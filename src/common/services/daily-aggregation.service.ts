/**
 * Service for calculating and storing daily aggregated data
 * This service processes raw data into daily summaries for optimal chart performance
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DailyAggregation } from '../schemas/daily-aggregation.schema';
import { SolisDataService } from '../../solis/solis-data.service';
import { ZaptecDataService } from '../../zaptec/zaptec-data.service';
import { SolisData } from '../../solis/schemas/solis-data.schema';
import { ZaptecData } from '../../zaptec/schemas/zaptec-data.schema';
import { IDailyAggregationDatabase } from '../database/interfaces/daily-aggregation-database.interface';
import { DATABASE_TOKENS } from '../database/database.constants';

// Interfaces for aggregation results
interface SolarProductionAggregation {
  totalEnergyKwh: number;
  maxPowerW: number;
  avgPowerW: number;
}

interface HouseConsumptionAggregation {
  totalEnergyKwh: number;
  maxPowerW: number;
  avgPowerW: number;
}

interface GridExchangeAggregation {
  importedEnergyKwh: number;
  exportedEnergyKwh: number;
  maxImportW: number;
  maxExportW: number;
}

interface ZaptecConsumptionAggregation {
  totalEnergyKwh: number;
  chargingTimeHours: number;
  maxPowerW: number;
}

interface BatteryAggregation {
  chargedEnergyKwh: number;
  dischargedEnergyKwh: number;
  minSoc: number;
  maxSoc: number;
}

interface DataQualityAggregation {
  solisDataPoints: number;
  zaptecDataPoints: number;
  dataGapMinutes: number;
  isComplete: boolean;
}

interface BackfillResult {
  processed: number;
  skipped: number;
  errors: number;
}

@Injectable()
export class DailyAggregationService {
  private readonly logger = new Logger(DailyAggregationService.name);

  constructor(
    @Inject(DATABASE_TOKENS.DAILY_AGGREGATION_DATABASE)
    private readonly dailyAggregationDb: IDailyAggregationDatabase,
    private readonly solisDataService: SolisDataService,
    private readonly zaptecDataService: ZaptecDataService
  ) {}

  /**
   * Cron job that runs every night at 2 AM to calculate previous day aggregations
   */
  @Cron('0 2 * * *', { name: 'daily-aggregation', timeZone: 'Europe/Brussels' })
  public async calculateDailyAggregations(): Promise<void> {
    this.logger.log('Starting daily aggregation cron job');

    try {
      // Calculate for yesterday (in case of late data)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      // Also calculate for 2 days ago to handle any potential data delays
      const dayBefore = new Date();
      dayBefore.setDate(dayBefore.getDate() - 2);
      dayBefore.setHours(0, 0, 0, 0);

      await this.calculateAndStoreDailyAggregation(yesterday);
      await this.calculateAndStoreDailyAggregation(dayBefore);

      this.logger.log('Daily aggregation cron job completed successfully');
    } catch (error) {
      this.logger.error('Error in daily aggregation cron job:', error);
    }
  }

  /**
   * Calculate and store aggregation for a specific date
   */
  public async calculateAndStoreDailyAggregation(date: Date): Promise<DailyAggregation> {
    const dateStr = date.toISOString().split('T')[0];
    this.logger.log(`Calculating aggregation for ${dateStr}`);

    // Set time range for the full day
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    try {
      // Fetch raw data for the day
      const [solisData, zaptecData] = await Promise.all([
        this.solisDataService.getDataInTimeRange(startDate, endDate),
        this.zaptecDataService.getDataInTimeRange(startDate, endDate)
      ]);

      // Calculate aggregations
      const aggregation = await this.computeDailyAggregation(date, solisData, zaptecData);

      // Store or update in database
      await this.dailyAggregationDb.findOneAndUpdate(startDate, aggregation);

      this.logger.log(
        `Successfully calculated aggregation for ${dateStr}: ${aggregation.solarProduction.totalEnergyKwh.toFixed(2)} kWh solar`
      );
      return aggregation as DailyAggregation;
    } catch (error) {
      this.logger.error(`Error calculating aggregation for ${dateStr}:`, error);
      throw error;
    }
  }

  /**
   * Compute daily aggregation from raw data
   * @param {Date} date - Date for the aggregation
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @param {ZaptecData[]} zaptecData - Array of Zaptec charger data points
   * @returns {Promise<Partial<DailyAggregation>>} Computed daily aggregation data
   */
  private async computeDailyAggregation(
    date: Date,
    solisData: SolisData[],
    zaptecData: ZaptecData[]
  ): Promise<Partial<DailyAggregation>> {
    // Solar production calculations
    const solarProduction = this.calculateSolarAggregation(solisData);

    // House consumption calculations
    const houseConsumption = this.calculateHouseAggregation(solisData);

    // Grid exchange calculations
    const gridExchange = this.calculateGridAggregation(solisData);

    // Zaptec consumption calculations
    const zaptecConsumption = this.calculateZaptecAggregation(zaptecData);

    // Battery calculations
    const battery = this.calculateBatteryAggregation(solisData);

    // Data quality assessment
    const dataQuality = this.assessDataQuality(solisData, zaptecData);

    return {
      date,
      solarProduction,
      houseConsumption,
      gridExchange,
      zaptecConsumption,
      battery,
      dataQuality
    };
  }

  /**
   * Calculate solar production aggregation
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @returns {SolarProductionAggregation} Solar production aggregation metrics
   */
  private calculateSolarAggregation(solisData: SolisData[]): SolarProductionAggregation {
    if (!solisData || solisData.length === 0) {
      return { totalEnergyKwh: 0, maxPowerW: 0, avgPowerW: 0 };
    }

    const powers = solisData.map((d) => d.pv?.totalPowerDC || 0).filter((p) => p > 0);
    const totalEnergyKwh = this.calculateTotalEnergy(solisData, (item) => item.pv?.totalPowerDC || 0);

    return {
      totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3)),
      maxPowerW: Math.max(...powers, 0),
      avgPowerW: powers.length > 0 ? Math.round(powers.reduce((sum, p) => sum + p, 0) / powers.length) : 0
    };
  }

  /**
   * Calculate house consumption aggregation
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @returns {HouseConsumptionAggregation} House consumption aggregation metrics
   */
  private calculateHouseAggregation(solisData: SolisData[]): HouseConsumptionAggregation {
    if (!solisData || solisData.length === 0) {
      return { totalEnergyKwh: 0, maxPowerW: 0, avgPowerW: 0 };
    }

    const powers = solisData.map((d) => d.house?.consumption || 0);
    const totalEnergyKwh = this.calculateTotalEnergy(solisData, (item) => item.house?.consumption || 0);

    return {
      totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3)),
      maxPowerW: Math.max(...powers, 0),
      avgPowerW: powers.length > 0 ? Math.round(powers.reduce((sum, p) => sum + p, 0) / powers.length) : 0
    };
  }

  /**
   * Calculate grid exchange aggregation
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @returns {GridExchangeAggregation} Grid exchange aggregation metrics
   */
  private calculateGridAggregation(solisData: SolisData[]): GridExchangeAggregation {
    if (!solisData || solisData.length === 0) {
      return { importedEnergyKwh: 0, exportedEnergyKwh: 0, maxImportW: 0, maxExportW: 0 };
    }

    const importedEnergyKwh = this.calculateTotalEnergy(solisData, (item) =>
      item.grid?.activePower > 0 ? item.grid.activePower : 0
    );

    const exportedEnergyKwh = this.calculateTotalEnergy(solisData, (item) =>
      item.grid?.activePower < 0 ? Math.abs(item.grid.activePower) : 0
    );

    const imports = solisData.map((d) => (d.grid?.activePower > 0 ? d.grid.activePower : 0));
    const exports = solisData.map((d) => (d.grid?.activePower < 0 ? Math.abs(d.grid.activePower) : 0));

    return {
      importedEnergyKwh: parseFloat(importedEnergyKwh.toFixed(3)),
      exportedEnergyKwh: parseFloat(exportedEnergyKwh.toFixed(3)),
      maxImportW: Math.max(...imports, 0),
      maxExportW: Math.max(...exports, 0)
    };
  }

  /**
   * Calculate Zaptec consumption aggregation
   * @param {ZaptecData[]} zaptecData - Array of Zaptec charger data points
   * @returns {ZaptecConsumptionAggregation} Zaptec consumption aggregation metrics
   */
  private calculateZaptecAggregation(zaptecData: ZaptecData[]): ZaptecConsumptionAggregation {
    if (!zaptecData || zaptecData.length === 0) {
      return { totalEnergyKwh: 0, chargingTimeHours: 0, maxPowerW: 0 };
    }

    const totalEnergyKwh = this.calculateTotalEnergy(zaptecData, (item) => (item.charging ? item.power || 0 : 0));

    const chargingMinutes = zaptecData.filter((d) => d.charging).length;
    const chargingTimeHours = parseFloat((chargingMinutes / 60).toFixed(2));

    const chargingPowers = zaptecData.map((d) => (d.charging ? d.power || 0 : 0));

    return {
      totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3)),
      chargingTimeHours,
      maxPowerW: Math.max(...chargingPowers, 0)
    };
  }

  /**
   * Calculate battery aggregation
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @returns {BatteryAggregation} Battery aggregation metrics
   */
  private calculateBatteryAggregation(solisData: SolisData[]): BatteryAggregation {
    if (!solisData || solisData.length === 0) {
      return { chargedEnergyKwh: 0, dischargedEnergyKwh: 0, minSoc: 0, maxSoc: 0 };
    }

    const chargedEnergyKwh = this.calculateTotalEnergy(solisData, (item) =>
      item.battery?.power > 0 ? item.battery.power : 0
    );

    const dischargedEnergyKwh = this.calculateTotalEnergy(solisData, (item) =>
      item.battery?.power < 0 ? Math.abs(item.battery.power) : 0
    );

    const socs = solisData.map((d) => d.battery?.soc || 0).filter((soc) => soc > 0);

    return {
      chargedEnergyKwh: parseFloat(chargedEnergyKwh.toFixed(3)),
      dischargedEnergyKwh: parseFloat(dischargedEnergyKwh.toFixed(3)),
      minSoc: socs.length > 0 ? Math.min(...socs) : 0,
      maxSoc: socs.length > 0 ? Math.max(...socs) : 0
    };
  }

  /**
   * Assess data quality for the day
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @param {ZaptecData[]} zaptecData - Array of Zaptec charger data points
   * @returns {DataQualityAggregation} Data quality assessment metrics
   */
  private assessDataQuality(solisData: SolisData[], zaptecData: ZaptecData[]): DataQualityAggregation {
    const expectedPointsPerDay = 24 * 60; // One point per minute
    const solisDataPoints = solisData ? solisData.length : 0;
    const zaptecDataPoints = zaptecData ? zaptecData.length : 0;

    // Calculate data gaps
    const solisGapMinutes = Math.max(0, expectedPointsPerDay - solisDataPoints);
    const zaptecGapMinutes = Math.max(0, expectedPointsPerDay - zaptecDataPoints);
    const dataGapMinutes = Math.max(solisGapMinutes, zaptecGapMinutes);

    // Consider complete if we have at least 80% of expected data
    const isComplete = solisDataPoints >= expectedPointsPerDay * 0.8;

    return {
      solisDataPoints,
      zaptecDataPoints,
      dataGapMinutes,
      isComplete
    };
  }

  /**
   * Calculate total energy from power data (reuse existing logic)
   * @param {T[]} rawData - Array of raw data points
   * @param {Function} valueExtractor - Function to extract power value from each data point
   * @returns {number} Total energy in kWh
   */
  private calculateTotalEnergy<T extends { timestamp: Date }>(rawData: T[], valueExtractor: (item: T) => number): number {
    if (!rawData || rawData.length === 0) {
      return 0;
    }

    // Sort data by timestamp
    const sortedData = rawData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let totalEnergy = 0;

    for (let i = 0; i < sortedData.length - 1; i++) {
      const currentPoint = sortedData[i];
      const nextPoint = sortedData[i + 1];

      const currentPowerWatts = valueExtractor(currentPoint);
      const currentTime = new Date(currentPoint.timestamp).getTime();
      const nextTime = new Date(nextPoint.timestamp).getTime();

      const timeDifferenceHours = (nextTime - currentTime) / (1000 * 60 * 60);
      const nextPowerWatts = valueExtractor(nextPoint);
      const averagePowerKW = (currentPowerWatts + nextPowerWatts) / 2 / 1000;

      totalEnergy += averagePowerKW * timeDifferenceHours;
    }

    return totalEnergy;
  }

  /**
   * Get aggregated data for a date range
   */
  public async getAggregatedData(startDate: Date, endDate: Date): Promise<DailyAggregation[]> {
    return await this.dailyAggregationDb.getAggregatedData(startDate, endDate);
  }

  /**
   * Get aggregated data for specific dates
   */
  public async getAggregatedDataForDates(dates: Date[]): Promise<DailyAggregation[]> {
    return await this.dailyAggregationDb.getAggregatedDataForDates(dates);
  }

  /**
   * Manual trigger for aggregation calculation (for testing or backfill)
   */
  public async triggerAggregationForDate(dateStr: string): Promise<DailyAggregation> {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format. Use YYYY-MM-DD');
    }

    return await this.calculateAndStoreDailyAggregation(date);
  }

  /**
   * Backfill aggregations for the last 30 days
   * Checks if data exists for each day and if aggregation is missing, then creates it
   */
  public async backfillLastMonth(): Promise<BackfillResult> {
    this.logger.log('Starting backfill of last 30 days aggregations');

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    // Start from 30 days ago, go up to yesterday
    for (let i = 30; i >= 1; i--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - i);
      targetDate.setHours(0, 0, 0, 0);

      const dateStr = targetDate.toISOString().split('T')[0];

      try {
        // Check if aggregation already exists for this date
        const existingAggregation = await this.dailyAggregationDb.findOne(targetDate);

        if (existingAggregation) {
          this.logger.debug(`Aggregation already exists for ${dateStr}, skipping`);
          skipped++;
          continue;
        }

        // Check if we have any data for this date
        const endDate = new Date(targetDate);
        endDate.setHours(23, 59, 59, 999);

        const [solisData, zaptecData] = await Promise.all([
          this.solisDataService.getDataInTimeRange(targetDate, endDate),
          this.zaptecDataService.getDataInTimeRange(targetDate, endDate)
        ]);

        // Skip if no data available for this date
        if (solisData.length === 0 && zaptecData.length === 0) {
          this.logger.debug(`No data available for ${dateStr}, skipping`);
          skipped++;
          continue;
        }

        // Calculate and store aggregation
        await this.calculateAndStoreDailyAggregation(targetDate);
        processed++;
        this.logger.log(
          `Processed backfill for ${dateStr} (${solisData.length} solis, ${zaptecData.length} zaptec points)`
        );
      } catch (error) {
        errors++;
        this.logger.error(`Error processing backfill for ${dateStr}:`, error);
      }
    }

    const result = { processed, skipped, errors };
    this.logger.log(`Backfill completed: ${processed} processed, ${skipped} skipped, ${errors} errors`);

    return result;
  }
}
