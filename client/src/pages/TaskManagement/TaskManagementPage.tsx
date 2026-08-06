import { useCallback, useEffect, useMemo, useState } from 'react';
import SpecBreakdown from '@client/src/components/SpecBreakdown';
import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@client/src/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Badge } from '@client/src/components/ui/badge';
import { UserDisplay } from '@client/src/components/business-ui/user-display';
import { Table } from '@lark-apaas/client-toolkit/antd-table';
import { Tag } from 'antd';
import { Search, RotateCcw, Clock, CheckCircle } from 'lucide-react';
import { Checkbox } from 'antd';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import type {
  AssignedTaskListItem,
  ProcurementRequirement,
  ProcurementStatus,
  UpdateStatusRequest,
} from '@shared/api.interface';
import { procurement } from '@client/src/api';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';

const STATUS_OPTIONS: { label: string; value: string; color: string }[] = [
  { label: '待采购', value: '待采购', color: 'orange' },
  { label: '已完成', value: '已完成', color: 'teal' },
  { label: '已取消', value: '已取消', color: 'default' },
];

const statusColorMap: Record<string, string> = {
  未开始: 'default',
  信息收集中: 'processing',
  待采购: 'orange',
  人工处理中: 'purple',
  采购中: 'blue',
  待收货: 'green',
  已完成: 'teal',
  已取消: 'default',
};

const TASK_STATUS_OPTIONS: ProcurementStatus[] = [
  '待采购',
  '已完成',
  '已取消',
];

const TaskManagementPage = () => {
  const [data, setData] = useState<AssignedTaskListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>('待采购');
  const [requesterFilter, setRequesterFilter] = useState('');
  const [projectCodeFilter, setProjectCodeFilter] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentTask, setCurrentTask] = useState<AssignedTaskListItem | null>(null);
  const [detail, setDetail] = useState<ProcurementRequirement | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);

  const [newStatus, setNewStatus] = useState<ProcurementStatus>('待采购');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await procurement.getAssignedTasks({
        page,
        pageSize,
        status: statusFilter || undefined,
        requesterId: requesterFilter || undefined,
        projectCode: projectCodeFilter || undefined,
      });
      setData(res.items);
      setTotal(res.total);
    } catch {
      toast.error('获取任务列表失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, requesterFilter, projectCodeFilter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleSearch = () => {
    setPage(1);
    fetchTasks();
  };

  const handleReset = () => {
    setStatusFilter('待采购');
    setRequesterFilter('');
    setProjectCodeFilter('');
    setPage(1);
  };

  const handleOpenDialog = async (record: AssignedTaskListItem) => {
    setCurrentTask(record);
    setDialogOpen(true);
    setDetailLoading(true);
      setRemark('');
    try {
      const res = await procurement.getRequirementDetail(record.id);
      setDetail(res);
      setNewStatus(res.status);
    } catch {
      toast.error('获取需求详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!currentTask) return;
    setSubmitting(true);
    try {
      const req: UpdateStatusRequest = {
        status: newStatus,
        remark: remark || undefined,
      };
      await procurement.updateStatus(currentTask.id, req);
      toast.success('状态更新成功');
      setDialogOpen(false);
      fetchTasks();
    } catch {
      toast.error('状态更新失败');
    } finally {
      setSubmitting(false);
    }
  };



  const handleBatchComplete = async () => {
    const selectedIds = selectedRowKeys.map((k) => String(k));
    if (selectedIds.length === 0) {
      toast.info('请先勾选需要完成的任务');
      return;
    }
    setBatchLoading(true);
    try {
      const res = await procurement.batchCompleteSelected(selectedIds);
      if (res.updatedCount === 0) {
        toast.info('选中的任务中没有待采购的记录');
      } else {
        toast.success(`已将 ${res.updatedCount} 条任务标记为已完成`);
      }
      setConfirmOpen(false);
      setSelectedRowKeys([]);
      fetchTasks();
    } catch {
      toast.error('批量操作失败');
    } finally {
      setBatchLoading(false);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo<Array<any>>(() => [
    {
      title: (
        <Checkbox
          checked={data.length > 0 && selectedRowKeys.length === data.length}
          indeterminate={selectedRowKeys.length > 0 && selectedRowKeys.length < data.length}
          onChange={(e) => {
            setSelectedRowKeys(e.target.checked ? data.map((item) => item.id) : []);
          }}
        />
      ),
      key: 'selection',
      width: 48,
      render: (_: unknown, record: AssignedTaskListItem) => (
        <Checkbox
          checked={selectedRowKeys.includes(record.id)}
          onChange={(e) => {
            setSelectedRowKeys(
              e.target.checked
                ? [...selectedRowKeys, record.id]
                : selectedRowKeys.filter((k) => k !== record.id),
            );
          }}
        />
      ),
    },
    {
      title: '需求编号',
      dataIndex: 'requirementId',
      key: 'requirementId',
      width: 150,
    },
    {
      title: '物料名称',
      dataIndex: 'itemName',
      key: 'itemName',
      width: 180,
    },
    {
      title: '提报人',
      dataIndex: 'requester',
      key: 'requester',
      width: 120,
      render: (userId: string) => <UserDisplay userId={userId} />,
    },
    {
      title: '项目代号',
      dataIndex: 'projectCode',
      key: 'projectCode',
      width: 130,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag bordered={false} color={statusColorMap[status] || 'default'}>
          {status}
        </Tag>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '超时标记',
      dataIndex: 'isOverdue',
      key: 'isOverdue',
      width: 80,
      render: (isOverdue: boolean) =>
        isOverdue ? (
          <Badge variant="destructive" className="text-xs">
            <Clock className="mr-1 size-3" />
            超时
          </Badge>
        ) : null,
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_, record) => (
        <Button
          variant="ghost"
          size="sm"
          className="p-0 h-auto text-primary"
          onClick={() => handleOpenDialog(record)}
        >
          处理
        </Button>
      ),
    },
  ], [selectedRowKeys, data, handleOpenDialog]);

  const rowClassName = (record: AssignedTaskListItem) =>
    record.status === '待采购' ? 'bg-yellow-50/60' : '';

  return (
    <div className="flex flex-col gap-4">

      {/* 筛选区 */}
      <div className="flex flex-wrap items-center gap-3 bg-card rounded-lg border p-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">状态</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="全部" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">全部</SelectItem>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">提报人</span>
          <Input
            placeholder="输入 requesterId"
            value={requesterFilter}
            onChange={(e) => setRequesterFilter(e.target.value)}
            className="w-[180px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">项目代号</span>
          <Input
            placeholder="输入项目代号"
            value={projectCodeFilter}
            onChange={(e) => setProjectCodeFilter(e.target.value)}
            className="w-[160px]"
          />
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={batchLoading || selectedRowKeys.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <CheckCircle className="mr-1 size-4" />
            已完成
          </Button>
          <Button size="sm" onClick={handleSearch}>
            <Search className="mr-1 size-4" />
            搜索
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-1 size-4" />
            重置
          </Button>
        </div>
      </div>

      {/* 列表区 */}
      <div className="bg-card rounded-lg border">
        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          scroll={{ y: 500 }}
          rowClassName={rowClassName}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
        />
      </div>

      {/* 任务处理弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>处理采购任务</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="py-8 text-center text-muted-foreground">加载中...</div>
          ) : detail ? (
            <div className="flex flex-col gap-4">
              {/* 需求基本信息 */}
              <div className="bg-accent rounded-lg p-4">
                <h3 className="text-sm font-semibold text-accent-foreground mb-3">需求信息</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">物料名称：</span>
                    <span className="font-medium">{detail.item.name}</span>
                  </div>
                  <div className="col-span-2">
                    <SpecBreakdown
                      brandModel={detail.item.brandModel}
                      quantity={detail.item.quantity}
                      unit={detail.item.unit}
                    />
                  </div>
                  <div>
                    <span className="text-muted-foreground">项目代号：</span>
                    <span>{detail.project.code}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">物料链接：</span>
                    {detail.item.link ? (
                      <UniversalLink
                        to={detail.item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline ml-1"
                      >
                        {detail.item.link}
                      </UniversalLink>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">提报人：</span>
                    <UserDisplay userId={detail.requester} />
                  </div>
                  <div>
                    <span className="text-muted-foreground">联系电话：</span>
                    <span>{detail.logistics.contactPhone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">收货地址：</span>
                    <span>{detail.logistics.deliveryAddress || '-'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">特殊要求：</span>
                    <span>{detail.specialRequirements || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 采购截图 */}
              {detail.screenshotUrl && (
                <div className="bg-accent rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-accent-foreground mb-3">采购截图</h3>
                  <button
                    type="button"
                    onClick={() => setScreenshotPreview(detail.screenshotUrl ?? null)}
                    className="cursor-pointer bg-transparent border-0 p-0"
                  >
                    <img
                      src={`${detail.screenshotUrl}?preview=true`}
                      alt="采购截图"
                      className="max-w-full max-h-48 rounded border border-border object-contain hover:opacity-80 transition-opacity"
                    />
                  </button>
                </div>
              )}

              {/* 状态更新 */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">更新状态</label>
                <Select
                  value={newStatus}
                  onValueChange={(v) => setNewStatus(v as ProcurementStatus)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 备注 */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">备注</label>
                <Textarea
                  placeholder="输入备注信息"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={2}
                />
              </div>


            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">无法加载需求详情</div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpdateStatus} disabled={submitting || detailLoading}>
              确认更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量已完成确认弹窗 */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认标记已完成</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定将选中的 {selectedRowKeys.length} 条「待采购」任务标记为「已完成」吗？
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button onClick={handleBatchComplete} disabled={batchLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {batchLoading ? '处理中...' : '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 截图预览弹窗 */}
      <Dialog open={!!screenshotPreview} onOpenChange={(open) => { if (!open) setScreenshotPreview(null); }}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader>
            <DialogTitle>采购截图</DialogTitle>
          </DialogHeader>
          {screenshotPreview && (
            <img
              src={`${screenshotPreview}?preview=true`}
              alt="采购截图预览"
              className="w-full h-auto rounded object-contain max-h-[80vh]"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TaskManagementPage;
