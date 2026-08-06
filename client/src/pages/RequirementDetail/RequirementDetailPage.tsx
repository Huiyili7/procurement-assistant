import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Clock,
  Package,
  Truck,
  FileText,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

import {
  getRequirementDetail,
  getStatusLogs,
  updateStatus,
  transferToHuman,
} from '@client/src/api/procurement';
import type {
  ProcurementRequirement,
  ProcurementStatusLog,
  ProcurementStatus,
} from '@shared/api.interface';
import { UserDisplay } from '@client/src/components/business-ui/user-display';
import { Card, CardContent, CardHeader, CardTitle } from '@client/src/components/ui/card';
import { Button } from '@client/src/components/ui/button';
import { StatusTag, InfoRow, TimelineNode } from './DetailComponents';
import { ActionDialog, DialogForm, DIALOG_TITLES } from './ActionDialog';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';
import { buildRebuyPrefill } from '../ProcurementSubmit/constants';
import SpecBreakdown from '@client/src/components/SpecBreakdown';

type DialogType = 'accept' | 'update' | 'receive' | 'transfer';

const RequirementDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<ProcurementRequirement | null>(null);
  const [logs, setLogs] = useState<ProcurementStatusLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<DialogType | null>(null);

  const [formStatus, setFormStatus] = useState<ProcurementStatus>('待采购');
  const [formRemark, setFormRemark] = useState('');
  const [formTracking, setFormTracking] = useState('');
  const [formReason, setFormReason] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getRequirementDetail(id),
      getStatusLogs(id),
    ])
      .then(([detailRes, logsRes]) => {
        setDetail(detailRes);
        setLogs(logsRes.items || []);
      })
      .catch((err: Error) => {
        toast.error('加载失败: ' + err.message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const refreshData = async () => {
    if (!id) return;
    const [newDetail, newLogs] = await Promise.all([
      getRequirementDetail(id),
      getStatusLogs(id),
    ]);
    setDetail(newDetail);
    setLogs(newLogs.items || []);
  };

  const handleAction = async () => {
    if (!id || !dialogType) return;
    setActionLoading(true);
    try {
      if (dialogType === 'transfer') {
        await transferToHuman(id, { reason: formReason });
        toast.success('已转人工处理');
      } else {
        const extraInfo: Record<string, unknown> = {};
        if (formTracking) extraInfo.trackingNumber = formTracking;
        await updateStatus(id, {
          status: formStatus,
          remark: formRemark,
          extraInfo,
        });
        toast.success('状态更新成功');
      }
      setDialogOpen(false);
      await refreshData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败';
      toast.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRebuy = () => {
    if (!detail) return;
    navigate('/', { state: { rebuy: buildRebuyPrefill(detail) } });
  };

  const openDialog = (type: DialogType) => {
    setDialogType(type);
    setFormRemark('');
    setFormTracking('');
    setFormReason('');
    if (type === 'accept') setFormStatus('采购中');
    else if (type === 'receive') setFormStatus('待收货');
    else if (type === 'update') setFormStatus(detail?.status || '待采购');
    setDialogOpen(true);
  };

  const renderActions = () => {
    if (!detail) return null;
    const { status } = detail;
    if (status === '待采购') {
      return (
        <div className="flex gap-2">
          <Button onClick={() => openDialog('accept')}>
            <CheckCircle2 className="size-4 mr-1" />
            确认接收
          </Button>
          <Button variant="outline" onClick={() => openDialog('transfer')}>
            转人工
          </Button>
        </div>
      );
    }
    if (status === '采购中') {
      return (
        <Button onClick={() => openDialog('receive')}>
          <Truck className="size-4 mr-1" />
          标记为待收货
        </Button>
      );
    }
    if (status === '待收货') {
      return (
        <Button onClick={() => openDialog('update')}>
          <CheckCircle2 className="size-4 mr-1" />
          确认收货
        </Button>
      );
    }
    if (status === '人工处理中') {
      return (
        <Button onClick={() => openDialog('update')}>
          <Clock className="size-4 mr-1" />
          更新状态
        </Button>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">未找到需求信息</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {detail.requirementId}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {detail.item.name}
            </p>
          </div>
        </div>
        <StatusTag status={detail.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Info Cards */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="size-4 text-primary" />
                物料信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <InfoRow label="物料名称" value={detail.item.name} />
              <InfoRow
                label="商品链接"
                value={
                  <UniversalLink
                    to={detail.item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                  >
                    查看商品
                  </UniversalLink>
                }
              />
              <SpecBreakdown
                brandModel={detail.item.brandModel}
                quantity={detail.item.quantity}
                unit={detail.item.unit}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                项目信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow label="项目代号" value={detail.project.code} />
              {detail.project.purpose && <InfoRow label="额外说明" value={detail.project.purpose} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="size-4 text-primary" />
                物流信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow
                label="库存核查"
                value={detail.logistics.inventoryChecked ? '已核查' : '未核查'}
              />
              <InfoRow
                label="核查人"
                value={
                  detail.logistics.inventoryChecker ? (
                    <UserDisplay userId={detail.logistics.inventoryChecker} />
                  ) : (
                    '-'
                  )
                }
              />
              <InfoRow
                label="期望到货"
                value={
                  detail.logistics.expectedDelivery
                    ? dayjs(detail.logistics.expectedDelivery).format('YYYY-MM-DD')
                    : '-'
                }
              />
              <InfoRow
                label="收货地址"
                value={detail.logistics.deliveryAddress || '-'}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                其他信息
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <InfoRow label="需求编号" value={detail.requirementId} />
              <InfoRow
                label="提报人"
                value={<UserDisplay userId={detail.requester} />}
              />
              <InfoRow
                label="采购执行人"
                value={
                  detail.assignee ? (
                    <UserDisplay userId={detail.assignee} />
                  ) : (
                    '-'
                  )
                }
              />
              <InfoRow
                label="特殊要求"
                value={detail.specialRequirements || '-'}
              />
              <InfoRow
                label="创建时间"
                value={dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm:ss')}
              />
              <InfoRow
                label="更新时间"
                value={dayjs(detail.updatedAt).format('YYYY-MM-DD HH:mm:ss')}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: Timeline + Actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">操作</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Button className="w-full" onClick={handleRebuy}>
                  <RefreshCw className="size-4 mr-1" />
                  再次购买
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(-1)}
                >
                  <ArrowLeft className="size-4 mr-1" />
                  返回列表
                </Button>
                {renderActions()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="size-4 text-primary" />
                状态流转
              </CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  暂无状态记录
                </p>
              ) : (
                <div className="pl-1">
                  {logs.map((log, idx) => (
                    <TimelineNode
                      key={log.id}
                      log={log}
                      isLatest={idx === 0}
                      isLast={idx === logs.length - 1}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Action Dialog */}
      {dialogType && (
        <ActionDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          title={DIALOG_TITLES[dialogType]}
          onConfirm={handleAction}
          confirmText={dialogType === 'transfer' ? '确认转人工' : '确认'}
          loading={actionLoading}
        >
          <DialogForm
            dialogType={dialogType}
            formStatus={formStatus}
            formRemark={formRemark}
            formTracking={formTracking}
            formReason={formReason}
            onStatusChange={setFormStatus}
            onRemarkChange={setFormRemark}
            onTrackingChange={setFormTracking}
            onReasonChange={setFormReason}
          />
        </ActionDialog>
      )}
    </div>
  );
};

export default RequirementDetailPage;
