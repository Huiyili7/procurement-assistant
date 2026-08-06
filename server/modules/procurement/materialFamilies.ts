/**
 * 物料品名归一 v4。
 *
 * 优先级：【】标注 > 关键词命中 > 紧固件判定 > 兜底(物料种类/原名)。
 * 目的：把多维表格「购买内容」里的具体物料(铣刀/千分尺…)从"加工工具/测量仪器"这类粗桶里抽出来；
 * 同时把 螺丝/自攻螺丝/内六角螺丝… 归并为「螺丝/紧固件」，但不误并 螺丝刀/螺丝批 等工具。
 */

function extractBracket(text: string): string | null {
  const t = (text || '').trim();
  if (!t) return null;
  const m = t.match(/【([^】]+)】\s*$/) || t.match(/【([^】]+)】/);
  return m ? m[1].trim() : null;
}

/** 关键词 → 规范品名（按顺序，首个命中即用）。覆盖粗桶里的常见具体物料。 */
const KEYWORDS: [RegExp, string][] = [
  [/千分尺/, '千分尺'], [/千分表/, '千分表'], [/(游标卡尺|卡尺)/, '卡尺'], [/塞尺/, '塞尺'],
  [/量块/, '量块'], [/(高度规|高度尺)/, '高度规'], [/针规/, '针规'], [/水平仪/, '水平仪'],
  [/百分表/, '百分表'], [/显微镜/, '显微镜'], [/万用表/, '万用表'],
  [/铣刀/, '铣刀'], [/钻头/, '钻头'], [/丝锥/, '丝锥'], [/(锯片|切割片)/, '锯片'],
  [/(螺丝刀|螺丝批|起子|批头)/, '螺丝刀'], [/内六角扳手/, '内六角扳手'], [/扳手/, '扳手'],
  [/(镊子|钳子)/, '钳具'], [/(焊台|烙铁)/, '焊台'], [/热风枪/, '热风枪'],
  [/真空发生器/, '真空发生器'], [/真空泵/, '真空泵'], [/气泵/, '气泵'],
  [/(步进电机|伺服电机|舵机|电机)/, '电机'], [/(压力传感|传感器)/, '传感器'],
  [/轴承/, '轴承'], [/轴套/, '轴套'], [/(同步轮|同步带)/, '同步传动'],
  [/(升降台|升降平台)/, '升降台'], [/动平衡/, '动平衡机'],
];

function keywordName(text: string): string | null {
  const t = (text || '').trim();
  if (!t) return null;
  for (const [re, name] of KEYWORDS) if (re.test(t)) return name;
  return null;
}

/** 紧固件判定：含 螺丝/螺栓/螺母/螺钉/螺柱，但排除 刀/批/起子/柜/枪/盒/镊/钳 等工具与容器 */
const FASTENER_RE = /(螺丝|螺栓|螺母|螺钉|螺柱)/;
const NOT_FASTENER_RE = /(刀|批|起子|柜|枪|盒|镊|钳)/;
function isFastener(text: string): boolean {
  return FASTENER_RE.test(text) && !NOT_FASTENER_RE.test(text);
}

/**
 * 统一归一：text 为主名来源，finalFallback 为兜底。
 * 顺序：【】标注（命中则按是否紧固件归一） > 文本紧固件判定 > 关键词 > 兜底。
 */
function classify(text: string, finalFallback: string): string {
  const t = (text || '').trim();
  const tag = extractBracket(t);
  if (tag) return isFastener(tag) ? '螺丝/紧固件' : tag;
  if (isFastener(t)) return '螺丝/紧固件';
  const kw = keywordName(t);
  if (kw) return kw;
  const fb = (finalFallback || '').trim();
  if (fb) return isFastener(fb) ? '螺丝/紧固件' : fb;
  return t || '未分类';
}

/** 多维表格花费：购买内容优先，兜底物料种类 */
export function normalizeSpendMaterial(content: string, category: string): string {
  return classify(content, category);
}

/** 系统库结构：itemName 即物料名，兜底自身 */
export function normalizeItemName(itemName: string): string {
  return classify(itemName, itemName);
}

/** 解析采购份数为数量合计。支持 "5"、"20/30"（多规格累加）、"5个" 等 */
export function parseQuantity(raw: string): number {
  if (!raw) return 0;
  const nums = String(raw).match(/\d+(\.\d+)?/g);
  if (!nums) return 0;
  return nums.reduce((sum, n) => sum + (parseFloat(n) || 0), 0);
}
