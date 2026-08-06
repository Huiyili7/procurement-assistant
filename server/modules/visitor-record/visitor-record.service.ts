import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { visitorRecordTable } from '@server/database/schema';
import { desc, count, gte, sql } from 'drizzle-orm';
import type {
  RecordVisitRequest,
  UsageStatsQuery,
  UsageStatsResponse,
  UsageUserStat,
} from '@shared/api.interface';
import {
  computeUserUsage,
  countTodaySessions,
  msToMinutes,
  type ActivityPoint,
} from './usage.util';

@Injectable()
export class VisitorRecordService {
  private readonly logger = new Logger(VisitorRecordService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async recordVisit(req: RecordVisitRequest, userId: string) {
    // 主流程：仅写自动生成 schema 已有的列，保证一定成功
    const [record] = await this.db
      .insert(visitorRecordTable)
      .values({
        visitorName: req.visitorName,
        visitorDepartment: req.visitorDepartment || null,
      })
      .returning();

    // 富化留痕字段：visitor_user_id / action / project_code
    // 这些列由妙搭数据模型新增；未加列时静默跳过，绝不影响访问主流程。
    try {
      await this.db.execute(sql`
        UPDATE visitor_record
        SET visitor_user_id = ${userId},
            action = ${req.action || 'browse'},
            project_code = ${req.projectCode || null}
        WHERE id = ${record.id}::uuid
      `);
    } catch (err) {
      this.logger.warn(
        `访客留痕富化失败（visitor_record 可能未加 visitor_user_id/action/project_code 列）: ${JSON.stringify(err)}`,
      );
    }

    this.logger.log(`访客记录: ${req.visitorName} (${userId})`);
    return record;
  }

  async getList(page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 优先用富化字段（按 user_id 去重活跃用户、返回操作/项目）；
    // 列不存在时回退到基础查询，保证向后兼容、不报错。
    try {
      return await this.getListEnriched(pageSize, offset, today);
    } catch (err) {
      this.logger.warn(`访客富化查询失败，回退基础查询: ${JSON.stringify(err)}`);
      return await this.getListBasic(pageSize, offset, today);
    }
  }

  private async getListEnriched(pageSize: number, offset: number, today: Date) {
    const rows = (await this.db.execute(sql`
      SELECT id, visitor_name, visitor_department, visit_time,
             visitor_user_id, action, project_code
      FROM visitor_record
      ORDER BY visit_time DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `)) as unknown as Record<string, unknown>[];

    const stat = (await this.db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE visit_time >= ${today})::int AS today_count,
        COUNT(DISTINCT COALESCE(visitor_user_id, visitor_name))::int AS visitor_count,
        COUNT(DISTINCT COALESCE(visitor_user_id, visitor_name))
          FILTER (WHERE visit_time >= ${today})::int AS today_visitor_count
      FROM visitor_record
    `)) as unknown as Record<string, unknown>[];
    const s = stat[0];

    return {
      items: rows.map((r) => ({
        id: String(r.id),
        visitorName: String(r.visitor_name),
        visitorDepartment: r.visitor_department ? String(r.visitor_department) : undefined,
        visitTime: r.visit_time ? new Date(r.visit_time as string | Date).toISOString() : '',
        action: r.action ? String(r.action) : undefined,
        projectCode: r.project_code ? String(r.project_code) : undefined,
      })),
      total: Number(s.total),
      todayCount: Number(s.today_count),
      visitorCount: Number(s.visitor_count),
      todayVisitorCount: Number(s.today_visitor_count),
    };
  }

  /** 拉取区间内的活动点（页面加载 + 心跳）。visitor_user_id 列缺失时回退按姓名维度。 */
  private async fetchActivityPoints(start?: Date, end?: Date): Promise<ActivityPoint[]> {
    try {
      const rows = (await this.db.execute(sql`
        SELECT visitor_user_id, visitor_name, visit_time
        FROM visitor_record
        WHERE (${start ? sql`visit_time >= ${start}` : sql`TRUE`})
          AND (${end ? sql`visit_time < ${end}` : sql`TRUE`})
          AND (action IS NULL OR action NOT IN ('rec_shown', 'rec_reused'))
      `)) as unknown as Record<string, unknown>[];
      return rows
        .map((r) => ({
          userId: r.visitor_user_id ? String(r.visitor_user_id) : String(r.visitor_name),
          userName: String(r.visitor_name),
          at: new Date(r.visit_time as string | Date),
        }))
        .filter((pt) => !isNaN(pt.at.getTime()));
    } catch (err) {
      this.logger.warn(`使用时长查询回退（visitor_user_id 列可能不存在）: ${JSON.stringify(err)}`);
      const conditions = [];
      if (start) conditions.push(gte(visitorRecordTable.visitTime, start));
      const base = this.db
        .select({
          visitorName: visitorRecordTable.visitorName,
          visitTime: visitorRecordTable.visitTime,
        })
        .from(visitorRecordTable);
      const rows = conditions.length
        ? await base.where(conditions[0])
        : await base;
      return rows
        .map((r: { visitorName: string; visitTime: Date | null }) => ({
          userId: r.visitorName,
          userName: r.visitorName,
          at: r.visitTime ? new Date(r.visitTime) : new Date(NaN),
        }))
        .filter((pt) => !isNaN(pt.at.getTime()) && (!end || pt.at < end));
    }
  }

  async getUsageStats(query: UsageStatsQuery): Promise<UsageStatsResponse> {
    const start = query.startTime ? new Date(query.startTime) : undefined;
    const end = query.endTime ? new Date(query.endTime) : undefined;
    const points = await this.fetchActivityPoints(start, end);

    const totalUsage = computeUserUsage(points);
    const sessionCount = totalUsage.reduce((acc, u) => acc + u.sessions, 0);
    const totalDurationMs = totalUsage.reduce((acc, u) => acc + u.durationMs, 0);
    const totalDurationMinutes = msToMinutes(totalDurationMs);
    const avgSessionMinutes =
      sessionCount > 0 ? Math.round((totalDurationMs / sessionCount / 60000) * 10) / 10 : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySessionCount = countTodaySessions(points, today);

    const filterSet =
      query.userIds && query.userIds.length ? new Set(query.userIds) : null;
    const filteredPoints = filterSet
      ? points.filter((p) => filterSet.has(p.userId))
      : points;
    const filteredUsage = filterSet ? computeUserUsage(filteredPoints) : totalUsage;
    const filteredSessionCount = filteredUsage.reduce((acc, u) => acc + u.sessions, 0);
    const filteredDurationMinutes = msToMinutes(
      filteredUsage.reduce((acc, u) => acc + u.durationMs, 0),
    );

    const perUser: UsageUserStat[] = totalUsage.map((u) => ({
      userId: u.userId,
      userName: u.userName,
      sessions: u.sessions,
      durationMinutes: msToMinutes(u.durationMs),
    }));

    return {
      distinctUsers: totalUsage.length,
      sessionCount,
      totalDurationMinutes,
      avgSessionMinutes,
      todaySessionCount,
      totalRecords: points.length,
      filteredSessionCount,
      filteredDurationMinutes,
      perUser,
    };
  }

  private async getListBasic(pageSize: number, offset: number, today: Date) {
    const [countResult] = await this.db
      .select({ total: count() })
      .from(visitorRecordTable);

    const [todayResult] = await this.db
      .select({ todayCount: count() })
      .from(visitorRecordTable)
      .where(gte(visitorRecordTable.visitTime, today));

    const [visitorCountResult] = await this.db
      .select({ visitorCount: sql<number>`COUNT(DISTINCT ${visitorRecordTable.visitorName})` })
      .from(visitorRecordTable);

    const [todayVisitorResult] = await this.db
      .select({ todayVisitorCount: sql<number>`COUNT(DISTINCT ${visitorRecordTable.visitorName})` })
      .from(visitorRecordTable)
      .where(gte(visitorRecordTable.visitTime, today));

    const items = await this.db
      .select()
      .from(visitorRecordTable)
      .orderBy(desc(visitorRecordTable.visitTime))
      .limit(pageSize)
      .offset(offset);

    return {
      items: items.map((item: Record<string, unknown>) => ({
        id: String(item.id),
        visitorName: String(item.visitorName),
        visitorDepartment: item.visitorDepartment ? String(item.visitorDepartment) : undefined,
        visitTime: item.visitTime ? new Date(item.visitTime as string | Date).toISOString() : '',
      })),
      total: Number(countResult.total),
      todayCount: Number(todayResult.todayCount),
      visitorCount: Number(visitorCountResult.visitorCount),
      todayVisitorCount: Number(todayVisitorResult.todayVisitorCount),
    };
  }
}
