import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import type { PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, gte, lt, inArray, sql } from 'drizzle-orm';
import {
  procurementRequirement,
  procurementStatusLog,
} from '@server/database/schema';
import type {
  AnalyticsQuery,
  AnalyticsResponse,
  AnalyticsAdoption,
  AnalyticsOps,
  AdoptionTrendPoint,
  NamedCount,
  CategoryStat,
  SpendItem,
  SpendBlock,
  CompositionBlock,
  BaselineConfig,
  SaveBaselineRequest,
  SaveBaselineResponse,
  SyncPurchasesResponse,
  AnalyticsRecordsResponse,
  AnalyticsRecordRow,
} from '@shared/api.interface';
import { FeishuService } from './feishu.service';
import { PurchaseService, type PurchaseRow } from './purchase.service';
import { median, type StatusLogPoint } from './analytics.util';
import { normalizeSpendMaterial, normalizeItemName, parseQuantity } from './materialFamilies';

/** 平台上线日期：2026-05-13 之前为工程师私聊采购的人工期 */
const LAUNCH_DATE = new Date('2026-05-13T00:00:00+08:00');
const EXCLUDED_DEV_USER_IDS = ['1863675762887783'];
const TOP_N = 10;
/** 月处理量目标（PRD：月均 ≥100 笔） */
const MONTHLY_TARGET = 100;

interface RequirementRow {
  id: string;
  requirementId: string;
  itemName: string;
  itemBrandModel: string | null;
  itemLink: string;
  itemQuantity: string;
  itemUnit: string;
  projectCode: string;
  projectName: string | null;
  status: string;
  requester: string;
  estimatedPrice: number | null;
  createdAt: Date;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    private readonly feishuService: FeishuService,
    private readonly purchaseService: PurchaseService,
  ) {}

  private parseRange(query: AnalyticsQuery): { start?: Date; end?: Date } {
    const start = query.startTime ? new Date(query.startTime) : undefined;
    const end = query.endTime ? new Date(query.endTime) : undefined;
    return {
      start: start && !isNaN(start.getTime()) ? start : undefined,
      end: end && !isNaN(end.getTime()) ? end : undefined,
    };
  }

  private async fetchRequirements(query: AnalyticsQuery): Promise<RequirementRow[]> {
    const { start, end } = this.parseRange(query);
    const conditions = [];
    if (start) conditions.push(gte(procurementRequirement.createdAt, start));
    if (end) conditions.push(lt(procurementRequirement.createdAt, end));
    conditions.push(
      sql`((${procurementRequirement.requester}).user_id != ALL(ARRAY[${sql.join(EXCLUDED_DEV_USER_IDS.map(id => sql`${id}`), sql`, `)}]::text[]))`,
    );
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    return this.db
      .select({
        id: procurementRequirement.id,
        requirementId: procurementRequirement.requirementId,
        itemName: procurementRequirement.itemName,
        itemBrandModel: procurementRequirement.itemBrandModel,
        itemLink: procurementRequirement.itemLink,
        itemQuantity: procurementRequirement.itemQuantity,
        itemUnit: procurementRequirement.itemUnit,
        projectCode: procurementRequirement.projectCode,
        projectName: procurementRequirement.projectName,
        status: procurementRequirement.status,
        requester: procurementRequirement.requester,
        estimatedPrice: procurementRequirement.estimatedPrice,
        createdAt: procurementRequirement.createdAt,
      })
      .from(procurementRequirement)
      .where(where);
  }

  private async fetchLogs(requirementIds: string[]): Promise<StatusLogPoint[]> {
    if (requirementIds.length === 0) return [];
    const rows = await this.db
      .select({
        requirementId: procurementStatusLog.requirementId,
        oldStatus: procurementStatusLog.oldStatus,
        newStatus: procurementStatusLog.newStatus,
        createdAt: procurementStatusLog.createdAt,
      })
      .from(procurementStatusLog)
      .where(inArray(procurementStatusLog.requirementId, requirementIds));
    return rows.map((r) => ({
      requirementId: r.requirementId,
      oldStatus: r.oldStatus,
      newStatus: r.newStatus,
      createdAt: r.createdAt,
    }));
  }

  private extractPlatform(link: string): string {
    try {
      const hostname = new URL(link).hostname.replace(/^www\./, '');
      const platforms: Record<string, string> = {
        'taobao.com': '淘宝',
        'tmall.com': '淘宝',
        'tb.cn': '淘宝',
        'jd.com': '京东',
        'u.jd.com': '京东',
        '1688.com': '1688',
      };
      for (const [domain, name] of Object.entries(platforms)) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) return name;
      }
      return '其他';
    } catch {
      return '未知';
    }
  }

  /** 上海时区 YYYY-MM */
  private toMonth(date: Date): string {
    const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /** 上海时区 周一为起点的周；key 用于排序，label 用于展示 MM-DD */
  private toWeekKey(date: Date): { key: string; label: string } {
    const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const dow = shifted.getUTCDay() || 7;
    const monday = new Date(shifted.getTime() - (dow - 1) * 86400000);
    const m = String(monday.getUTCMonth() + 1).padStart(2, '0');
    const d = String(monday.getUTCDate()).padStart(2, '0');
    return { key: `${monday.getUTCFullYear()}-${m}-${d}`, label: `${m}-${d}` };
  }

  /** 提单耗时（分钟）数组：EXTRACT(EPOCH) 在 SQL 内算差值，兼容 timestamp/timestamptz */
  private async fetchSubmitMinutes(ids: string[]): Promise<number[]> {
    if (ids.length === 0) return [];
    try {
      const idArr = sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(',')}]::uuid[]`);
      const rows = await this.db.execute(sql`
        SELECT (EXTRACT(EPOCH FROM _created_at) - EXTRACT(EPOCH FROM draft_started_at)) / 60 AS mins
        FROM procurement_requirement
        WHERE draft_started_at IS NOT NULL AND id = ANY(${idArr})
      `);
      const out: number[] = [];
      for (const r of rows as unknown as Record<string, unknown>[]) {
        const m = Number(r.mins);
        if (!isNaN(m) && m >= 0 && m < 24 * 60) out.push(Math.round(m * 100) / 100);
      }
      return out;
    } catch (err) {
      this.logger.warn(`读取提单耗时失败（draft_started_at 列可能未创建），降级: ${JSON.stringify(err)}`);
      return [];
    }
  }

  private rate(num: number, den: number): number {
    return den > 0 ? Math.round((num / den) * 1000) / 1000 : 0;
  }

  /* ============================ B. 规模与采纳 ============================ */
  private buildAdoption(rows: RequirementRow[], submitMinutes: number[]): AnalyticsAdoption {
    const activeRequesters = new Set(rows.map((r) => r.requester)).size;

    const byMonth = new Map<string, { count: number; users: Set<string> }>();
    const byWeek = new Map<string, { label: string; count: number; users: Set<string> }>();
    for (const r of rows) {
      const m = this.toMonth(r.createdAt);
      const em = byMonth.get(m) || { count: 0, users: new Set<string>() };
      em.count += 1;
      em.users.add(r.requester);
      byMonth.set(m, em);
      const wk = this.toWeekKey(r.createdAt);
      const ew = byWeek.get(wk.key) || { label: wk.label, count: 0, users: new Set<string>() };
      ew.count += 1;
      ew.users.add(r.requester);
      byWeek.set(wk.key, ew);
    }
    const trend: AdoptionTrendPoint[] = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, e]) => ({ period, count: e.count, activeUsers: e.users.size }));
    const trendWeekly: AdoptionTrendPoint[] = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, e]) => ({ period: e.label, count: e.count, activeUsers: e.users.size }));
    const latestMonthCount = trend.length ? trend[trend.length - 1].count : 0;

    const reqCounter = new Map<string, number>();
    for (const r of rows) reqCounter.set(r.requester, (reqCounter.get(r.requester) || 0) + 1);
    const topRequesters: NamedCount[] = [...reqCounter.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N);

    return {
      totalOrders: rows.length,
      activeRequesters,
      avgOrdersPerRequester:
        activeRequesters > 0 ? Math.round((rows.length / activeRequesters) * 100) / 100 : 0,
      latestMonthCount,
      monthlyTarget: MONTHLY_TARGET,
      submitMedianMinutes: median(submitMinutes),
      trend,
      trendWeekly,
      topRequesters,
    };
  }

  /* ============================ 价值自证 / 处理能力 ============================ */
  private async fetchOps(ids: string[], total: number): Promise<AnalyticsOps> {
    let transfer = 0;
    let completed = 0;
    let batch = 0;
    if (ids.length > 0) {
      try {
        const idArr = sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(',')}]::uuid[]`);
        const rows = await this.db.execute(sql`
          SELECT
            count(DISTINCT requirement_id) FILTER (WHERE new_status = '人工处理中') AS transfer,
            count(DISTINCT requirement_id) FILTER (WHERE new_status = '已完成') AS completed,
            count(DISTINCT requirement_id) FILTER (WHERE new_status = '已完成' AND remark LIKE '%批量%') AS batch
          FROM procurement_status_log
          WHERE requirement_id = ANY(${idArr})
        `);
        const r = (rows as unknown as Record<string, unknown>[])[0] || {};
        transfer = Number(r.transfer) || 0;
        completed = Number(r.completed) || 0;
        batch = Number(r.batch) || 0;
      } catch (err) {
        this.logger.warn(`读取转人工/批量统计失败: ${JSON.stringify(err)}`);
      }
    }
    const transferRate = this.rate(transfer, total);
    return {
      transferRate,
      autonomyRate: Math.round((1 - transferRate) * 1000) / 1000,
      batchRatio: this.rate(batch, completed),
      autoLoggedCount: total,
    };
  }

  /* ============================ E. 花费 ============================ */
  private buildSpend(purchases: PurchaseRow[], syncedAt: Date | null): SpendBlock {
    const available = purchases.length > 0;
    const totalAmount = Math.round(purchases.reduce((s, p) => s + p.price, 0) * 100) / 100;
    const orderCount = purchases.length;

    const projAgg = new Map<string, { amount: number; count: number }>();
    const catAgg = new Map<string, { amount: number; count: number }>();
    const platAgg = new Map<string, { amount: number; count: number }>();
    const monthAgg = new Map<string, { amount: number; count: number }>();
    for (const p of purchases) {
      const proj = p.projectCode || '未填项目';
      const cat = normalizeSpendMaterial(p.content, p.materialCategory);
      const plat = p.platform || '未知';
      const month = p.purchaseDate ? this.toMonth(p.purchaseDate) : '未知';
      for (const [map, key] of [
        [projAgg, proj],
        [catAgg, cat],
        [platAgg, plat],
        [monthAgg, month],
      ] as [Map<string, { amount: number; count: number }>, string][]) {
        const e = map.get(key) || { amount: 0, count: 0 };
        e.amount += p.price;
        e.count += 1;
        map.set(key, e);
      }
    }
    const toSpendItems = (m: Map<string, { amount: number; count: number }>): SpendItem[] =>
      [...m.entries()]
        .map(([key, v]) => ({
          key,
          amount: Math.round(v.amount * 100) / 100,
          count: v.count,
          avgAmount: v.count ? Math.round((v.amount / v.count) * 100) / 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

    const byCategory: CategoryStat[] = [...catAgg.entries()]
      .map(([key, v]) => ({ key, count: v.count, quantity: 0, amount: Math.round(v.amount * 100) / 100 }))
      .sort((a, b) => (b.amount || 0) - (a.amount || 0))
      .slice(0, TOP_N);

    const monthly = [...monthAgg.entries()]
      .filter(([k]) => k !== '未知')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({ period, amount: Math.round(v.amount * 100) / 100, count: v.count }));

    return {
      available,
      syncedAt: syncedAt ? syncedAt.toISOString() : null,
      totalAmount,
      orderCount,
      avgOrderAmount: orderCount ? Math.round((totalAmount / orderCount) * 100) / 100 : 0,
      byProject: toSpendItems(projAgg).slice(0, TOP_N),
      byCategory,
      byPlatform: toSpendItems(platAgg),
      monthly,
    };
  }

  /* ============================ F. 结构 ============================ */
  private buildComposition(rows: RequirementRow[]): CompositionBlock {
    const projCounter = new Map<string, number>();
    const catAgg = new Map<string, { count: number; quantity: number }>();
    const platCounter = new Map<string, number>();
    for (const r of rows) {
      const proj = r.projectName ? `${r.projectCode} ${r.projectName}` : r.projectCode;
      projCounter.set(proj, (projCounter.get(proj) || 0) + 1);
      const cat = normalizeItemName(r.itemName);
      const e = catAgg.get(cat) || { count: 0, quantity: 0 };
      e.count += 1;
      e.quantity += parseQuantity(r.itemQuantity);
      catAgg.set(cat, e);
      const plat = this.extractPlatform(r.itemLink);
      platCounter.set(plat, (platCounter.get(plat) || 0) + 1);
    }
    const topNamed = (m: Map<string, number>): NamedCount[] =>
      [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count).slice(0, TOP_N);

    const byCategory: CategoryStat[] = [...catAgg.entries()]
      .map(([key, v]) => ({ key, count: v.count, quantity: Math.round(v.quantity * 100) / 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_N);

    return { byProject: topNamed(projCounter), byCategory, byPlatform: topNamed(platCounter) };
  }

  /* ============================ 基线读写（保留，看板暂未用） ============================ */
  async getBaseline(): Promise<BaselineConfig | null> {
    try {
      const rows = await this.db.execute(sql`
        SELECT dept_headcount, manual_coordination_minutes, labor_cost_per_hour,
               baseline_source, effective_date
        FROM config_baseline
        ORDER BY effective_date DESC NULLS LAST
        LIMIT 1
      `);
      const r = (rows as unknown as Record<string, unknown>[])[0];
      if (!r) return null;
      return {
        deptHeadcount: Number(r.dept_headcount) || 0,
        manualCoordinationMinutes: Number(r.manual_coordination_minutes) || 0,
        laborCostPerHour: Number(r.labor_cost_per_hour) || 0,
        baselineSource: r.baseline_source ? String(r.baseline_source) : '',
        effectiveDate: r.effective_date ? String(r.effective_date) : '',
      };
    } catch (err) {
      this.logger.warn(`读取基线失败，降级为待配置: ${JSON.stringify(err)}`);
      return null;
    }
  }

  async saveBaseline(input: SaveBaselineRequest): Promise<SaveBaselineResponse> {
    const effectiveDate = input.effectiveDate || new Date().toISOString().slice(0, 10);
    try {
      await this.db.execute(sql`
        INSERT INTO config_baseline
          (dept_headcount, manual_coordination_minutes, labor_cost_per_hour, baseline_source, effective_date)
        VALUES
          (${input.deptHeadcount}, ${input.manualCoordinationMinutes}, ${input.laborCostPerHour},
           ${input.baselineSource || ''}, ${effectiveDate})
      `);
      return { success: true };
    } catch (err) {
      this.logger.error(`保存基线失败: ${JSON.stringify(err)}`);
      return { success: false, message: 'config_baseline 写入失败' };
    }
  }

  async syncPurchases(): Promise<SyncPurchasesResponse> {
    const n = await this.purchaseService.syncFromBitable();
    if (n < 0) {
      return { success: false, synced: 0, message: '同步失败：多维表格读取异常或 purchase_record 表未创建' };
    }
    return { success: true, synced: n };
  }

  /* ============================ 主入口 ============================ */
  async getAnalytics(query: AnalyticsQuery): Promise<AnalyticsResponse> {
    const { start, end } = this.parseRange(query);
    const rows = await this.fetchRequirements(query);
    const ids = rows.map((r) => r.id);
    const [purchases, syncedAt, ops, submitMinutes] = await Promise.all([
      this.purchaseService.fetchRows(start, end),
      this.purchaseService.getLastSyncedAt(),
      this.fetchOps(ids, rows.length),
      this.fetchSubmitMinutes(ids),
    ]);

    // 花费只统计上线后
    const postPurchases = purchases.filter((p) => p.purchaseDate && p.purchaseDate >= LAUNCH_DATE);

    return {
      meta: {
        rangeStart: start ? start.toISOString() : null,
        rangeEnd: end ? end.toISOString() : null,
      },
      adoption: this.buildAdoption(rows, submitMinutes),
      ops,
      spend: this.buildSpend(postPurchases, syncedAt),
      composition: this.buildComposition(rows),
    };
  }

  /* ============================ 明细导出（保留） ============================ */
  async getRecords(query: AnalyticsQuery): Promise<AnalyticsRecordsResponse> {
    const rows = await this.fetchRequirements(query);
    const logs = await this.fetchLogs(rows.map((r) => r.id));

    const completedAtById = new Map<string, Date>();
    const firstLogById = new Map<string, Date>();
    for (const log of logs) {
      if (log.newStatus === '已完成') {
        const ex = completedAtById.get(log.requirementId);
        if (!ex || log.createdAt < ex) completedAtById.set(log.requirementId, log.createdAt);
      }
      const ef = firstLogById.get(log.requirementId);
      if (!ef || log.createdAt < ef) firstLogById.set(log.requirementId, log.createdAt);
    }

    const requesterIds = [...new Set(rows.map((r) => r.requester))];
    const nameById = await this.feishuService.batchGetUserNames(
      requesterIds.filter((id) => /^\d+$/.test(id)),
    );

    const items: AnalyticsRecordRow[] = rows.map((r) => {
      const completedAt = completedAtById.get(r.id);
      const firstAt = firstLogById.get(r.id) || r.createdAt;
      const leadTimeHours = completedAt
        ? Math.round(((completedAt.getTime() - firstAt.getTime()) / (1000 * 60 * 60)) * 100) / 100
        : null;
      return {
        requirementId: r.requirementId,
        itemName: r.itemName,
        itemBrandModel: r.itemBrandModel || '',
        itemQuantity: r.itemQuantity,
        itemUnit: r.itemUnit,
        projectCode: r.projectCode,
        projectName: r.projectName || '',
        platform: this.extractPlatform(r.itemLink),
        status: r.status,
        requesterName: nameById.get(r.requester) || r.requester,
        estimatedPrice: r.estimatedPrice || 0,
        createdAt: r.createdAt.toISOString(),
        completedAt: completedAt ? completedAt.toISOString() : '',
        leadTimeHours,
      };
    });

    return { items };
  }
}
