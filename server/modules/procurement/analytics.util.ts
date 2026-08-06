import type { StatDist } from '@shared/api.interface';

/** 一条状态流转日志的最小形态 */
export interface StatusLogPoint {
  requirementId: string;
  oldStatus: string | null;
  newStatus: string;
  createdAt: Date;
}

const MS_PER_HOUR = 1000 * 60 * 60;

/** 保留两位小数 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 中位数，空数组返回 null */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 按 requirementId 分组并按时间升序排序 */
export function groupLogsByRequirement(
  logs: StatusLogPoint[],
): Map<string, StatusLogPoint[]> {
  const grouped = new Map<string, StatusLogPoint[]>();
  for (const log of logs) {
    const arr = grouped.get(log.requirementId);
    if (arr) arr.push(log);
    else grouped.set(log.requirementId, [log]);
  }
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return grouped;
}

/** 一条已完成需求的交付周期记录 */
export interface LeadEntry {
  /** 首次进入「已完成」的时间 */
  completedAt: Date;
  /** 交付周期（小时） */
  leadHours: number;
}

/**
 * 计算每条已完成需求的交付周期：从首条日志到首次进入「已完成」的小时数。
 * 返回完成时间 + 周期，供按月聚合提效趋势使用。
 */
export function computeCompletedLeadEntries(logs: StatusLogPoint[]): LeadEntry[] {
  const grouped = groupLogsByRequirement(logs);
  const entries: LeadEntry[] = [];
  for (const arr of grouped.values()) {
    if (arr.length === 0) continue;
    const completed = arr.find((l) => l.newStatus === '已完成');
    if (!completed) continue;
    const hours =
      (completed.createdAt.getTime() - arr[0].createdAt.getTime()) / MS_PER_HOUR;
    if (hours >= 0) {
      entries.push({ completedAt: completed.createdAt, leadHours: round2(hours) });
    }
  }
  return entries;
}

/**
 * 计算每条需求的交付周期 (lead time)：从首条日志到首次进入「已完成」的小时数。
 * 仅统计已完成的需求。
 */
export function computeLeadTimes(logs: StatusLogPoint[]): number[] {
  return computeCompletedLeadEntries(logs).map((e) => e.leadHours);
}

/** 平均值，保留两位小数；空数组返回 null */
export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return round2(sum / values.length);
}

/** 分位数（线性插值），p∈[0,1]；空数组返回 null */
export function quantile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return round2(sorted[0]);
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return round2(sorted[lo]);
  const frac = idx - lo;
  return round2(sorted[lo] * (1 - frac) + sorted[hi] * frac);
}

/** 构造统计分布：P50/P90/均值/样本数。专业看板首选中位+P90，避免长尾拉偏均值。 */
export function buildStatDist(values: number[]): StatDist {
  return {
    p50: quantile(values, 0.5),
    p90: quantile(values, 0.9),
    mean: average(values),
    count: values.length,
  };
}
