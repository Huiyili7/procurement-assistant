import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import type { PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { sql } from 'drizzle-orm';
import { FeishuService } from './feishu.service';

/** 同步后落库的一行采购记录（镜像多维表格） */
export interface PurchaseRow {
  feishuRecordId: string;
  purchaseDate: Date | null;
  requesterName: string;
  content: string;
  price: number;
  materialCategory: string;
  projectCode: string;
  platform: string;
  buyerMinutes: number | null;
}

/** 多维表格列名（实际飞书表，见 AGENTS.md） */
const F = {
  date: '日期',
  requester: '申请人',
  content: '购买内容',
  price: '价格',
  category: '物料种类',
  project: '归属项目',
  platform: '购物平台',
  minutes: '用时效率',
} as const;

/**
 * 多维表格 → 系统库 purchase_record 的同步与读取。
 *
 * 同步策略：全量刷新（DELETE + 批量 INSERT）。多维表格无 requirementId，
 * 用飞书 record_id 作业务主键；数据量小（季度数百行），全刷最稳、零对账歧义。
 *
 * 容错：purchase_record 表由妙搭数据模型创建；未创建时所有方法降级（不抛错），
 * 看板花费板块显示「未同步」。与 config_baseline 同款降级思路。
 */
@Injectable()
export class PurchaseService {
  private readonly logger = new Logger(PurchaseService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    private readonly feishuService: FeishuService,
  ) {}

  /** 飞书字段值 → 字符串（兼容 纯字符串 / 富文本段数组 / {text} 对象） */
  private toStr(v: unknown): string {
    if (v == null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number') return String(v);
    if (Array.isArray(v)) {
      return v
        .map((seg) =>
          seg && typeof seg === 'object' && 'text' in seg
            ? String((seg as { text: unknown }).text)
            : typeof seg === 'string'
              ? seg
              : '',
        )
        .join('')
        .trim();
    }
    if (typeof v === 'object' && v && 'text' in v) {
      return String((v as { text: unknown }).text).trim();
    }
    return '';
  }

  private toNum(v: unknown): number | null {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isNaN(v) ? null : v;
    const n = parseFloat(this.toStr(v));
    return isNaN(n) ? null : n;
  }

  private mapRecord(rec: {
    recordId: string;
    fields: Record<string, unknown>;
  }): PurchaseRow {
    const f = rec.fields;
    const dateMs = this.toNum(f[F.date]);
    return {
      feishuRecordId: rec.recordId,
      purchaseDate: dateMs ? new Date(dateMs) : null,
      requesterName: this.toStr(f[F.requester]),
      content: this.toStr(f[F.content]),
      price: this.toNum(f[F.price]) ?? 0,
      materialCategory: this.toStr(f[F.category]),
      projectCode: this.toStr(f[F.project]),
      platform: this.toStr(f[F.platform]),
      buyerMinutes: this.toNum(f[F.minutes]),
    };
  }

  /** 全量同步多维表格到 purchase_record。返回写入行数；失败返回 -1。 */
  async syncFromBitable(): Promise<number> {
    let records: { recordId: string; fields: Record<string, unknown> }[];
    try {
      records = await this.feishuService.listBitableRecords();
    } catch (err) {
      this.logger.error(`拉取多维表格失败: ${JSON.stringify(err)}`);
      return -1;
    }
    const rows = records.map((r) => this.mapRecord(r)).filter((r) => r.feishuRecordId);

    try {
      await this.db.execute(sql`DELETE FROM purchase_record`);
      // 分批插入，避免单条 SQL 参数过多
      const CHUNK = 100;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const values = chunk.map(
          (r) => sql`(${r.feishuRecordId}, ${r.purchaseDate ? r.purchaseDate.toISOString() : null},
            ${r.requesterName}, ${r.content}, ${r.price}, ${r.materialCategory},
            ${r.projectCode}, ${r.platform}, ${r.buyerMinutes}, CURRENT_TIMESTAMP)`,
        );
        await this.db.execute(sql`
          INSERT INTO purchase_record
            (feishu_record_id, purchase_date, requester_name, content, price,
             material_category, project_code, platform, buyer_minutes, synced_at)
          VALUES ${sql.join(values, sql`, `)}
        `);
      }
      this.logger.log(`purchase_record 同步完成，写入 ${rows.length} 行`);
      return rows.length;
    } catch (err) {
      this.logger.warn(
        `写入 purchase_record 失败（表可能未在妙搭创建），降级: ${JSON.stringify(err)}`,
      );
      return -1;
    }
  }

  /** 最近一次同步时间；表不存在或为空返回 null */
  async getLastSyncedAt(): Promise<Date | null> {
    try {
      const rows = await this.db.execute(sql`
        SELECT MAX(synced_at) AS last FROM purchase_record
      `);
      const r = (rows as unknown as Record<string, unknown>[])[0];
      return r?.last ? new Date(String(r.last)) : null;
    } catch {
      return null;
    }
  }

  /** 若数据陈旧（超过 maxAgeMs）或为空则触发同步。失败静默，不影响看板。 */
  async ensureFresh(maxAgeMs = 60 * 60 * 1000): Promise<void> {
    try {
      const last = await this.getLastSyncedAt();
      if (!last || Date.now() - last.getTime() > maxAgeMs) {
        await this.syncFromBitable();
      }
    } catch (err) {
      this.logger.warn(`ensureFresh 失败(忽略): ${JSON.stringify(err)}`);
    }
  }

  /** 读取区间内的采购记录（按 purchase_date 过滤）；表不存在返回 [] */
  async fetchRows(start?: Date, end?: Date): Promise<PurchaseRow[]> {
    try {
      const conds = [];
      if (start) conds.push(sql`purchase_date >= ${start.toISOString()}`);
      if (end) conds.push(sql`purchase_date < ${end.toISOString()}`);
      const where = conds.length
        ? sql`WHERE ${sql.join(conds, sql` AND `)}`
        : sql``;
      const rows = await this.db.execute(sql`
        SELECT feishu_record_id, purchase_date, requester_name, content, price,
               material_category, project_code, platform, buyer_minutes
        FROM purchase_record ${where}
      `);
      return (rows as unknown as Record<string, unknown>[]).map((r) => ({
        feishuRecordId: String(r.feishu_record_id),
        purchaseDate: r.purchase_date ? new Date(String(r.purchase_date)) : null,
        requesterName: String(r.requester_name ?? ''),
        content: String(r.content ?? ''),
        price: Number(r.price) || 0,
        materialCategory: String(r.material_category ?? ''),
        projectCode: String(r.project_code ?? ''),
        platform: String(r.platform ?? ''),
        buyerMinutes: r.buyer_minutes == null ? null : Number(r.buyer_minutes),
      }));
    } catch (err) {
      this.logger.warn(`读取 purchase_record 失败（表可能未创建），降级为空: ${JSON.stringify(err)}`);
      return [];
    }
  }
}
