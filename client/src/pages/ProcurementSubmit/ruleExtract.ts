export interface RuleExtractResult {
  itemLink?: string;
  itemLinkOriginal?: string;
  contactPhone?: string;
  projectCode?: string;
}

export interface BatchExtractItem {
  itemName?: string;
  itemBrandModel?: string;
  itemLink?: string;
  itemLinkOriginal?: string;
  itemQuantity?: string;
}

export interface BatchExtractResult {
  items: BatchExtractItem[];
  shared: {
    contactPhone?: string;
    projectCode?: string;
    projectName?: string;
    deliveryAddress?: string;
    projectPurpose?: string;
  };
}

const ALLOWED_DOMAINS = ['taobao.com', 'jd.com', 'tmall.com', '1688.com', 'tb.cn', 'e.tb.cn', 'm.tb.cn', 'u.jd.com'];

const KEEP_PARAMS: Record<string, string[]> = {
  'tmall.com': ['id'],
  'taobao.com': ['id'],
  'jd.com': [],
  '1688.com': ['offerId'],
};

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const matchedKey = ALLOWED_DOMAINS.find(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
    if (!matchedKey) return url;
    if (url.length <= 150) return url;
    const paramsToKeep = KEEP_PARAMS[matchedKey] || [];
    const kept = new URLSearchParams();
    for (const key of paramsToKeep) {
      const val = parsed.searchParams.get(key);
      if (val) kept.set(key, val);
    }
    const qs = kept.toString();
    return `${parsed.origin}${parsed.pathname}${qs ? '?' + qs : ''}`;
  } catch {
    return url;
  }
}

function isAllowedLink(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return ALLOWED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
  } catch {
    return false;
  }
}

/**
 * 清洗电商分享文案噪声，便于 LLM 提取：
 * 去掉【淘宝】等前缀、"点击链接直接打开 或者 淘宝搜索直接打开"尾巴、CZ193 这类分享码。
 * 不动 URL 与商品标题；对普通输入基本无改动。
 */
export function cleanShareText(text: string): string {
  return text
    .replace(/【[^】]*】/g, ' ')
    .replace(/点击链接直接打开\s*(?:或者\s*)?/g, ' ')
    .replace(/淘宝搜索直接打开/g, ' ')
    .replace(/复制(?:这条|此)信息[，,]?/g, ' ')
    .replace(/(^|\s)[A-Z]{2}\d{3}(?=\s|$)/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function ruleExtract(userInput: string): RuleExtractResult {
  const result: RuleExtractResult = {};
  const text = userInput.trim();

  const urlMatch = text.match(/https?:\/\/[^\s，,。；;]+/);
  if (urlMatch) {
    const url = urlMatch[0];
    if (isAllowedLink(url)) {
      result.itemLinkOriginal = url;
      result.itemLink = shortenUrl(url);
    }
  }

  const phoneMatch = text.match(/(?:^|[^\d])(1[3-9]\d{9})(?:[^\d]|$)/);
  if (phoneMatch) {
    result.contactPhone = phoneMatch[1];
  }


  const projectPatterns = [
    /(?:用于|用途|项目代号)[：:]*\s*([A-Za-z]{1,4}\d{2,4}(?:[_]\d{1,4}|\.\d{1,2})?)/,
    /(?:^[\s，,。；;、（(])([A-Za-z]{1,4}\d{2,4}(?:[_]\d{1,4}|\.\d{1,2})?)(?:[\s，,。；;、）)项机型装]|$)/,
    /(?:项目|项)[：:\s]*([A-Za-z]{1,4}\d{2,4}(?:[_]\d{1,4}|\.\d{1,2})?)/,
  ];
  for (const pat of projectPatterns) {
    const m = text.match(pat);
    if (m) { result.projectCode = m[1].toUpperCase(); break; }
  }

  return result;
}

export function detectBatchInput(text: string): boolean {
  const urls = text.match(/https?:\/\/[^\s，,。；;]+/g) || [];
  const allowedUrls = urls.filter(isAllowedLink);
  if (allowedUrls.length >= 2) return true;

  const buyPatterns = text.match(/(?:买|购买|采购|需|要买|需要)[^买购买采购需要买需要]{2,40}/g) || [];
  if (buyPatterns.length >= 2) return true;

  return false;
}

export function batchRuleExtract(userInput: string): BatchExtractResult {
  const text = userInput.trim();

  const shared: BatchExtractResult['shared'] = {};

  const phoneMatch = text.match(/(?:^|[^\d])(1[3-9]\d{9})(?:[^\d]|$)/);
  if (phoneMatch) shared.contactPhone = phoneMatch[1];

  const projectPatterns = [
    /(?:用于|用途|项目代号)[：:]*\s*([A-Za-z]{1,4}\d{2,4}(?:[_]\d{1,4}|\.\d{1,2})?)/,
    /(?:^[\s，,。；;、（(])([A-Za-z]{1,4}\d{2,4}(?:[_]\d{1,4}|\.\d{1,2})?)(?:[\s，,。；;、）)项机型装]|$)/,
    /(?:项目|项)[：:\s]*([A-Za-z]{1,4}\d{2,4}(?:[_]\d{1,4}|\.\d{1,2})?)/,
  ];
  for (const pat of projectPatterns) {
    const m = text.match(pat);
    if (m) { shared.projectCode = m[1].toUpperCase(); break; }
  }

  const addressMatch = text.match(/(?:地址|收货地址|送货地址|寄到)[：:]*\s*([^\s，,。；;]+(?:[市省区路号栋座楼层室]\S*)+)/);
  if (addressMatch) shared.deliveryAddress = addressMatch[1];

  const purposeMatch = text.match(/(?:用于|用途|目的)[：:]*\s*([^\s，,。；;]+(?:[^\s，,。；;])*)/);
  if (purposeMatch) {
    const rawPurpose = purposeMatch[1];
    const projInPurpose = rawPurpose.match(/^([A-Za-z]{1,4}\d{2,4}(?:[_]\d{1,4}|\.\d{1,2})?)项目?(.*)/);
    if (projInPurpose) {
      if (!shared.projectCode) shared.projectCode = projInPurpose[1].toUpperCase();
      shared.projectPurpose = projInPurpose[2] || undefined;
    } else {
      shared.projectPurpose = rawPurpose;
    }
  }

  const segments = splitByItems(text);

  const items: BatchExtractItem[] = segments.map((seg: string) => extractItemFromSegment(seg));

  return { items, shared };
}

export function splitByItems(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s，,。；;]+/g) || [];

  // 多链接：按链接边界切分（每个链接归属前一个「买」）
  if (urls.length >= 2) {
    const parts: string[] = [];
    let lastIdx = 0;

    for (let i = 1; i < urls.length; i++) {
      const prevUrlEnd = text.indexOf(urls[i - 1], lastIdx) + urls[i - 1].length;
      const nextBuyPos = text.indexOf('买', prevUrlEnd);
      const nextUrlPos = text.indexOf(urls[i], prevUrlEnd);

      if (nextBuyPos > 0 && nextBuyPos < nextUrlPos) {
        parts.push(text.slice(lastIdx, nextBuyPos).trim());
        lastIdx = nextBuyPos;
      } else {
        parts.push(text.slice(lastIdx, nextUrlPos).trim());
        lastIdx = nextUrlPos;
      }
    }
    parts.push(text.slice(lastIdx).trim());
    return parts.filter((p: string) => p.length > 0);
  }

  // 无多链接：按「买/购买/采购」关键字切分，覆盖「买轴承10份，买电机2台」这类无链接批量
  const positions: number[] = [];
  const kwRe = /买|购买|采购/g;
  let m: RegExpExecArray | null;
  while ((m = kwRe.exec(text)) !== null) {
    positions.push(m.index);
    kwRe.lastIndex = m.index + m[0].length;
  }
  if (positions.length >= 2) {
    const parts: string[] = [];
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i];
      const end = i + 1 < positions.length ? positions[i + 1] : text.length;
      const seg = text.slice(start, end).trim();
      if (seg) parts.push(seg);
    }
    return parts;
  }

  return [text];
}

const ITEM_NAME_STOP = /[,，。；;、\s]*((?:链接|数量|需求数量|买|用于|电话|地址|项目))|https?:\/\//;

export function extractItemFromSegment(seg: string): BatchExtractItem {
  const item: BatchExtractItem = {};

  const urlMatch = seg.match(/https?:\/\/[^\s，,。；;]+/);
  if (urlMatch && isAllowedLink(urlMatch[0])) {
    item.itemLinkOriginal = urlMatch[0];
    item.itemLink = shortenUrl(urlMatch[0]);
  }

  const nameMatch = seg.match(/(?:买|购买|采购|需|要买|需要)\s*([,，。；;]*[^,，。；;]{2,50}?)(?:\s*[,，。；;]|数量|需求|链接|https?:\/\/|$)/);
  if (nameMatch) {
    let raw = nameMatch[1].replace(/^\s+|\s+$/g, '');
    // 名称尾部常黏着「10份/2台」及连接词「和」——份数已单独提取，这里剥掉让名称干净
    raw = raw.replace(/[\s,，、]*\d+\s*(?:份|个|只|台|套|件|条|米|包|盒|卷|张|根)\s*(?:和|与|以及|、|加)?\s*$/, '').trim();
    raw = raw.replace(/(?:和|与|以及|、|加)\s*$/, '').trim();
    if (raw.length >= 2) {
      item.itemName = raw;
    }
  }

  const brandMatch = seg.match(/(?:规格|型号|牌号)[：:]*\s*([^\s,，。；;]+)/);
  if (brandMatch) {
    item.itemBrandModel = brandMatch[1];
  }

  // 份数：一句话里常写「电机2份/轴承10个」，抓到就填，抓不到再由机器人追问
  const qtyMatch = seg.match(/(\d+)\s*(?:份|个|只|台|套|件|条|米|包|盒|卷|张|根)/);
  if (qtyMatch) {
    item.itemQuantity = qtyMatch[1];
  }

  return item;
}

export function isRuleResultSufficient(
  ruleResult: RuleExtractResult,
  remainingRequiredFields: string[],
): boolean {
  const ruleCoveredFields = new Set(['itemLink', 'contactPhone', 'projectCode']);

  for (const field of remainingRequiredFields) {
    if (!ruleCoveredFields.has(field)) {
      return false;
    }
    if (ruleResult[field as keyof RuleExtractResult] === undefined) {
      return false;
    }
  }

  return true;
}
