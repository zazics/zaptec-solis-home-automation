import { Module } from '@nestjs/common';
import { ChartService } from './chart.service';
import { ChartController } from './chart.controller';
import { SolisModule } from '../solis/solis.module';
import { ZaptecModule } from '../zaptec/zaptec.module';
import { LoggingService } from '../common/logging.service';
import { DailyAggregationService } from '../common/services/daily-aggregation.service';
import { HourlyAggregationService } from '../common/services/hourly-aggregation.service';

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
    ZaptecModule
  ],
  providers: [ChartService, LoggingService, DailyAggregationService, HourlyAggregationService],
  controllers: [ChartController],
  exports: [ChartService]
})
export class ChartModule {}