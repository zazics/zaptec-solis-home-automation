import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HomeAutomationService } from './home-automation.service';
import { HomeAutomationController } from './home-automation.controller';
import { SolisModule } from '../solis/solis.module';
import { ZaptecModule } from '../zaptec/zaptec.module';
import { LoggingService } from '../common/logging.service';
import { TapoModule } from '../tapo/tapo.module';
import { DailyAggregationService } from '../common/services/daily-aggregation.service';
import { DailyAggregation, DailyAggregationSchema } from '../common/schemas/daily-aggregation.schema';
import { HourlyAggregationService } from '../common/services/hourly-aggregation.service';
import { HourlyAggregation, HourlyAggregationSchema } from '../common/schemas/hourly-aggregation.schema';

@Module({
  imports: [
    SolisModule, 
    ZaptecModule, 
    TapoModule,
    MongooseModule.forFeature([
      { name: DailyAggregation.name, schema: DailyAggregationSchema },
      { name: HourlyAggregation.name, schema: HourlyAggregationSchema }
    ])
  ],
  providers: [HomeAutomationService, LoggingService, DailyAggregationService, HourlyAggregationService],
  controllers: [HomeAutomationController],
  exports: [HomeAutomationService, DailyAggregationService, HourlyAggregationService]
})
export class HomeAutomationModule {}
