import React from 'react';
import { parseSpecDetails } from '@client/src/pages/ProcurementSubmit/constants';

interface SpecBreakdownProps {
  brandModel?: string;
  quantity?: string;
  unit?: string;
}

/**
 * 规格 + 份数展示。
 * 单规格：显示「规格型号 / 采购份数」两行；
 * 多规格：把合并存储的型号串还原成分行明细 + 合计，避免把各规格份数加在一起当总数误导。
 */
export const SpecBreakdown: React.FC<SpecBreakdownProps> = ({
  brandModel,
  quantity,
  unit,
}) => {
  const unitText = unit || '份';
  const specs = parseSpecDetails(brandModel, quantity);

  if (specs.length <= 1) {
    const only = specs[0];
    return (
      <div className="space-y-1 text-sm">
        <div className="flex gap-2">
          <span className="text-muted-foreground">规格型号：</span>
          <span>{only?.itemBrandModel || '-'}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-muted-foreground">采购份数：</span>
          <span>
            {only?.itemQuantity || quantity || '-'} {unitText}
          </span>
        </div>
      </div>
    );
  }

  const total = specs.reduce((s, x) => s + (parseInt(x.itemQuantity, 10) || 0), 0);
  return (
    <div className="text-sm">
      <div className="text-muted-foreground mb-1">规格明细（共 {specs.length} 种）</div>
      <div className="rounded-md border border-border divide-y divide-border">
        {specs.map((s, i) => (
          <div key={i} className="flex justify-between gap-4 px-3 py-1.5">
            <span>{s.itemBrandModel || '-'}</span>
            <span className="text-muted-foreground whitespace-nowrap">
              {s.itemQuantity || '-'} {unitText}
            </span>
          </div>
        ))}
        <div className="flex justify-between gap-4 px-3 py-1.5 bg-accent/40 font-medium">
          <span>合计</span>
          <span className="whitespace-nowrap">
            {total} {unitText}
          </span>
        </div>
      </div>
    </div>
  );
};

export default SpecBreakdown;
