import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChartService } from './chart.service';
import { SolisModule } from '../solis/solis.module';
import { ZaptecModule } from '../zaptec/zaptec.module';
import { LoggingService } from '../common/logging.service';
import { DailyAggregationService } from '../common/services/daily-aggregation.service';
import { HourlyAggregationService } from '../common/services/hourly-aggregation.service';
import { DailyAggregation, DailyAggregationSchema } from '../common/schemas/daily-aggregation.schema';
import { HourlyAggregation, HourlyAggregationSchema } from '../common/schemas/hourly-aggregation.schema';

/**
 * Chart module providing chart data generation services
 *
 * This module exports the ChartService which handles all chart-related
 * operations including solar production, grid exchange, house consumption,
 * Zaptec consumption, battery charts, and dashboard combined charts.
 */
@Module({
  imports: [
    SolisModule,
    ZaptecModule,
    MongooseModule.forFeature([
      { name: DailyAggregation.name, schema: DailyAggregationSchema },
      { name: HourlyAggregation.name, schema: HourlyAggregationSchema }
    ])
  ],
  providers: [ChartService, LoggingService, DailyAggregationService, HourlyAggregationService],
  exports: [ChartService]
})
export class ChartModule {}