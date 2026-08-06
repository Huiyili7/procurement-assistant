import { Controller, Get, Post, Body, Query, Req } from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { VisitorRecordService } from './visitor-record.service';
import type {
  RecordVisitRequest,
  VisitorRecordListQuery,
  UsageStatsQuery,
} from '@shared/api.interface';

@Controller('api/visitor-records')
export class VisitorRecordController {
  constructor(private readonly visitorRecordService: VisitorRecordService) {}

  @Post()
  @NeedLogin()
  async recordVisit(
    @Req() req: Request & { userContext: { userId: string; userName: string } },
    @Body() body: RecordVisitRequest,
  ) {
    return this.visitorRecordService.recordVisit(body, req.userContext.userId);
  }

  @Get()
  @NeedLogin()
  @CanRole(['admin'])
  async getList(@Query() query: VisitorRecordListQuery) {
    const page = query.page ? parseInt(String(query.page), 10) : 1;
    const pageSize = query.pageSize ? parseInt(String(query.pageSize), 10) : 20;
    return this.visitorRecordService.getList(page, pageSize);
  }

  @Get('usage')
  @NeedLogin()
  @CanRole(['admin'])
  async getUsage(@Query() query: UsageStatsQuery & { userIds?: string | string[] }) {
    const userIds = query.userIds
      ? (Array.isArray(query.userIds) ? query.userIds : String(query.userIds).split(','))
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    return this.visitorRecordService.getUsageStats({
      startTime: query.startTime,
      endTime: query.endTime,
      userIds,
    });
  }
}
