/* 前后端共享的类型写在这里 */

export type ProcurementStatus =
  | '未开始'
  | '信息收集中'
  | '待采购'
  | '人工处理中'
  | '采购中'
  | '待收货'
  | '已完成'
  | '已取消';

export interface ProcurementRequirementItem {
  name: string;
  brandModel?: string;
  link: string;
  quantity: string;
  unit: string;
}

export interface ProcurementRequirementProject {
  code: string;
  name?: string;
  purpose?: string;
}

export interface ProcurementRequirementLogistics {
  inventoryChecked: boolean;
  inventoryChecker?: string;
  expectedDelivery?: string;
  deliveryAddress: string;
  contactPhone?: string;
  trackingNumber?: string;
}

export interface ProcurementRequirementFinancial {
  estimatedPrice?: number;
  invoiceRequired: boolean;
  invoiceType?: string;
  budgetCode?: string;
}

export interface ProcurementRequirement {
  id: string;
  requirementId: string;
  item: ProcurementRequirementItem;
  project: ProcurementRequirementProject;
  logistics: ProcurementRequirementLogistics;
  financial: ProcurementRequirementFinancial;
  status: ProcurementStatus;
  requester: string;
  assignee?: string;
  specialRequirements?: string;
  conversationHistory?: string;
  screenshotUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProcurementStatusLog {
  id: string;
  requirementId: string;
  operator: string;
  oldStatus: string;
  newStatus: string;
  remark?: string;
  extraInfo?: Record<string, unknown>;
  createdAt: string;
}

export interface CreateProcurementRequirementRequest {
  itemName: string;
  itemBrandModel?: string;
  itemLink: string;
  itemQuantity: string;
  itemUnit: string;
  projectCode: string;
  projectName?: string;
  projectPurpose?: string;
  inventoryChecked?: boolean;
  inventoryChecker?: string;
  expectedDelivery?: string;
  deliveryAddress?: string;
  contactPhone?: string;
  estimatedPrice?: number;
  invoiceRequired?: boolean;
  invoiceType?: string;
  budgetCode?: string;
  specialRequirements?: string;
  conversationHistory?: string;
  screenshotUrl?: string;
  status?: ProcurementStatus;
  assigneeId?: string;
  requesterName?: string;
  /** 提单耗时埋点：工程师进入提单页/开始对话的时间(ISO)。提单耗时 = 创建时间 − 此值 */
  draftStartedAt?: string;
}

export interface CreateProcurementRequirementResponse {
  id: string;
  requirementId: string;
  status: ProcurementStatus;
}

export interface ValidateFieldRequest {
  field: string;
  value: unknown;
}

export interface ValidateFieldResponse {
  valid: boolean;
  message?: string;
  severity?: 'error' | 'warning';
  suggestion?: string;
}

export interface BatchValidateRequest {
  fields: Record<string, unknown>;
}

export interface BatchValidateResponse {
  errors: { field: string; message: string; suggestion?: string }[];
  warnings: { field: string; message: string; suggestion?: string }[];
  valid: boolean;
}

export interface MyRequirementsQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  projectCode?: string;
  startTime?: string;
  endTime?: string;
}

export interface RequirementListItem {
  id: string;
  requirementId: string;
  itemName: string;
  status: ProcurementStatus;
  createdAt: string;
  projectCode: string;
}

export interface MyRequirementsResponse {
  items: RequirementListItem[];
  total: number;
}

export interface AssignedTasksQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  requesterId?: string;
  projectCode?: string;
}

export interface AssignedTaskListItem {
  id: string;
  requirementId: string;
  itemName: string;
  requester: string;
  status: ProcurementStatus;
  createdAt: string;
  projectCode: string;
  isOverdue: boolean;
}

export interface AssignedTasksResponse {
  items: AssignedTaskListItem[];
  total: number;
}

export interface UpdateStatusRequest {
  status: ProcurementStatus;
  remark?: string;
  extraInfo?: Record<string, unknown>;
}

export interface UpdateStatusResponse {
  success: boolean;
}

export interface StatusLogsResponse {
  items: ProcurementStatusLog[];
}

export interface TransferToHumanRequest {
  reason: string;
}

export interface TransferToHumanResponse {
  success: boolean;
}

export interface UpdateRequirementRequest {
  itemName?: string;
  itemBrandModel?: string;
  itemLink?: string;
  itemQuantity?: string;
  itemUnit?: string;
  projectCode?: string;
  projectPurpose?: string;
  contactPhone?: string;
  deliveryAddress?: string;
  expectedDelivery?: string;
  specialRequirements?: string;
}

export interface UpdateRequirementResponse {
  success: boolean;
  id: string;
  requirementId: string;
}

export interface ProjectInfoItem {
  projectCode: string;
  projectName?: string;
  department?: string;
}

export interface ProjectListResponse {
  items: ProjectInfoItem[];
}

export interface InvoiceReminderResult {
  shouldRemind: boolean;
  message?: string;
  invoiceRequired: boolean;
  invoiceType?: string;
}

export interface BatchCreateItemRequest {
  itemName: string;
  itemBrandModel?: string;
  itemLink: string;
  itemQuantity: string;
  itemUnit: string;
  specialRequirements?: string;
}

export interface BatchCreateRequest {
  items: BatchCreateItemRequest[];
  projectCode: string;
  projectName?: string;
  projectPurpose?: string;
  inventoryChecked?: boolean;
  inventoryChecker?: string;
  expectedDelivery?: string;
  deliveryAddress?: string;
  contactPhone?: string;
  invoiceRequired?: boolean;
  invoiceType?: string;
  budgetCode?: string;
  conversationHistory?: string;
  requesterName?: string;
  /** 提单耗时埋点：首次交互时刻(ISO) */
  draftStartedAt?: string;
}

export interface BatchCreateResponse {
  createdIds: string[];
  count: number;
}

export interface VisitorRecord {
  id: string;
  visitorName: string;
  visitorDepartment?: string;
  visitTime: string;
  /** 操作类型：browse 浏览 / query 查询 / submit_order 提单 */
  action?: string;
  /** 本次访问关联的项目代号（可空） */
  projectCode?: string;
}

export interface VisitorRecordListQuery {
  page?: number;
  pageSize?: number;
}

export interface VisitorRecordListResponse {
  items: VisitorRecord[];
  total: number;
  todayCount: number;
  visitorCount: number;
  todayVisitorCount: number;
}

export interface RecordVisitRequest {
  visitorName: string;
  visitorDepartment?: string;
  /** 操作类型：browse 浏览 / query 查询 / submit_order 提单 / heartbeat 心跳 */
  action?: string;
  /** 本次访问关联的项目代号（可空） */
  projectCode?: string;
}

/* ===================== 使用时长统计（对标领导访问统计面板） ===================== */

export interface UsageStatsQuery {
  startTime?: string;
  endTime?: string;
  /** 按申请人/访客 user_id 多选筛选（逗号分隔或重复参数） */
  userIds?: string[];
}

export interface UsageUserStat {
  userId: string;
  userName: string;
  /** 访问次数（30 分钟合并后的会话数） */
  sessions: number;
  /** 累计使用时长（分钟） */
  durationMinutes: number;
}

export interface UsageStatsResponse {
  /** 真实用户数（按 user_id 去重，无 id 老数据按姓名） */
  distinctUsers: number;
  /** 访问次数（30 分钟合并会话数，全部用户） */
  sessionCount: number;
  /** 累计使用时长（分钟，全部用户） */
  totalDurationMinutes: number;
  /** 人均单次时长（分钟）= 累计 / 会话数 */
  avgSessionMinutes: number;
  /** 今日会话数 */
  todaySessionCount: number;
  /** 命中的原始活动记录数 */
  totalRecords: number;
  /** 当前筛选下的会话数与时长（与全部相同则表示未筛选） */
  filteredSessionCount: number;
  filteredDurationMinutes: number;
  /** 按用户聚合（用于左侧"按姓名筛选"列表与下方明细） */
  perUser: UsageUserStat[];
}

export interface BatchCompleteResponse {
  success: boolean;
  updatedCount: number;
}

/* ===================== L4 历史复用推荐 ===================== */

export interface RecommendationItem {
  /** 代表性需求 id（用于复用预填） */
  id: string;
  itemName: string;
  itemBrandModel?: string;
  itemQuantity: string;
  itemLink: string;
  projectCode: string;
  platform?: string;
  /** 最近一次采购时间 */
  lastPurchasedAt: string;
  /** 历史采购次数（同物料+规格+链接合并计数） */
  purchaseCount: number;
  /** 是否本人买过（true=可一键复用；false=同事采购，仅参考、已脱敏） */
  isOwn: boolean;
}

export interface RecommendationResponse {
  items: RecommendationItem[];
}

/* ===================== 数据分析 (效能看板 v2) =====================
 * 设计原则：本系统的价值是「自助提单 + 一键处理」两个人在系统里的操作被提速，
 * 而非通用工单履约。指标按 采纳 / 速度 / 花费 / 结构 / 提效ROI 五块组织。
 * 数据双源：系统库(procurement_*) 提供上线后的提单/状态/速度；
 *           多维表格同步表(purchase_record) 提供金额 + 采购用时 + 上线前后对比。
 */

export interface AnalyticsQuery {
  /** 起始时间 (含)，ISO 字符串或 YYYY-MM-DD */
  startTime?: string;
  /** 结束时间 (不含)，ISO 字符串或 YYYY-MM-DD */
  endTime?: string;
}

/** 通用统计分布：中位数 / P90 / 均值 / 样本数。专业看板用分布而非单一均值。 */
export interface StatDist {
  p50: number | null;
  p90: number | null;
  mean: number | null;
  count: number;
}

export interface NamedCount {
  key: string;
  count: number;
}

/** 物料类别统计：频次 + 数量合计 (+可选金额) */
export interface CategoryStat {
  key: string;
  /** 订单条数（频次） */
  count: number;
  /** 采购份数/数量合计 */
  quantity: number;
  /** 金额合计（仅花费视图有值） */
  amount?: number;
}

/** 花费明细项 */
export interface SpendItem {
  key: string;
  amount: number;
  count: number;
  avgAmount: number;
}

export interface MonthlySpendPoint {
  period: string;
  amount: number;
  count: number;
}

/* ---------- A 大盘 / B 采纳 ---------- */
export interface AdoptionTrendPoint {
  period: string;
  count: number;
  activeUsers: number;
}

export interface AnalyticsAdoption {
  totalOrders: number;
  activeRequesters: number;
  avgOrdersPerRequester: number;
  /** 最近一个自然月的提单量（喂「月处理量」KPI） */
  latestMonthCount: number;
  /** 月处理量目标（PRD ≥100） */
  monthlyTarget: number;
  /** 工程师提单耗时中位（分钟，首次交互→提交）；无样本为 null */
  submitMedianMinutes: number | null;
  /** 月度趋势 */
  trend: AdoptionTrendPoint[];
  /** 周度趋势（周报用） */
  trendWeekly: AdoptionTrendPoint[];
  /** 申请人提单量 Top N */
  topRequesters: NamedCount[];
}

/** 价值自证 / 处理能力 的实时输入 */
export interface AnalyticsOps {
  /** 转人工率 = 曾转人工需求 / 总提单，0~1 */
  transferRate: number;
  /** 自助解决率 = 1 − 转人工率，0~1 */
  autonomyRate: number;
  /** 批量处理占比 = 批量完成 / 总完成，0~1 */
  batchRatio: number;
  /** 自动落库单数（= 系统提单量，采购员省去手工录入的单数） */
  autoLoggedCount: number;
}

/* ---------- C. 花费（来自多维表格同步表） ---------- */
export interface SpendBlock {
  /** 多维表格是否已同步并有数据 */
  available: boolean;
  syncedAt: string | null;
  totalAmount: number;
  orderCount: number;
  avgOrderAmount: number;
  /** 项目花费 Top N（金额） */
  byProject: SpendItem[];
  /** 物料家族花费（归一后，含金额+频次+数量） */
  byCategory: CategoryStat[];
  byPlatform: SpendItem[];
  monthly: MonthlySpendPoint[];
}

/* ---------- D. 结构（系统期单量分布） ---------- */
export interface CompositionBlock {
  byProject: NamedCount[];
  /** 物料家族（归一后）频次 + 数量 */
  byCategory: CategoryStat[];
  byPlatform: NamedCount[];
}

/** 提效基线参数（config_baseline，后台手填；当前看板未直接使用，保留接口） */
export interface BaselineConfig {
  deptHeadcount: number;
  manualCoordinationMinutes: number;
  laborCostPerHour: number;
  baselineSource: string;
  effectiveDate: string;
}

export interface AnalyticsResponse {
  meta: {
    rangeStart: string | null;
    rangeEnd: string | null;
  };
  adoption: AnalyticsAdoption;
  ops: AnalyticsOps;
  spend: SpendBlock;
  composition: CompositionBlock;
}

export interface SaveBaselineRequest {
  deptHeadcount: number;
  manualCoordinationMinutes: number;
  laborCostPerHour: number;
  baselineSource?: string;
  effectiveDate?: string;
}

export interface SaveBaselineResponse {
  success: boolean;
  message?: string;
}

/** 手动触发多维表格同步的结果 */
export interface SyncPurchasesResponse {
  success: boolean;
  synced: number;
  message?: string;
}

/** 导出用的扁平化需求明细行 */
export interface AnalyticsRecordRow {
  requirementId: string;
  itemName: string;
  itemBrandModel: string;
  itemQuantity: string;
  itemUnit: string;
  projectCode: string;
  projectName: string;
  platform: string;
  status: string;
  requesterName: string;
  estimatedPrice: number;
  createdAt: string;
  completedAt: string;
  leadTimeHours: number | null;
}

export interface AnalyticsRecordsResponse {
  items: AnalyticsRecordRow[];
}
