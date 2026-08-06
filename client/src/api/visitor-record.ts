import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  RecordVisitRequest,
  VisitorRecordListQuery,
  VisitorRecordListResponse,
  UsageStatsQuery,
  UsageStatsResponse,
} from '@shared/api.interface';

export async function recordVisit(req: RecordVisitRequest) {
  try {
    const response = await axiosForBackend({
      url: '/api/visitor-records',
      method: 'POST',
      data: req,
    });
    return response.data;
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status;
    if (status === 401 || status === 403) {
      logger.warn('记录访客跳过: 登录态未就绪');
    } else {
      logger.warn('记录访客失败:', e);
    }
  }
}

export async function getVisitorList(
  params: VisitorRecordListQuery,
): Promise<VisitorRecordListResponse> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));

  const response = await axiosForBackend({
    url: `/api/visitor-records?${query.toString()}`,
    method: 'GET',
  });
  if (response.status === 403) throw new Error('无操作权限，请联系管理员分配角色');
  return response.data;
}

export async function getUsageStats(
  params: UsageStatsQuery,
): Promise<UsageStatsResponse> {
  const query = new URLSearchParams();
  if (params.startTime) query.set('startTime', params.startTime);
  if (params.endTime) query.set('endTime', params.endTime);
  if (params.userIds && params.userIds.length) {
    query.set('userIds', params.userIds.join(','));
  }
  const response = await axiosForBackend({
    url: `/api/visitor-records/usage?${query.toString()}`,
    method: 'GET',
  });
  if (response.status === 403) throw new Error('无操作权限，请联系管理员分配角色');
  return response.data;
}
