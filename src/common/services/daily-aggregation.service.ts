/**
 * Service for calculating and storing daily aggregated data
 * This service processes raw data into daily summaries for optimal chart performance
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DailyAggregation, DailyAggregationDocument } from '../schemas/daily-aggregation.schema';
import { SolisDataService } from '../../solis/solis-data.service';
import { ZaptecDataService } from '../../zaptec/zaptec-data.service';

@Injectable()
export class DailyAggregationService {
  private readonly logger = new Logger(DailyAggregationService.name);

  constructor(
    @InjectModel(DailyAggregation.name)
    private readonly dailyAggregationModel: Model<DailyAggregationDocument>,
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
      await this.dailyAggregationModel.findOneAndUpdate({ date: startDate }, aggregation, { upsert: true, new: true });

      this.logger.log(
        `Successfully calculated aggregation for ${dateStr}: ${aggregation.solarProduction.totalEnergyKwh.toFixed(2)} kWh solar`
      );
      return aggregation;
    } catch (error) {
      this.logger.error(`Error calculating aggregation for ${dateStr}:`, error);
      throw error;
    }
  }

  /**
   * Compute daily aggregation from raw data
   */
  private async computeDailyAggregation(
    date: Date,
    solisData: any[],
    zaptecData: any[]
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
   */
  private calculateSolarAggregation(solisData: any[]) {
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
   */
  private calculateHouseAggregation(solisData: any[]) {
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
   */
  private calculateGridAggregation(solisData: any[]) {
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
   */
  private calculateZaptecAggregation(zaptecData: any[]) {
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
   */
  private calculateBatteryAggregation(solisData: any[]) {
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
   */
  private assessDataQuality(solisData: any[], zaptecData: any[]) {
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
   */
  private calculateTotalEnergy(rawData: any[], valueExtractor: (item: any) => number): number {
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
    return await this.dailyAggregationModel
      .find({
        date: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .sort({ date: 1 })
      .exec();
  }

  /**
   * Get aggregated data for specific dates
   */
  public async getAggregatedDataForDates(dates: Date[]): Promise<DailyAggregation[]> {
    const startDates = dates.map((date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    });

    return await this.dailyAggregationModel
      .find({
        date: { $in: startDates }
      })
      .sort({ date: 1 })
      .exec();
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
  public async backfillLastMonth(): Promise<{ processed: number; skipped: number; errors: number }> {
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
        const existingAggregation = await this.dailyAggregationModel.findOne({ date: targetDate }).exec();
        
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
        this.logger.log(`Processed backfill for ${dateStr} (${solisData.length} solis, ${zaptecData.length} zaptec points)`);
        
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
