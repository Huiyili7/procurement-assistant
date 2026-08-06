import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { logger } from '@lark-apaas/client-toolkit/logger';
import type {
  CreateProcurementRequirementRequest,
  CreateProcurementRequirementResponse,
  ValidateFieldRequest,
  ValidateFieldResponse,
  MyRequirementsQuery,
  MyRequirementsResponse,
  AssignedTasksQuery,
  AssignedTasksResponse,
  UpdateStatusRequest,
  UpdateStatusResponse,
  StatusLogsResponse,
  TransferToHumanRequest,
  TransferToHumanResponse,
  ProcurementRequirement,
  ProjectListResponse,
  InvoiceReminderResult,
  BatchCreateRequest,
  BatchCreateResponse,
  BatchValidateRequest,
  BatchValidateResponse,
  BatchCompleteResponse,
  RecommendationResponse,
  UpdateRequirementRequest,
  UpdateRequirementResponse,
} from '@shared/api.interface';

export async function validateField(data: ValidateFieldRequest): Promise<ValidateFieldResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/validate',
    method: 'POST',
    data,
  });
  return response.data;
}

export async function createRequirement(
  data: CreateProcurementRequirementRequest,
): Promise<CreateProcurementRequirementResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements',
    method: 'POST',
    data,
  });
  return response.data;
}

export async function getMyRequirements(
  params: MyRequirementsQuery,
): Promise<MyRequirementsResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/my',
    method: 'GET',
    params,
  });
  return response.data;
}

export async function getAssignedTasks(
  params: AssignedTasksQuery,
): Promise<AssignedTasksResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/assigned',
    method: 'GET',
    params,
  });
  return response.data;
}

export async function getRequirementDetail(id: string): Promise<ProcurementRequirement> {
  const response = await axiosForBackend({
    url: `/api/procurement-requirements/${id}`,
    method: 'GET',
  });
  return response.data;
}

export async function getStatusLogs(id: string): Promise<StatusLogsResponse> {
  const response = await axiosForBackend({
    url: `/api/procurement-requirements/${id}/status-logs`,
    method: 'GET',
  });
  return response.data;
}

export async function updateStatus(
  id: string,
  data: UpdateStatusRequest,
): Promise<UpdateStatusResponse> {
  const response = await axiosForBackend({
    url: `/api/procurement-requirements/${id}/status`,
    method: 'PATCH',
    data,
  });
  return response.data;
}

export async function transferToHuman(
  id: string,
  data: TransferToHumanRequest,
): Promise<TransferToHumanResponse> {
  const response = await axiosForBackend({
    url: `/api/procurement-requirements/${id}/transfer-to-human`,
    method: 'POST',
    data,
  });
  return response.data;
}

export async function getProjectList(keyword?: string): Promise<ProjectListResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/projects',
    method: 'GET',
    params: keyword ? { keyword } : undefined,
  });
  return response.data;
}

export async function getMyProjectCodes(): Promise<{ items: string[] }> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/my-project-codes',
    method: 'GET',
  });
  return response.data;
}

export async function getInvoiceReminder(estimatedPrice?: number): Promise<InvoiceReminderResult> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/invoice-reminder',
    method: 'GET',
    params: estimatedPrice !== undefined ? { estimatedPrice } : undefined,
  });
  return response.data;
}

export async function batchCreateRequirements(
  data: BatchCreateRequest,
): Promise<BatchCreateResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/batch',
    method: 'POST',
    data,
  });
  return response.data;
}

export async function batchValidate(
  data: BatchValidateRequest,
): Promise<BatchValidateResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/batch-validate',
    method: 'POST',
    data,
  });
  return response.data;
}

export async function batchCompleteSelected(ids: string[]): Promise<BatchCompleteResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/batch-complete',
    method: 'POST',
    data: { ids },
  });
  return response.data;
}

export async function getRecommendations(query: string): Promise<RecommendationResponse> {
  const response = await axiosForBackend({
    url: '/api/procurement-requirements/recommendations',
    method: 'GET',
    params: { query },
  });
  return response.data;
}

export async function trackRecEvent(event: 'shown' | 'reused'): Promise<void> {
  try {
    await axiosForBackend({
      url: '/api/procurement-requirements/recommendations/track',
      method: 'POST',
      data: { event },
    });
  } catch {
    // 埋点失败不影响主流程
  }
}

export async function updateRequirement(
  id: string,
  data: UpdateRequirementRequest,
): Promise<UpdateRequirementResponse> {
  const response = await axiosForBackend({
    url: `/api/procurement-requirements/${id}`,
    method: 'PATCH',
    data,
  });
  return response.data;
}
