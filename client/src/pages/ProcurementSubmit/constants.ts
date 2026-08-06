import React from 'react';
import { Package, FolderOpen, Truck } from 'lucide-react';
import type { ProcurementRequirement } from '@shared/api.interface';

export interface SpecDetail {
  itemBrandModel: string;
  itemQuantity: string;
}

/** 「再次购买」带入表单填报的预填数据 */
export interface RebuyProduct {
  itemLink: string;
  itemName: string;
  specDetails: SpecDetail[];
}

export interface FormPrefill {
  products: RebuyProduct[];
  shared: {
    projectCode?: string;
    projectPurpose?: string;
    contactPhone?: string;
    deliveryAddress?: string;
  };
}

/**
 * 把合并存储的规格还原成多行。
 * 提交时多规格被拼接为「型号A(5份)、型号B(4份)」、份数累加为总和；
 * 这里按「、」拆分并提取每段尾部的「(N份)」还原型号与份数。
 * 不是合并格式（单规格）时，退回单行并使用总份数。
 */
export function parseSpecDetails(
  brandModel: string | undefined,
  totalQuantity: string | undefined,
): SpecDetail[] {
  const bm = (brandModel || '').trim();
  const total = totalQuantity || '';
  if (!bm) return [{ itemBrandModel: '', itemQuantity: total }];

  const segments = bm
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parsed: SpecDetail[] = [];
  let matchedAny = false;
  for (const seg of segments) {
    const m = seg.match(/^(.*?)[（(]\s*(\d+)\s*份\s*[)）]\s*$/);
    if (m) {
      matchedAny = true;
      parsed.push({ itemBrandModel: m[1].trim(), itemQuantity: m[2] });
    } else {
      parsed.push({ itemBrandModel: seg, itemQuantity: '' });
    }
  }

  // 没有任何段带「(N份)」=不是合并格式，按单规格还原
  if (!matchedAny) {
    return [{ itemBrandModel: bm, itemQuantity: total }];
  }
  return parsed;
}

/** 由需求详情构造「再次购买」的表单预填数据（详情页/列表页共用） */
export function buildRebuyPrefill(detail: ProcurementRequirement): FormPrefill {
  return {
    products: [
      {
        itemLink: detail.item.link,
        itemName: detail.item.name,
        specDetails: parseSpecDetails(detail.item.brandModel, detail.item.quantity),
      },
    ],
    shared: {
      projectCode: detail.project.code,
      projectPurpose: detail.project.purpose || '',
      contactPhone: detail.logistics.contactPhone || '',
      deliveryAddress: detail.logistics.deliveryAddress || '',
    },
  };
}

export interface CollectField {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  required: boolean;
  group: 'material' | 'project' | 'logistics';
  question: string;
  fieldType: 'string' | 'number' | 'boolean';
  validationHint?: string;
  noAsk?: boolean;
}

export const COLLECT_FIELDS: CollectField[] = [
  { key: 'itemName', label: '物料名称', icon: Package, required: true, group: 'material', question: '请粘贴需求描述，例如：买轴承SKF 6204-2RS 10份，链接https://xxx，用于DT002项目原型机装配，电话138xxxx，地址南山智园C3栋', fieldType: 'string' },
  { key: 'itemBrandModel', label: '规格型号', icon: Package, required: true, group: 'material', question: '请提供规格型号。', fieldType: 'string' },
  { key: 'itemLink', label: '商品链接', icon: Package, required: true, group: 'material', question: '请提供商品购买链接或参考链接。', fieldType: 'string', validationHint: '请输入淘宝/京东/天猫/1688平台的商品链接' },
  { key: 'itemQuantity', label: '采购份数', icon: Package, required: true, group: 'material', question: '需要采购多少份？（1份=1个采购单位，如螺丝10个/份，需200个则输入20）', fieldType: 'string', validationHint: '请输入采购份数（非物品个数），如：20' },
  { key: 'projectCode', label: '项目代号', icon: FolderOpen, required: true, group: 'project', question: '请提供项目代号（如DT002）。', fieldType: 'string', validationHint: '请输入项目代号（如DT002）' },
  { key: 'projectPurpose', label: '额外说明', icon: FolderOpen, required: false, group: 'project', question: '', fieldType: 'string', validationHint: '非必填，可补充额外需求信息', noAsk: true },
  { key: 'contactPhone', label: '联系电话', icon: Truck, required: true, group: 'logistics', question: '请输入您的联系电话。', fieldType: 'string', validationHint: '请输入11位手机号码' },
  { key: 'deliveryAddress', label: '收货地址', icon: Truck, required: true, group: 'logistics', question: '请输入收货地址。', fieldType: 'string', validationHint: '请输入详细收货地址' },
];

const SKIP_PATTERNS = ['没有', '不需要', '跳过', '无', '暂无', '不填', '算了', '没', 'none', 'skip', 'no'];

export const OFF_TOPIC_REPROMPT = '我是采购助手，专门帮助您完成采购需求提报，关于其他问题可能无法回答。如有采购需求，请继续告诉我。';

export const isSkipInput = (input: string): boolean => {
  const trimmed = input.trim().toLowerCase();
  return SKIP_PATTERNS.some((p) => trimmed === p || trimmed === `${p}。`);
};

export function isMeaningfulExtraction(fieldKey: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const field = COLLECT_FIELDS.find((f) => f.key === fieldKey);
  if (!field) return false;

  switch (field.fieldType) {
    case 'number':
      return typeof value === 'number' && value > 0;
    case 'boolean':
      return value === true;
    case 'string':
    default:
      return typeof value === 'string' && value.trim() !== '';
  }
}

export function isFieldFilled(fieldKey: string, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  const field = COLLECT_FIELDS.find((f) => f.key === fieldKey);
  if (!field) return false;

  switch (field.fieldType) {
    case 'number':
      return typeof value === 'number' && value > 0;
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
    default:
      return typeof value === 'string' && value.trim() !== '';
  }
}

export const hasNewExtraction = (
  prev: Record<string, unknown>,
  updated: Record<string, unknown>,
): boolean => {
  for (const f of COLLECT_FIELDS) {
    const wasEmpty = !isMeaningfulExtraction(f.key, prev[f.key]);
    const nowFilled = isMeaningfulExtraction(f.key, updated[f.key]);
    if (wasEmpty && nowFilled) return true;
  }
  return false;
};

export const formatFieldValue = (key: string, value: unknown): string => {
  if (key === 'itemQuantity') {
    return typeof value === 'string' ? value : String(value ?? '');
  }
  if (key === 'contactPhone' || key === 'deliveryAddress') {
    return typeof value === 'string' ? value : String(value ?? '');
  }
  return String(value ?? '');
};

export const MATERIAL_FIELD_KEYS = [
  'itemName', 'itemBrandModel', 'itemLink', 'itemQuantity', 'specDetails',
];

export const SHARED_FIELD_KEYS = [
  'projectCode', 'projectPurpose', 'contactPhone', 'deliveryAddress',
];

export const URGENT_KEYWORDS = ['急单', '紧急', '加急', '紧急采购', '尽快', '今天必须', '马上要'];

export const TRANSFER_DIRECT_KEYWORDS = ['转人工', '人工服务', '转接人工', '找人工', '转人工服务'];

export const COMPLEX_KEYWORDS = ['定制', '特殊规格', '非标', '非标准', '需沟通', '需协商', '需确认', '特殊加工'];

export const CANCEL_KEYWORDS = ['取消', '取消采购', '不要了', '不买了', '取消申请'];
