import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { ProcurementService } from './procurement.service';
import type {
  ValidateFieldRequest,
  CreateProcurementRequirementRequest,
  MyRequirementsQuery,
  AssignedTasksQuery,
  UpdateStatusRequest,
  TransferToHumanRequest,
  BatchCreateRequest,
  BatchValidateRequest,
  UpdateRequirementRequest,
} from '@shared/api.interface';

@Controller('api/procurement-requirements')
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  @Post('validate')
  @NeedLogin()
  async validateField(@Body() req: ValidateFieldRequest) {
    return this.procurementService.validateField(req);
  }

  @Post('batch-validate')
  @NeedLogin()
  async batchValidate(@Body() req: BatchValidateRequest) {
    return this.procurementService.batchValidate(req.fields);
  }

  @Get('projects')
  @NeedLogin()
  async getProjectList(@Query('keyword') keyword?: string) {
    return this.procurementService.getProjectList(keyword);
  }

  @Get('invoice-reminder')
  @NeedLogin()
  async getInvoiceReminder(@Query('estimatedPrice') estimatedPrice?: string) {
    const price = estimatedPrice ? parseFloat(estimatedPrice) : undefined;
    return this.procurementService.calculateInvoiceReminder(price);
  }

  @Post('batch')
  @NeedLogin()
  async batchCreate(
    @Req() req: Request & { userContext: { userId: string; userName: string } },
    @Body() body: BatchCreateRequest,
  ) {
    return this.procurementService.batchCreateRequirements(body, req.userContext.userId, req.userContext.userName, (req.headers as unknown as Record<string, string>).origin || '');
  }

  @Post()
  @NeedLogin()
  async createRequirement(
    @Req() req: Request & { userContext: { userId: string; userName: string } },
    @Body() body: CreateProcurementRequirementRequest,
  ) {
    return this.procurementService.createRequirement(body, req.userContext.userId, req.userContext.userName, (req.headers as unknown as Record<string, string>).origin || '');
  }

  @Get('my')
  @NeedLogin()
  async getMyRequirements(
    @Req() req: Request & { userContext: { userId: string } },
    @Query() query: MyRequirementsQuery,
  ) {
    return this.procurementService.getMyRequirements(req.userContext.userId, {
      ...query,
      page: query.page ? parseInt(query.page as unknown as string, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize as unknown as string, 10) : undefined,
    });
  }

  @Get('assigned')
  @NeedLogin()
  @CanRole(['task_manager'])
  async getAssignedTasks(
    @Req() req: Request & { userContext: { userId: string } },
    @Query() query: AssignedTasksQuery,
  ) {
    return this.procurementService.getAssignedTasks({
      ...query,
      page: query.page ? parseInt(query.page as unknown as string, 10) : undefined,
      pageSize: query.pageSize ? parseInt(query.pageSize as unknown as string, 10) : undefined,
    });
  }

  @Get('my-project-codes')
  @NeedLogin()
  async getMyProjectCodes(@Req() req: Request & { userContext: { userId: string } }) {
    return this.procurementService.getMyProjectCodes(req.userContext.userId);
  }

  @Get('recommendations')
  @NeedLogin()
  async getRecommendations(
    @Req() req: Request & { userContext: { userId: string } },
    @Query('query') query?: string,
  ) {
    return this.procurementService.getRecommendations(req.userContext.userId, query || '');
  }

  @Post('recommendations/track')
  @NeedLogin()
  async trackRecommendation(
    @Req() req: Request & { userContext: { userId: string } },
    @Body() body: { event?: string },
  ) {
    return this.procurementService.trackRecEvent(req.userContext.userId, body.event || 'shown');
  }

  @Get(':id/status-logs')
  @NeedLogin()
  async getStatusLogs(@Param('id') id: string) {
    return this.procurementService.getStatusLogs(id);
  }

  @Get(':id')
  @NeedLogin()
  async getRequirementDetail(@Param('id') id: string) {
    return this.procurementService.getRequirementDetail(id);
  }

  @Post('batch-complete')
  @NeedLogin()
  @CanRole(['task_manager'])
  async batchCompleteSelected(
    @Body() body: { ids: string[] },
    @Req() req: Request & { userContext: { userId: string; userName: string } },
  ) {
    return this.procurementService.batchCompleteSelected(body.ids, req.userContext.userId, req.userContext.userName, (req.headers as unknown as Record<string, string>).origin || '');
  }

  @Patch(':id/status')
  @NeedLogin()
  @CanRole(['task_manager'])
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateStatusRequest,
    @Req() req: Request & { userContext: { userId: string; userName: string } },
  ) {
    return this.procurementService.updateStatus(id, body, req.userContext.userId, req.userContext.userName, (req.headers as unknown as Record<string, string>).origin || '');
  }

  @Post(':id/transfer-to-human')
  @NeedLogin()
  @CanRole(['task_manager'])
  async transferToHuman(
    @Param('id') id: string,
    @Body() body: TransferToHumanRequest,
    @Req() req: Request & { userContext: { userId: string; userName: string } },
  ) {
    return this.procurementService.transferToHuman(id, body, req.userContext.userId, req.userContext.userName);
  }

  @Post(':id/resend-notice')
  @NeedLogin()
  @CanRole(['task_manager'])
  async resendNotice(
    @Param('id') id: string,
    @Req() req: Request & { userContext: { userId: string; userName: string } },
  ) {
    return this.procurementService.resendFeishuNotice(id, req.userContext.userId, (req.headers as unknown as Record<string, string>).origin || '');
  }

  @Patch(':id')
  @NeedLogin()
  async updateRequirement(
    @Param('id') id: string,
    @Body() body: UpdateRequirementRequest,
    @Req() req: Request & { userContext: { userId: string } },
  ) {
    return this.procurementService.updateRequirement(id, req.userContext.userId, body);
  }
}
