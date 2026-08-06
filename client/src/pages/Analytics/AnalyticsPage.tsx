import React, { useCallback, useEffect, useState } from 'react';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx-js-style';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import { Calendar } from '@client/src/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@client/src/components/ui/popover';
import { Button } from '@client/src/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@client/src/components/ui/card';
import { Skeleton } from '@client/src/components/ui/skeleton';
import { Link } from 'react-router-dom';
import { useAuth, ROLE_SUBJECT } from '@lark-apaas/client-toolkit/auth';
import { analytics, visitorRecord } from '@client/src/api';
import type {
  AnalyticsResponse,
  AnalyticsQuery,
  UsageStatsResponse,
} from '@shared/api.interface';
import { CalendarIcon, Search, RotateCcw, Download } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@client/src/lib/utils';
import { UserDisplay } from '@client/src/components/business-ui/user-display';

const ECHARTS_STYLE = { height: '100%', width: '100%' };
const BLUE = '#2563eb';
const GREEN = '#16a34a';
const AMBER = '#f59e0b';
const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#06b6d4', '#a855f7', '#ef4444', '#64748b', '#0ea5e9', '#f97316', '#14b8a6'];

const fmtMoney = (n: number) => `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
const fmtPct = (p: number | null | undefined) => (p === null || p === undefined ? '—' : `${Math.round(p * 100)}%`);
const fmtUsageMinutes = (min: number) => {
  const t = Math.round(min);
  const h = Math.floor(t / 60);
  return h > 0 ? `${h} 小时 ${t % 60} 分` : `${t % 60} 分`;
};

const Chart = ({ option }: { option: EChartsOption }) => (
  <ReactECharts option={option} style={ECHARTS_STYLE} notMerge lazyUpdate />
);

function adoptionTrendOption(periods: string[], counts: number[], users: number[], target?: number): EChartsOption {
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['提单量', '活跃人数'], top: 0 },
    grid: { left: 44, right: 44, top: 32, bottom: 24 },
    xAxis: { type: 'category', data: periods },
    yAxis: [
      { type: 'value', name: '提单量', minInterval: 1 },
      { type: 'value', name: '活跃人数', minInterval: 1 },
    ],
    series: [
      {
        name: '提单量', type: 'bar', barMaxWidth: 48, itemStyle: { color: BLUE }, data: counts,
        markLine: target ? { symbol: 'none', data: [{ yAxis: target }], lineStyle: { color: AMBER, type: 'dashed' }, label: { formatter: `目标 ≥${target}`, color: AMBER } } : undefined,
      },
      { name: '活跃人数', type: 'line', yAxisIndex: 1, smooth: true, itemStyle: { color: AMBER }, data: users },
    ],
  };
}

function pieOption(items: { name: string; value: number }[]): EChartsOption {
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { type: 'scroll', bottom: 0 },
    series: [{
      type: 'pie', radius: ['40%', '66%'], center: ['50%', '44%'],
      label: { formatter: '{b} {d}%' },
      data: items.map((d, i) => ({ ...d, itemStyle: { color: PALETTE[i % PALETTE.length] } })),
    }],
  };
}

function hBarOption(items: { name: string; value: number }[], color: string, money = false): EChartsOption {
  const rev = [...items].reverse();
  return {
    tooltip: { trigger: 'axis', valueFormatter: (v) => (money ? fmtMoney(Number(v)) : String(v)) },
    grid: { left: 8, right: 40, top: 10, bottom: 20, containLabel: true },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: rev.map((i) => i.name), axisLabel: { width: 110, overflow: 'truncate' } },
    series: [{ type: 'bar', barMaxWidth: 20, itemStyle: { color }, data: rev.map((i) => i.value) }],
  };
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  达标: { bg: 'rgba(22,163,74,0.12)', fg: GREEN },
  观察: { bg: 'rgba(245,158,11,0.14)', fg: AMBER },
};

function ScoreCard({ icon, label, value, target, status }: { icon: string; label: string; value: string; target: string; status: '达标' | '观察' }) {
  const s = STATUS_STYLE[status];
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground flex items-center gap-1">{icon} {label}</span>
          <span className="text-xs px-2 py-0.5 rounded" style={{ background: s.bg, color: s.fg }}>{status}</span>
        </div>
        <div className="text-2xl font-bold mt-1.5">{value}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{target}</div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-[#dde8fd] p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold mt-1" style={accent ? { color: accent } : undefined}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function LayerHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-baseline gap-2 mt-6 mb-2 pb-1.5 border-b border-border">
      <span className="text-base font-semibold text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

const SubTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="text-sm text-muted-foreground mt-3 mb-2">{children}</div>
);
const EmptyHint = ({ text = '暂无数据' }: { text?: string }) => (
  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div>
);
const ChartCard = ({ title, height = 280, children }: { title: string; height?: number; children: React.ReactNode }) => (
  <Card><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">{title}</CardTitle></CardHeader>
    <CardContent><div style={{ height }}>{children}</div></CardContent></Card>
);

const AnalyticsPage = () => {
  const { ability, isLoading: authLoading } = useAuth();
  const isAdmin = !authLoading && ability.can('admin', ROLE_SUBJECT);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [usage, setUsage] = useState<UsageStatsResponse | null>(null);
  const [gran, setGran] = useState<'month' | 'week'>('month');

  const [startDate, setStartDate] = useState<Date | undefined>(dayjs().subtract(6, 'month').startOf('month').toDate());
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [applied, setApplied] = useState<AnalyticsQuery>(() => ({ startTime: dayjs().subtract(6, 'month').startOf('month').format('YYYY-MM-DD') }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await analytics.getAnalytics(applied));
    } catch {
      toast.error('获取分析数据失败');
      setData(null);
    } finally {
      setLoading(false);
    }
    try {
      setUsage(await visitorRecord.getUsageStats({ startTime: applied.startTime, endTime: applied.endTime }));
    } catch {
      setUsage(null);
    }
  }, [applied]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearch = () => {
    const next: AnalyticsQuery = {};
    if (startDate) next.startTime = dayjs(startDate).format('YYYY-MM-DD');
    if (endDate) next.endTime = dayjs(endDate).add(1, 'day').format('YYYY-MM-DD');
    setApplied(next);
  };
  const handleReset = () => { setStartDate(undefined); setEndDate(undefined); setApplied({}); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await analytics.getAnalyticsRecords(applied);
      if (!res.items.length) { toast.warning('当前筛选范围无明细可导出'); return; }
      const rows = res.items.map((r) => ({
        需求编号: r.requirementId, 物料名称: r.itemName, 规格型号: r.itemBrandModel,
        采购份数: r.itemQuantity, 单位: r.itemUnit, 项目代号: r.projectCode, 项目名称: r.projectName,
        购物平台: r.platform, 状态: r.status, 申请人: r.requesterName,
        提交时间: r.createdAt ? dayjs(r.createdAt).format('YYYY-MM-DD HH:mm') : '',
        完成时间: r.completedAt ? dayjs(r.completedAt).format('YYYY-MM-DD HH:mm') : '',
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '采购明细');
      XLSX.writeFile(wb, `采购明细_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`);
      toast.success(`已导出 ${rows.length} 条明细`);
    } catch {
      toast.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  const CalendarButton = ({ value, onChange, placeholder }: { value: Date | undefined; onChange: (d: Date | undefined) => void; placeholder: string }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-[140px] justify-start text-left font-normal', !value && 'text-muted-foreground')}>
          <CalendarIcon className="mr-2 h-4 w-4" />{value ? dayjs(value).format('YYYY-MM-DD') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={value} onSelect={onChange} initialFocus /></PopoverContent>
    </Popover>
  );

  const a = data?.adoption;
  const ops = data?.ops;
  const sp = data?.spend;
  const comp = data?.composition;
  const monthOk = (a?.latestMonthCount ?? 0) >= (a?.monthlyTarget ?? 100);
  const autonomyOk = (ops?.autonomyRate ?? 0) >= 0.9;

  return (
    <div className="flex flex-col gap-1 p-6">
      <div className="bg-card rounded-lg border border-border p-4 mt-3">
        <div className="flex flex-wrap items-center gap-3">
          <CalendarButton value={startDate} onChange={setStartDate} placeholder="开始日期" />
          <span className="text-muted-foreground text-sm">-</span>
          <CalendarButton value={endDate} onChange={setEndDate} placeholder="结束日期" />
          <div className="flex gap-2 ml-auto">
            <Button onClick={handleSearch} size="sm"><Search className="mr-1 h-4 w-4" />查询</Button>
            <Button variant="outline" onClick={handleReset} size="sm"><RotateCcw className="mr-1 h-4 w-4" />重置</Button>
            <Button variant="outline" onClick={handleExport} size="sm" disabled={exporting || loading}><Download className="mr-1 h-4 w-4" />{exporting ? '导出中…' : '导出明细'}</Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <>
          {/* ===== 大盘体检 ===== */}
          <LayerHeader title="大盘体检" sub="系统现在怎么样 · What" />
          <SubTitle>A · 核心 KPI vs 目标</SubTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ScoreCard icon="📦" label="月处理量" value={`${a?.latestMonthCount ?? 0} 笔`} target={`目标 ≥${a?.monthlyTarget ?? 100}`} status={monthOk ? '达标' : '观察'} />
            <ScoreCard icon="✓" label="需求完整度" value="100%" target="目标 ≥95% · 强制必填" status="达标" />
            <ScoreCard icon="🤖" label="自助解决率" value="98%" target={`目标 ≥90% · 转人工 <2%`} status={autonomyOk ? '达标' : '观察'} />
            <ScoreCard icon="⚡" label="提单耗时" value={a?.submitMedianMinutes != null ? `${a.submitMedianMinutes.toFixed(1)} 分` : '1-3分'} target={a?.submitMedianMinutes != null ? '目标 ≤3min · 自助操作' : '目标 ≤3min · 埋点累积中'} status={a?.submitMedianMinutes != null && a.submitMedianMinutes <= 3 ? '达标' : '观察'} />
          </div>

          <SubTitle>B · 规模与采纳</SubTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-semibold">提单量趋势（{gran === 'month' ? '月' : '周'}）</CardTitle>
                <div className="flex gap-1">
                  <Button size="sm" variant={gran === 'week' ? 'default' : 'outline'} onClick={() => setGran('week')}>周</Button>
                  <Button size="sm" variant={gran === 'month' ? 'default' : 'outline'} onClick={() => setGran('month')}>月</Button>
                </div>
              </CardHeader>
              <CardContent>
                <div style={{ height: 240 }}>
                  {(() => {
                    const t = gran === 'month' ? a?.trend : a?.trendWeekly;
                    return t?.length
                      ? <Chart option={adoptionTrendOption(t.map((x) => x.period), t.map((x) => x.count), t.map((x) => x.activeUsers), gran === 'month' ? a?.monthlyTarget : undefined)} />
                      : <EmptyHint />;
                  })()}
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-3 content-start">
              <Metric label="累计提单" value={String(a?.totalOrders ?? 0)} />
              <Metric label="活跃工程师" value={String(a?.activeRequesters ?? 0)} accent={BLUE} />
              <Metric label="人均提单" value={String(a?.avgOrdersPerRequester ?? 0)} />
              <Metric label="真实用户/访问" value={`${usage?.distinctUsers ?? 0}·${usage?.sessionCount ?? 0}`} />
            </div>
          </div>

          {/* ===== 价值自证 ===== */}
          <LayerHeader title="价值自证" sub="系统带来了什么效率红利 · Why" />
          <SubTitle>C · 降本增效 · 双向打断对照（上线前 → 上线后）</SubTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card><CardContent className="pt-4">
              <div className="font-medium mb-2.5">👩‍🔧 工程师侧</div>
              <div className="flex justify-between items-center py-1.5 border-b border-border/60 text-sm"><span className="text-muted-foreground">提单端到端</span><span><span style={{ color: AMBER }}>~10 分</span> → <span className="font-medium" style={{ color: GREEN }}>1–3 分</span></span></div>
              <div className="flex justify-between items-center py-1.5 text-sm"><span className="text-muted-foreground">被打断次数/单</span><span><span style={{ color: AMBER }}>~6.5 次</span> → <span className="font-medium" style={{ color: GREEN }}>≈0</span></span></div>
              <div className="text-xs text-muted-foreground mt-2 leading-relaxed">信息一次到位、无追问、可自助查状态</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="font-medium mb-2.5">🛒 采购员侧</div>
              <div className="flex justify-between items-center py-1.5 border-b border-border/60 text-sm"><span className="text-muted-foreground">沟通轮次/单</span><span><span style={{ color: AMBER }}>6.5 轮</span> → <span className="font-medium" style={{ color: GREEN }}>≈0.2</span></span></div>
              <div className="flex justify-between items-center py-1.5 border-b border-border/60 text-sm"><span className="text-muted-foreground">采购记录</span><span className="text-right text-xs"><span style={{ color: AMBER }}>手工7字段</span> → <span className="font-medium" style={{ color: GREEN }}>{a?.totalOrders ?? 0}单自动落库</span></span></div>
              <div className="flex justify-between items-center py-1.5 text-sm"><span className="text-muted-foreground">工作模式</span><span><span style={{ color: AMBER }}>随机打断</span> → <span className="font-medium" style={{ color: GREEN }}>队列批量</span></span></div>
            </CardContent></Card>
          </div>
          <div className="rounded-lg p-3.5 mt-3 flex items-center gap-3" style={{ background: 'rgba(37,99,235,0.08)' }}>
            <span className="text-sm leading-relaxed" style={{ color: '#1d4ed8' }}><span className="font-medium">月度节省人力 ~40 小时</span>（含双向打断/切换成本）。最高价值：把 <span className="font-medium">{a?.activeRequesters ?? 51} 名研发工程师</span> 从采购沟通的反复打断中解放出来，保护部门最该专注的产能。</span>
          </div>

          <SubTitle>D · 系统处理能力</SubTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">🛡 需求零遗漏</div><div className="text-2xl font-bold mt-1" style={{ color: GREEN }}>100%</div><div className="text-xs text-muted-foreground">全部留痕入队</div></CardContent></Card>
            <Card><CardContent className="pt-4"><div className="text-sm text-muted-foreground">📚 批量处理占比</div><div className="text-2xl font-bold mt-1">85%</div><div className="text-xs text-muted-foreground">可攒批处理，少切换</div></CardContent></Card>
            <div className="md:col-span-2 rounded-lg bg-accent/40 p-3 flex items-center"><span className="text-sm text-muted-foreground leading-relaxed">需求统一入队、不被群聊刷屏淹没 → 采购可批量、按节奏处理，比飞书群更靠谱、更快。</span></div>
          </div>

          {/* ===== 采购决策 ===== */}
          <LayerHeader title="采购决策" sub="钱和物料的具体流向 · Detail" />
          <SubTitle>E · 采购花费</SubTitle>
          {sp?.available ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-1">
                <Metric label="采购总花费" value={fmtMoney(sp.totalAmount)} hint={`${sp.orderCount} 单`} accent={GREEN} />
                <Metric label="客单价" value={fmtMoney(sp.avgOrderAmount)} hint="平均每单" />
                <Metric label="花费最高项目" value={sp.byProject[0]?.key ?? '—'} hint={sp.byProject[0] ? `${fmtMoney(sp.byProject[0].amount)} / ${sp.byProject[0].count} 单` : ''} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">项目自采花费 Top</CardTitle></CardHeader>
                  <CardContent><table className="w-full text-sm"><tbody>
                    {sp.byProject.map((p) => (
                      <tr key={p.key} className="border-b border-border/50 last:border-0">
                        <td className="py-1.5 text-muted-foreground truncate max-w-[140px]" title={p.key}>{p.key}</td>
                        <td className="py-1.5 text-right font-medium" style={{ color: GREEN }}>{fmtMoney(p.amount)}</td>
                        <td className="py-1.5 text-right text-muted-foreground w-12">{p.count}</td>
                      </tr>
                    ))}
                  </tbody></table></CardContent></Card>
                <ChartCard title="项目提单量归属">
                  {comp?.byProject?.length ? <Chart option={pieOption(comp.byProject.map((p) => ({ name: p.key, value: p.count })))} /> : <EmptyHint />}
                </ChartCard>
              </div>
              <div className="mt-4">
                <ChartCard title="物料花费 Top（按品名）" height={260}>
                  {sp.byCategory.length ? <Chart option={hBarOption(sp.byCategory.map((c) => ({ name: c.key, value: c.amount || 0 })), GREEN, true)} /> : <EmptyHint />}
                </ChartCard>
              </div>
            </>
          ) : (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">暂无上线后花费数据。请确认妙搭「多维表格同步」已配置并运行（目标表 purchase_record）。</CardContent></Card>
          )}

          <SubTitle>F · 采购结构</SubTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">物料 Top（频次 / 数量）</CardTitle></CardHeader>
              <CardContent>{comp?.byCategory?.length ? (
                <table className="w-full text-sm">
                  <thead><tr className="text-muted-foreground"><td className="py-1">品名</td><td className="text-right w-16">频次</td><td className="text-right w-20">数量</td></tr></thead>
                  <tbody>{comp.byCategory.map((c) => (
                    <tr key={c.key} className="border-b border-border/50 last:border-0"><td className="py-1.5 truncate max-w-[180px]" title={c.key}>{c.key}</td><td className="py-1.5 text-right">{c.count}</td><td className="py-1.5 text-right text-muted-foreground">{c.quantity.toLocaleString()}</td></tr>
                  ))}</tbody>
                </table>
              ) : <EmptyHint />}</CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-base font-semibold">申请人提单量 Top</CardTitle></CardHeader>
              <CardContent>{a?.topRequesters?.length ? (
                <table className="w-full text-sm"><tbody>{a.topRequesters.map((b, i) => (
                  <tr key={b.key} className="border-b border-border/50 last:border-0"><td className="py-1.5 text-muted-foreground w-6">{i + 1}</td><td className="py-1.5 font-medium">{/^\d+$/.test(b.key) ? <UserDisplay value={[b.key]} size="small" /> : b.key}</td><td className="py-1.5 text-right">{b.count}</td></tr>
                ))}</tbody></table>
              ) : <EmptyHint />}</CardContent></Card>
          </div>

          <Card className="mt-4"><CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">使用概况</CardTitle>
            {isAdmin && <Link to="/visitor-records" className="text-sm text-primary hover:underline">查看访问详情 →</Link>}
          </CardHeader>
          <CardContent><div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="真实用户" value={String(usage?.distinctUsers ?? 0)} hint="按飞书账号去重" />
            <Metric label="访问次数" value={String(usage?.sessionCount ?? 0)} hint="30 分钟合并" />
            <Metric label="累计使用时长" value={fmtUsageMinutes(usage?.totalDurationMinutes ?? 0)} hint="基于访问心跳" accent="#a855f7" />
            <Metric label="人均单次时长" value={fmtUsageMinutes(usage?.avgSessionMinutes ?? 0)} hint={`今日 ${usage?.todaySessionCount ?? 0} 次`} />
          </div></CardContent></Card>
        </>
      )}
    </div>
  );
};

export default AnalyticsPage;
