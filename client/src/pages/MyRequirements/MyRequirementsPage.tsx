import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { Calendar } from '@client/src/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@client/src/components/ui/popover';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';
import { Input } from '@client/src/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { procurement } from '@client/src/api';
import type { RequirementListItem, MyRequirementsQuery } from '@shared/api.interface';
import { buildRebuyPrefill } from '@client/src/pages/ProcurementSubmit/constants';
import { CalendarIcon, Search, RotateCcw, Pencil, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { cn } from '@client/src/lib/utils';
import { RequirementEditDialog } from '@client/src/components/RequirementEditDialog';

const STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '待采购', value: '待采购' },
  { label: '采购中', value: '采购中' },
  { label: '待收货', value: '待收货' },
  { label: '已完成', value: '已完成' },
  { label: '已取消', value: '已取消' },
  { label: '人工处理中', value: '人工处理中' },
  { label: '信息收集中', value: '信息收集中' },
] as const;

const STATUS_STYLE_MAP: Record<string, string> = {
  待采购: 'bg-orange-100 text-orange-700 border-orange-200',
  采购中: 'bg-blue-100 text-blue-700 border-blue-200',
  待收货: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  已完成: 'bg-green-100 text-green-700 border-green-200',
  已取消: 'bg-gray-100 text-gray-600 border-gray-200',
  人工处理中: 'bg-purple-100 text-purple-700 border-purple-200',
  信息收集中: 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLE_MAP[status] || 'bg-gray-100 text-gray-600 border-gray-200';
  return <Badge className={cn('rounded-full', cls)}>{status}</Badge>;
}

const MyRequirementsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RequirementListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Filter states
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [projectCode, setProjectCode] = useState('');
  const [status, setStatus] = useState('');

  // Applied filter states (only applied on search)
  const [appliedStartDate, setAppliedStartDate] = useState<Date | undefined>(undefined);
  const [appliedEndDate, setAppliedEndDate] = useState<Date | undefined>(undefined);
  const [appliedProjectCode, setAppliedProjectCode] = useState('');
  const [appliedStatus, setAppliedStatus] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: MyRequirementsQuery = {
        page,
        pageSize,
      };
      if (appliedStatus) params.status = appliedStatus;
      if (appliedProjectCode) params.projectCode = appliedProjectCode;
      if (appliedStartDate) params.startTime = dayjs(appliedStartDate).format('YYYY-MM-DD');
      if (appliedEndDate) params.endTime = dayjs(appliedEndDate).format('YYYY-MM-DD');

      const res = await procurement.getMyRequirements(params);
      setData(res.items || []);
      setTotal(res.total || 0);
    } catch {
      toast.error('获取需求列表失败');
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, appliedStartDate, appliedEndDate, appliedProjectCode, appliedStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSearch = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedProjectCode(projectCode);
    setAppliedStatus(status);
    setPage(1);
  };

  const handleReset = () => {
    setStartDate(undefined);
    setEndDate(undefined);
    setProjectCode('');
    setStatus('');
    setAppliedStartDate(undefined);
    setAppliedEndDate(undefined);
    setAppliedProjectCode('');
    setAppliedStatus('');
    setPage(1);
  };

  const [rebuyingId, setRebuyingId] = useState<string | null>(null);
  const handleRebuy = useCallback(
    async (id: string) => {
      setRebuyingId(id);
      try {
        const detail = await procurement.getRequirementDetail(id);
        navigate('/', { state: { rebuy: buildRebuyPrefill(detail) } });
      } catch {
        toast.error('获取需求信息失败');
      } finally {
        setRebuyingId(null);
      }
    },
    [navigate],
  );

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const handleEdit = useCallback((id: string) => {
    setEditingId(id);
    setEditDialogOpen(true);
  }, []);

  const columns = useMemo(
    () => [
      {
        title: '物料名称',
        dataIndex: 'itemName',
        key: 'itemName',
        width: 200,
        ellipsis: true,
      },
      {
        title: '项目代号',
        dataIndex: 'projectCode',
        key: 'projectCode',
        width: 120,
      },
      {
        title: '状态',
        dataIndex: 'status',
        key: 'status',
        width: 100,
        render: (status: string) => <StatusBadge status={status} />,
      },
      {
        title: '提交时间',
        dataIndex: 'createdAt',
        key: 'createdAt',
        width: 150,
        render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-'),
      },
      {
        title: '操作',
        key: 'action',
        width: 180,
        fixed: 'right' as const,
        render: (_: unknown, record: RequirementListItem) => (
          <div className="flex items-center gap-2">
            {record.status === '待采购' && (
              <button
                type="button"
                className="text-primary hover:underline text-sm font-medium flex items-center gap-1"
                onClick={() => handleEdit(record.id)}
              >
                <Pencil className="h-3.5 w-3.5" />
                修改
              </button>
            )}
            <button
              type="button"
              className="text-primary hover:underline text-sm font-medium"
              onClick={() => navigate(`/requirements/${record.id}`)}
            >
              查看详情
            </button>
            <button
              type="button"
              className="text-primary hover:underline text-sm font-medium disabled:opacity-50"
              disabled={rebuyingId === record.id}
              onClick={() => handleRebuy(record.id)}
            >
              {rebuyingId === record.id ? '处理中…' : '再次购买'}
            </button>
          </div>
        ),
      },
    ],
    [navigate, handleRebuy, rebuyingId, handleEdit],
  );

  // 移动端卡片列表项
  const MobileCard = ({ record }: { record: RequirementListItem }) => (
    <div className="bg-card rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between">
        <h3 className="font-medium text-foreground text-base flex-1 pr-2 line-clamp-2">
          {record.itemName}
        </h3>
        <StatusBadge status={record.status} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-muted-foreground">项目代号：</span>
          <span className="text-foreground">{record.projectCode || '-'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">提交时间：</span>
          <span className="text-foreground">
            {record.createdAt ? dayjs(record.createdAt).format('MM-DD HH:mm') : '-'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        {record.status === '待采购' && (
          <button
            type="button"
            className="text-primary text-sm font-medium flex items-center gap-1"
            onClick={() => handleEdit(record.id)}
          >
            <Pencil className="h-3.5 w-3.5" />
            修改
          </button>
        )}
        <button
          type="button"
          className="text-primary text-sm font-medium"
          onClick={() => navigate(`/requirements/${record.id}`)}
        >
          查看详情
        </button>
        <button
          type="button"
          className="text-primary text-sm font-medium disabled:opacity-50"
          disabled={rebuyingId === record.id}
          onClick={() => handleRebuy(record.id)}
        >
          {rebuyingId === record.id ? '处理中…' : '再次购买'}
        </button>
      </div>
    </div>
  );

  const CalendarButton = ({
    value,
    onChange,
    placeholder,
  }: {
    value: Date | undefined;
    onChange: (d: Date | undefined) => void;
    placeholder: string;
  }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-[140px] justify-start text-left font-normal',
            !value && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? dayjs(value).format('YYYY-MM-DD') : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={onChange}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">我的采购需求</h1>
      </div>

      {/* 筛选区 - 响应式布局 */}
      <div className="bg-card rounded-lg border border-border p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarButton
              value={startDate}
              onChange={setStartDate}
              placeholder="开始日期"
            />
            <span className="text-muted-foreground text-sm">-</span>
            <CalendarButton
              value={endDate}
              onChange={setEndDate}
              placeholder="结束日期"
            />
          </div>
          <Input
            placeholder="项目代号"
            className="w-full sm:w-[160px]"
            value={projectCode}
            onChange={(e) => setProjectCode(e.target.value)}
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-[140px]">
              <SelectValue placeholder="需求状态" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2 sm:ml-auto">
            <Button onClick={handleSearch} size="sm" className="flex-1 sm:flex-none">
              <Search className="mr-1 h-4 w-4" />
              搜索
            </Button>
            <Button variant="outline" onClick={handleReset} size="sm" className="flex-1 sm:flex-none">
              <RotateCcw className="mr-1 h-4 w-4" />
              重置
            </Button>
          </div>
        </div>
      </div>

      {/* 列表区 - 桌面端表格 / 移动端卡片 */}
      <div className="bg-card rounded-lg border border-border p-4">
        {/* 桌面端表格 */}
        <div className="hidden md:block">
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            scroll={{ y: 500 }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (t: number, range: [number, number]) =>
                `第 ${range[0]}-${range[1]} 条 / 共 ${t} 条`,
              onChange: (p: number, ps: number) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
            locale={{
              emptyText: (
                <div className="py-8 text-center text-muted-foreground">
                  暂无采购需求数据
                </div>
              ),
            }}
          />
        </div>

        {/* 移动端卡片列表 */}
        <div className="md:hidden">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">加载中...</div>
          ) : data.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              暂无采购需求数据
            </div>
          ) : (
            <div className="space-y-3">
              {data.map((record) => (
                <MobileCard key={record.id} record={record} />
              ))}
              {/* 移动端分页 */}
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  上一页
                </Button>
                <span className="text-sm text-muted-foreground">
                  第 {page} 页 / 共 {Math.ceil(total / pageSize)} 页
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / pageSize)}
                  onClick={() => setPage(page + 1)}
                >
                  下一页
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <RequirementEditDialog
        requirementId={editingId || ''}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={fetchData}
      />
    </div>
  );
};

export default MyRequirementsPage;
