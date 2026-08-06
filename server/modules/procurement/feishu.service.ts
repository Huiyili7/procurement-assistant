import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AuthNPaasService } from '@lark-apaas/fullstack-nestjs-core';

const FEISHU_APP_ID = 'cli_a97af2fb97399bb4';
const FEISHU_APP_SECRET = 'yvT1nKC85RGUo9E6c62JJeh6gBxKfeJ8';
const BASE_APP_TOKEN = 'AyQSb3pe2asBMes3QJYc1VyjnYc';
const TABLE_ID = 'tbl3DUuMgWI3r0v5';const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';

interface TokenResponse {
  code: number;
  msg: string;
  tenant_access_token: string;
  expire: number;
}

@Injectable()
export class FeishuService {
  private readonly logger = new Logger(FeishuService.name);
  private tenantAccessToken: string | null = null;
  private tokenExpireAt = 0;
  private userNameCache = new Map<string, { name: string; expireAt: number }>();
  private static readonly USER_NAME_CACHE_TTL = 30 * 60 * 1000;

  constructor(
    private readonly httpService: HttpService,
    @Inject(AuthNPaasService) private readonly authnService: AuthNPaasService,
  ) {}

  private async getTenantAccessToken(): Promise<string> {
    if (this.tenantAccessToken && Date.now() < this.tokenExpireAt) {
      return this.tenantAccessToken;
    }
    const res = await firstValueFrom(
      this.httpService.post<TokenResponse>(
        `${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`,
        {
          app_id: FEISHU_APP_ID,
          app_secret: FEISHU_APP_SECRET,
        },
        {
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    const data = res.data;
    if (data.code !== 0) {
      throw new Error(`获取token失败: ${data.msg}`);
    }
    this.tenantAccessToken = data.tenant_access_token;
    this.tokenExpireAt = Date.now() + (data.expire - 300) * 1000;
    this.logger.log(`飞书token获取成功, 过期时间: ${data.expire}s`);
    return this.tenantAccessToken;
  }

  async listBitableFields(): Promise<unknown[]> {
    const token = await this.getTenantAccessToken();
    const res = await firstValueFrom(
      this.httpService.get(
        `${FEISHU_BASE_URL}/bitable/v1/apps/${BASE_APP_TOKEN}/tables/${TABLE_ID}/fields`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { page_size: 100 },
        },
      ),
    );
    return res.data?.data?.items ?? [];
  }

  async getUserName(userId: string): Promise<string> {
    const cached = this.userNameCache.get(userId);
    if (cached && Date.now() < cached.expireAt) {
      return cached.name;
    }
    const results = await this.batchGetUserNames([userId]);
    return results.get(userId) || '';
  }

  async batchGetUserNames(sudaUserIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const id of sudaUserIds) {
      const cached = this.userNameCache.get(id);
      if (cached && Date.now() < cached.expireAt) {
        result.set(id, cached.name);
      }
    }
    return result;
  }

  /**
   * 分页拉取多维表格全部记录。返回 [{ recordId, fields }]。
   * record_id 作为同步去重主键（多维表格无 requirementId）。
   */
  async listBitableRecords(): Promise<
    { recordId: string; fields: Record<string, unknown> }[]
  > {
    const token = await this.getTenantAccessToken();
    const all: { recordId: string; fields: Record<string, unknown> }[] = [];
    let pageToken: string | undefined = undefined;
    let guard = 0;
    do {
      const params: Record<string, unknown> = { page_size: 500 };
      if (pageToken) params.page_token = pageToken;
      const res = await firstValueFrom(
        this.httpService.get(
          `${FEISHU_BASE_URL}/bitable/v1/apps/${BASE_APP_TOKEN}/tables/${TABLE_ID}/records`,
          { headers: { Authorization: `Bearer ${token}` }, params },
        ),
      );
      const data = res.data?.data;
      if (res.data?.code !== 0) {
        this.logger.error(`多维表格读取失败: code=${res.data?.code}, msg=${res.data?.msg}`);
        break;
      }
      for (const item of data?.items ?? []) {
        all.push({
          recordId: item.record_id,
          fields: (item.fields ?? {}) as Record<string, unknown>,
        });
      }
      pageToken = data?.has_more ? data?.page_token : undefined;
      guard += 1;
    } while (pageToken && guard < 50);
    this.logger.log(`多维表格读取完成，共 ${all.length} 条`);
    return all;
  }

  async addBitableRecord(fields: Record<string, unknown>): Promise<string | null> {
    try {
      const token = await this.getTenantAccessToken();
      const res = await firstValueFrom(
        this.httpService.post(
          `${FEISHU_BASE_URL}/bitable/v1/apps/${BASE_APP_TOKEN}/tables/${TABLE_ID}/records`,
          { fields },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      const code = res.data?.code;
      const recordId = res.data?.data?.record?.record_id ?? null;
      if (code !== 0) {
        this.logger.error(`多维表格写入失败: code=${code}, msg=${res.data?.msg}`);
        return null;
      }
      this.logger.log(`多维表格写入成功: record_id=${recordId}`);
      return recordId;
    } catch (err) {
      this.logger.error(`多维表格写入异常: ${JSON.stringify(err)}`);
      return null;
    }
  }
}
