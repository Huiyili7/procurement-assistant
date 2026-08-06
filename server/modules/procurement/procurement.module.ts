import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { FeishuService } from './feishu.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PurchaseService } from './purchase.service';

@Module({
  imports: [HttpModule],
  controllers: [ProcurementController, AnalyticsController],
  providers: [ProcurementService, FeishuService, AnalyticsService, PurchaseService],
})
export class ProcurementModule {}
