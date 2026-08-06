import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { AnalyticsService } from './analytics.service';
import type { AnalyticsQuery, SaveBaselineRequest } from '@shared/api.interface';

@Controller('api/procurement-analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  @NeedLogin()
  @CanRole(['admin'])
  async getAnalytics(@Query() query: AnalyticsQuery) {
    return this.analyticsService.getAnalytics(query);
  }

  @Get('records')
  @NeedLogin()
  @CanRole(['admin'])
  async getRecords(@Query() query: AnalyticsQuery) {
    return this.analyticsService.getRecords(query);
  }

  @Post('baseline')
  @NeedLogin()
  @CanRole(['admin'])
  async saveBaseline(@Body() body: SaveBaselineRequest) {
    return this.analyticsService.saveBaseline(body);
  }

  /** 手动触发多维表格 → purchase_record 全量同步 */
  @Post('sync-purchases')
  @NeedLogin()
  @CanRole(['admin'])
  async syncPurchases() {
    return this.analyticsService.syncPurchases();
  }
}
