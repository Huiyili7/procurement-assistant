import React from 'react';
import dayjs from 'dayjs';
import { User } from 'lucide-react';

import type {
  ProcurementStatusLog,
  ProcurementStatus,
} from '@shared/api.interface';
import { UserDisplay } from '@client/src/components/business-ui/user-display';
import { Badge } from '@client/src/components/ui/badge';

const STATUS_COLOR_MAP: Record<ProcurementStatus, string> = {
  未开始: 'bg-gray-100 text-gray-700',
  信息收集中: 'bg-gray-100 text-gray-700',
  待采购: 'bg-orange-100 text-orange-700',
  采购中: 'bg-blue-100 text-blue-700',
  待收货: 'bg-cyan-100 text-cyan-700',
  已完成: 'bg-green-100 text-green-700',
  已取消: 'bg-gray-100 text-gray-500',
  人工处理中: 'bg-purple-100 text-purple-700',
};

const STATUS_LABEL_MAP: Record<ProcurementStatus, string> = {
  未开始: '未开始',
  信息收集中: '信息收集中',
  待采购: '待采购',
  采购中: '采购中',
  待收货: '待收货',
  已完成: '已完成',
  已取消: '已取消',
  人工处理中: '人工处理中',
};

export const StatusTag: React.FC<{ status: ProcurementStatus }> = ({ status }) => (
  <Badge className={STATUS_COLOR_MAP[status]}>
    {STATUS_LABEL_MAP[status]}
  </Badge>
);

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
}

export const InfoRow: React.FC<InfoRowProps> = ({ label, value }) => (
  <div className="flex items-start gap-2 py-2">
    <span className="text-sm text-muted-foreground shrink-0 w-24">{label}</span>
    <span className="text-sm text-foreground">{value}</span>
  </div>
);

export const TimelineNode: React.FC<{
  log: ProcurementStatusLog;
  isLatest: boolean;
  isLast: boolean;
}> = ({ log, isLatest, isLast }) => (
  <div className="flex gap-3">
    <div className="flex flex-col items-center">
      <div
        className={`size-3 rounded-full shrink-0 mt-1.5 ${
          isLatest ? 'bg-primary ring-4 ring-primary/20' : 'bg-border'
        }`}
      />
      {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
    </div>
    <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <StatusTag status={log.newStatus as ProcurementStatus} />
        <span className="text-xs text-muted-foreground">
          {dayjs(log.createdAt).format('YYYY-MM-DD HH:mm')}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1 text-sm">
        <User className="size-3.5 text-muted-foreground" />
        <UserDisplay value={[log.operator]} size="small" />
      </div>
      {log.remark && (
        <p className="mt-1 text-sm text-muted-foreground">{log.remark}</p>
      )}
    </div>
  </div>
);
