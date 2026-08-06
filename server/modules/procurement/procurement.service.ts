import { Injectable, Inject, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, CapabilityService, AuthNPaasService } from '@lark-apaas/fullstack-nestjs-core';
import type { PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq, and, like, gt, lt, count, asc, desc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  procurementRequirement,
  procurementStatusLog,
  projectInfo,
} from '@server/database/schema';
import type {
  CreateProcurementRequirementRequest,
  CreateProcurementRequirementResponse,
  ValidateFieldRequest,
  ValidateFieldResponse,
  BatchValidateResponse,
  MyRequirementsQuery,
  MyRequirementsResponse,
  AssignedTasksQuery,
  AssignedTasksResponse,
  ProcurementRequirement,
  ProcurementStatus,
  UpdateStatusRequest,
  UpdateStatusResponse,
  StatusLogsResponse,
  TransferToHumanRequest,
  TransferToHumanResponse,
  UpdateRequirementRequest,
  UpdateRequirementResponse,
  RequirementListItem,
  AssignedTaskListItem,
  ProjectInfoItem,
  ProjectListResponse,
  InvoiceReminderResult,
  BatchCreateRequest,
  BatchCreateItemRequest,
  BatchCreateResponse,
  BatchCompleteResponse,
} from '@shared/api.interface';
import type { SendProcurementDemandFeishuNoticeOneInput } from '@shared/plugin-types';
import type { SendProcurementTransferManualNoticeOneInput } from '@shared/plugin-types';
import type { ProcurementFeishuGroupCreateOneInput } from '@shared/plugin-types';
import { FeishuService } from './feishu.service';

const FEISHU_NOTICE_PLUGIN_ID = 'send_procurement_demand_feishu_notice_1';
const FEISHU_GROUP_CREATE_PLUGIN_ID = 'procurement_feishu_group_create_1';
const TRANSFER_MANUAL_NOTICE_PLUGIN_ID = 'send_procurement_transfer_manual_notice_1';
const DEFAULT_ASSIGNEE = '0000000000000000';
const HUMAN_HANDLER_ID = '0000000000000000';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  '未开始': ['待采购', '已完成', '已取消'],
  '信息收集中': ['待采购', '已完成', '已取消'],
  '待采购': ['已完成', '已取消'],
  '采购中': ['待采购', '已完成', '已取消'],
  '待收货': ['待采购', '已完成', '已取消'],
  '人工处理中': ['待采购', '已完成', '已取消'],
  '已完成': ['待采购', '已取消'],
  '已取消': ['待采购', '已完成'],
};

@Injectable()
export class ProcurementService {
  private readonly logger = new Logger(ProcurementService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE)
    private readonly db: PostgresJsDatabase,
    @Inject(CapabilityService)
    private readonly capabilityService: CapabilityService,
    @Inject(AuthNPaasService)
    private readonly authnService: AuthNPaasService,
    private readonly feishuService: FeishuService,
    private readonly httpService: HttpService,
  ) {}

  async validateField(
    req: ValidateFieldRequest,
  ): Promise<ValidateFieldResponse> {
    const { field, value } = req;

    switch (field) {
      case 'itemLink': {
        const link = String(value);
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(link);
        } catch {
          return { valid: false, message: '请输入有效的URL链接', severity: 'error' };
        }
        const allowedDomains = ['taobao.com', 'jd.com', 'tmall.com', '1688.com', 'tb.cn', 'e.tb.cn', 'm.tb.cn', 'u.jd.com'];
        const hostname = parsedUrl.hostname.replace(/^www\./, '');
        const matchedDomain = allowedDomains.find(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
        );
        if (!matchedDomain) {
          return { valid: false, message: '仅支持淘宝、京东、天猫、1688平台的商品链接', severity: 'error' };
        }
        const shortLinkDomains = ['tb.cn', 'e.tb.cn', 'm.tb.cn', 'u.jd.com'];
        const isShortLink = shortLinkDomains.some(
          (d) => hostname === d || hostname.endsWith(`.${d}`),
        );
        if (!isShortLink) {
          const pathname = parsedUrl.pathname;
          const searchParams = parsedUrl.searchParams;
          if (matchedDomain === 'jd.com') {
            const jdItemPattern = /^\/\d{6,}(\.html)?$/;
            if (!jdItemPattern.test(pathname)) {
              return { valid: false, message: '请输入有效的京东商品链接，如 https://item.jd.com/12345678.html', severity: 'error' };
            }
          } else if (matchedDomain === 'taobao.com') {
            if (!pathname.includes('item.htm') || !searchParams.get('id')) {
              return { valid: false, message: '请输入有效的淘宝商品链接，如 https://item.taobao.com/item.htm?id=123456', severity: 'error' };
            }
          } else if (matchedDomain === 'tmall.com') {
            if (!pathname.includes('item.htm') || !searchParams.get('id')) {
              return { valid: false, message: '请输入有效的天猫商品链接，如 https://detail.tmall.com/item.htm?id=123456', severity: 'error' };
            }
          } else if (matchedDomain === '1688.com') {
            if (!pathname.includes('/offer/')) {
              return { valid: false, message: '请输入有效的1688商品链接，如 https://detail.1688.com/offer/123456.html', severity: 'error' };
            }
          }
        }
        return { valid: true };
      }

      case 'projectCode': {
        const code = String(value).trim();
        if (!code) {
          return { valid: false, message: '项目代号不能为空', severity: 'error' };
        }
        if (code.length < 2) {
          return { valid: false, message: '项目代号至少2个字符', severity: 'error' };
        }
        const formalPattern = /^P\d{4}-[A-Z]+-\d{3}$/;
        if (formalPattern.test(code)) {
          const result = await this.db.select({ projectCode: projectInfo.projectCode })
            .from(projectInfo)
            .where(eq(projectInfo.projectCode, code))
            .limit(1);
          if (result.length === 0) {
            return { valid: false, message: '项目代号不存在，请确认后重新输入', severity: 'error' };
          }
        }
        return { valid: true };
      }

      case 'itemQuantity': {
        const qtyStr = String(value).trim();
        if (!qtyStr) {
          return { valid: false, message: '采购份数不能为空', severity: 'error' };
        }
        const qtyPattern = /^\d+(\/\d+)*$/;
        if (!qtyPattern.test(qtyStr)) {
          return { valid: false, message: '没看懂份数～直接发数字就行，比如 5；多个规格用 / 分隔，如 20/30', severity: 'error' };
        }
        const parts = qtyStr.split('/');
        const hasInvalid = parts.some((p: string) => {
          const n = parseInt(p, 10);
          return isNaN(n) || n < 1 || n > 10000;
        });
        if (hasInvalid) {
          return { valid: false, message: '每项采购份数应为1-10000之间的正整数', severity: 'error' };
        }
        return { valid: true };
      }

      case 'itemName': {
        const name = String(value).trim();
        if (!name) {
          return { valid: false, message: '物料名称不能为空', severity: 'error' };
        }
        if (name.length < 2 || name.length > 100) {
          return { valid: false, message: '物料名称长度应在2-100字之间', severity: 'error' };
        }
        return { valid: true };
      }

      case 'projectPurpose': {
        const purpose = String(value).trim();
        if (!purpose) {
          return { valid: true };
        }
        if (purpose.length > 200) {
          return { valid: false, message: '额外说明不能超过200字', severity: 'error' };
        }
        const SENSITIVE_WORDS = ['炸弹', '枪支', '毒品', '赌博', '武器', '弹药', '管制刀具'];
        const hasSensitive = SENSITIVE_WORDS.some((word) => purpose.includes(word));
        if (hasSensitive) {
          return { valid: false, message: '额外说明包含不允许的内容，请修改', severity: 'error' };
        }
        return { valid: true };
      }

      case 'itemBrandModel': {
        const brandModel = String(value);
        if (brandModel.length > 200) {
          return { valid: false, message: '规格型号描述过长，请简化', severity: 'error' };
        }
        return { valid: true };
      }

      case 'expectedDelivery': {
        const deliveryStr = String(value);
        const parsed = this.parseDate(deliveryStr);
        if (!parsed) {
          return { valid: false, message: '无法识别到货时间，请使用如"5月20号"或"2026-05-20"的格式', severity: 'warning' };
        }
        return { valid: true };
      }

      case 'deliveryAddress': {
        const addr = String(value).trim();
        if (!addr) {
          return { valid: false, message: '收货地址不能为空', severity: 'error' };
        }
        if (addr.length < 2) {
          return { valid: false, message: '收货地址至少2个字符', severity: 'error' };
        }
        return { valid: true };
      }

      case 'contactPhone': {
        const phone = String(value).trim();
        if (!phone) {
          return { valid: false, message: '联系电话不能为空', severity: 'error' };
        }
        const phonePattern = /^1[3-9]\d{9}$/;
        if (!phonePattern.test(phone)) {
          return { valid: false, message: '请输入有效的11位手机号码', severity: 'error' };
        }
        return { valid: true };
      }

      default:
        return { valid: true };
    }
  }

  async batchValidate(fields: Record<string, unknown>): Promise<BatchValidateResponse> {
    const errors: { field: string; message: string; suggestion?: string }[] = [];
    const warnings: { field: string; message: string; suggestion?: string }[] = [];

    const requiredFields = [
      { key: 'itemName', label: '物料名称' },
      { key: 'itemLink', label: '商品链接' },
      { key: 'itemQuantity', label: '采购份数' },
      { key: 'projectCode', label: '项目代号' },
    ];
    for (const rf of requiredFields) {
      const val = fields[rf.key];
      if (val === undefined || val === null || val === '') {
        errors.push({ field: rf.key, message: `还缺少${rf.label}，请提供` });
      }
    }

    const fieldsToValidate = ['itemName', 'itemLink', 'itemQuantity', 'projectCode', 'expectedDelivery', 'itemBrandModel'];
    for (const fieldKey of fieldsToValidate) {
      if (fields[fieldKey] !== undefined && fields[fieldKey] !== null && fields[fieldKey] !== '') {
        const result = await this.validateField({ field: fieldKey, value: fields[fieldKey] });
        if (!result.valid) {
          if (result.severity === 'warning') {
            warnings.push({ field: fieldKey, message: result.message!, suggestion: result.suggestion });
          } else {
            errors.push({ field: fieldKey, message: result.message!, suggestion: result.suggestion });
          }
        }
      }
    }

    return { errors, warnings, valid: errors.length === 0 };
  }

  private async generateRequirementId(): Promise<string> {
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const id = await this.buildRequirementId(attempt);
      const exists = await this.db
        .select({ count: count() })
        .from(procurementRequirement)
        .where(eq(procurementRequirement.requirementId, id));
      if (Number(exists[0].count) === 0) return id;
      this.logger.warn(`requirementId ${id} collision, retry ${attempt + 1}`);
    }
    const fallback = await this.buildRequirementId(MAX_RETRIES);
    return `${fallback}-${Date.now() % 1000}`;
  }

  private async buildRequirementId(offset: number = 0): Promise<string> {
    const dateResult = await this.db.execute(sql`
      SELECT to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD') as date_str,
             (now() AT TIME ZONE 'Asia/Shanghai')::date as start_of_day,
             ((now() AT TIME ZONE 'Asia/Shanghai')::date + interval '1 day') as end_of_day
    `);
    const row = dateResult[0] as Record<string, unknown>;
    const dateStr: string = String(row.date_str);
    const startOfDay: Date = new Date(String(row.start_of_day));
    const endOfDay: Date = new Date(String(row.end_of_day));

    const maxResult = await this.db
      .select({ maxId: sql<string>`MAX(${procurementRequirement.requirementId})` })
      .from(procurementRequirement)
      .where(
        and(
          gt(procurementRequirement.createdAt, startOfDay),
          lt(procurementRequirement.createdAt, endOfDay),
        ),
      );

    const maxId: string | null = maxResult[0].maxId;
    let baseSeq = 0;
    if (maxId) {
      const match = maxId.match(/REQ\d{8}(\d+)/);
      if (match) baseSeq = parseInt(match[1], 10);
    }
    const seq = String(baseSeq + offset + 1).padStart(3, '0');
    return `REQ${dateStr}${seq}`;
  }

  private parseDate(dateStr: string | undefined): Date | undefined {
    if (!dateStr) return undefined;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    const m = dateStr.match(/(\d{1,2})月(\d{1,2})/);
    if (m) {
      const now = new Date();
      const year = now.getMonth() + 1 >= parseInt(m[1], 10) ? now.getFullYear() : now.getFullYear() + 1;
      const parsed = new Date(year, parseInt(m[1], 10) - 1, parseInt(m[2], 10));
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return undefined;
  }

  async createRequirement(
    req: CreateProcurementRequirementRequest,
    userId: string,
    userName: string = '',
    appOrigin: string = '',
  ): Promise<CreateProcurementRequirementResponse> {
    let resolvedName: string = req.requesterName || userName;
    if (!resolvedName) {
      const fetched: string = await this.feishuService.getUserName(userId);
      if (fetched) resolvedName = fetched;
    }

    const requirementId = await this.generateRequirementId();

    const [inserted] = await this.db
      .insert(procurementRequirement)
      .values({
        requirementId,
        itemName: req.itemName,
        itemBrandModel: req.itemBrandModel,
        itemLink: req.itemLink,
        itemQuantity: req.itemQuantity,
        itemUnit: req.itemUnit,
        projectCode: req.projectCode,
        projectName: req.projectName,
        projectPurpose: req.projectPurpose,
        inventoryChecked: req.inventoryChecked,
        inventoryChecker: req.inventoryChecked ? (req.inventoryChecker || userId) : undefined,
        expectedDelivery: this.parseDate(req.expectedDelivery),
        deliveryAddress: req.deliveryAddress,
        contactPhone: req.contactPhone,
        estimatedPrice: req.estimatedPrice,
        invoiceRequired: req.invoiceRequired,
        invoiceType: req.invoiceType,
        budgetCode: req.budgetCode,
        status: req.status || '待采购',
        requester: userId,
        assignee: req.assigneeId || DEFAULT_ASSIGNEE,
        specialRequirements: req.specialRequirements,
        conversationHistory: req.conversationHistory,
        screenshotUrl: req.screenshotUrl,
      })
      .returning();

    await this.db.insert(procurementStatusLog).values({
      requirementId: inserted.id,
      operator: userId,
      oldStatus: '未开始',
      newStatus: '待采购',
    });

    // 提单耗时埋点（best-effort）：列未在妙搭创建时静默跳过，绝不阻断提单
    if (req.draftStartedAt) {
      const draft = new Date(req.draftStartedAt);
      if (!isNaN(draft.getTime())) {
        try {
          await this.db.execute(
            sql`UPDATE procurement_requirement SET draft_started_at = ${draft.toISOString()} WHERE id = ${inserted.id}`,
          );
        } catch (err) {
          this.logger.warn(`写入 draft_started_at 失败(忽略): ${JSON.stringify(err)}`);
        }
      }
    }

    const platform: string = this.extractPlatformFromLink(req.itemLink);

    try {
      await this.sendFeishuNoticeWithRetry({
        detail_url: `${appOrigin}/my-requirements`,
        receiver_users: [req.assigneeId || DEFAULT_ASSIGNEE],
        demand_no: requirementId,
        material_info: `${req.itemName}${req.itemBrandModel ? ` (${req.itemBrandModel})` : ''} × ${req.itemQuantity}${req.itemUnit}`,
        project_info: `${req.projectCode}${req.projectName ? ` (${req.projectName})` : ''}`,
        operator: resolvedName || '系统',
        operate_type: '新建',
        item_link: req.itemLink,
        requester: resolvedName || userId,
        contact_phone: req.contactPhone || '-',
        delivery_address: req.deliveryAddress || '-',
        request_time: new Date().toLocaleString('zh-CN', { hour12: false }),
        screenshot_url: this.resolveScreenshotUrl(req.screenshotUrl, appOrigin),
      });
    } catch (err: unknown) {
      this.logger.error(`飞书通知发送失败: ${JSON.stringify(err)}`);
    }

    try {
      await this.syncToBitableWithRetry(
        { requirementId, itemName: req.itemName, itemBrandModel: req.itemBrandModel || null, itemLink: req.itemLink, itemQuantity: req.itemQuantity, itemUnit: req.itemUnit, projectCode: req.projectCode, projectName: req.projectName || null, projectPurpose: req.projectPurpose, inventoryChecked: req.inventoryChecked, estimatedPrice: req.estimatedPrice || null, deliveryAddress: req.deliveryAddress || null, contactPhone: req.contactPhone || null, expectedDelivery: req.expectedDelivery || null, requesterName: resolvedName || userId, status: req.status || '待采购' },
        platform,
      );
    } catch (err: unknown) {
      this.logger.error(`多维表格同步失败: ${JSON.stringify(err)}`);
    }

    return {
      id: inserted.id,
      requirementId: inserted.requirementId,
      status: inserted.status as CreateProcurementRequirementResponse['status'],
    };
  }

  async getMyRequirements(
    userId: string,
    query: MyRequirementsQuery,
  ): Promise<MyRequirementsResponse> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 10;

    const conditions = [eq(procurementRequirement.requester, userId)];
    if (query.status) {
      conditions.push(eq(procurementRequirement.status, query.status));
    }
    if (query.projectCode) {
      conditions.push(
        like(procurementRequirement.projectCode, `%${query.projectCode}%`),
      );
    }
    if (query.startTime) {
      conditions.push(
        gt(procurementRequirement.createdAt, new Date(query.startTime)),
      );
    }
    if (query.endTime) {
      conditions.push(
        lt(procurementRequirement.createdAt, new Date(query.endTime)),
      );
    }

    const whereClause = and(...conditions);

    const itemsResult = await this.db
      .select({
        id: procurementRequirement.id,
        requirementId: procurementRequirement.requirementId,
        itemName: procurementRequirement.itemName,
        status: procurementRequirement.status,
        createdAt: procurementRequirement.createdAt,
        projectCode: procurementRequirement.projectCode,
      })
      .from(procurementRequirement)
      .where(whereClause)
      .orderBy(desc(procurementRequirement.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items: RequirementListItem[] = itemsResult.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      status: item.status as ProcurementStatus,
    }));

    const totalResult = await this.db
      .select({ count: count() })
      .from(procurementRequirement)
      .where(whereClause);

    return {
      items,
      total: Number(totalResult[0].count),
    };
  }

  async getAssignedTasks(
    query: AssignedTasksQuery,
  ): Promise<AssignedTasksResponse> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 10;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const conditions = [];
    if (query.status) {
      conditions.push(eq(procurementRequirement.status, query.status));
    }
    if (query.requesterId) {
      conditions.push(
        eq(procurementRequirement.requester, query.requesterId),
      );
    }
    if (query.projectCode) {
      conditions.push(
        like(procurementRequirement.projectCode, `%${query.projectCode}%`),
      );
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const threeDaysAgoISO = threeDaysAgo.toISOString();

    const itemsResult = await this.db
      .select({
        id: procurementRequirement.id,
        requirementId: procurementRequirement.requirementId,
        itemName: procurementRequirement.itemName,
        requester: procurementRequirement.requester,
        status: procurementRequirement.status,
        createdAt: procurementRequirement.createdAt,
        projectCode: procurementRequirement.projectCode,
        isOverdue: sql<boolean>`CASE WHEN ${procurementRequirement.status} NOT IN ('已完成', '已取消') AND ${procurementRequirement.createdAt} < ${threeDaysAgoISO} THEN true ELSE false END`,
      })
      .from(procurementRequirement)
      .where(whereClause)
      .orderBy(desc(procurementRequirement.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const items: AssignedTaskListItem[] = itemsResult.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      isOverdue: Boolean(item.isOverdue),
      status: item.status as ProcurementStatus,
    }));

    const totalResult = await this.db
      .select({ count: count() })
      .from(procurementRequirement)
      .where(whereClause);

    return {
      items,
      total: Number(totalResult[0].count),
    };
  }

  async getRequirementDetail(
    id: string,
  ): Promise<ProcurementRequirement> {
    const [record] = await this.db
      .select()
      .from(procurementRequirement)
      .where(eq(procurementRequirement.id, id));

    if (!record) {
      throw new Error('采购需求不存在');
    }

    return {
      id: record.id,
      requirementId: record.requirementId,
      item: {
        name: record.itemName,
        brandModel: record.itemBrandModel || undefined,
        link: record.itemLink,
        quantity: record.itemQuantity,
        unit: record.itemUnit,
      },
      project: {
        code: record.projectCode,
        name: record.projectName || undefined,
        purpose: record.projectPurpose || undefined,
      },
      logistics: {
        inventoryChecked: record.inventoryChecked,
        inventoryChecker: record.inventoryChecker || undefined,
        expectedDelivery: record.expectedDelivery
          ? record.expectedDelivery.toISOString()
          : undefined,
        deliveryAddress: record.deliveryAddress || '',
        contactPhone: record.contactPhone || undefined,
        trackingNumber: undefined,
      },
      financial: {
        estimatedPrice: record.estimatedPrice || undefined,
        invoiceRequired: record.invoiceRequired,
        invoiceType: record.invoiceType || undefined,
        budgetCode: record.budgetCode || undefined,
      },
      status: record.status as ProcurementRequirement['status'],
      requester: record.requester,
      assignee: record.assignee || undefined,
      specialRequirements: record.specialRequirements || undefined,
      conversationHistory: record.conversationHistory || undefined,
      screenshotUrl: record.screenshotUrl || undefined,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async updateRequirement(
    id: string,
    userId: string,
    data: UpdateRequirementRequest,
  ): Promise<UpdateRequirementResponse> {
    // 检查需求是否存在且属于当前用户
    const [existing] = await this.db
      .select()
      .from(procurementRequirement)
      .where(eq(procurementRequirement.id, id));

    if (!existing) {
      throw new Error('采购需求不存在');
    }

    if ((existing.createdBy as unknown as string) !== userId) {
      throw new Error('无权修改此采购需求');
    }

    // 只允许修改待采购状态的需求
    if (existing.status !== '待采购') {
      throw new Error('只能修改待采购状态的需求');
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {};
    if (data.itemName !== undefined) updateData.itemName = data.itemName;
    if (data.itemBrandModel !== undefined) updateData.itemBrandModel = data.itemBrandModel;
    if (data.itemLink !== undefined) updateData.itemLink = data.itemLink;
    if (data.itemQuantity !== undefined) updateData.itemQuantity = data.itemQuantity;
    if (data.itemUnit !== undefined) updateData.itemUnit = data.itemUnit;
    if (data.projectCode !== undefined) updateData.projectCode = data.projectCode;
    if (data.projectPurpose !== undefined) updateData.projectPurpose = data.projectPurpose;
    if (data.contactPhone !== undefined) updateData.contactPhone = data.contactPhone;
    if (data.deliveryAddress !== undefined) updateData.deliveryAddress = data.deliveryAddress;
    if (data.expectedDelivery !== undefined) {
      const parsed = this.parseDate(data.expectedDelivery);
      updateData.expectedDelivery = parsed;
    }
    if (data.specialRequirements !== undefined) updateData.specialRequirements = data.specialRequirements;

    if (Object.keys(updateData).length === 0) {
      return { success: true, id: existing.id, requirementId: existing.requirementId };
    }

    await this.db
      .update(procurementRequirement)
      .set(updateData)
      .where(eq(procurementRequirement.id, id));

    return { success: true, id: existing.id, requirementId: existing.requirementId };
  }

  async getStatusLogs(
    requirementId: string,
  ): Promise<StatusLogsResponse> {
    const logs = await this.db
      .select()
      .from(procurementStatusLog)
      .where(eq(procurementStatusLog.requirementId, requirementId))
      .orderBy(asc(procurementStatusLog.createdAt));

    return {
      items: logs.map((log) => ({
        id: log.id,
        requirementId: log.requirementId,
        operator: log.operator,
        oldStatus: log.oldStatus || '',
        newStatus: log.newStatus,
        remark: log.remark || undefined,
        extraInfo: (log.extraInfo as Record<string, unknown>) || undefined,
        createdAt: log.createdAt.toISOString(),
      })),
    };
  }

  async updateStatus(
    id: string,
    req: UpdateStatusRequest,
    userId: string,
    userName: string = '',
    appOrigin: string = '',
  ): Promise<UpdateStatusResponse> {
    const [record] = await this.db
      .select()
      .from(procurementRequirement)
      .where(eq(procurementRequirement.id, id));

    if (!record) {
      throw new Error('采购需求不存在');
    }

    const oldStatus = record.status;

    const allowed = ALLOWED_TRANSITIONS[oldStatus];
    if (!allowed || !allowed.includes(req.status)) {
      throw new Error(`状态不允许从 "${oldStatus}" 变更为 "${req.status}"，允许的目标状态: ${allowed?.join('、') || '无'}`);
    }

    let resolvedName: string = userName;
    if (!resolvedName) {
      const fetched: string = await this.feishuService.getUserName(userId);
      if (fetched) resolvedName = fetched;
    }

    await this.db
      .update(procurementRequirement)
      .set({
        status: req.status,
      })
      .where(eq(procurementRequirement.id, id));

    await this.db.insert(procurementStatusLog).values({
      requirementId: id,
      operator: userId,
      oldStatus,
      newStatus: req.status,
      remark: req.remark,
      extraInfo: req.extraInfo,
    });

    setImmediate(() => {
      this.sendFeishuNoticeWithRetry({
        detail_url: `${appOrigin}/my-requirements`,
        receiver_users: [record.requester],
        demand_no: record.requirementId,
        material_info: `${record.itemName}${record.itemBrandModel ? ` (${record.itemBrandModel})` : ''} × ${record.itemQuantity}${record.itemUnit}`,
        project_info: `${record.projectCode}${record.projectName ? ` (${record.projectName})` : ''}`,
        operator: resolvedName || '系统',
        operate_type: `状态变更: ${oldStatus} -> ${req.status}`,
        item_link: record.itemLink,
        requester: resolvedName || userId,
        contact_phone: record.contactPhone || '-',
        delivery_address: record.deliveryAddress || '-',
        request_time: new Date().toLocaleString('zh-CN', { hour12: false }),
        screenshot_url: this.resolveScreenshotUrl(record.screenshotUrl, appOrigin),
      }).catch((err: unknown) => this.logger.error(`异步飞书通知失败: ${JSON.stringify(err)}`));
    });

    return { success: true };
  }

  async transferToHuman(
    id: string,
    req: TransferToHumanRequest,
    userId: string,
    userName: string = '',
  ): Promise<TransferToHumanResponse> {
    const [record] = await this.db
      .select()
      .from(procurementRequirement)
      .where(eq(procurementRequirement.id, id));

    if (!record) {
      throw new Error('采购需求不存在');
    }

    const oldStatus = record.status;

    if (oldStatus === '人工处理中') {
      return { success: true };
    }

    const allowed = ALLOWED_TRANSITIONS[oldStatus];
    if (!allowed || !allowed.includes('人工处理中')) {
      throw new Error(`状态不允许从 "${oldStatus}" 转人工处理，允许转人工的状态: 待采购`);
    }

    await this.db
      .update(procurementRequirement)
      .set({
        status: '人工处理中',
        assignee: HUMAN_HANDLER_ID,
      })
      .where(eq(procurementRequirement.id, id));

    await this.db.insert(procurementStatusLog).values({
      requirementId: id,
      operator: userId,
      oldStatus,
      newStatus: '人工处理中',
      remark: req.reason,
    });

    setImmediate(() => {
      this.sendTransferManualNoticeWithRetry(record, req.reason, userName)
        .catch((err: unknown) => this.logger.error(`异步转人工通知失败: ${JSON.stringify(err)}`));

      const platform: string = this.extractPlatformFromLink(record.itemLink);
      this.syncToBitableWithRetry(
        { requirementId: record.requirementId, itemName: record.itemName, itemBrandModel: record.itemBrandModel, itemLink: record.itemLink, itemQuantity: record.itemQuantity, itemUnit: record.itemUnit, projectCode: record.projectCode, projectName: record.projectName, projectPurpose: record.projectPurpose, inventoryChecked: record.inventoryChecked, estimatedPrice: record.estimatedPrice, deliveryAddress: record.deliveryAddress, contactPhone: null, expectedDelivery: null, requesterName: String(record.requester), status: '人工处理中' },
        platform,
      ).catch((err: unknown) => this.logger.error(`异步多维表格同步失败: ${JSON.stringify(err)}`));
    });

    return { success: true };
  }

  async createFeishuGroup(
    record: { requirementId: string; itemName: string; requester: string },
    reason: string,
  ): Promise<string | null> {
    try {
      const larkIds = await this.authnService.getBatchLarkUserIds([record.requester, HUMAN_HANDLER_ID]);
      const requesterLarkId = larkIds[0];
      const handlerLarkId = larkIds[1];
      if (!requesterLarkId || !handlerLarkId) {
        this.logger.error('创建飞书群组失败: 无法获取飞书用户ID');
        return null;
      }
      const input: ProcurementFeishuGroupCreateOneInput = {
        group_name: `采购需求-${record.requirementId}沟通群`,
        requester_id: requesterLarkId,
        handler_id: handlerLarkId,
        welcome_message: `采购需求 ${record.requirementId} 已转人工处理，原因：${reason}。物料：${record.itemName}。请在此群沟通处理。`,
        group_description: `采购需求 ${record.requirementId} 的沟通群，物料：${record.itemName}`,
      };
      const plugin = await this.capabilityService.load(FEISHU_GROUP_CREATE_PLUGIN_ID);
      const result: { groupID?: string } = await plugin.call(
        'createGroup',
        input as unknown as Record<string, unknown>,
      );
      return result?.groupID || null;
    } catch (err) {
      this.logger.error(`创建飞书群组失败: ${JSON.stringify(err)}`);
      return null;
    }
  }

  async sendTransferManualNotice(
    record: { requirementId: string; itemName: string; itemQuantity: string; itemUnit: string; projectCode: string; projectName: string | null; requester: string; conversationHistory: string | null },
    reason: string,
    requesterName: string = '',
  ): Promise<boolean> {
    try {
      const input = {
        procurement_no: record.requirementId,
        procurement_material: `${record.itemName} × ${record.itemQuantity}${record.itemUnit}`,
        procurement_project: `${record.projectCode}${record.projectName ? ` - ${record.projectName}` : ''}`,
        submiter_id: record.requester,
        conversation_history: record.conversationHistory || '无对话记录',
        transfer_reason: reason,
      };
      const plugin = await this.capabilityService.load(TRANSFER_MANUAL_NOTICE_PLUGIN_ID);
      const result: { success?: boolean } = await plugin.call(
        'send_feishu_message',
        input as unknown as Record<string, unknown>,
      );
      return Boolean(result?.success);
    } catch (err) {
      this.logger.error(`发送转人工经办人通知失败: ${JSON.stringify(err)}`);
      return false;
    }
  }

  private async sendFeishuNoticeWithRetry(
    input: SendProcurementDemandFeishuNoticeOneInput,
    retries: number = 1,
  ): Promise<boolean> {
    try {
      return await this.sendFeishuNotice(input);
    } catch (err) {
      if (retries > 0) {
        this.logger.warn(`飞书通知发送失败，${3}s后重试: ${JSON.stringify(err)}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));
        return this.sendFeishuNoticeWithRetry(input, retries - 1);
      }
      this.logger.error(`飞书通知重试仍失败: ${JSON.stringify(err)}`);
      return false;
    }
  }

  private async syncToBitableWithRetry(
    record: {
      requirementId: string; itemName: string; itemBrandModel: string | null; itemLink: string; itemQuantity: string; itemUnit: string; projectCode: string; projectName: string | null; projectPurpose?: string | null; inventoryChecked: boolean; estimatedPrice: number | null; deliveryAddress: string | null; contactPhone: string | null; expectedDelivery: string | null; requesterName: string; status: string;
    },
    platform: string,
    retries: number = 1,
  ): Promise<boolean> {
    try {
      return await this.syncToBitable(record, platform);
    } catch (err) {
      if (retries > 0) {
        this.logger.warn(`多维表格同步失败，${3}s后重试: ${JSON.stringify(err)}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));
        return this.syncToBitableWithRetry(record, platform, retries - 1);
      }
      this.logger.error(`多维表格同步重试仍失败: ${JSON.stringify(err)}`);
      return false;
    }
  }

  private async sendTransferManualNoticeWithRetry(
    record: { requirementId: string; itemName: string; itemQuantity: string; itemUnit: string; projectCode: string; projectName: string | null; requester: string; conversationHistory: string | null },
    reason: string,
    requesterName: string = '',
    retries: number = 1,
  ): Promise<boolean> {
    try {
      return await this.sendTransferManualNotice(record, reason, requesterName);
    } catch (err) {
      if (retries > 0) {
        this.logger.warn(`转人工通知发送失败，${3}s后重试: ${JSON.stringify(err)}`);
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));
        return this.sendTransferManualNoticeWithRetry(record, reason, requesterName, retries - 1);
      }
      this.logger.error(`转人工通知重试仍失败: ${JSON.stringify(err)}`);
      return false;
    }
  }

  async sendFeishuNotice(
    input: SendProcurementDemandFeishuNoticeOneInput,
  ): Promise<boolean> {
    try {
      const plugin = await this.capabilityService.load(
        FEISHU_NOTICE_PLUGIN_ID,
      );
      const result: { success?: boolean } = await plugin.call(
        'send_feishu_message',
        input as unknown as Record<string, unknown>,
      );
      return Boolean(result?.success);
    } catch (err) {
      this.logger.error(`飞书通知发送失败: ${JSON.stringify(err)}`);
      return false;
    }
  }

  private resolveScreenshotUrl(url: string | null | undefined, appOrigin: string): string {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    try {
      const origin = new URL(appOrigin).origin;
      return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
    } catch {
      return url;
    }
  }

  private extractPlatformFromLink(link: string): string {
    try {
      const hostname = new URL(link).hostname.replace(/^www\./, '');
      const platforms: Record<string, string> = {
        'taobao.com': '淘宝',
        'tmall.com': '淘宝',
        'tb.cn': '淘宝',
        'jd.com': '京东',
        'u.jd.com': '京东',
        '1688.com': '1688',
      };
      for (const [domain, name] of Object.entries(platforms)) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return name;
        }
      }
      return '其他';
    } catch {
      return '未知';
    }
  }

  async getProjectList(keyword?: string): Promise<ProjectListResponse> {
    const conditions = [];
    if (keyword) {
      conditions.push(
        sql`(${projectInfo.projectCode} ILIKE ${`%${keyword}%`} OR ${projectInfo.projectName} ILIKE ${`%${keyword}%`})`,
      );
    }
    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    const query = this.db
      .select({
        projectCode: projectInfo.projectCode,
        projectName: projectInfo.projectName,
        department: projectInfo.department,
      })
      .from(projectInfo)
      .limit(50);

    const results = whereClause
      ? await query.where(whereClause)
      : await query;

    return {
      items: results.map((r: { projectCode: string; projectName: string | null; department: string | null }) => ({
        projectCode: r.projectCode,
        projectName: r.projectName || undefined,
        department: r.department || undefined,
      })),
    };
  }

  /**
   * L4 历史复用推荐：按物料关键词匹配本人历史采购，合并去重后按"频次+近期"排序。
   * 纯 SQL，无外部依赖；后续可在此基础上加 LLM 精排。
   */
  async getRecommendations(
    userId: string,
    rawQuery: string,
  ): Promise<{ items: import('@shared/api.interface').RecommendationItem[] }> {
    const q = (rawQuery || '').trim();
    if (!q) return { items: [] };
    const likeExpr = `%${q}%`;

    // 全公司范围匹配（跨工程师复用）；行按时间倒序，首条即最近
    const rows = await this.db
      .select({
        id: procurementRequirement.id,
        itemName: procurementRequirement.itemName,
        itemBrandModel: procurementRequirement.itemBrandModel,
        itemQuantity: procurementRequirement.itemQuantity,
        itemLink: procurementRequirement.itemLink,
        projectCode: procurementRequirement.projectCode,
        requester: procurementRequirement.requester,
        createdAt: procurementRequirement.createdAt,
      })
      .from(procurementRequirement)
      .where(
        and(
          sql`(${procurementRequirement.itemName} ILIKE ${likeExpr} OR ${procurementRequirement.itemBrandModel} ILIKE ${likeExpr})`,
          sql`${procurementRequirement.itemName} NOT IN ('待人工补充', '')`,
        ),
      )
      .orderBy(desc(procurementRequirement.createdAt))
      .limit(100);

    // 合并去重；记录"本人最近一条(ownRep)"用于一键复用与脱敏判定
    type Row = (typeof rows)[number];
    const merged = new Map<string, { rep: Row; ownRep?: Row; count: number }>();
    for (const row of rows) {
      const key = `${row.itemName}|${row.itemBrandModel || ''}|${row.itemLink}`;
      const isMine = row.requester === userId;
      const existing = merged.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.ownRep && isMine) existing.ownRep = row;
      } else {
        merged.set(key, { rep: row, ownRep: isMine ? row : undefined, count: 1 });
      }
    }

    const items = [...merged.values()]
      .map(({ rep, ownRep, count }) => {
        const isOwn = !!ownRep;
        const chosen = ownRep || rep;
        return {
          id: chosen.id,
          itemName: chosen.itemName,
          itemBrandModel: chosen.itemBrandModel || undefined,
          itemQuantity: chosen.itemQuantity,
          itemLink: chosen.itemLink,
          // 脱敏：仅本人项展示项目代号；同事项不暴露其项目
          projectCode: isOwn ? chosen.projectCode : '',
          platform: this.extractPlatformFromLink(chosen.itemLink),
          lastPurchasedAt: chosen.createdAt.toISOString(),
          purchaseCount: count,
          isOwn,
        };
      })
      .sort(
        (a, b) =>
          Number(b.isOwn) - Number(a.isOwn) ||
          b.purchaseCount - a.purchaseCount ||
          (a.lastPurchasedAt < b.lastPurchasedAt ? 1 : -1),
      )
      .slice(0, 12);

    return { items };
  }

  /** ① 采纳率埋点：记录推荐被展示/被复用。复用 visitor_record(action) 持久化，妙搭零改动；失败忽略。 */
  async trackRecEvent(userId: string, event: string): Promise<{ success: boolean }> {
    const action = event === 'reused' ? 'rec_reused' : 'rec_shown';
    try {
      await this.db.execute(sql`
        INSERT INTO visitor_record (visitor_name, action, visitor_user_id)
        VALUES (${userId}, ${action}, ${userId})
      `);
    } catch (err) {
      this.logger.warn(`推荐埋点写入失败(忽略): ${JSON.stringify(err)}`);
    }
    return { success: true };
  }

  async getMyProjectCodes(userId: string): Promise<{ items: string[] }> {
    const results = await this.db
      .selectDistinct({ projectCode: procurementRequirement.projectCode })
      .from(procurementRequirement)
      .where(and(
        eq(procurementRequirement.requester, userId),
        sql`${procurementRequirement.projectCode} NOT IN ('', '待补充')`,
      ))
      .orderBy(sql`${procurementRequirement.projectCode} DESC`)
      .limit(50);
    return { items: results.map((r: { projectCode: string }) => r.projectCode) };
  }

  calculateInvoiceReminder(estimatedPrice?: number): InvoiceReminderResult {
    if (estimatedPrice === undefined || estimatedPrice === null || estimatedPrice <= 0) {
      return { shouldRemind: false, invoiceRequired: false };
    }
    if (estimatedPrice >= 200) {
      return {
        shouldRemind: true,
        message: `预估金额 ¥${estimatedPrice} ≥ ¥200，按公司规定需开具发票。已自动勾选需要发票。`,
        invoiceRequired: true,
        invoiceType: '普票',
      };
    }
    return {
      shouldRemind: false,
      invoiceRequired: false,
    };
  }

  async batchCreateRequirements(
    req: BatchCreateRequest,
    userId: string,
    userName: string = '',
    appOrigin: string = '',
  ): Promise<BatchCreateResponse> {
    const conversationText = req.conversationHistory || '';

    let resolvedName: string = req.requesterName || userName;
    if (!resolvedName) {
      const fetched: string = await this.feishuService.getUserName(userId);
      if (fetched) resolvedName = fetched;
    }

    this.logger.log(`开始批量创建需求, userName=${userName}, resolvedName=${resolvedName}`);

    const dateResult = await this.db.execute(sql`
      SELECT to_char(now() AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD') as date_str,
             (now() AT TIME ZONE 'Asia/Shanghai')::date as start_of_day,
             ((now() AT TIME ZONE 'Asia/Shanghai')::date + interval '1 day') as end_of_day
    `);
    const dateRow = dateResult[0] as Record<string, unknown>;
    const dateStr: string = String(dateRow.date_str);
    const startOfDay: Date = new Date(String(dateRow.start_of_day));
    const endOfDay: Date = new Date(String(dateRow.end_of_day));

    const maxResult = await this.db
      .select({ maxId: sql<string>`MAX(${procurementRequirement.requirementId})` })
      .from(procurementRequirement)
      .where(
        and(
          gt(procurementRequirement.createdAt, startOfDay),
          lt(procurementRequirement.createdAt, endOfDay),
        ),
      );
    const maxId: string | null = maxResult[0].maxId;
    let baseSeq = 0;
    if (maxId) {
      const match = maxId.match(/REQ\d{8}(\d+)/);
      if (match) baseSeq = parseInt(match[1], 10);
    }

    const requirementIds: string[] = req.items.map((_item, idx: number) => {
      const seq = String(baseSeq + idx + 1).padStart(3, '0');
      return `REQ${dateStr}${seq}`;
    });

    const insertedIds: string[] = [];
    for (let i = 0; i < req.items.length; i++) {
      const item = req.items[i];
      const [inserted] = await this.db
        .insert(procurementRequirement)
        .values({
          requirementId: requirementIds[i],
          itemName: item.itemName,
          itemBrandModel: item.itemBrandModel,
          itemLink: item.itemLink,
          itemQuantity: item.itemQuantity,
          itemUnit: item.itemUnit,
          projectCode: req.projectCode,
          projectName: req.projectName,
          projectPurpose: req.projectPurpose,
          inventoryChecked: req.inventoryChecked,
          inventoryChecker: req.inventoryChecked ? (req.inventoryChecker || userId) : undefined,
          expectedDelivery: req.expectedDelivery
            ? new Date(req.expectedDelivery)
            : undefined,
          deliveryAddress: req.deliveryAddress || undefined,
          contactPhone: req.contactPhone || undefined,
          invoiceRequired: req.invoiceRequired,
          invoiceType: req.invoiceType,
          budgetCode: req.budgetCode,
          status: '待采购',
          requester: userId,
          assignee: DEFAULT_ASSIGNEE,
          specialRequirements: item.specialRequirements,
          conversationHistory: conversationText,
        })
        .returning();

      await this.db.insert(procurementStatusLog).values({
        requirementId: inserted.id,
        operator: userId,
        oldStatus: '未开始',
        newStatus: '待采购',
      });

      insertedIds.push(inserted.id);
    }

    for (let i = 0; i < req.items.length; i++) {
      const item = req.items[i];
      try {
        await this.sendFeishuNoticeWithRetry({
          detail_url: `${appOrigin}/my-requirements`,
          receiver_users: [DEFAULT_ASSIGNEE],
          demand_no: requirementIds[i],
          material_info: `${item.itemName}${item.itemBrandModel ? ` (${item.itemBrandModel})` : ''} × ${item.itemQuantity}${item.itemUnit}`,
          project_info: `${req.projectCode}${req.projectName ? ` (${req.projectName})` : ''}`,
          operator: resolvedName || '系统',
          operate_type: '批量新建',
          item_link: item.itemLink,
          requester: resolvedName || userId,
          contact_phone: req.contactPhone || '-',
          delivery_address: req.deliveryAddress || '-',
          request_time: new Date().toLocaleString('zh-CN', { hour12: false }),
        });
      } catch (err: unknown) {
        this.logger.error(`批量创建飞书通知失败[${requirementIds[i]}]: ${JSON.stringify(err)}`);
      }

      const platform: string = this.extractPlatformFromLink(item.itemLink);
      try {
        await this.syncToBitableWithRetry(
          { requirementId: requirementIds[i], itemName: item.itemName, itemBrandModel: item.itemBrandModel || null, itemLink: item.itemLink, itemQuantity: item.itemQuantity, itemUnit: item.itemUnit, projectCode: req.projectCode, projectName: req.projectName || null, projectPurpose: req.projectPurpose, inventoryChecked: req.inventoryChecked, estimatedPrice: null, deliveryAddress: req.deliveryAddress || null, contactPhone: req.contactPhone || null, expectedDelivery: req.expectedDelivery || null, requesterName: resolvedName || userId, status: '待采购' },
          platform,
        );
      } catch (err: unknown) {
        this.logger.error(`批量创建多维表格同步失败[${requirementIds[i]}]: ${JSON.stringify(err)}`);
      }
    }

    // 提单耗时埋点（best-effort）：列未创建时静默跳过，绝不阻断批量提单
    if (req.draftStartedAt && insertedIds.length > 0) {
      const draft = new Date(req.draftStartedAt);
      if (!isNaN(draft.getTime())) {
        try {
          await this.db.execute(
            sql`UPDATE procurement_requirement SET draft_started_at = ${draft.toISOString()} WHERE id = ANY(${sql.raw(`ARRAY[${insertedIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})`,
          );
        } catch (err) {
          this.logger.warn(`批量写入 draft_started_at 失败(忽略): ${JSON.stringify(err)}`);
        }
      }
    }

    return { createdIds: insertedIds, count: insertedIds.length };
  }

  async syncToBitable(
    record: {
      requirementId: string; itemName: string; itemBrandModel: string | null; itemLink: string; itemQuantity: string; itemUnit: string; projectCode: string; projectName: string | null; projectPurpose?: string | null; inventoryChecked: boolean; estimatedPrice: number | null; deliveryAddress: string | null; contactPhone: string | null; expectedDelivery: string | null; requesterName: string; status: string;
    },
    platform: string,
  ): Promise<boolean> {
    try {
      let requesterName: string = record.requesterName;
      if (/^\d+$/.test(requesterName)) {
        const resolvedName: string = await this.feishuService.getUserName(requesterName);
        if (resolvedName) {
          requesterName = resolvedName;
        }
      }

      const fields: Record<string, unknown> = {
        '日期': Date.now(),
        '申请人': requesterName,
        '购买内容': record.itemBrandModel || '',
        '价格': record.estimatedPrice || 0,
        '物料种类': record.itemName,
        '归属项目': record.projectCode,
        '购物平台': platform,
      };
      const recordId = await this.feishuService.addBitableRecord(fields);
      if (recordId) {
        this.logger.log(`多维表格同步成功: requirementId=${record.requirementId}, recordId=${recordId}`);
        return true;
      }
      return false;
    } catch (err) {
      this.logger.error(`多维表格同步失败: ${JSON.stringify(err)}`);
      return false;
    }
  }

  async batchCompleteSelected(
    ids: string[],
    userId: string,
    userName: string = '',
    appOrigin: string = '',
  ): Promise<BatchCompleteResponse> {
    if (ids.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    const selectedRecords = await this.db
      .select()
      .from(procurementRequirement)
      .where(
        sql`${procurementRequirement.id} = ANY(${sql.raw(`ARRAY[${ids.map((id: string) => `'${id}'`).join(',')}]::uuid[]`)})`,
      );

    const pendingRecords = selectedRecords.filter(
      (record: typeof procurementRequirement.$inferSelect) => record.status === '待采购',
    );

    if (pendingRecords.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    let resolvedName: string = userName;
    if (!resolvedName) {
      const fetched: string = await this.feishuService.getUserName(userId);
      if (fetched) resolvedName = fetched;
    }

    const pendingIds: string[] = pendingRecords.map((r: typeof procurementRequirement.$inferSelect) => r.id);
    await this.db
      .update(procurementRequirement)
      .set({ status: '已完成' })
      .where(
        and(
          eq(procurementRequirement.status, '待采购'),
          sql`${procurementRequirement.id} = ANY(${sql.raw(`ARRAY[${pendingIds.map((id: string) => `'${id}'`).join(',')}]::uuid[]`)})`,
        ),
      );

    const logValues = pendingRecords.map((record: typeof procurementRequirement.$inferSelect) => ({
      requirementId: record.id,
      operator: userId,
      oldStatus: '待采购',
      newStatus: '已完成',
      remark: '批量标记已完成',
    }));
    await this.db.insert(procurementStatusLog).values(logValues);

    setImmediate(() => {
      for (const record of pendingRecords) {
        this.sendFeishuNoticeWithRetry({
          detail_url: `${appOrigin}/my-requirements`,
          receiver_users: [record.requester],
          demand_no: record.requirementId,
          material_info: `${record.itemName}${record.itemBrandModel ? ` (${record.itemBrandModel})` : ''} × ${record.itemQuantity}${record.itemUnit}`,
          project_info: `${record.projectCode}${record.projectName ? ` (${record.projectName})` : ''}`,
          operator: resolvedName || '系统',
          operate_type: '状态变更: 待采购 -> 已完成',
          item_link: record.itemLink,
          requester: resolvedName || userId,
          contact_phone: record.contactPhone || '-',
          delivery_address: record.deliveryAddress || '-',
          request_time: new Date().toLocaleString('zh-CN', { hour12: false }),
          screenshot_url: this.resolveScreenshotUrl(record.screenshotUrl, appOrigin),
        }).catch((err: unknown) => this.logger.error(`异步飞书通知失败: ${JSON.stringify(err)}`));
      }
    });

    return { success: true, updatedCount: pendingRecords.length };
  }

  async resendFeishuNotice(id: string, userId: string, appOrigin: string = ''): Promise<{ success: boolean; message: string }> {
    const [record] = await this.db
      .select()
      .from(procurementRequirement)
      .where(eq(procurementRequirement.id, id))
      .limit(1);

    if (!record) {
      return { success: false, message: '采购需求不存在' };
    }

    let resolvedName: string = '';
    try {
      resolvedName = await this.feishuService.getUserName((record.requester as unknown as string));
    } catch {
      resolvedName = (record.requester as unknown as string);
    }

    const assigneeId: string = (record.assignee as unknown as string) || DEFAULT_ASSIGNEE;

    try {
      await this.sendFeishuNoticeWithRetry({
        detail_url: `${appOrigin}/my-requirements`,
        receiver_users: [assigneeId],
        demand_no: record.requirementId,
        material_info: `${record.itemName}${record.itemBrandModel ? ` (${record.itemBrandModel})` : ''} × ${record.itemQuantity}${record.itemUnit}`,
        project_info: `${record.projectCode}${record.projectName ? ` (${record.projectName})` : ''}`,
        operator: resolvedName || '系统',
        operate_type: '补发通知',
        item_link: record.itemLink,
        requester: resolvedName || (record.requester as unknown as string),
        contact_phone: record.contactPhone || '-',
        delivery_address: record.deliveryAddress || '-',
        request_time: new Date().toLocaleString('zh-CN', { hour12: false }),
        screenshot_url: this.resolveScreenshotUrl(record.screenshotUrl, appOrigin),
      });
      return { success: true, message: `通知已补发: ${record.requirementId}` };
    } catch (err: unknown) {
      this.logger.error(`补发飞书通知失败: ${JSON.stringify(err)}`);
      return { success: false, message: '补发通知失败' };
    }
  }
}
