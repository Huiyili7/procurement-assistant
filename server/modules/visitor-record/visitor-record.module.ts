import { Module } from '@nestjs/common';
import { VisitorRecordController } from './visitor-record.controller';
import { VisitorRecordService } from './visitor-record.service';

@Module({
  controllers: [VisitorRecordController],
  providers: [VisitorRecordService],
})
export class VisitorRecordModule {}
