import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  AnalyticsQuery,
  AnalyticsResponse,
  AnalyticsRecordsResponse,
  SaveBaselineRequest,
  SaveBaselineResponse,
  SyncPurchasesResponse,
} from '@shared/api.interface';

export async function getAnalytics(
  params: AnalyticsQuery,
): Promise<AnalyticsResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-analytics',
    method: 'GET',
    params,
  });
  return response.data;
}

export async function getAnalyticsRecords(
  params: AnalyticsQuery,
): Promise<AnalyticsRecordsResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-analytics/records',
    method: 'GET',
    params,
  });
  return response.data;
}

export async function saveBaseline(
  data: SaveBaselineRequest,
): Promise<SaveBaselineResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-analytics/baseline',
    method: 'POST',
    data,
  });
  return response.data;
}

export async function syncPurchases(): Promise<SyncPurchasesResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-analytics/sync-purchases',
    method: 'POST',
  });
  return response.data;
}
