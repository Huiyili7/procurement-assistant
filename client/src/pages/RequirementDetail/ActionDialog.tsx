import React from 'react';
import { Button } from '@client/src/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@client/src/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Input } from '@client/src/components/ui/input';
import { Textarea } from '@client/src/components/ui/textarea';
import type { ProcurementStatus } from '@shared/api.interface';

interface ActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  onConfirm: () => void;
  confirmText?: string;
  loading?: boolean;
}

export const ActionDialog: React.FC<ActionDialogProps> = ({
  open,
  onOpenChange,
  title,
  children,
  onConfirm,
  confirmText = '确认',
  loading = false,
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="py-4">{children}</div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          取消
        </Button>
        <Button onClick={onConfirm} disabled={loading}>
          {loading ? '处理中...' : confirmText}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

type DialogType = 'accept' | 'update' | 'receive' | 'transfer';

interface DialogFormProps {
  dialogType: DialogType;
  formStatus: ProcurementStatus;
  formRemark: string;
  formTracking: string;
  formReason: string;
  onStatusChange: (v: ProcurementStatus) => void;
  onRemarkChange: (v: string) => void;
  onTrackingChange: (v: string) => void;
  onReasonChange: (v: string) => void;
}

export const DialogForm: React.FC<DialogFormProps> = ({
  dialogType,
  formStatus,
  formRemark,
  formTracking,
  formReason,
  onStatusChange,
  onRemarkChange,
  onTrackingChange,
  onReasonChange,
}) => {
  switch (dialogType) {
    case 'accept':
      return (
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">备注</label>
            <Textarea
              value={formRemark}
              onChange={(e) => onRemarkChange(e.target.value)}
              placeholder="输入备注信息（可选）"
            />
          </div>
        </div>
      );
    case 'receive':
      return (
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">物流单号</label>
            <Input
              value={formTracking}
              onChange={(e) => onTrackingChange(e.target.value)}
              placeholder="输入物流单号"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">备注</label>
            <Textarea
              value={formRemark}
              onChange={(e) => onRemarkChange(e.target.value)}
              placeholder="输入备注信息（可选）"
            />
          </div>
        </div>
      );
    case 'update':
      return (
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">目标状态</label>
            <Select
              value={formStatus}
              onValueChange={(v) => onStatusChange(v as ProcurementStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="待采购">待采购</SelectItem>
                <SelectItem value="采购中">采购中</SelectItem>
                <SelectItem value="待收货">待收货</SelectItem>
                <SelectItem value="已完成">已完成</SelectItem>
                <SelectItem value="已取消">已取消</SelectItem>
                <SelectItem value="人工处理中">人工处理中</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">物流单号</label>
            <Input
              value={formTracking}
              onChange={(e) => onTrackingChange(e.target.value)}
              placeholder="输入物流单号（可选）"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">备注</label>
            <Textarea
              value={formRemark}
              onChange={(e) => onRemarkChange(e.target.value)}
              placeholder="输入备注信息（可选）"
            />
          </div>
        </div>
      );
    case 'transfer':
      return (
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">转人工原因</label>
            <Textarea
              value={formReason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="请说明转人工的原因"
              required
            />
          </div>
        </div>
      );
  }
};

export const DIALOG_TITLES: Record<DialogType, string> = {
  accept: '确认接收',
  receive: '标记为待收货',
  update: '更新状态',
  transfer: '转人工处理',
};
