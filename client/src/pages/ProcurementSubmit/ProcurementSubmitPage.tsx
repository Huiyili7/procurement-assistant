import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';

import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { getDataloom } from '@lark-apaas/client-toolkit/dataloom';
import { getDefaultBucketId } from '@lark-apaas/client-toolkit/tools/storage';
import { extractProcurementInfo, extractFromScreenshot } from '@client/src/utils/plugin';
import { procurement } from '@client/src/api';
import { getProjectList, batchCreateRequirements, validateField, batchValidate } from '@client/src/api/procurement';
import type { CreateProcurementRequirementRequest, ProjectInfoItem, BatchCreateItemRequest, BatchCreateRequest, ValidateFieldResponse } from '@shared/api.interface';
import {
  COLLECT_FIELDS, isSkipInput, parseSpecDetails,
  hasNewExtraction, isMeaningfulExtraction, isFieldFilled, formatFieldValue,
  MATERIAL_FIELD_KEYS,
  URGENT_KEYWORDS, TRANSFER_DIRECT_KEYWORDS, COMPLEX_KEYWORDS, CANCEL_KEYWORDS,
} from './constants';
import PreviewPanel from './PreviewPanel';
import ChatArea from './ChatArea';
import ProcurementForm from './ProcurementForm';
import { useChatSession } from './useChatSession';
import { RequirementEditDialog } from '@client/src/components/RequirementEditDialog';
import { ruleExtract, detectBatchInput, splitByItems, extractItemFromSegment, cleanShareText } from './ruleExtract';
import type { RuleExtractResult } from './ruleExtract';
import type { SpecDetail, FormPrefill } from './constants';

const DEFAULT_ASSIGNEE_ID = '0000000000000000';
const FEISHU_CHAT_LINK = 'https://applink.feishu.cn/client/chat/open?openId=ou_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

interface ChatMessage { role: 'user' | 'bot'; content: string; timestamp: Date | string; type?: 'transfer_card' | 'image_result' | 'pending_list'; collected?: Record<string, unknown>; imageUrl?: string; }

/** 中文数字转阿拉伯数字：五→5、十五→15、二十→20、一百二十→120；无中文数字返回 null。 */
function chineseToNumber(text: string): number | null {
  const d: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const u: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  let total = 0;
  let current = 0;
  let hasAny = false;
  for (const ch of text) {
    if (ch in d) { current = d[ch]; hasAny = true; }
    else if (ch in u) { hasAny = true; total += (current === 0 ? 1 : current) * u[ch]; current = 0; }
  }
  total += current;
  return hasAny ? total : null;
}

/**
 * 份数容错：从自然语言里抠出数字。
 * "采购5份"→"5"、"采购数量: 5"→"5"、"20/30"→"20/30"、"购买五份"→"5"；都没有则原样返回。
 */
// 从单个物料段解析多规格：段内出现 ≥2 个「N份」时，按逗号把「规格,份数」逐档配对；
// 第一档规格常与物料名粘连（如「塞打螺丝Q4*6*M3」），用插件给的 itemName 剥掉前缀。
// 返回合并规格串「型号A(40份)、型号B(50份)」与总份数；非多规格返回 null。
function parseSegmentMultiSpec(
  segment: string,
  itemName: string,
): { itemBrandModel: string; itemQuantity: string } | null {
  const text = segment
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/链接/g, ' ')
    .replace(/^\s*(?:买|购买|采购)\s*/, '');
  if ((text.match(/\d+\s*份/g) || []).length < 2) return null;

  const tokens = text.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  const specs: { model: string; qty: string }[] = [];
  let pendingModel: string | null = null;
  for (const tk of tokens) {
    const qm = tk.match(/^(\d+)\s*份$/);
    if (qm) {
      if (pendingModel) { specs.push({ model: pendingModel, qty: qm[1] }); pendingModel = null; }
    } else {
      pendingModel = tk;
    }
  }
  if (specs.length < 2) return null;

  if (itemName && specs[0].model.startsWith(itemName)) {
    specs[0].model = specs[0].model.slice(itemName.length).trim() || specs[0].model;
  }
  const itemBrandModel = specs.map((s) => `${s.model}(${s.qty}份)`).join('、');
  const total = specs.reduce((n, s) => n + (parseInt(s.qty, 10) || 0), 0);
  return { itemBrandModel, itemQuantity: String(total) };
}

function normalizeQuantity(input: string): string {
  const s = input.trim();
  if (/^\d+(\/\d+)*$/.test(s)) return s;
  const m = s.match(/\d+(?:\/\d+)*/);
  if (m) return m[0];
  const cn = chineseToNumber(s);
  if (cn !== null && cn > 0) return String(cn);
  return s;
}

const ProcurementSubmitPage: React.FC = () => {
  const {
    messages, setMessages,
    collected, setCollected,
    skippedFields, setSkippedFields,
    currentFieldIndex, setCurrentFieldIndex,
    batchItems, setBatchItems,
    batchMode, setBatchMode,
    batchPreview, setBatchPreview,
    transferMode, setTransferMode,
    transferReason, setTransferReason,
    transferred, setTransferred,
    urgentMarked, setUrgentMarked,
    transferPending, setTransferPending,
    validationWarnings, setValidationWarnings,
    clearSession,
    saveDefaultFields,
  } = useChatSession();

  const location = useLocation();
  const rebuyPrefill = (location.state as { rebuy?: FormPrefill } | null)?.rebuy;

  const [input, setInput] = useState('');
  const [inputMode, setInputMode] = useState<'chat' | 'form'>(
    rebuyPrefill ? 'form' : 'chat',
  );
  const [extracting, setExtracting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  // 提单耗时埋点：首次交互时置位（不在 mount 计时，避免开着页面发呆稀释；复用预填场景按进入页计时）
  const draftStartedAtRef = useRef<string | null>(rebuyPrefill ? new Date().toISOString() : null);
  const markDraftStart = useCallback(() => {
    if (!draftStartedAtRef.current) draftStartedAtRef.current = new Date().toISOString();
  }, []);
  const handleModeChange = useCallback((m: 'chat' | 'form') => {
    markDraftStart();
    setInputMode(m);
  }, [markDraftStart]);
  const [showPreview, setShowPreview] = useState(false);
  // 批量预览下，用户点「继续添加物料」后，下一条输入按新增物料处理
  const [addingMaterial, setAddingMaterial] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [modifyFieldKey, setModifyFieldKey] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [imageUploading, setImageUploading] = useState(false);
  // F-103: Project autocomplete
  const [projectSuggestions, setProjectSuggestions] = useState<ProjectInfoItem[]>([]);
  const [showProjectSuggestions, setShowProjectSuggestions] = useState(false);
  const [projectSearchLoading, setProjectSearchLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const userInfo = useCurrentUserProfile();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const isMountedRef = useRef(false);

  // 初始挂载时滚动聊天区域到顶部
  useEffect(() => {
    const timer = setTimeout(() => {
      if (messagesScrollRef.current) {
        messagesScrollRef.current.scrollTop = 0;
      }
      isMountedRef.current = true;
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // 消息变化时平滑滚动到底部（首次挂载除外）
  useEffect(() => {
    if (isMountedRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // 「再次购买」带入原需求信息提示（仅首次）
  const rebuyHintedRef = useRef(false);
  useEffect(() => {
    if (rebuyPrefill && !rebuyHintedRef.current) {
      rebuyHintedRef.current = true;
      toast.success('已带入原需求信息，可修改后再次提交');
    }
  }, [rebuyPrefill]);

  const currentField = COLLECT_FIELDS[currentFieldIndex];

  const addBotMsg = (content: string, type?: 'transfer_card' | 'image_result' | 'pending_list', collected?: Record<string, unknown>) => {
    const msg: ChatMessage = { role: 'bot', content, timestamp: new Date().toISOString(), type: type as ChatMessage['type'], collected };
    setMessages((prev) => [...prev, msg]);
  };

  const getNextFieldIndex = (
    data: Record<string, unknown>,
    skipped: Set<string>,
    startFrom: number,
    forceSkipMaterial = false,
  ): number => {
    // 批量预览下物料字段按物料逐条收集，共享字段机器只问项目/物流
    const skipMaterial = forceSkipMaterial || batchPreview;
    for (let i = startFrom; i < COLLECT_FIELDS.length; i++) {
      const f = COLLECT_FIELDS[i];
      if (f.noAsk) continue;
      if (skipMaterial && MATERIAL_FIELD_KEYS.includes(f.key)) continue;
      const isFilled = isFieldFilled(f.key, data[f.key]);
      const isSkipped = skipped.has(f.key);
      if (!isFilled && !isSkipped) return i;
    }
    return -1;
  };

  const advanceToNextField = (
    data: Record<string, unknown>,
    skipped: Set<string>,
    fromIndex: number,
    forceSkipMaterial = false,
  ) => {
    const nextIdx = getNextFieldIndex(data, skipped, fromIndex, forceSkipMaterial);
    if (nextIdx >= 0) {
      setCurrentFieldIndex(nextIdx);
      setModifying(false);
      setModifyFieldKey(null);
      setMessages((prev) => [
        ...prev,
        { role: 'bot', content: COLLECT_FIELDS[nextIdx].question, timestamp: new Date().toISOString() },
      ]);
    } else {
      setShowPreview(true);
      setModifying(false);
      setModifyFieldKey(null);
      const deliveryNotice = !data.expectedDelivery
        ? '期望到货时间已默认设为3天后。'
        : '';
      setMessages((prev) => [
        ...prev,
        {
          role: 'bot',
          content: `所有信息已收集完毕！请在右侧预览采购单，确认无误后即可提交。${deliveryNotice}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  // 批量流程：找到第一个缺份数的物料就追问；份数齐了转而收集共享字段（项目/物流），都齐了进入可提交预览
  const isQtyMissing = (qty: string): boolean =>
    !qty || !/\d/.test(qty) || Number(qty) <= 0;
  const promptNextBatchStep = (
    items: BatchCreateItemRequest[],
    sharedData: Record<string, unknown>,
    skipped: Set<string>,
  ) => {
    const idx = items.findIndex((it) => isQtyMissing(it.itemQuantity));
    if (idx >= 0) {
      addBotMsg(`物料 ${idx + 1}「${items[idx].itemName}」需要采购多少份？`);
      return;
    }
    advanceToNextField(sharedData, skipped, 0, true);
  };

  // 一句话 → 多物料：切分靠规则、段内解析靠 LLM 插件、链接用正则精确取。供首次批量识别与「继续添加物料」复用。
  const extractMaterialsFromText = async (
    text: string,
  ): Promise<{
    items: BatchCreateItemRequest[];
    shared: { projectCode?: string; projectPurpose?: string; deliveryAddress?: string; contactPhone?: string };
  }> => {
    const segments = splitByItems(text);
    const results = await Promise.all(
      segments.map(async (seg) => {
        const rule = ruleExtract(seg);
        const ruleItem = extractItemFromSegment(seg);
        const llm = await extractProcurementInfo(seg);
        return { rule, ruleItem, llm };
      }),
    );

    const items: BatchCreateItemRequest[] = [];
    for (const { rule, ruleItem, llm } of results) {
      const itemName = (llm?.itemName || ruleItem.itemName || '').trim();
      const itemBrandModel = (llm?.itemBrandModel || ruleItem.itemBrandModel || '').trim();
      const qty = llm && llm.itemQuantity > 0 ? String(llm.itemQuantity) : (ruleItem.itemQuantity || '');
      const link = rule.itemLinkOriginal || rule.itemLink || '';
      if (itemName || itemBrandModel || link) {
        items.push({
          itemName: itemName || '待补充物料',
          itemBrandModel: itemBrandModel || undefined,
          itemLink: link || '待补充',
          itemQuantity: qty,
          itemUnit: '份',
        });
      }
    }

    const firstNonEmpty = (vals: Array<string | undefined>): string | undefined =>
      vals.find((v) => v && v.trim())?.trim();
    const shared = {
      projectCode: firstNonEmpty(results.map((r) => r.llm?.projectCode)) || firstNonEmpty(results.map((r) => r.rule.projectCode)),
      projectPurpose: firstNonEmpty(results.map((r) => r.llm?.projectPurpose)),
      deliveryAddress: firstNonEmpty(results.map((r) => r.llm?.deliveryAddress)),
      contactPhone: firstNonEmpty(results.map((r) => r.rule.contactPhone)),
    };
    return { items, shared };
  };

  // F-103: Project search debounce
  const handleProjectSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setProjectSuggestions([]);
      setShowProjectSuggestions(false);
      return;
    }
    setProjectSearchLoading(true);
    try {
      const res = await getProjectList(keyword.trim());
      setProjectSuggestions(res.items);
      setShowProjectSuggestions(true);
    } catch {
      setProjectSuggestions([]);
    } finally {
      setProjectSearchLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((value: string) => {
    markDraftStart();
    setInput(value);
    if (currentField?.key === 'projectCode' && !modifying && !showPreview) {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => handleProjectSearch(value), 300);
    }
  }, [currentField?.key, modifying, showPreview, handleProjectSearch, markDraftStart]);

  const handleSelectProject = useCallback((project: ProjectInfoItem) => {
    setCollected((prev) => ({
      ...prev,
      projectCode: project.projectCode,
      projectName: project.projectName,
    }));
    setShowProjectSuggestions(false);
    setProjectSuggestions([]);
  }, []);

  const validateExtractedField = async (
    fieldKey: string,
    value: unknown,
  ): Promise<{ valid: boolean; message?: string; severity?: string; suggestion?: string }> => {
    if (value === undefined || value === null) return { valid: true };
    const field = COLLECT_FIELDS.find((f) => f.key === fieldKey);
    if (!field) return { valid: true };
    if (!field.required) {
      if (field.fieldType === 'string' && (!value || String(value).trim() === '')) return { valid: true };
      if (field.fieldType === 'number' && (!value || Number(value) <= 0)) return { valid: true };
    }
    try {
      const result: ValidateFieldResponse = await validateField({ field: fieldKey, value });
      return { valid: result.valid, message: result.message, severity: result.severity, suggestion: result.suggestion };
    } catch {
      return { valid: true };
    }
  };

  const runBatchValidation = async (
    fields: Record<string, unknown>,
  ): Promise<boolean> => {
    const result = await batchValidate({ fields });
    if (result.errors.length > 0) {
      const msg = result.errors.map((e) => e.message).join('；');
      toast.error(msg);
      setMessages((prev) => [...prev, { role: 'bot', content: `提交前校验未通过：${msg}`, timestamp: new Date().toISOString() }]);
      return false;
    }
    if (result.warnings.length > 0) {
      const msg = result.warnings.map((w) => w.message).join('；');
      toast.error(msg);
      setMessages((prev) => [...prev, { role: 'bot', content: `提交前校验未通过：${msg}`, timestamp: new Date().toISOString() }]);
      return false;
    }
    return true;
  };

  const handleSend = async () => {
    if (!input.trim() || extracting) return;
    const userInput = input.trim();
    setInput('');
    setShowProjectSuggestions(false);
    setMessages((prev) => [...prev, { role: 'user', content: userInput, timestamp: new Date().toISOString() }]);

    // === Keyword detection before normal flow ===

    // K1: Transferred state — respond with status, no welcome
    if (transferred) {
      addBotMsg('您的需求已转交人工处理。', 'transfer_card', collected);
      return;
    }

    // K2: Cancel keyword
    if (CANCEL_KEYWORDS.some((kw) => userInput.includes(kw))) {
      resetConversation();
      addBotMsg('已取消当前采购申请。如需重新发起，请发送商品链接。');
      return;
    }

    // K3: Direct transfer — no confirmation needed
    if (TRANSFER_DIRECT_KEYWORDS.some((kw) => userInput.includes(kw))) {
      setExtracting(true);
      try {
        const hasData = Object.keys(collected).length > 0;
        if (hasData) {
          const created = await procurement.createRequirement(buildCreateRequest(collected, '人工处理中', DEFAULT_ASSIGNEE_ID));
          await procurement.transferToHuman(created.id, { reason: '用户主动要求转人工' });
          toast.success('已转交人工处理');
          setTransferred(true);
          addBotMsg('已为您转交人工处理。', 'transfer_card', collected);
        } else {
          setTransferred(true);
          addBotMsg('已为您转交人工处理。', 'transfer_card', collected);
        }
      } catch {
        toast.error('转人工失败，请重试');
        addBotMsg('转人工操作失败，请稍后再试。');
      } finally {
        setExtracting(false);
      }
      return;
    }

    // K4: Transfer pending — user confirming or rejecting
    if (transferPending) {
      const affirmatives = ['是', '好', '好的', '转吧', '需要', '确认', '要'];
      const negatives = ['否', '不', '不用', '不需要', '继续', '算了', '取消转接', '不转', '我自己填'];
      const trimmed = userInput.trim();
      if (affirmatives.some((a) => trimmed.includes(a))) {
        setTransferPending(false);
        setExtracting(true);
        try {
          const hasData = Object.keys(collected).length > 0;
          if (hasData) {
            const created = await procurement.createRequirement(buildCreateRequest(collected, '人工处理中', DEFAULT_ASSIGNEE_ID));
            await procurement.transferToHuman(created.id, { reason: '涉及定制/特殊需求' });
            toast.success('已转交人工处理');
          }
          setTransferred(true);
          addBotMsg('已为您转交人工处理。', 'transfer_card', collected);
        } catch {
          toast.error('转人工失败，请重试');
        } finally {
          setExtracting(false);
        }
        return;
      } else if (negatives.some((n) => trimmed.includes(n))) {
        setTransferPending(false);
        addBotMsg('好的，继续填写采购信息。');
        if (currentField) addBotMsg(currentField.question);
        return;
      }
    }

    // K5: Urgent keyword detection
    if (URGENT_KEYWORDS.some((kw) => userInput.includes(kw)) && !urgentMarked) {
      setUrgentMarked(true);
      addBotMsg('⚡ 已标记为急单，将优先处理！');
    }

    // K6: Complex keyword — ask before transferring
    if (COMPLEX_KEYWORDS.some((kw) => userInput.includes(kw)) && !transferPending && !transferred) {
      setTransferPending(true);
      addBotMsg('检测到您可能涉及定制/特殊需求，是否需要转接采购专员人工处理？（回复"是"转接，回复"否"继续填写）');
    }

    // K7: 改单意图检测 — 任何状态下均可触发
    const MODIFY_KEYWORDS = ['修改', '我要修改', '改一下', '改单', '改我的采购单', '改采购单', '改一下单子'];
    const trimmedInput = userInput.trim();
    if (MODIFY_KEYWORDS.some((kw) => trimmedInput === kw || trimmedInput.startsWith(kw + ' ') || trimmedInput.startsWith(kw + '，') || trimmedInput.startsWith(kw + ','))) {
      setModifying(false);
      setShowPreview(false);
      setCurrentFieldIndex(0);
      setExtracting(true);
      try {
        const res = await procurement.getMyRequirements({ status: '待采购', page: 1, pageSize: 10 });
        if (res.items.length === 0) {
          addBotMsg('您当前没有待采购的需求，无需修改。如需提交新需求，请直接发送商品链接。');
        } else {
          addBotMsg('为您找到以下待采购需求，点击「修改」按钮即可编辑：', 'pending_list', { pendingItems: res.items.slice(0, 5), total: res.total });
        }
      } catch {
        addBotMsg('查询待采购需求失败，请稍后再试或前往「我的采购需求」页面进行修改。');
      } finally {
        setExtracting(false);
      }
      return;
    }

    // === 批量份数追问：正在补物料份数时，本次输入按份数处理 ===
    if (batchPreview && !showPreview && batchItems.some((it) => isQtyMissing(it.itemQuantity))) {
      const missingIdx = batchItems.findIndex((it) => isQtyMissing(it.itemQuantity));
      const norm = normalizeQuantity(userInput);
      if (/^\d+$/.test(norm) && Number(norm) > 0) {
        const updatedItems = batchItems.map((it, i) => (i === missingIdx ? { ...it, itemQuantity: norm } : it));
        setBatchItems(updatedItems);
        promptNextBatchStep(updatedItems, collected, new Set(skippedFields));
      } else {
        addBotMsg('请输入数字份数，例如 5。');
      }
      return;
    }

    // === Batch detection: 一句话多物料 ===
    // 切分靠规则（按链接/买，稳定）；段内名称/规格/份数交给 LLM 插件（规则8 处理同物料多规格），
    // 链接用正则从原文精确取（避免 LLM 改写长链接）。多个物料段并行调用插件。
    if (!batchPreview && detectBatchInput(userInput)) {
      const segments = splitByItems(userInput);
      if (segments.length >= 2) {
        setExtracting(true);
        try {
          const results = await Promise.all(
            segments.map(async (seg) => {
              const rule = ruleExtract(seg);
              const ruleItem = extractItemFromSegment(seg);
              const llm = await extractProcurementInfo(seg);
              return { seg, rule, ruleItem, llm };
            }),
          );

          const validItems: BatchCreateItemRequest[] = [];
          // 合成一单：先并入此前已有的物料，避免被这批新物料覆盖丢失
          // ① 「继续添加物料」按钮累积在 batchItems 里的
          if (batchItems.length > 0) {
            validItems.push(...batchItems);
          }
          // ② 单物料流程正收集在 collected 里的
          if (collected.itemName || collected.itemLink) {
            validItems.push(...buildItemsFromCollected(collected));
          }
          for (const { seg, rule, ruleItem, llm } of results) {
            const itemName = (llm?.itemName || ruleItem.itemName || '').trim();
            let itemBrandModel = (llm?.itemBrandModel || ruleItem.itemBrandModel || '').trim();
            let qty = llm && llm.itemQuantity > 0 ? String(llm.itemQuantity) : (ruleItem.itemQuantity || '');
            // 多规格：直接从原文段解析每档规格+份数（不依赖插件是否按规范返回），份数取各档之和
            const segMulti = parseSegmentMultiSpec(seg, itemName);
            if (segMulti) {
              itemBrandModel = segMulti.itemBrandModel;
              qty = segMulti.itemQuantity;
            } else {
              // 兜底：插件已把多规格合并进 itemBrandModel 时，份数按明细求和
              const itemSpecs = parseSpecDetails(itemBrandModel, qty);
              if (itemSpecs.length > 1) {
                const specSum = itemSpecs.reduce((s, sp) => { const n = parseInt(sp.itemQuantity, 10); return s + (isNaN(n) ? 0 : n); }, 0);
                if (specSum > 0) qty = String(specSum);
              }
            }
            const link = rule.itemLinkOriginal || rule.itemLink || '';
            if (itemName || itemBrandModel || link) {
              validItems.push({
                itemName: itemName || '待补充物料',
                itemBrandModel: itemBrandModel || undefined,
                itemLink: link || '待补充',
                itemQuantity: qty,
                itemUnit: '份',
              });
            }
          }

          if (validItems.length >= 2) {
            const firstNonEmpty = (vals: Array<string | undefined>): string | undefined =>
              vals.find((v) => v && v.trim())?.trim();
            // 共享字段并入 collected：只在本地尚未有值时填入，不覆盖已填/预填的默认电话地址
            const mergedShared: Record<string, unknown> = { ...collected };
            if (!mergedShared.projectCode) {
              const pc = firstNonEmpty(results.map((r) => r.llm?.projectCode)) || firstNonEmpty(results.map((r) => r.rule.projectCode));
              if (pc) mergedShared.projectCode = pc;
            }
            if (!mergedShared.projectPurpose) {
              const pp = firstNonEmpty(results.map((r) => r.llm?.projectPurpose));
              if (pp) mergedShared.projectPurpose = pp;
            }
            if (!mergedShared.deliveryAddress) {
              const da = firstNonEmpty(results.map((r) => r.llm?.deliveryAddress));
              if (da) mergedShared.deliveryAddress = da;
            }
            if (!mergedShared.contactPhone) {
              const cp = firstNonEmpty(results.map((r) => r.rule.contactPhone));
              if (cp) mergedShared.contactPhone = cp;
            }

            setCollected(mergedShared);
            setBatchItems(validItems);
            setBatchMode(false);
            setBatchPreview(true);

            const summary = validItems
              .map((it, i) => {
                const specs = parseSpecDetails(it.itemBrandModel, it.itemQuantity);
                const specText = specs.length > 1
                  ? specs.map((s) => `${s.itemBrandModel} ${s.itemQuantity}份`).join('、')
                  : (it.itemQuantity ? `${it.itemQuantity}份` : '份数待补充');
                return `${i + 1}. ${it.itemName}（${specText}）`;
              })
              .join('\n');
            addBotMsg(`已识别到 ${validItems.length} 个物料，可在右侧核对：\n${summary}`);
            promptNextBatchStep(validItems, mergedShared, new Set(skippedFields));
            return;
          }
        } catch {
          toast.error('批量识别失败，将按单条模式处理');
        } finally {
          setExtracting(false);
        }
      }
    }

    // === Direct input fallback: only for truly simple, single-value inputs ===
    // Complex inputs (containing URLs, multi-field info, etc.) MUST go through AI extraction
    const activeFieldKey = modifying ? modifyFieldKey : currentField?.key;
    const activeField = COLLECT_FIELDS.find((f) => f.key === activeFieldKey);
    let directFilled = false;
    const directUpdated: Record<string, unknown> = { ...collected };

    if (activeField && (!showPreview || modifying)) {
      if (activeField.fieldType === 'boolean') {
        const trimmed = userInput.trim().toLowerCase();
        if (['是', '是的', '需要', '要', 'yes', 'y', '已经', '已核查', '查了'].includes(trimmed) || trimmed.startsWith('是')) {
          directUpdated[activeField.key] = true;
          directFilled = true;
        } else if (['否', '不是', '不需要', '不要', 'no', 'n', '没', '没有', '未核查'].includes(trimmed) || trimmed.startsWith('否') || trimmed.startsWith('没')) {
          directUpdated[activeField.key] = false;
          directFilled = true;
        }
      } else if (activeField.fieldType === 'number') {
        const num = parseFloat(userInput.trim());
        if (!isNaN(num) && num > 0 && /^\d+(\.\d+)?$/.test(userInput.trim())) {
          directUpdated[activeField.key] = num;
          directFilled = true;
        }
      } else if (activeField.fieldType === 'string') {
        const trimmed = userInput.trim();
        if (trimmed.length > 0) {
          // When modifying, directly fill the target field — no LLM needed
          if (modifying) {
            directUpdated[activeField.key] =
              activeField.key === 'itemQuantity' ? normalizeQuantity(trimmed) : trimmed;
            if (activeField.key === 'itemLink') {
              directUpdated['itemLinkOriginal'] = trimmed;
            }
            directFilled = true;
          } else {
            // Check if input looks like a simple single-field answer vs complex multi-field
            const hasUrl = /https?:\/\//.test(trimmed);
            const hasPhone = /1[3-9]\d{9}/.test(trimmed);
            const hasQuantityUnit = /\d+\s*份/.test(trimmed);
            // 用户在一句里顺带提到了别的字段（项目/地址/电话/规格…）→ 走抽取，多字段一起接住
            const mentionsOtherField = /(项目|代号|收货|地址|电话|手机|规格|型号)/.test(trimmed);
            const isComplex =
              hasUrl ||
              (hasPhone && trimmed.length > 15) ||
              (hasQuantityUnit && activeField.key !== 'itemQuantity') ||
              mentionsOtherField;

            if (isComplex) {
              // Complex / multi-field input — let extraction handle it (fills multiple fields)
            } else if (activeField.key === 'itemQuantity') {
              // 份数：有阿拉伯数字就即时填(秒回)；像"五份"这种中文数字交给 LLM 归一化
              const norm = normalizeQuantity(trimmed);
              if (/\d/.test(norm)) {
                directUpdated[activeField.key] = norm;
                directFilled = true;
              }
            } else {
              // Simple answer to current question — direct fill, no LLM
              directUpdated[activeField.key] = trimmed;
              if (activeField.key === 'itemLink') {
                directUpdated['itemLinkOriginal'] = trimmed;
              }
              directFilled = true;
            }
          }
        }
      }
    }

    if (directFilled) {
      setExtracting(true);
      try {
        const newSkipped = new Set(skippedFields);
        const v = await validateExtractedField(activeField!.key, directUpdated[activeField!.key]);
        if (!v.valid) {
          delete directUpdated[activeField!.key];
          setCollected((prev) => { const r = { ...prev }; delete r[activeField!.key]; return r; });
          if (v.severity === 'warning') {
            setValidationWarnings((prev) => ({ ...prev, [activeField!.key]: v.message! }));
            addBotMsg(`⚠️ ${v.message || '格式有误'}，请提供正确的${activeField!.label || ''}或回复"跳过"。`);
          } else {
            addBotMsg(`❌ ${v.message || '格式有误'}${v.suggestion ? ` ${v.suggestion}` : ''}`);
          }
          setExtracting(false);
          return;
        }

        setValidationWarnings((prev) => { const n = { ...prev }; delete n[activeField!.key]; return n; });


        setCollected(directUpdated);
        advanceToNextField(directUpdated, newSkipped, currentFieldIndex + 1);
      } catch {
        toast.error('信息处理失败，请重试');
      } finally {
        setExtracting(false);
      }
      return;
    }

    // === Rule-based pre-extraction + LLM fallback ===
    setExtracting(true);
    const startTime = performance.now();

    try {
      // Parallel: rule extraction + LLM extraction run concurrently
      const truncateUrls = (text: string): string =>
        text.replace(/https?:\/\/[^\s，,。；;]{80,}/g, (url) => {
          try {
            const parsed = new URL(url);
            return `${parsed.origin}${parsed.pathname}（链接已缩短）`;
          } catch {
            return url.slice(0, 80) + '...';
          }
        });

      // LLM payload: 喂全量上下文(已收集状态 + 当前在问 + 近期对话)，让 LLM 带上下文归一化抽取，
      // 处理"五份/多字段/电话混地址"这类——理解交给 LLM，而不是正则去猜。
      const targetFieldKey = modifying ? modifyFieldKey : currentField?.key;
      const targetField = COLLECT_FIELDS.find((f) => f.key === targetFieldKey);
      const collectedSummary =
        COLLECT_FIELDS.filter((f) => isFieldFilled(f.key, collected[f.key]))
          .map((f) => `${f.label}=${formatFieldValue(f.key, collected[f.key])}`)
          .join('；') || '（暂无）';
      const recentConvo = messages
        .slice(-8)
        .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${truncateUrls(m.content)}`)
        .join('\n');
      // 淘宝/京东分享文案先清洗掉噪声（【淘宝】/点击链接直接打开/分享码），LLM 更容易提对名称
      const llmPayload =
        `【已收集信息】${collectedSummary}\n` +
        `【当前正在询问】${targetField?.label || '（无）'}\n` +
        `【对话记录】\n${recentConvo}\n用户: ${truncateUrls(cleanShareText(userInput))}`;

      const [ruleResult, llmResult] = await Promise.all([
        Promise.resolve(ruleExtract(userInput)),
        extractProcurementInfo(llmPayload),
      ]);

      const updated: Record<string, unknown> = { ...collected };
      let ruleHits = 0;

      // Apply rule extraction first (higher confidence for structured fields)
      for (const [key, value] of Object.entries(ruleResult)) {
        if (value !== undefined && (!isFieldFilled(key, updated[key]) || (modifying && key === modifyFieldKey))) {
          updated[key] = value;
          ruleHits++;
        }
      }

      // Apply LLM extraction (fills itemName, itemBrandModel, projectPurpose, deliveryAddress)
      let llmHits = 0;
      if (llmResult) {
        const extracted = llmResult as unknown as Record<string, unknown>;
        // Shadow comparison: log diffs between rule and LLM for observability
        const diffEntries: Record<string, { rule: unknown; llm: unknown }> = {};
        for (const rk of Object.keys(ruleResult) as (keyof RuleExtractResult)[]) {
          if (ruleResult[rk] !== undefined && extracted[rk] !== undefined && extracted[rk] !== null) {
            const ruleVal = ruleResult[rk];
            const llmVal = String(extracted[rk]);
            if (ruleVal !== llmVal) {
              diffEntries[rk] = { rule: ruleVal, llm: llmVal };
            }
          }
        }
        if (Object.keys(diffEntries).length > 0) {
          logger.info('[ExtractionDiff]', { diff: diffEntries, input_preview: userInput.slice(0, 80) });
        }

        for (const f of COLLECT_FIELDS) {
          const v = extracted[f.key];
          if (v === undefined || v === null) continue;

          // Rule extraction takes priority — skip if rule already filled this field
          if (f.key in ruleResult && (ruleResult as Record<string, unknown>)[f.key] !== undefined && !(modifying && f.key === modifyFieldKey)) continue;

          if (isMeaningfulExtraction(f.key, v)) {
            updated[f.key] = v;
            llmHits++;
          }
        }

        // Fix LLM misassignment: when modifying a specific field,
        // if LLM didn't return the target field but put the value in a related field, reassign it
        if (modifying && modifyFieldKey && !isMeaningfulExtraction(modifyFieldKey, updated[modifyFieldKey])) {
          const relatedFieldsMap: Record<string, string[]> = {
            itemName: ['itemBrandModel'],
            itemBrandModel: ['itemName'],
            projectPurpose: ['specialRequirements'],
            deliveryAddress: ['projectPurpose'],
          };
          const relatedFields = relatedFieldsMap[modifyFieldKey] || [];
          for (const relKey of relatedFields) {
            const prevVal = isMeaningfulExtraction(relKey, collected[relKey]) ? String(collected[relKey]) : null;
            const llmVal = extracted[relKey];
            // If LLM put a new value in the related field (not previously there), reassign to target
            if (isMeaningfulExtraction(relKey, llmVal) && prevVal !== String(llmVal)) {
              updated[modifyFieldKey] = llmVal;
              // Restore the related field to its previous value
              if (prevVal) {
                updated[relKey] = collected[relKey];
              } else {
                delete updated[relKey];
              }
              llmHits++;
              break;
            }
          }
          }
      }

      // Fallback: when modifying a string field and target is still empty, use raw user input
      if (modifying && modifyFieldKey && !isMeaningfulExtraction(modifyFieldKey, updated[modifyFieldKey])) {
        const targetFieldDef = COLLECT_FIELDS.find((f) => f.key === modifyFieldKey);
        if (targetFieldDef?.fieldType === 'string' && userInput.trim().length > 0) {
          updated[modifyFieldKey] = userInput.trim();
        }
      }
      const activeFieldKey2 = modifying ? modifyFieldKey : currentField?.key;
      const activeField2 = COLLECT_FIELDS.find((f) => f.key === activeFieldKey2);
      if (activeField2?.fieldType === 'boolean' && updated[activeFieldKey2] === undefined) {
        const trimmed = userInput.trim().toLowerCase();
        if (['是', '是的', '需要', '要', 'yes', 'y', '已经', '已核查', '查了'].includes(trimmed) || trimmed.startsWith('是')) {
          updated[activeFieldKey2] = true;
        } else if (['否', '不是', '不需要', '不要', 'no', 'n', '没', '没有', '未核查'].includes(trimmed) || trimmed.startsWith('否') || trimmed.startsWith('没')) {
          updated[activeFieldKey2] = false;
        }
      }

      // Post-AI string fallback: scan phone numbers from complex messages
      if (!isMeaningfulExtraction('contactPhone', updated.contactPhone) && !isSkipInput(userInput)) {
        const phoneMatch = userInput.match(/1[3-9]\d{9}/);
        if (phoneMatch) {
          updated.contactPhone = phoneMatch[0];
        }
      }

      // Post-AI fallback: 多字段输入里份数常被漏抽，从"X份 / 采购X / 数量X"里兜底（含中文数字）
      if (!isMeaningfulExtraction('itemQuantity', updated.itemQuantity) && !isSkipInput(userInput)) {
        const qtyMatch =
          userInput.match(/(\d+(?:\/\d+)*)\s*份/) ||
          userInput.match(/(?:采购|购买|需要|数量|要)\s*[:：]?\s*(\d+(?:\/\d+)*)/);
        if (qtyMatch) {
          updated.itemQuantity = qtyMatch[1];
        } else {
          const cnMatch = userInput.match(/([零一二三四五六七八九十百千两]+)\s*份/);
          const cn = cnMatch ? chineseToNumber(cnMatch[1]) : null;
          if (cn !== null && cn > 0) updated.itemQuantity = String(cn);
        }
      }

      // 多规格纠正：原文含 ≥2 档「N份」时，以原文为准解析每档规格+份数，份数取各档之和。
      // 插件常只返回第一档份数（如 40 而非 90），这里从用户原文兜底，保证单物料/继续添加/合并批量各路径份数都对。
      const singleMulti = parseSegmentMultiSpec(userInput, String(updated.itemName || ''));
      if (singleMulti) {
        updated.itemBrandModel = singleMulti.itemBrandModel;
        updated.itemQuantity = singleMulti.itemQuantity;
        updated.specDetails = parseSpecDetails(singleMulti.itemBrandModel, singleMulti.itemQuantity);
      }

      // Post-AI fallback: 从"收货地址/地址X"里兜底地址（多字段输入常带）
      if (!isMeaningfulExtraction('deliveryAddress', updated.deliveryAddress) && !isSkipInput(userInput)) {
        const addrMatch = userInput.match(
          /(?:收货地址|收获地址|送货地址|寄到|地址)[：:]*\s*([^\s，,。；;]+(?:[市省区路号栋座楼层室幢单元]\S*)*)/,
        );
        if (addrMatch && addrMatch[1].trim().length >= 2) {
          updated.deliveryAddress = addrMatch[1].trim();
        }
      }

      // 修正：电话被并进收货地址 → 抠出电话归位，并从地址里去掉（含"电话:"前缀）
      if (typeof updated.deliveryAddress === 'string') {
        const addrPhone = updated.deliveryAddress.match(/1[3-9]\d{9}/);
        if (addrPhone) {
          if (!isMeaningfulExtraction('contactPhone', updated.contactPhone)) {
            updated.contactPhone = addrPhone[0];
          }
          updated.deliveryAddress = updated.deliveryAddress
            .replace(/(?:电话|联系电话|手机|tel)?[：:]?\s*1[3-9]\d{9}/i, '')
            .replace(/[，,；;、\s]+$/, '')
            .trim();
        }
      }

      const endTime = performance.now();
      const metricsFieldKey = modifying ? modifyFieldKey : currentField?.key;
      logger.info('[ExtractionMetrics]', {
        duration_ms: Math.round(endTime - startTime),
        rule_hits: ruleHits,
        llm_hits: llmHits,
        current_field: metricsFieldKey,
        input_length: userInput.length,
      });

      const newSkipped = new Set(skippedFields);
      const extractedNew = hasNewExtraction(collected, updated);

      // F-Validation: Parallel validation of all newly extracted fields
      if (extractedNew) {
        const newFields: { key: string; value: unknown }[] = [];
        for (const f of COLLECT_FIELDS) {
          const wasEmpty = !isMeaningfulExtraction(f.key, collected[f.key]);
          const nowFilled = isMeaningfulExtraction(f.key, updated[f.key]);
          if (wasEmpty && nowFilled) newFields.push({ key: f.key, value: updated[f.key] });
        }
        if (newFields.length > 0) {
          const validationResults = await Promise.all(
            newFields.map(async (item) => {
              const v = await validateExtractedField(item.key, item.value);
              return { key: item.key, ...v };
            }),
          );
          const invalidFields: string[] = [];
          for (const vr of validationResults) {
            if (!vr.valid) {
              delete updated[vr.key];
              invalidFields.push(vr.key);
              setValidationWarnings((prev) => { const n = { ...prev }; delete n[vr.key]; return n; });
              const field = COLLECT_FIELDS.find((f) => f.key === vr.key);
              if (vr.severity === 'warning') {
                setMessages((prev) => [...prev, { role: 'bot', content: `⚠️ ${vr.message || '格式有误'}，请提供正确的${field?.label || ''}。`, timestamp: new Date().toISOString() }]);
              } else {
                setMessages((prev) => [...prev, { role: 'bot', content: `❌ ${field?.label || '信息'}${vr.message || '格式有误'}${vr.suggestion ? ` ${vr.suggestion}` : ''}`, timestamp: new Date().toISOString() }]);
              }
            } else {
              setValidationWarnings((prev) => { const n = { ...prev }; delete n[vr.key]; return n; });
            }
          }
          if (invalidFields.length > 0) {
            setCollected((prev) => {
              const r = { ...prev };
              for (const key of invalidFields) delete r[key];
              return r;
            });
          }
          const stillHasNewExtraction = hasNewExtraction(collected, updated);
          if (!stillHasNewExtraction && invalidFields.length > 0) {
            setExtracting(false);
            return;
          }
        }
      }

      if (modifying && modifyFieldKey) {
        const field = COLLECT_FIELDS.find((f) => f.key === modifyFieldKey);
        const modifyFieldExtracted = isMeaningfulExtraction(modifyFieldKey, updated[modifyFieldKey])
          || (field?.fieldType === 'boolean' && updated[modifyFieldKey] !== undefined);
        if (modifyFieldExtracted) {
          setCollected(updated); setModifying(false); setModifyFieldKey(null);
          addBotMsg(`已更新${field?.label || ''}。如需修改其他字段，请点击预览区的"修改"按钮。`);
        } else if (isSkipInput(userInput)) {
          setCollected(updated); setModifying(false); setModifyFieldKey(null);
          addBotMsg('已取消修改。');
        } else {
          setCollected(updated);
          addBotMsg(`未能提取到有效的${field?.label || ''}信息，请重新输入。`);
        }
      } else if (!extractedNew && isSkipInput(userInput)) {
        if (currentField && currentField.required) {
          setValidationWarnings((prev) => { const n = { ...prev }; delete n[currentField.key]; return n; });
          addBotMsg(`${currentField.label}为必填项，无法跳过，请提供有效信息。`);
        } else if (currentField) {
          newSkipped.add(currentField.key);
          setValidationWarnings((prev) => { const n = { ...prev }; delete n[currentField.key]; return n; });
          setSkippedFields(newSkipped); setCollected(updated);
          advanceToNextField(updated, newSkipped, currentFieldIndex + 1);
        }
      } else {
        // Step 2：抽到新信息 → 推进到下一个仍缺的字段；没抽到也不再粗暴判为"无关问题"，
        // 而是从头重扫、温和地重新追问当前还缺的字段，避免把有效的多字段回答误拒。
        setCollected(updated);
        if (!extractedNew && currentField) {
          addBotMsg(`我没太理解，麻烦补充一下「${currentField.label}」。`);
        }
        advanceToNextField(updated, newSkipped, 0);
      }
    } catch {
      toast.error('信息提取失败，请重试');
      addBotMsg('抱歉，信息提取出现异常，请重新输入。');
    } finally {
      setExtracting(false);
    }
  };

  const buildCreateRequest = (
    data: Record<string, unknown>,
    status?: string,
    assigneeId?: string,
  ): CreateProcurementRequirementRequest => {
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    return {
    itemName: String(data.itemName || '待人工补充'),
    itemLink: String(data.itemLinkOriginal || data.itemLink || '待补充'),
    itemQuantity: String(data.itemQuantity || ''),
    itemUnit: String(data.itemUnit || '份'),
    projectCode: String(data.projectCode || '待补充'),
      projectPurpose: data.projectPurpose ? String(data.projectPurpose) : undefined,
    inventoryChecked: true,
    inventoryChecker: userInfo?.user_id || undefined,
    itemBrandModel: data.itemBrandModel ? String(data.itemBrandModel) : undefined,
    projectName: data.projectName ? String(data.projectName) : undefined,
    expectedDelivery: data.expectedDelivery ? String(data.expectedDelivery) : threeDaysLater.toISOString().split('T')[0],
    deliveryAddress: data.deliveryAddress ? String(data.deliveryAddress) : undefined,
    contactPhone: data.contactPhone ? String(data.contactPhone) : undefined,
    invoiceRequired: true,
    conversationHistory: messages.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n'),
    screenshotUrl: data.screenshotUrl ? String(data.screenshotUrl) : undefined,
    status: status as CreateProcurementRequirementRequest['status'],
    assigneeId,
    requesterName: userInfo?.name && typeof userInfo.name === 'object' ? (userInfo.name as { zh_cn?: string }).zh_cn || (userInfo.name as { en_us?: string }).en_us : (typeof userInfo?.name === 'string' ? userInfo.name : undefined),
    draftStartedAt: draftStartedAtRef.current || undefined,
  };}

  const buildBatchItem = (data: Record<string, unknown>): BatchCreateItemRequest => ({
    itemName: String(data.itemName || '待人工补充'),
    itemBrandModel: data.itemBrandModel ? String(data.itemBrandModel) : undefined,
    itemLink: String(data.itemLinkOriginal || data.itemLink || '待补充'),
    itemQuantity: String(data.itemQuantity || ''),
    itemUnit: String(data.itemUnit || '份'),
  });

  const buildItemsFromCollected = (data: Record<string, unknown>): BatchCreateItemRequest[] => {
    const specs = data.specDetails as SpecDetail[] | undefined;
    if (specs && specs.length > 0) {
      const mergedModel = specs
        .map((s) => (specs.length > 1 ? `${s.itemBrandModel}(${s.itemQuantity}份)` : s.itemBrandModel))
        .join('、');
      const totalQty = specs.reduce((sum, s) => {
        const n = parseInt(s.itemQuantity, 10);
        return sum + (isNaN(n) ? 0 : n);
      }, 0);
      return [{
        itemName: String(data.itemName || '待人工补充'),
        itemBrandModel: mergedModel,
        itemLink: String(data.itemLinkOriginal || data.itemLink || '待补充'),
        itemQuantity: String(totalQty || 1),
        itemUnit: '份',
      }];
    }
    return [buildBatchItem(data)];
  };

  const handleConfirm = async () => {
    markDraftStart();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (!(await runBatchValidation(collected))) { setSubmitting(false); submittingRef.current = false; return; }
      const items = buildItemsFromCollected(collected);
      if (items.length > 1) {
        const threeDaysLater = new Date();
        threeDaysLater.setDate(threeDaysLater.getDate() + 3);
        const batchReq: BatchCreateRequest = {
          items,
          draftStartedAt: draftStartedAtRef.current || undefined,
          projectCode: String(collected.projectCode || '待补充'),
          projectName: collected.projectName ? String(collected.projectName) : undefined,
          projectPurpose: collected.projectPurpose ? String(collected.projectPurpose) : undefined,
          inventoryChecked: true,
          inventoryChecker: userInfo?.user_id || undefined,
          expectedDelivery: collected.expectedDelivery ? String(collected.expectedDelivery) : threeDaysLater.toISOString().split('T')[0],
          deliveryAddress: collected.deliveryAddress ? String(collected.deliveryAddress) : undefined,
          contactPhone: collected.contactPhone ? String(collected.contactPhone) : undefined,
          invoiceRequired: true,
          conversationHistory: messages.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n'),
          requesterName: userInfo?.name && typeof userInfo.name === 'object' ? (userInfo.name as { zh_cn?: string }).zh_cn || (userInfo.name as { en_us?: string }).en_us : (typeof userInfo?.name === 'string' ? userInfo.name : undefined),
        };
        const res = await batchCreateRequirements(batchReq);
        saveDefaultFields(collected);
        toast.success(`采购需求已提交成功！共创建 ${res.count} 条采购需求。`);
      } else {
        await procurement.createRequirement(buildCreateRequest(collected));
        saveDefaultFields(collected);
        toast.success('采购需求已提交成功！');
      }
      if (batchMode) { setBatchMode(false); setBatchItems([]); }
      resetConversation();
    } catch {
      toast.error('提交失败，请重试');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // F-106: Continue adding materials
  const handleContinueAddMaterial = () => {
    const currentItem = buildBatchItem(collected);
    setBatchItems((prev) => [...prev, currentItem]);
    setBatchMode(true);
    setShowPreview(false);

    // Reset only material fields, keep project/logistics fields
    const resetData: Record<string, unknown> = {};
    for (const key of Object.keys(collected)) {
      if (!MATERIAL_FIELD_KEYS.includes(key)) resetData[key] = collected[key];
    }
    setCollected(resetData); setSkippedFields(new Set());
    const nextIdx = getNextFieldIndex(resetData, new Set(), 0);
    if (nextIdx >= 0) {
      setCurrentFieldIndex(nextIdx);
      addBotMsg(`✅ 已添加第 ${batchItems.length + 1} 个物料。继续添加下一个：${COLLECT_FIELDS[nextIdx].question}`);
    } else {
      setCurrentFieldIndex(0);
      addBotMsg(`✅ 已添加第 ${batchItems.length + 1} 个物料。请重新输入物料信息。`);
    }
  };

  // F-106: Submit all batch items
  const handleSubmitAll = async () => {
    markDraftStart();
    if (submittingRef.current) return;
    submittingRef.current = true;
    const currentItems = buildItemsFromCollected(collected);
    const allItems = [...batchItems, ...currentItems];

    setSubmitting(true);
    try {
      if (!(await runBatchValidation(collected))) { setSubmitting(false); submittingRef.current = false; return; }
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    const batchReq: BatchCreateRequest = {
        items: allItems,
        draftStartedAt: draftStartedAtRef.current || undefined,
        projectCode: String(collected.projectCode || '待补充'),
        projectName: collected.projectName ? String(collected.projectName) : undefined,
        projectPurpose: collected.projectPurpose ? String(collected.projectPurpose) : undefined,
        inventoryChecked: true,
        inventoryChecker: userInfo?.user_id || undefined,
        expectedDelivery: collected.expectedDelivery ? String(collected.expectedDelivery) : threeDaysLater.toISOString().split('T')[0],
        deliveryAddress: collected.deliveryAddress ? String(collected.deliveryAddress) : undefined,
        contactPhone: collected.contactPhone ? String(collected.contactPhone) : undefined,
        invoiceRequired: true,
        conversationHistory: messages.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n'),
        requesterName: userInfo?.name && typeof userInfo.name === 'object' ? (userInfo.name as { zh_cn?: string }).zh_cn || (userInfo.name as { en_us?: string }).en_us : (typeof userInfo?.name === 'string' ? userInfo.name : undefined),
    };
      const res = await batchCreateRequirements(batchReq);
      saveDefaultFields(collected);
      toast.success(`批量提交成功！共创建 ${res.count} 条采购需求。`);
      setBatchMode(false);
      setBatchItems([]);
      resetConversation();
    } catch {
      toast.error('批量提交失败，请重试');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  // 批量预览确认提交：直接提交 batchItems（共享字段取自 collected）
  const handleConfirmBatch = async () => {
    markDraftStart();
    if (submittingRef.current) return;
    submittingRef.current = true;
    // 批量校验：物料在 batchItems（非 collected），逐项检查名称/链接/份数；共享字段收集时已逐个校验过
    const missing: string[] = [];
    if (!collected.projectCode) missing.push('项目代号');
    if (!collected.contactPhone) missing.push('联系电话');
    if (!collected.deliveryAddress) missing.push('收货地址');
    batchItems.forEach((it, i) => {
      if (!it.itemName || it.itemName === '待补充物料') missing.push(`物料${i + 1}名称`);
      if (!it.itemLink || it.itemLink === '待补充') missing.push(`物料${i + 1}链接`);
      if (!it.itemQuantity || !/\d/.test(it.itemQuantity)) missing.push(`物料${i + 1}份数`);
    });
    if (missing.length > 0) {
      toast.error(`还缺少：${missing.join('、')}`);
      submittingRef.current = false;
      return;
    }
    setSubmitting(true);
    try {
      const threeDaysLater = new Date();
      threeDaysLater.setDate(threeDaysLater.getDate() + 3);
      const batchReq: BatchCreateRequest = {
        items: batchItems,
        draftStartedAt: draftStartedAtRef.current || undefined,
        projectCode: String(collected.projectCode || '待补充'),
        projectName: collected.projectName ? String(collected.projectName) : undefined,
        projectPurpose: collected.projectPurpose ? String(collected.projectPurpose) : undefined,
        inventoryChecked: true,
        inventoryChecker: userInfo?.user_id || undefined,
        expectedDelivery: collected.expectedDelivery ? String(collected.expectedDelivery) : threeDaysLater.toISOString().split('T')[0],
        deliveryAddress: collected.deliveryAddress ? String(collected.deliveryAddress) : undefined,
        contactPhone: collected.contactPhone ? String(collected.contactPhone) : undefined,
        invoiceRequired: true,
        conversationHistory: messages.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n'),
        requesterName: userInfo?.name && typeof userInfo.name === 'object' ? (userInfo.name as { zh_cn?: string }).zh_cn || (userInfo.name as { en_us?: string }).en_us : (typeof userInfo?.name === 'string' ? userInfo.name : undefined),
      };
      const res = await batchCreateRequirements(batchReq);
      saveDefaultFields(collected);
      toast.success(`批量提交成功！共创建 ${res.count} 条采购需求。`);
      resetConversation();
    } catch {
      toast.error('批量提交失败，请重试');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleFormSubmit = async (data: Record<string, unknown>) => {
    markDraftStart();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const allFormItems = (data.allItems || buildItemsFromCollected(data)) as BatchCreateItemRequest[];
      if (allFormItems.length >= 1) {
        const threeDaysLater = new Date();
        threeDaysLater.setDate(threeDaysLater.getDate() + 3);
        const batchReq: BatchCreateRequest = {
          items: allFormItems,
          draftStartedAt: draftStartedAtRef.current || undefined,
          projectCode: String(data.projectCode || '待补充'),
          projectName: data.projectName ? String(data.projectName) : undefined,
          projectPurpose: data.projectPurpose ? String(data.projectPurpose) : undefined,
          inventoryChecked: true,
          inventoryChecker: userInfo?.user_id || undefined,
          expectedDelivery: data.expectedDelivery ? String(data.expectedDelivery) : threeDaysLater.toISOString().split('T')[0],
          deliveryAddress: data.deliveryAddress ? String(data.deliveryAddress) : undefined,
          contactPhone: data.contactPhone ? String(data.contactPhone) : undefined,
          invoiceRequired: true,
          conversationHistory: '',
          requesterName: userInfo?.name && typeof userInfo.name === 'object' ? (userInfo.name as { zh_cn?: string }).zh_cn || (userInfo.name as { en_us?: string }).en_us : (typeof userInfo?.name === 'string' ? userInfo.name : undefined),
        };
        const res = await batchCreateRequirements(batchReq);
        saveDefaultFields(data);
        if (allFormItems.length > 1) {
          toast.success(`采购需求已提交成功！共创建 ${res.count} 条采购需求。`);
        } else {
          toast.success('采购需求已提交成功！');
        }
      } else {
        await procurement.createRequirement(buildCreateRequest(data));
        saveDefaultFields(data);
        toast.success('采购需求已提交成功！');
      }
      resetConversation();
      setFormKey((k) => k + 1);
    } catch {
      toast.error('提交失败，请重试');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleTransferToHuman = async () => {
    markDraftStart();
    if (!transferReason.trim()) { toast.error('请输入转人工原因'); return; }
    setTransferring(true);
    try {
      const created = await procurement.createRequirement(buildCreateRequest(collected, '人工处理中', DEFAULT_ASSIGNEE_ID));
      await procurement.transferToHuman(created.id, { reason: transferReason.trim() });
      toast.success('已转交人工处理，采购专员将尽快与您联系。');
      setTransferMode(false); setTransferReason(''); setTransferred(true);
      addBotMsg(`已为您转交人工处理，原因：${transferReason.trim()}。`, 'transfer_card', collected);
    } catch {
      toast.error('转人工失败，请重试');
    } finally { setTransferring(false); }
  };

  const handleImageUpload = useCallback(async (file: File) => {
    if (extracting || imageUploading) return;
    markDraftStart();
    setImageUploading(true);
    const imageUrl = URL.createObjectURL(file);
    setMessages((prev) => [...prev, { role: 'user' as const, content: '[上传采购截图]', timestamp: new Date().toISOString(), imageUrl }]);
    try {
      let screenshotUrl = '';
      try {
        const dataloom = await getDataloom();
        const { data: uploadData, error: uploadError } = await dataloom.storage.from(getDefaultBucketId()).uploadFile(file);
        if (!uploadError && uploadData) {
          screenshotUrl = uploadData.download_url;
          logger.info('截图上传成功:', screenshotUrl);
        } else {
          logger.error('截图上传失败:', uploadError?.message || '未知错误');
        }
      } catch (uploadErr) {
        logger.error('截图上传异常:', String(uploadErr));
      }
      const result = await extractFromScreenshot(file);
      if (!result) {
        addBotMsg('未能识别截图中的采购信息，请手动输入或重新上传清晰截图。');
        return;
      }
      const updated: Record<string, unknown> = { ...collected };
      if (screenshotUrl) updated.screenshotUrl = screenshotUrl;
      if (result.itemName) updated.itemName = result.itemName;
      if (result.itemBrandModel) updated.itemBrandModel = result.itemBrandModel;
      const pkgSizeNum = result.packageSize ? Number(result.packageSize) : 0;
      const annoQtyNum = result.annotatedQuantity ? Number(result.annotatedQuantity) : 0;
      const portionsNum = result.purchasePortions ? Number(result.purchasePortions) : 0;
      if (portionsNum > 0) {
        updated.itemQuantity = String(portionsNum);
        updated.itemUnit = '份';
      } else if (annoQtyNum > 0 && pkgSizeNum > 0) {
        const portions = Math.ceil(annoQtyNum / pkgSizeNum);
        updated.itemQuantity = String(portions);
        updated.itemUnit = '份';
      } else if (annoQtyNum > 0) {
        updated.itemQuantity = String(annoQtyNum);
        updated.itemUnit = '份';
      }
      setCollected(updated);
      const summaryParts: string[] = [];
      if (result.itemName) summaryParts.push(`物料: ${result.itemName}`);
      if (result.itemBrandModel) summaryParts.push(`规格: ${result.itemBrandModel}`);
      if (result.packageSize) summaryParts.push(`每份: ${result.packageSize}个`);
      if (result.annotatedQuantity) summaryParts.push(`总需: ${result.annotatedQuantity}个`);
      if (result.purchasePortions) summaryParts.push(`份数: ${result.purchasePortions}份`);
      if (result.platform) summaryParts.push(`平台: ${result.platform}`);
      if (summaryParts.length === 0) {
        addBotMsg('未能从截图中识别到有效信息，请手动输入或上传更清晰的截图。');
      } else {
        addBotMsg(`已从截图中识别到以下信息：\n${summaryParts.join(' | ')}`, 'image_result', updated);
      }
      const nextIdx = getNextFieldIndex(updated, skippedFields, 0);
      if (nextIdx >= 0) {
        setCurrentFieldIndex(nextIdx);
        setModifying(false);
        setModifyFieldKey(null);
        const nextField = COLLECT_FIELDS[nextIdx];
        setTimeout(() => addBotMsg(nextField.question), 400);
      } else {
        setShowPreview(true);
        setModifying(false);
        setModifyFieldKey(null);
        const deliveryNotice = !updated.expectedDelivery ? '期望到货时间已默认设为3天后。' : '';
        addBotMsg(`所有信息已收集完毕！请在右侧预览采购单，确认无误后即可提交。${deliveryNotice}`);
      }
    } catch (err) {
      logger.error('截图识别异常:', String(err));
      addBotMsg('截图识别出现异常，请手动输入信息。');
    } finally {
      setImageUploading(false);
    }
  }, [extracting, imageUploading, collected, showPreview, setMessages, setCollected, setShowPreview]);

  const handleModifyField = (fieldKey: string) => {
    const field = COLLECT_FIELDS.find((f) => f.key === fieldKey);
    if (!field) return;
    setModifying(true); setModifyFieldKey(fieldKey); setShowPreview(true);
    addBotMsg(`请重新输入${field.label}：${field.question}`);
  };

  const handleModify = () => {
    setShowPreview(true);
    const firstUnfilled = getNextFieldIndex(collected, skippedFields, 0);
    handleModifyField(COLLECT_FIELDS[firstUnfilled >= 0 ? firstUnfilled : 0].key);
  };

  const handleEditExpectedDelivery = (date: string) => {
    setCollected((prev) => ({ ...prev, expectedDelivery: date }));
  };

  const resetConversation = () => {
    clearSession();
    setShowPreview(false);
    setModifying(false);
    setModifyFieldKey(null);
  };

  const inputDisabled = extracting || (showPreview && !modifying);

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-4rem)] p-4 max-w-[1600px] mx-auto w-full">
      {inputMode === 'form' ? (
        <ProcurementForm
          key={formKey}
          defaultPhone={localStorage.getItem('procurement_default_phone') || undefined}
          defaultAddress={localStorage.getItem('procurement_default_address') || undefined}
          initialProducts={rebuyPrefill?.products}
          initialShared={rebuyPrefill?.shared}
          onSubmit={handleFormSubmit}
          onTransferToHuman={async () => {
            setTransferred(true);
            toast.success('已转交人工处理');
          }}
          onInputModeChange={handleModeChange}
          submitting={submitting}
        />
      ) : (
        <ChatArea
          messages={messages} extracting={extracting} transferMode={transferMode}
          transferReason={transferReason} transferring={transferring} transferred={transferred}
          input={input} inputDisabled={inputDisabled} modifying={modifying}
          modifyFieldKey={modifyFieldKey} showPreview={showPreview} currentField={currentField}
          projectSuggestions={projectSuggestions} projectSearchLoading={projectSearchLoading}
          showProjectSuggestions={showProjectSuggestions} messagesEndRef={messagesEndRef} messagesScrollRef={messagesScrollRef}
          onInputModeChange={handleModeChange}
          onSend={handleSend} onInputChange={handleInputChange}
          onTransferToHuman={handleTransferToHuman}
          onTransferReasonChange={(v) => setTransferReason(v)}
          onCancelTransfer={() => { setTransferMode(false); setTransferReason(''); }}
          onStartTransfer={() => setTransferMode(true)}
          onSelectProject={handleSelectProject}
          onCloseProjectSuggestions={() => { setShowProjectSuggestions(false); setProjectSuggestions([]); }}
          onReset={resetConversation}
          onImageUpload={handleImageUpload}
          imageUploading={imageUploading}
          onEditRequirement={(id) => { setEditingId(id); setEditDialogOpen(true); }}
        />
      )}

      {inputMode === 'chat' && (
        <PreviewPanel
          collected={collected}
          skippedFields={skippedFields}
          showPreview={showPreview}
          transferred={transferred}
          batchMode={batchMode}
          batchItems={batchItems}
          batchPreview={batchPreview}
          submitting={submitting}
          onModifyField={handleModifyField}
          onEditExpectedDelivery={handleEditExpectedDelivery}
          onModify={handleModify}
          onConfirm={handleConfirm}
          onContinueAddMaterial={handleContinueAddMaterial}
          onSubmitAll={handleSubmitAll}
          onConfirmBatch={handleConfirmBatch}
          onReset={resetConversation}
        />
      )}

      <RequirementEditDialog
        requirementId={editingId || ''}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </div>
  );
};

export default ProcurementSubmitPage;
