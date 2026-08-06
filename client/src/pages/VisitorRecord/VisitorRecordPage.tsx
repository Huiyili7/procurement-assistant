import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getUsageStats } from '@client/src/api/visitor-record';
import type { UsageStatsResponse } from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@client/src/lib/utils';

/** 分钟 → "X 小时 Y 分" / "Y 分" */
function formatMinutes(min: number): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分`;
}

function KpiCard({
  title,
  value,
  hint,
  accent,
}: {
  title: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="bg-card rounded-lg border border-border px-5 py-4">
      <div className="text-sm text-muted-foreground mb-1">{title}</div>
      <div className="text-2xl font-bold" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

const VisitorRecordPage: React.FC = () => {
  const [data, setData] = useState<UsageStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getUsageStats({
        startTime: startDate || undefined,
        endTime: endDate ? `${endDate}T23:59:59` : undefined,
        userIds: selectedUsers.length ? selectedUsers : undefined,
      });
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '加载失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedUsers]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((u) => u !== userId) : [...prev, userId],
    );
  };

  const clearFilter = () => {
    setStartDate('');
    setEndDate('');
    setSelectedUsers([]);
  };

  const perUser = data?.perUser || [];
  const filtering = selectedUsers.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">访问统计</h1>
        <p className="text-sm text-muted-foreground mt-1">
          真实飞书用户访问、次数与使用时长
        </p>
      </div>

      {/* 筛选区 */}
      <div className="bg-card rounded-lg border border-border p-4 space-y-4">
        <div>
          <div className="text-sm font-medium mb-2">筛选访问姓名</div>
          <div className="flex flex-wrap gap-2">
            {perUser.length === 0 && (
              <span className="text-sm text-muted-foreground">暂无数据</span>
            )}
            {perUser.map((u) => {
              const active = selectedUsers.includes(u.userId);
              return (
                <button
                  key={u.userId}
                  type="button"
                  onClick={() => toggleUser(u.userId)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:bg-accent',
                  )}
                >
                  {u.userName}
                  <span className={cn('text-xs', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {u.sessions}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            开始日期
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <label className="text-sm">
            结束日期
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <Button variant="outline" size="sm" onClick={clearFilter}>
            <RotateCcw className="mr-1 h-4 w-4" />
            清空筛选
          </Button>
        </div>
      </div>

      {/* KPI 卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="真实飞书用户"
          value={String(data?.distinctUsers ?? 0)}
          hint="按飞书账号去重"
        />
        <KpiCard
          title="访问次数"
          value={String(data?.sessionCount ?? 0)}
          hint="30 分钟间隔合并"
        />
        <KpiCard
          title="累计使用时长"
          value={formatMinutes(data?.totalDurationMinutes ?? 0)}
          hint="基于访问心跳估算"
          accent="#a855f7"
        />
        <KpiCard
          title="筛选累计时长"
          value={formatMinutes(data?.filteredDurationMinutes ?? 0)}
          hint={filtering ? `已选 ${selectedUsers.length} 人` : '全部用户·全时段'}
          accent="#16a34a"
        />
        <KpiCard
          title="人均单次时长"
          value={formatMinutes(data?.avgSessionMinutes ?? 0)}
          hint={`今日 ${data?.todaySessionCount ?? 0} 次`}
        />
        <KpiCard
          title="筛选匹配"
          value={String(data?.filteredSessionCount ?? 0)}
          hint={`${data?.totalRecords ?? 0} 条原始记录`}
          accent="#f59e0b"
        />
      </div>

      {/* 用户访问情况 */}
      <div className="bg-card rounded-lg border border-border">
        <div className="px-6 py-4 border-b border-border font-semibold">
          用户访问情况
        </div>
        <div className="px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              加载中...
            </div>
          ) : perUser.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              暂无访问记录
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">排名</TableHead>
                  <TableHead>访客姓名</TableHead>
                  <TableHead className="text-right">访问次数</TableHead>
                  <TableHead className="text-right">累计使用时长</TableHead>
                  <TableHead className="text-right">人均单次</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perUser.map((u, i) => (
                  <TableRow
                    key={u.userId}
                    className={cn(
                      'cursor-pointer',
                      selectedUsers.includes(u.userId) && 'bg-accent/50',
                    )}
                    onClick={() => toggleUser(u.userId)}
                  >
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{u.userName}</TableCell>
                    <TableCell className="text-right">{u.sessions}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatMinutes(u.durationMinutes)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {u.sessions > 0
                        ? formatMinutes(u.durationMinutes / u.sessions)
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisitorRecordPage;
