import React, { useState, useCallback, useRef, useEffect } from 'react';
import { z } from 'zod';
import { Loader2, Package, FolderOpen, Truck, Headset, MessageSquare, ChevronRight, FileText, Plus, Trash2, History } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getProjectList, getMyProjectCodes, batchValidate, getRecommendations, trackRecEvent } from '@client/src/api/procurement';
import type { ProjectInfoItem, RecommendationItem } from '@shared/api.interface';
import ProjectSuggestDropdown from './ProjectSuggestDropdown';
import CategorySuggestDropdown from './CategorySuggestDropdown';
import { parseSpecDetails, type SpecDetail } from './constants';
import { UniversalLink } from '@lark-apaas/client-toolkit/components/UniversalLink';

interface ProductCard {
  itemLink: string;
  itemName: string;
  specDetails: SpecDetail[];
  showCategorySuggestions?: boolean;
}

interface ProductErrors {
  itemLink?: string;
  itemName?: string;
  specErrors: Record<string, string>[];
}

const sharedSchema = z.object({
  projectCode: z.string().min(1, '请输入项目代号'),
  projectPurpose: z.string().max(200, '额外说明不超过200字'),
  contactPhone: z.string().regex(/^1[3-9]\d{9}$/, '请输入11位手机号码'),
  deliveryAddress: z.string().min(1, '请输入收货地址'),
});

type SharedFormData = z.infer<typeof sharedSchema>;

interface FieldError { field: string; message: string; }

interface ProcurementFormProps {
  defaultPhone?: string;
  defaultAddress?: string;
  /** 「再次购买」预填的商品卡片 */
  initialProducts?: ProductCard[];
  /** 「再次购买」预填的项目/物流信息 */
  initialShared?: Partial<SharedFormData>;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  onTransferToHuman: () => void;
  onInputModeChange: (mode: 'chat' | 'form') => void;
  submitting: boolean;
}

const createEmptyProduct = (): ProductCard => ({
  itemLink: '',
  itemName: '',
  specDetails: [{ itemBrandModel: '', itemQuantity: '' }],
});

const ProcurementForm: React.FC<ProcurementFormProps> = ({
  defaultPhone,
  defaultAddress,
  initialProducts,
  initialShared,
  onSubmit,
  onTransferToHuman,
  onInputModeChange,
  submitting,
}) => {
  const initProducts =
    initialProducts && initialProducts.length ? initialProducts : [createEmptyProduct()];
  const [products, setProducts] = useState<ProductCard[]>(initProducts);
  const [sharedValues, setSharedValues] = useState<SharedFormData>({
    projectCode: initialShared?.projectCode || '',
    projectPurpose: initialShared?.projectPurpose || '',
    contactPhone: initialShared?.contactPhone || defaultPhone || '',
    deliveryAddress: initialShared?.deliveryAddress || defaultAddress || '南山智园C3-4',
  });
  const [sharedErrors, setSharedErrors] = useState<FieldError[]>([]);
  const [productErrors, setProductErrors] = useState<ProductErrors[]>(
    initProducts.map((p) => ({
      itemLink: '',
      itemName: '',
      specErrors: p.specDetails.map(() => ({})),
    })),
  );
  const [projectSuggestions, setProjectSuggestions] = useState<ProjectInfoItem[]>([]);
  const [showProjectSuggestions, setShowProjectSuggestions] = useState(false);
  const [projectSearchLoading, setProjectSearchLoading] = useState(false);
  const [historyCodes, setHistoryCodes] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const historyFetchedRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // L4 历史复用推荐
  const [recQuery, setRecQuery] = useState('');
  const [recItems, setRecItems] = useState<RecommendationItem[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const recTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastShownRef = useRef('');

  const handleRecSearch = useCallback((kw: string) => {
    setRecQuery(kw);
    if (recTimerRef.current) clearTimeout(recTimerRef.current);
    if (!kw.trim()) {
      setRecItems([]);
      return;
    }
    recTimerRef.current = setTimeout(async () => {
      setRecLoading(true);
      try {
        const res = await getRecommendations(kw.trim());
        setRecItems(res.items);
        // ① 采纳率埋点：有结果且换了查询词才记一次"展示"
        if (res.items.length > 0 && lastShownRef.current !== kw.trim()) {
          lastShownRef.current = kw.trim();
          trackRecEvent('shown');
        }
      } catch {
        setRecItems([]);
      } finally {
        setRecLoading(false);
      }
    }, 350);
  }, []);

  // 本人历史：一键复用（链接/物料/规格/份数/项目全带入）
  const reuseRecommendation = useCallback((item: RecommendationItem) => {
    const specDetails = parseSpecDetails(item.itemBrandModel, item.itemQuantity);
    setProducts([{ itemLink: item.itemLink, itemName: item.itemName, specDetails }]);
    setProductErrors([
      { itemLink: '', itemName: '', specErrors: specDetails.map(() => ({})) },
    ]);
    setSharedValues((prev) => ({ ...prev, projectCode: item.projectCode }));
    setRecItems([]);
    setRecQuery('');
    trackRecEvent('reused');
    toast.success(`已复用历史采购：${item.itemName}`);
  }, []);

  // 同事采购：仅以链接+物料为模板，规格/份数留空让本人确认填写（型号可能不同）
  const fillAsTemplate = useCallback((item: RecommendationItem) => {
    setProducts([
      { itemLink: item.itemLink, itemName: item.itemName, specDetails: [{ itemBrandModel: '', itemQuantity: '' }] },
    ]);
    setProductErrors([{ itemLink: '', itemName: '', specErrors: [{}] }]);
    setRecItems([]);
    setRecQuery('');
    trackRecEvent('reused');
    toast.success('已带入链接和物料，请确认规格并填写份数');
  }, []);

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

  const fetchHistoryCodes = useCallback(async () => {
    if (historyFetchedRef.current) {
      setShowHistory(true);
      return;
    }
    historyFetchedRef.current = true;
    try {
      const res = await getMyProjectCodes();
      setHistoryCodes(res.items);
      if (res.items.length > 0) setShowHistory(true);
    } catch {
      // ignore
    }
  }, []);

  const handleSharedFieldChange = useCallback((key: keyof SharedFormData, value: string) => {
    setSharedValues((prev) => ({ ...prev, [key]: value }));
    setSharedErrors((prev) => prev.filter((e) => e.field !== key));
    if (key === 'projectCode' && searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => handleProjectSearch(value), 300);
    }
  }, [handleProjectSearch]);

  const updateProduct = useCallback((productIndex: number, key: keyof Omit<ProductCard, 'specDetails' | 'showCategorySuggestions'>, value: string) => {
    setProducts((prev) =>
      prev.map((p, i) => (i === productIndex ? { ...p, [key]: value } : p)),
    );
    setProductErrors((prev) =>
      prev.map((e, i) => (i === productIndex ? { ...e, [key]: '' } : e)),
    );
  }, []);

  const addProduct = useCallback(() => {
    setProducts((prev) => [...prev, createEmptyProduct()]);
    setProductErrors((prev) => [...prev, { itemLink: '', itemName: '', specErrors: [{}] }]);
  }, []);

  const removeProduct = useCallback((index: number) => {
    setProducts((prev) => prev.filter((_, i) => i !== index));
    setProductErrors((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addSpec = useCallback((productIndex: number) => {
    setProducts((prev) =>
      prev.map((p, i) =>
        i === productIndex
          ? { ...p, specDetails: [...p.specDetails, { itemBrandModel: '', itemQuantity: '' }] }
          : p,
      ),
    );
    setProductErrors((prev) =>
      prev.map((e, i) =>
        i === productIndex ? { ...e, specErrors: [...e.specErrors, {}] } : e,
      ),
    );
  }, []);

  const removeSpec = useCallback((productIndex: number, specIndex: number) => {
    setProducts((prev) =>
      prev.map((p, i) =>
        i === productIndex
          ? { ...p, specDetails: p.specDetails.filter((_, si) => si !== specIndex) }
          : p,
      ),
    );
    setProductErrors((prev) =>
      prev.map((e, i) =>
        i === productIndex ? { ...e, specErrors: e.specErrors.filter((_, si) => si !== specIndex) } : e,
      ),
    );
  }, []);

  const updateSpec = useCallback((productIndex: number, specIndex: number, key: keyof SpecDetail, value: string) => {
    setProducts((prev) =>
      prev.map((p, i) =>
        i === productIndex
          ? { ...p, specDetails: p.specDetails.map((s, si) => (si === specIndex ? { ...s, [key]: value } : s)) }
          : p,
      ),
    );
    setProductErrors((prev) =>
      prev.map((e, i) =>
        i === productIndex
          ? { ...e, specErrors: e.specErrors.map((errs, si) => (si === specIndex ? { ...errs, [key]: '' } : errs)) }
          : e,
      ),
    );
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const sharedResult = sharedSchema.safeParse(sharedValues);
    if (!sharedResult.success) {
      const fieldErrors: FieldError[] = sharedResult.error.issues.map((issue) => ({
        field: String(issue.path[0]),
        message: issue.message,
      }));
      setSharedErrors(fieldErrors);
      toast.error('请完善项目/物流信息');
      return;
    }

    if (products.length === 0) {
      toast.error('请至少添加一个商品');
      return;
    }

    let hasProductError = false;
    const newProductErrors: ProductErrors[] = products.map((product) => {
      const pe: ProductErrors = { itemLink: '', itemName: '', specErrors: [] };
      if (!product.itemLink.trim()) { pe.itemLink = '请输入商品链接'; hasProductError = true; }
      else if (!/^https?:\/\/.+/.test(product.itemLink.trim())) { pe.itemLink = '请输入有效的URL'; hasProductError = true; }
      if (!product.itemName.trim()) { pe.itemName = '请输入物料名称'; hasProductError = true; }
      if (product.specDetails.length === 0) {
        pe.specErrors = [{}];
        hasProductError = true;
      } else {
        pe.specErrors = product.specDetails.map((spec) => {
          const errs: Record<string, string> = {};
          if (!spec.itemBrandModel.trim()) { errs.itemBrandModel = '请输入规格型号'; hasProductError = true; }
          if (!spec.itemQuantity.trim()) { errs.itemQuantity = '请输入采购份数'; hasProductError = true; }
          else if (!/^\d+(\/\d+)*$/.test(spec.itemQuantity.trim())) { errs.itemQuantity = '格式不正确，如：20'; hasProductError = true; }
          return errs;
        });
      }
      return pe;
    });
    setProductErrors(newProductErrors);
    if (hasProductError) {
      toast.error('请完善商品信息');
      return;
    }

    try {
      const allItems: Array<{ itemName: string; itemLink: string; itemLinkOriginal: string; itemBrandModel: string; itemQuantity: string; itemUnit: string }> = [];
      for (const product of products) {
        const mergedModel = product.specDetails
          .map((s) => (product.specDetails.length > 1 ? `${s.itemBrandModel}(${s.itemQuantity}份)` : s.itemBrandModel))
          .join('、');
        const totalQty = product.specDetails.reduce((sum, s) => {
          const n = parseInt(s.itemQuantity, 10);
          return sum + (isNaN(n) ? 0 : n);
        }, 0);
        allItems.push({
          itemName: product.itemName,
          itemLink: product.itemLink,
          itemLinkOriginal: product.itemLink,
          itemBrandModel: mergedModel,
          itemQuantity: String(totalQty || 1),
          itemUnit: '份',
        });
      }

      const fieldMap: Record<string, unknown> = {
        itemName: products[0].itemName,
        itemLink: products[0].itemLink,
        itemLinkOriginal: products[0].itemLink,
        itemBrandModel: allItems[0]?.itemBrandModel || '',
        itemQuantity: allItems[0]?.itemQuantity || '',
        projectCode: sharedValues.projectCode,
        projectPurpose: sharedValues.projectPurpose,
        contactPhone: sharedValues.contactPhone,
        deliveryAddress: sharedValues.deliveryAddress,
        allItems,
      };

      const batchResult = await batchValidate({ fields: fieldMap });
      if (batchResult.errors.length > 0) {
        const msg = batchResult.errors.map((err) => err.message).join('；');
        toast.error(msg);
        return;
      }
      if (batchResult.warnings.length > 0) {
        const msg = batchResult.warnings.map((w) => w.message).join('；');
        toast.error(msg);
        return;
      }

      await onSubmit(fieldMap);
    } catch {
      toast.error('提交失败，请重试');
    }
  };

  const getSharedError = (key: string): string | undefined =>
    sharedErrors.find((e) => e.field === key)?.message;

  const renderProductCard = (product: ProductCard, productIndex: number) => {
    const pErrors = productErrors[productIndex];
    return (
      <div
        key={productIndex}
        className="rounded-lg border border-border bg-card p-4 space-y-3"
      >
        {productIndex > 0 && (
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-primary">商品 {productIndex + 1}</span>
            <button
              type="button"
              onClick={() => removeProduct(productIndex)}
              className="size-6 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
        {productIndex === 0 && products.length > 1 && (
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-primary">商品 1</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            商品链接 <span className="text-destructive">*</span>
          </label>
          <Input
            placeholder="https://..."
            value={product.itemLink}
            onChange={(e) => updateProduct(productIndex, 'itemLink', e.target.value)}
            className={`h-9 ${pErrors?.itemLink ? 'border-destructive' : ''}`}
          />
          {pErrors?.itemLink && <p className="text-xs text-destructive">{pErrors.itemLink}</p>}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">
            物料名称 <span className="text-destructive">*</span>
          </label>
          <div className="relative">
            <Input
              placeholder="如：轴承、电机、螺丝"
              value={product.itemName}
              onChange={(e) => {
                updateProduct(productIndex, 'itemName', e.target.value);
                setProducts((prev) =>
                  prev.map((p, i) =>
                    i === productIndex ? { ...p, showCategorySuggestions: e.target.value.trim().length > 0 } : p,
                  ),
                );
              }}
              onFocus={() => {
                if (product.itemName.trim()) {
                  setProducts((prev) =>
                    prev.map((p, i) => (i === productIndex ? { ...p, showCategorySuggestions: true } : p)),
                  );
                }
              }}
              onBlur={() => setTimeout(() => {
                setProducts((prev) =>
                  prev.map((p, i) => (i === productIndex ? { ...p, showCategorySuggestions: false } : p)),
                );
              }, 200)}
              className={`h-9 ${pErrors?.itemName ? 'border-destructive' : ''}`}
            />
            {product.showCategorySuggestions && (
              <CategorySuggestDropdown
                keyword={product.itemName}
                onSelect={(cat) => {
                  updateProduct(productIndex, 'itemName', cat);
                  setProducts((prev) =>
                    prev.map((p, i) => (i === productIndex ? { ...p, showCategorySuggestions: false } : p)),
                  );
                }}
                onClose={() => {
                  setProducts((prev) =>
                    prev.map((p, i) => (i === productIndex ? { ...p, showCategorySuggestions: false } : p)),
                  );
                }}
              />
            )}
          </div>
          {pErrors?.itemName && <p className="text-xs text-destructive">{pErrors.itemName}</p>}
        </div>

        <div className="rounded-md border border-border bg-accent/20 p-3 space-y-2">
          <h4 className="text-xs font-semibold text-foreground">规格明细</h4>
          {product.specDetails.map((spec, specIndex) => {
            const sErrors = pErrors?.specErrors[specIndex];
            return (
              <div key={specIndex} className="flex items-start gap-2">
                <div className="flex-1 min-w-0 space-y-1">
                  <Input
                    placeholder="规格型号 *"
                    value={spec.itemBrandModel}
                    onChange={(e) => updateSpec(productIndex, specIndex, 'itemBrandModel', e.target.value)}
                    className={`h-8 text-sm ${sErrors?.itemBrandModel ? 'border-destructive' : ''}`}
                  />
                  {sErrors?.itemBrandModel && (
                    <p className="text-[11px] text-destructive">{sErrors.itemBrandModel}</p>
                  )}
                </div>
                <div className="w-20 shrink-0 space-y-1">
                  <Input
                    placeholder="份数 *"
                    value={spec.itemQuantity}
                    onChange={(e) => updateSpec(productIndex, specIndex, 'itemQuantity', e.target.value)}
                    className={`h-8 text-sm ${sErrors?.itemQuantity ? 'border-destructive' : ''}`}
                  />
                  {sErrors?.itemQuantity && (
                    <p className="text-[11px] text-destructive">{sErrors.itemQuantity}</p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeSpec(productIndex, specIndex)}
                  disabled={product.specDetails.length <= 1}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => addSpec(productIndex)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-primary hover:bg-primary/5 rounded-md transition-colors"
          >
            <Plus className="size-3.5" />
            <span className="text-xs font-medium">添加规格</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-w-0">
      <Card className="flex flex-col flex-1 min-h-0">
        <CardHeader className="flex-shrink-0 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10">
                <FileText className="size-5 text-primary" />
              </div>
              <h2 className="text-base font-semibold text-foreground">表单填报</h2>
            </div>
            <button
              type="button"
              onClick={() => onInputModeChange('chat')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-card border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
            >
              <MessageSquare className="size-4 text-muted-foreground" />
              切换到对话填报
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
          <form onSubmit={handleFormSubmit} className="space-y-6">
            {/* L4 历史复用推荐 */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <History className="size-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">历史复用</span>
                <span className="text-xs text-muted-foreground">
                  输入物料，看你买过的、参考同事买过的同类，一键复用
                </span>
              </div>
              <Input
                placeholder="如：轴承、铝焊丝、螺丝…"
                value={recQuery}
                onChange={(e) => handleRecSearch(e.target.value)}
              />
              {recLoading && (
                <p className="text-xs text-muted-foreground mt-2">搜索中…</p>
              )}
              {!recLoading && recQuery.trim() && recItems.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  没有找到你买过的同类物料
                </p>
              )}
              {recItems.length > 0 && (
                <div className="mt-2 space-y-3">
                  {/* 本人买过：一键复用 */}
                  {recItems.some((it) => it.isOwn) && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">你买过</div>
                      {recItems
                        .filter((it) => it.isOwn)
                        .map((it) => (
                          <div
                            key={it.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {it.itemName}
                                {it.itemBrandModel ? ` · ${it.itemBrandModel}` : ''}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {it.platform} · {it.projectCode} · 买过 {it.purchaseCount} 次 ·{' '}
                                {new Date(it.lastPurchasedAt).toLocaleDateString('zh-CN')}
                              </div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="flex-shrink-0"
                              onClick={() => reuseRecommendation(it)}
                            >
                              复用
                            </Button>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* 同事买过：仅参考，先点链接确认，再以此为模板填入 */}
                  {recItems.some((it) => !it.isOwn) && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium text-muted-foreground">
                        同事买过 · 仅参考（型号可能不同，请先点链接确认）
                      </div>
                      {recItems
                        .filter((it) => !it.isOwn)
                        .map((it) => (
                          <div
                            key={it.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {it.itemName}
                                {it.itemBrandModel ? ` · ${it.itemBrandModel}` : ''}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {it.platform} · 买过 {it.purchaseCount} 次 ·{' '}
                                {new Date(it.lastPurchasedAt).toLocaleDateString('zh-CN')}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <UniversalLink
                                to={it.itemLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
                              >
                                查看商品
                              </UniversalLink>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => fillAsTemplate(it)}
                              >
                                以此填入
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 商品信息 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Package className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">商品信息</h3>
              </div>
              <div className="space-y-3 pl-0 md:pl-6">
                {products.map((product, i) => renderProductCard(product, i))}
                <button
                  type="button"
                  onClick={addProduct}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-primary/30 rounded-lg text-primary hover:bg-primary/5 hover:border-primary/50 transition-colors"
                >
                  <Plus className="size-4" />
                  <span className="text-sm font-medium">添加其他商品</span>
                </button>
              </div>
            </div>

            {/* 项目信息 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">项目信息</h3>
              </div>
              <div className="space-y-4 pl-0 md:pl-6">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    项目代号 <span className="text-destructive">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      placeholder="如 DT002"
                      value={sharedValues.projectCode}
                      onChange={(e) => {
                        handleSharedFieldChange('projectCode', e.target.value);
                        setShowHistory(false);
                        if (e.target.value.trim()) {
                          if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                          searchTimerRef.current = setTimeout(() => handleProjectSearch(e.target.value), 300);
                        } else {
                          setShowProjectSuggestions(false);
                          setProjectSuggestions([]);
                        }
                      }}
                      onFocus={() => {
                        if (!sharedValues.projectCode.trim()) {
                          fetchHistoryCodes();
                        }
                      }}
                      onBlur={() => setTimeout(() => setShowHistory(false), 200)}
                      className={getSharedError('projectCode') ? 'border-destructive' : ''}
                    />
                    {showHistory && !sharedValues.projectCode.trim() && historyCodes.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden">
                        <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground border-b border-border">
                          <History className="size-3" />
                          历史项目代号
                        </div>
                        <div className="max-h-40 overflow-y-auto">
                          {historyCodes.map((code) => (
                            <button
                              key={code}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSharedFieldChange('projectCode', code);
                                setShowHistory(false);
                              }}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {showProjectSuggestions && sharedValues.projectCode.trim() && (
                      <ProjectSuggestDropdown
                        suggestions={projectSuggestions}
                        loading={projectSearchLoading}
                        onSelect={(project) => {
                          handleSharedFieldChange('projectCode', project.projectCode);
                          setShowProjectSuggestions(false);
                          setProjectSuggestions([]);
                        }}
                        onClose={() => { setShowProjectSuggestions(false); setProjectSuggestions([]); }}
                      />
                    )}
                  </div>
                  {getSharedError('projectCode') && <p className="text-xs text-destructive">{getSharedError('projectCode')}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    额外说明
                  </label>
                  <Textarea
                    placeholder="如有需要，请补充额外说明"
                    value={sharedValues.projectPurpose}
                    onChange={(e) => handleSharedFieldChange('projectPurpose', e.target.value)}
                    className={`resize-none ${getSharedError('projectPurpose') ? 'border-destructive' : ''}`}
                    rows={3}
                  />
                  {getSharedError('projectPurpose') && <p className="text-xs text-destructive">{getSharedError('projectPurpose')}</p>}
                </div>
              </div>
            </div>

            {/* 物流信息 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Truck className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">物流信息</h3>
              </div>
              <div className="space-y-4 pl-0 md:pl-6">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    联系电话 <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="11位手机号码"
                    value={sharedValues.contactPhone}
                    onChange={(e) => handleSharedFieldChange('contactPhone', e.target.value)}
                    className={getSharedError('contactPhone') ? 'border-destructive' : ''}
                  />
                  {getSharedError('contactPhone') && <p className="text-xs text-destructive">{getSharedError('contactPhone')}</p>}
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    收货地址 <span className="text-destructive">*</span>
                  </label>
                  <Input
                    placeholder="详细收货地址"
                    value={sharedValues.deliveryAddress}
                    onChange={(e) => handleSharedFieldChange('deliveryAddress', e.target.value)}
                    className={getSharedError('deliveryAddress') ? 'border-destructive' : ''}
                  />
                  {getSharedError('deliveryAddress') && <p className="text-xs text-destructive">{getSharedError('deliveryAddress')}</p>}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-border">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                {submitting ? '提交中...' : '提交采购需求'}
              </Button>
              <Button type="button" variant="outline" onClick={onTransferToHuman} disabled={submitting}>
                <Headset className="size-4 mr-1" />
                转人工
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProcurementForm;
