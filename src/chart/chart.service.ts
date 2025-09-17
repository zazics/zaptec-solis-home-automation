import { Inject, Injectable } from '@nestjs/common';
import { SolisDataService } from '../solis/solis-data.service';
import { ZaptecDataService } from '../zaptec/zaptec-data.service';
import { LoggingService } from '../common/logging.service';
import { DailyAggregationService } from '../common/services/daily-aggregation.service';
import { HourlyAggregationService } from '../common/services/hourly-aggregation.service';
import {
  SolarProductionChartData,
  GridExchangeChartData,
  HouseConsumptionChartData,
  ZaptecConsumptionChartData,
  BatteryChartData,
  DashboardChartData,
  ChartDataPoint
} from '../common/dto/chart-data.dto';

/**
 * Service dedicated to chart data generation and aggregation
 *
 * This service handles all chart-related operations including:
 * - Solar production charts
 * - Grid exchange charts
 * - House consumption charts
 * - Zaptec consumption charts
 * - Battery charts
 * - Dashboard combined charts
 *
 * The service automatically chooses between pre-aggregated data and real-time calculation
 * based on the requested period and date to optimize performance.
 */
@Injectable()
export class ChartService {
  private readonly context = ChartService.name;

  @Inject(SolisDataService) private readonly solisDataService: SolisDataService;
  @Inject(ZaptecDataService) private readonly zaptecDataService: ZaptecDataService;
  @Inject(DailyAggregationService) private readonly dailyAggregationService: DailyAggregationService;
  @Inject(HourlyAggregationService) private readonly hourlyAggregationService: HourlyAggregationService;
  @Inject(LoggingService) private readonly logger: LoggingService;

  constructor() {}

  /**
   * Calculates total energy in kWh from power data collected every minute
   * @param {any[]} rawData - Array of data points with power values
   * @param {Function} valueExtractor - Function to extract power value from each data point
   * @returns {number} Total energy in kWh
   */
  private calculateTotalEnergy(rawData: any[], valueExtractor: (item: any) => number): number {
    if (!rawData || rawData.length === 0) {
      return 0;
    }

    // Sort data by timestamp to ensure correct chronological order
    const sortedData = rawData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let totalEnergy = 0;

    for (let i = 0; i < sortedData.length - 1; i++) {
      const currentPoint = sortedData[i];
      const nextPoint = sortedData[i + 1];

      const currentPowerWatts = valueExtractor(currentPoint); // Power in Watts
      const currentTime = new Date(currentPoint.timestamp).getTime();
      const nextTime = new Date(nextPoint.timestamp).getTime();

      // Calculate time difference in hours
      const timeDifferenceHours = (nextTime - currentTime) / (1000 * 60 * 60);

      // Convert Watts to kW and calculate energy
      const nextPowerWatts = valueExtractor(nextPoint);
      const averagePowerKW = (currentPowerWatts + nextPowerWatts) / 2 / 1000; // Convert W to kW

      // Energy = Power × Time (kWh = kW × hours)
      totalEnergy += averagePowerKW * timeDifferenceHours;
    }

    return totalEnergy;
  }

  /**
   * Gets time range for chart data based on period
   * @param {string} period - Chart period (day, week, month, year)
   * @param {string} date - Optional specific date
   * @returns {object} Start and end dates with grouping period
   */
  private getTimeRange(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): { startDate: Date; endDate: Date; groupBy: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly' } {
    const referenceDate = date ? new Date(date) : new Date();
    if (isNaN(referenceDate.getTime())) {
      throw new Error('Invalid date format');
    }

    let startDate: Date;
    let endDate: Date;
    let groupBy: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly';

    switch (period) {
      case 'day':
        startDate = new Date(referenceDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        groupBy = 'quarterly'; // Use 15-minute intervals for day view
        break;

      case 'week':
        {
          const dayOfWeek = referenceDate.getDay();
          const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          startDate = new Date(referenceDate);
          startDate.setDate(referenceDate.getDate() - daysToMonday);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          groupBy = 'hourly'; // Use hourly intervals for week view
        }
        break;

      case 'month':
        startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
        endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        groupBy = 'daily'; // Use daily intervals for month view
        break;

      case 'year':
        startDate = new Date(referenceDate.getFullYear(), 0, 1);
        endDate = new Date(referenceDate.getFullYear(), 11, 31);
        endDate.setHours(23, 59, 59, 999);
        groupBy = 'monthly'; // Use monthly intervals for year view
        break;
    }

    return {
      startDate,
      endDate,
      groupBy
    };
  }

  /**
   * Aggregates data points by time period
   * @param {Array} data - Raw data array
   * @param {string} groupBy - Grouping period (quarterly, hourly, daily, monthly)
   * @param {Function} valueExtractor - Function to extract value from data point
   * @returns {Array} Aggregated chart data points
   */
  private aggregateData(data: any[], groupBy: string, valueExtractor: (item: any) => number): ChartDataPoint[] {
    const groups = new Map<string, { sum: number; count: number; timestamp: Date }>();

    data.forEach((item) => {
      const timestamp = new Date(item.timestamp);
      let groupKey: string;

      switch (groupBy) {
        case 'quarterly': {
          // Group by 15-minute intervals
          const quarter = Math.floor(timestamp.getMinutes() / 15) * 15;
          groupKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}-${timestamp.getHours()}-${quarter}`;
          break;
        }
        case 'hourly':
          groupKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}-${timestamp.getHours()}`;
          break;
        case 'daily':
          groupKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;
          break;
        case 'monthly':
          groupKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}`;
          break;
        default:
          throw new Error(`Invalid groupBy: ${groupBy}`);
      }

      const value = valueExtractor(item);
      if (groups.has(groupKey)) {
        const group = groups.get(groupKey)!;
        group.sum += value;
        group.count += 1;
      } else {
        let groupTimestamp: Date;
        switch (groupBy) {
          case 'quarterly': {
            const quarter = Math.floor(timestamp.getMinutes() / 15) * 15;
            groupTimestamp = new Date(
              timestamp.getFullYear(),
              timestamp.getMonth(),
              timestamp.getDate(),
              timestamp.getHours(),
              quarter
            );
            break;
          }
          case 'hourly':
            groupTimestamp = new Date(
              timestamp.getFullYear(),
              timestamp.getMonth(),
              timestamp.getDate(),
              timestamp.getHours()
            );
            break;
          case 'daily':
            groupTimestamp = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
            break;
          case 'monthly':
            groupTimestamp = new Date(timestamp.getFullYear(), timestamp.getMonth(), 1);
            break;
        }
        groups.set(groupKey, { sum: value, count: 1, timestamp: groupTimestamp! });
      }
    });

    return Array.from(groups.values())
      .map((group) => ({
        timestamp: group.timestamp,
        value: group.sum / group.count // Average value
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Converts daily aggregations to chart data format
   * @param {any[]} aggregations - Array of daily aggregations
   * @param {Function} valueExtractor - Function to extract value from aggregation
   * @returns {ChartDataPoint[]} Chart data points
   */
  private convertAggregationsToChartData(aggregations: any[], valueExtractor: (agg: any) => number): ChartDataPoint[] {
    return aggregations
      .map((agg) => ({
        timestamp: new Date(agg.date),
        value: valueExtractor(agg)
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Determines whether to use pre-aggregated data or real-time calculation
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {boolean} True if should use pre-aggregated data
   */
  private shouldUsePreAggregatedData(period: 'day' | 'week' | 'month' | 'year', date?: string): boolean {
    if (period === 'day') {
      // For day period, only use pre-aggregated data if it's not today
      const targetDate = date ? new Date(date) : new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      targetDate.setHours(0, 0, 0, 0);

      return targetDate.getTime() < today.getTime();
    }

    if (period === 'week') {
      // For week period, use hourly pre-aggregated data (not daily)
      return true;
    }

    // For month, year periods, use daily pre-aggregated data
    return true;
  }

  /**
   * Converts hourly aggregations to chart data format for week view
   * @param {any[]} hourlyAggregations - Array of hourly aggregations
   * @param {Function} valueExtractor - Function to extract value from aggregation
   * @returns {ChartDataPoint[]} Chart data points
   */
  private convertHourlyAggregationsToChartData(hourlyAggregations: any[], valueExtractor: (agg: any) => number): ChartDataPoint[] {
    return hourlyAggregations.map(agg => {
      const timestamp = new Date(agg.date);
      timestamp.setHours(agg.hour, 0, 0, 0);
      return {
        timestamp,
        value: valueExtractor(agg)
      };
    }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Retrieves solar production chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<SolarProductionChartData>} Solar production chart data
   */
  public async getSolarProductionChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<SolarProductionChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (this.shouldUsePreAggregatedData(period, date)) {
      if (period === 'week') {
        // Use hourly aggregations for week view to show hourly granularity
        const hourlyAggregations = await this.hourlyAggregationService.getAggregatedData(startDate, endDate);

        const chartData = this.convertHourlyAggregationsToChartData(
          hourlyAggregations,
          (agg) => agg.solarProduction?.avgPowerW || 0  // Use average power for hourly display
        );

        // Calculate total energy from hourly aggregations
        const totalEnergyKwh = hourlyAggregations.reduce((sum, agg) => sum + (agg.solarProduction?.totalEnergyKwh || 0), 0);

        return {
          period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
          startDate,
          endDate,
          data: chartData,
          totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3))
        };
      } else if (period === 'month' || period === 'year') {
        // Use daily aggregations for month/year view
        const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

        const chartData = this.convertAggregationsToChartData(
          aggregations,
          (agg) => agg.solarProduction?.maxPowerW || 0  // Use max power for chart display
        );

        // Calculate total energy from aggregations
        const totalEnergyKwh = aggregations.reduce((sum, agg) => sum + (agg.solarProduction?.totalEnergyKwh || 0), 0);

        return {
          period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
          startDate,
          endDate,
          data: chartData,
          totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3))
        };
      }
    }

    // Fallback to real-time calculation for current day or when aggregations are not available
    const rawData = await this.solisDataService.getDataInTimeRange(startDate, endDate);
    const chartData = this.aggregateData(rawData, groupBy, (item) => item.pv?.totalPowerDC || 0);
    const totalEnergyKwh = this.calculateTotalEnergy(rawData, (item) => item.pv?.totalPowerDC || 0);

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      data: chartData,
      totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3))
    };
  }

  /**
   * Retrieves grid exchange chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<GridExchangeChartData>} Grid exchange chart data
   */
  public async getGridExchangeChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<GridExchangeChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const importedData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.gridExchange?.maxImportW || 0
      );

      const exportedData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.gridExchange?.maxExportW || 0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        imported: importedData,
        exported: exportedData
      };
    }

    // Fallback to real-time calculation for current day
    const rawData = await this.solisDataService.getDataInTimeRange(startDate, endDate);

    const importedData = this.aggregateData(rawData, groupBy, (item) =>
      item.grid?.activePower > 0 ? item.grid.activePower : 0
    );

    const exportedData = this.aggregateData(rawData, groupBy, (item) =>
      item.grid?.activePower < 0 ? Math.abs(item.grid.activePower) : 0
    );

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      imported: importedData,
      exported: exportedData
    };
  }

  /**
   * Retrieves house consumption chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<HouseConsumptionChartData>} House consumption chart data
   */
  public async getHouseConsumptionChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<HouseConsumptionChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const chartData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.houseConsumption?.maxPowerW || 0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        data: chartData
      };
    }

    // Fallback to real-time calculation for current day
    const rawData = await this.solisDataService.getDataInTimeRange(startDate, endDate);
    const chartData = this.aggregateData(rawData, groupBy, (item) => item.house?.consumption || 0);

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      data: chartData
    };
  }

  /**
   * Retrieves Zaptec consumption chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<ZaptecConsumptionChartData>} Zaptec consumption chart data
   */
  public async getZaptecConsumptionChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<ZaptecConsumptionChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const chartData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.zaptecConsumption?.maxPowerW || 0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        data: chartData
      };
    }

    // Fallback to real-time calculation for current day
    const rawData = await this.zaptecDataService.getDataInTimeRange(startDate, endDate);
    const chartData = this.aggregateData(rawData, groupBy, (item) => (item.charging ? item.power || 0 : 0));

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      data: chartData
    };
  }

  /**
   * Retrieves combined dashboard chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<DashboardChartData>} Combined dashboard chart data
   */
  public async getDashboardChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<DashboardChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const solarProduction = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.solarProduction?.maxPowerW || 0
      );

      const houseConsumption = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.houseConsumption?.maxPowerW || 0
      );

      const gridImported = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.gridExchange?.maxImportW || 0
      );

      const gridExported = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.gridExchange?.maxExportW || 0
      );

      const zaptecConsumption = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.zaptecConsumption?.maxPowerW || 0
      );

      // Calculate total solar energy from aggregations
      const totalSolarEnergyKwh = aggregations.reduce(
        (sum, agg) => sum + (agg.solarProduction?.totalEnergyKwh || 0),
        0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        solarProduction,
        houseConsumption,
        zaptecConsumption,
        gridImported,
        gridExported,
        totalSolarEnergyKwh: parseFloat(totalSolarEnergyKwh.toFixed(3))
      };
    }

    // Fallback to real-time calculation for current day
    const [solisData, zaptecData] = await Promise.all([
      this.solisDataService.getDataInTimeRange(startDate, endDate),
      this.zaptecDataService.getDataInTimeRange(startDate, endDate)
    ]);

    const solarProduction = this.aggregateData(solisData, groupBy, (item) => item.pv?.totalPowerDC || 0);
    const houseConsumption = this.aggregateData(solisData, groupBy, (item) => item.house?.consumption || 0);
    const gridImported = this.aggregateData(solisData, groupBy, (item) =>
      item.grid?.activePower > 0 ? item.grid.activePower : 0
    );
    const gridExported = this.aggregateData(solisData, groupBy, (item) =>
      item.grid?.activePower < 0 ? Math.abs(item.grid.activePower) : 0
    );
    const zaptecConsumption = this.aggregateData(zaptecData, groupBy, (item) => (item.charging ? item.power || 0 : 0));

    // Calculate total solar energy in kWh from power data in Watts
    const totalSolarEnergyKwh = this.calculateTotalEnergy(solisData, (item) => item.pv?.totalPowerDC || 0);

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      solarProduction,
      houseConsumption,
      zaptecConsumption,
      gridImported,
      gridExported,
      totalSolarEnergyKwh: parseFloat(totalSolarEnergyKwh.toFixed(3)) // Round to 3 decimal places
    };
  }

  /**
   * Retrieves battery charge and power chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<BatteryChartData>} Battery SOC and power chart data
   */
  public async getBatteryChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<BatteryChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const socData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.battery?.avgSocPercent || 0
      );

      const powerData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.battery?.avgPowerW || 0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        data: socData,
        powerData: powerData
      };
    }

    // Fallback to real-time calculation for current day
    const rawData = await this.solisDataService.getDataInTimeRange(startDate, endDate);

    const socData = this.aggregateData(rawData, groupBy, (item) => item.battery?.soc || 0);
    const powerData = this.aggregateData(rawData, groupBy, (item) => item.battery?.activePower || 0);

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      data: socData,
      powerData: powerData
    };
  }
}