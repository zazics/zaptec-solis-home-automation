import { Controller, Get, HttpException, HttpStatus, Inject, Query } from '@nestjs/common';
import { ChartService } from './chart.service';
import { DailyAggregationService } from '../common/services/daily-aggregation.service';
import { HourlyAggregationService } from '../common/services/hourly-aggregation.service';
import {
  SolarProductionChartData,
  GridExchangeChartData,
  HouseConsumptionChartData,
  ZaptecConsumptionChartData,
  BatteryChartData,
  DashboardChartData,
  CHART_PERIODS,
  ChartPeriodOption
} from '../common/dto/chart-data.dto';

/**
 * Controller for managing chart data generation
 * Provides REST API endpoints for retrieving various chart data
 * including solar production, grid exchange, consumption, and battery charts
 */
@Controller('charts')
export class ChartController {
  @Inject(ChartService)
  private readonly chartService: ChartService;

  @Inject(DailyAggregationService)
  private readonly dailyAggregationService: DailyAggregationService;

  @Inject(HourlyAggregationService)
  private readonly hourlyAggregationService: HourlyAggregationService;

  constructor() {}

  /**
   * Retrieves available chart periods for frontend selection
   * @returns {Array} List of available chart period configurations
   */
  @Get('periods')
  public getChartPeriods(): ChartPeriodOption[] {
    return CHART_PERIODS;
  }

  /**
   * Retrieves solar production chart data for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<SolarProductionChartData>} Solar production data aggregated by period
   */
  @Get('solar-production')
  public async getSolarProductionChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<SolarProductionChartData> {
    try {
      return await this.chartService.getSolarProductionChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get solar production chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves grid exchange chart data (import/export) for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<GridExchangeChartData>} Grid import/export data aggregated by period
   */
  @Get('grid-exchange')
  public async getGridExchangeChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<GridExchangeChartData> {
    try {
      return await this.chartService.getGridExchangeChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get grid exchange chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves house consumption chart data for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<HouseConsumptionChartData>} House consumption data aggregated by period
   */
  @Get('house-consumption')
  public async getHouseConsumptionChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<HouseConsumptionChartData> {
    try {
      return await this.chartService.getHouseConsumptionChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get house consumption chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves Zaptec charger consumption chart data for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<ZaptecConsumptionChartData>} Zaptec consumption data aggregated by period
   */
  @Get('zaptec-consumption')
  public async getZaptecConsumptionChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<ZaptecConsumptionChartData> {
    try {
      return await this.chartService.getZaptecConsumptionChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get Zaptec consumption chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves combined dashboard chart data for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<DashboardChartData>} Combined chart data for dashboard view
   */
  @Get('dashboard')
  public async getDashboardChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<DashboardChartData> {
    try {
      return await this.chartService.getDashboardChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get dashboard chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves battery charge and power chart data for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<BatteryChartData>} Battery SOC and power data aggregated by period
   */
  @Get('battery')
  public async getBatteryChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<BatteryChartData> {
    try {
      return await this.chartService.getBatteryChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get battery chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Backfill daily aggregations for the last 30 days
   * This endpoint should be called once after implementing the aggregation system
   * @returns {Promise<object>} Backfill operation result with counts
   */
  @Get('aggregation/backfill')
  public async backfillAggregations(): Promise<{ processed: number; skipped: number; errors: number }> {
    try {
      return await this.dailyAggregationService.backfillLastMonth();
    } catch (error) {
      throw new HttpException('Failed to backfill aggregations', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Backfill hourly aggregations for the last 30 days
   * This endpoint should be called once after implementing the hourly aggregation system
   * @returns {Promise<object>} Backfill operation result with counts
   */
  @Get('aggregation/hourly-backfill')
  public async backfillHourlyAggregations(): Promise<{ processed: number; skipped: number; errors: number }> {
    try {
      return await this.hourlyAggregationService.backfillLastMonth();
    } catch (error) {
      throw new HttpException('Failed to backfill hourly aggregations', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}