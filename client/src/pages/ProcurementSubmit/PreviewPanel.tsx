import React, { useState } from 'react';
import dayjs from 'dayjs';
import {
  CheckCircle, Clock, Package, FolderOpen, Truck,
  SkipForward, Loader2, Pencil, Plus, ListChecks, Calendar, ArrowLeft, ChevronDown,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import type { BatchCreateItemRequest } from '@shared/api.interface';
import {
  COLLECT_FIELDS, isFieldFilled, formatFieldValue, parseSpecDetails,
} from './constants';

interface PreviewPanelProps {
  collected: Record<string, unknown>;
  skippedFields: Set<string>;
  showPreview: boolean;
  transferred: boolean;
  batchMode: boolean;
  batchItems: BatchCreateItemRequest[];
  batchPreview: boolean;
  submitting: boolean;
  onModifyField: (key: string) => void;
  onEditExpectedDelivery: (date: string) => void;
  onModify: () => void;
  onConfirm: () => void;
  onContinueAddMaterial: () => void;
  onSubmitAll: () => void;
  onConfirmBatch: () => void;
  onReset: () => void;
  onBackToChat?: () => void;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({
  collected, skippedFields, showPreview, transferred,
  batchMode, batchItems, batchPreview, submitting,
  onModifyField, onEditExpectedDelivery, onModify, onConfirm, onContinueAddMaterial,
  onSubmitAll, onConfirmBatch, onReset, onBackToChat,
}) => {
  const [openBatchIdx, setOpenBatchIdx] = useState<number | null>(null);
  const askFields = COLLECT_FIELDS.filter((f) => !f.noAsk);
  const completedCount = askFields.filter(
    (f) => isFieldFilled(f.key, collected[f.key]) || skippedFields.has(f.key),
  ).length;
  const progressPct = Math.round((completedCount / askFields.length) * 100);
  const requiredFilled = askFields.filter(
    (f) => f.required && isFieldFilled(f.key, collected[f.key]),
  ).length;
  const totalRequired = askFields.filter((f) => f.required).length;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const defaultDeliveryDate = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d; })();
  const deliveryDateValue = collected.expectedDelivery
    ? new Date(String(collected.expectedDelivery))
    : defaultDeliveryDate;

  // 批量预览：公共信息头 + 可折叠物料明细行（默认全收起、最后一项展开）
  if (batchPreview && batchItems.length > 0) {
    const openIndex = openBatchIdx === null ? batchItems.length - 1 : openBatchIdx;
    // 跨物料把「份」相加没有意义（不同物料单位不同），只统计物料数与规格(SKU)行数
    const specLineCount = batchItems.reduce(
      (n, it) => n + Math.max(1, parseSpecDetails(it.itemBrandModel, it.itemQuantity).length),
      0,
    );
    const sharedRows: Array<{ label: string; value: string }> = [
      { label: '项目代号', value: collected.projectCode ? String(collected.projectCode) : '' },
      { label: '期望到货', value: dayjs(deliveryDateValue).format('YYYY-MM-DD') },
      { label: '联系电话', value: collected.contactPhone ? String(collected.contactPhone) : '' },
      { label: '收货地址', value: collected.deliveryAddress ? String(collected.deliveryAddress) : '' },
    ];
    return (
      <div className="w-full lg:w-[40%] flex flex-col gap-4 overflow-y-auto lg:max-h-[calc(100vh-4rem)]">
        {onBackToChat && (
          <Button variant="outline" className="lg:hidden flex items-center gap-2 h-11 w-full" onClick={onBackToChat}>
            <ArrowLeft className="size-4" />
            返回对话
          </Button>
        )}
        <Card className="flex-shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="size-4 text-primary" />
              采购单预览
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {/* 公共信息 · 全部物料共享 */}
            <div className="rounded-md bg-accent/30 p-3">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                公共信息 · 全部物料共享
              </div>
              <div className="space-y-1.5">
                {sharedRows.map((r) => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={r.value ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                      {r.value || '待补充'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 物料清单 */}
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                物料清单（{batchItems.length} 项）
              </div>
              <div className="space-y-2">
                {batchItems.map((it, i) => {
                  const open = openIndex === i;
                  const qtyMissing = !it.itemQuantity || !/\d/.test(it.itemQuantity);
                  const specs = parseSpecDetails(it.itemBrandModel, it.itemQuantity);
                  const multiSpec = specs.length > 1;
                  return (
                    <div key={i} className="border border-border rounded-md overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setOpenBatchIdx(open ? -1 : i)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent/40 transition-colors"
                      >
                        <span className="flex items-center justify-center size-5 rounded-full bg-accent text-xs text-muted-foreground flex-shrink-0">
                          {i + 1}
                        </span>
                        <span className="flex-1 min-w-0 truncate font-medium text-sm">{it.itemName}</span>
                        <span className={`text-sm flex-shrink-0 ${qtyMissing ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {qtyMissing ? '待补份数' : `${it.itemQuantity} 份`}
                        </span>
                        <ChevronDown className={`size-4 text-muted-foreground flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </button>
                      {open && (
                        <div className="px-3 pb-3 pl-10 space-y-2 text-sm">
                          {multiSpec ? (
                            <div className="rounded-md bg-accent/30 p-2 space-y-1">
                              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">规格明细</div>
                              {specs.map((s, si) => (
                                <div key={si} className="flex justify-between">
                                  <span className="text-foreground font-medium">{s.itemBrandModel}</span>
                                  <span className="text-muted-foreground">{s.itemQuantity} 份</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            it.itemBrandModel && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">规格型号</span>
                                <span className="font-medium text-foreground">{it.itemBrandModel}</span>
                              </div>
                            )
                          )}
                          <div className="text-muted-foreground break-all">链接：{it.itemLink}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 汇总：只统计物料数与规格行数，不对不同物料的份数求和 */}
            <div className="text-sm text-muted-foreground border-t border-border pt-2">
              共 <span className="text-foreground font-medium">{batchItems.length}</span> 项物料
              {specLineCount > batchItems.length && (
                <> · <span className="text-foreground font-medium">{specLineCount}</span> 个规格</>
              )}
            </div>

            {/* 操作 */}
            {showPreview ? (
              <div className="flex gap-2 pt-1">
                <Button onClick={onConfirmBatch} disabled={submitting} className="flex-1">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                  提交全部（{batchItems.length} 项）
                </Button>
                <Button variant="outline" onClick={onReset} disabled={submitting}>
                  重新开始
                </Button>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center pt-1">
                请在左侧对话中补齐份数与项目/物流信息
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full lg:w-[40%] flex flex-col gap-4 overflow-y-auto lg:max-h-[calc(100vh-4rem)]">
      {/* Mobile back button */}
      {onBackToChat && showPreview && (
        <Button
          variant="outline"
          className="lg:hidden flex items-center gap-2 h-11 w-full"
          onClick={onBackToChat}
        >
          <ArrowLeft className="size-4" />
          返回对话
        </Button>
      )}
      {/* Progress Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">收集进度</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-2 bg-accent rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
              {completedCount}/{askFields.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {askFields.map((f) => {
              const Icon = f.icon;
              const isFilled = isFieldFilled(f.key, collected[f.key]);
              const isSkipped = skippedFields.has(f.key);
              return (
                <div key={f.key} className="flex items-center gap-2 text-sm">
                  <Icon className={`size-3.5 ${isFilled ? 'text-primary' : 'text-muted-foreground'}`} />
                  <span className={isFilled ? 'text-foreground' : 'text-muted-foreground'}>
                    {f.label}
                  </span>
                  {!f.required && (
                    <span className="text-[10px] text-muted-foreground/60">选填</span>
                  )}
                  {isFilled ? (
                    <CheckCircle className="size-3.5 text-primary ml-auto" />
                  ) : isSkipped ? (
                    <SkipForward className="size-3.5 text-muted-foreground ml-auto" />
                  ) : (
                    <Clock className="size-3.5 text-muted-foreground ml-auto" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 pt-2 border-t border-border text-xs text-muted-foreground">
            必填项 {requiredFilled}/{totalRequired}
          </div>
        </CardContent>
      </Card>

      {/* Batch mode indicator */}
      {batchMode && batchItems.length > 0 && (
        <Card className="flex-shrink-0 border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <ListChecks className="size-4" />
              已添加 {batchItems.length} 个物料
            </div>
          </CardContent>
        </Card>
      )}

{/* Preview Card */}
      {showPreview && !transferred && (
        <Card className="flex-shrink-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="size-4 text-primary" />
              采购单预览
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            {(['material', 'project', 'logistics'] as const).map((group) => {
              const groupLabel = group === 'material' ? '物料信息'
                : group === 'project' ? '项目信息'
                  : '物流信息';
              const GroupIcon = group === 'material' ? Package
                : group === 'project' ? FolderOpen
                  : Truck;
              const fields = COLLECT_FIELDS.filter((f) => f.group === group);
              return (
                <div key={group}>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <GroupIcon className="size-3" /> {groupLabel}
                  </h4>
                  <div className="space-y-1.5">
                    {fields
                      .filter((f) => {
                        if (!collected.specDetails) return true;
                        return f.key !== 'itemBrandModel' && f.key !== 'itemQuantity';
                      })
                      .map((f) => {
                      const isFilled = isFieldFilled(f.key, collected[f.key]);
                      const isSkipped = skippedFields.has(f.key);
                      if (!isFilled && !isSkipped && !f.noAsk) return null;
                      return (
                        <div key={f.key} className="flex justify-between text-sm group">
                          <span className="text-muted-foreground">{f.label}</span>
                          <div className="flex items-center gap-1">
                            <span className="font-medium text-foreground">
                              {isSkipped && !isFilled ? '未提供' : isFilled ? formatFieldValue(f.key, collected[f.key]) : '-'}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-5 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => onModifyField(f.key)}
                              title={`修改${f.label}`}
                            >
                              <Pencil className="size-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {collected.specDetails && Array.isArray(collected.specDetails) && (collected.specDetails as Array<{ itemBrandModel: string; itemQuantity: string }>).length > 0 && (
                      <div className="mt-2 rounded-md bg-accent/30 p-2 space-y-1">
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">规格明细</div>
                        {(collected.specDetails as Array<{ itemBrandModel: string; itemQuantity: string }>).map((spec, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-foreground font-medium">{spec.itemBrandModel}</span>
                            <span className="text-muted-foreground">{spec.itemQuantity} 份</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {group === 'logistics' && (
                      <div className="flex justify-between text-sm group">
                        <span className="text-muted-foreground">期望到货</span>
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-foreground">
                            {dayjs(deliveryDateValue).format('YYYY-MM-DD')}
                          </span>
                          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="修改期望到货时间"
                              >
                                <Calendar className="size-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="end">
                              <CalendarComponent
                                mode="single"
                                selected={deliveryDateValue}
                                onSelect={(date: Date | undefined) => {
                                  if (date) {
                                    onEditExpectedDelivery(dayjs(date).format('YYYY-MM-DD'));
                                    setCalendarOpen(false);
                                  }
                                }}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Actions */}
            {batchMode ? (
              <div className="flex gap-2 pt-2">
                <Button onClick={onSubmitAll} disabled={submitting} className="flex-1">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                  提交全部 ({batchItems.length + 1}个物料)
                </Button>
                <Button variant="outline" onClick={onContinueAddMaterial} disabled={submitting}>
                  <Plus className="size-4" />
                  继续添加物料
                </Button>
              </div>
            ) : (
              <div className="flex gap-2 pt-2">
                <Button onClick={onConfirm} disabled={submitting} className="flex-1">
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle className="size-4" />}
                  确认提交
                </Button>
                <Button variant="outline" onClick={onContinueAddMaterial} disabled={submitting} title="再加物料，合并为一单">
                  <Plus className="size-4" />
                  继续添加
                </Button>
                <Button variant="outline" onClick={onModify} disabled={submitting}>
                  修改
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PreviewPanel;
