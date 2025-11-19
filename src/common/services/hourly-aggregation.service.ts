import { Injectable, Logger, Inject } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { HourlyAggregation } from '../schemas/hourly-aggregation.schema';
import { SolisDataService } from '../../solis/solis-data.service';
import { ZaptecDataService } from '../../zaptec/zaptec-data.service';
import { SolisData } from '../../solis/schemas/solis-data.schema';
import { ZaptecData } from '../../zaptec/schemas/zaptec-data.schema';
import { IHourlyAggregationDatabase } from '../database/interfaces/hourly-aggregation-database.interface';
import { DATABASE_TOKENS } from '../database/database.constants';

// Interfaces for hourly aggregation results
interface HourlySolarProductionAggregation {
  totalEnergyKwh: number;
  maxPowerW: number;
  avgPowerW: number;
}

interface HourlyHouseConsumptionAggregation {
  totalEnergyKwh: number;
  maxPowerW: number;
  avgPowerW: number;
}

interface HourlyGridExchangeAggregation {
  importedEnergyKwh: number;
  exportedEnergyKwh: number;
  maxImportW: number;
  maxExportW: number;
}

interface HourlyZaptecConsumptionAggregation {
  totalEnergyKwh: number;
  chargingTimeMinutes: number;
  maxPowerW: number;
}

interface HourlyBatteryAggregation {
  chargedEnergyKwh: number;
  dischargedEnergyKwh: number;
  minSoc: number;
  maxSoc: number;
}

interface HourlyDataQualityAggregation {
  solisDataPoints: number;
  zaptecDataPoints: number;
  dataGapMinutes: number;
  isComplete: boolean;
}

interface HourlyBackfillResult {
  processed: number;
  skipped: number;
  errors: number;
}

@Injectable()
export class HourlyAggregationService {
  private readonly logger = new Logger(HourlyAggregationService.name);

  constructor(
    @Inject(DATABASE_TOKENS.HOURLY_AGGREGATION_DATABASE)
    private readonly hourlyAggregationDb: IHourlyAggregationDatabase,
    private readonly solisDataService: SolisDataService,
    private readonly zaptecDataService: ZaptecDataService
  ) {}

  /**
   * Cron job that runs every hour at 5 minutes past the hour to calculate hourly aggregations
   * Processes the previous hour's data
   */
  @Cron('5 * * * *', { name: 'hourly-aggregation', timeZone: 'Europe/Brussels' })
  public async calculateHourlyAggregations(): Promise<void> {
    this.logger.log('Starting hourly aggregation calculation');

    try {
      // Calculate for the previous hour
      const now = new Date();
      const previousHour = new Date(now);
      previousHour.setHours(now.getHours() - 1, 0, 0, 0);

      await this.calculateAndStoreHourlyAggregation(previousHour);
    } catch (error) {
      this.logger.error('Failed to calculate hourly aggregations:', error);
    }
  }

  /**
   * Calculate and store hourly aggregation for a specific hour
   * @param {Date} dateHour - Date and hour for aggregation (minutes, seconds, ms will be set to 0)
   * @returns {Promise<HourlyAggregation>} Calculated hourly aggregation
   */
  public async calculateAndStoreHourlyAggregation(dateHour: Date): Promise<HourlyAggregation> {
    const hourStart = new Date(dateHour);
    hourStart.setMinutes(0, 0, 0);

    const hourEnd = new Date(hourStart);
    hourEnd.setMinutes(59, 59, 999);

    const dateStr = hourStart.toISOString().split('T')[0];
    const hour = hourStart.getHours();

    this.logger.debug(`Calculating hourly aggregation for ${dateStr} ${hour}:00`);

    try {
      // Check if aggregation already exists
      const existing = await this.hourlyAggregationDb.findOne(new Date(dateStr), hour);

      if (existing) {
        this.logger.debug(`Hourly aggregation already exists for ${dateStr} ${hour}:00, updating`);
        await this.hourlyAggregationDb.deleteOne(new Date(dateStr), hour);
      }

      // Fetch data for this hour
      const [solisData, zaptecData] = await Promise.all([
        this.solisDataService.getDataInTimeRange(hourStart, hourEnd),
        this.zaptecDataService.getDataInTimeRange(hourStart, hourEnd)
      ]);

      // Skip if no data available
      if (solisData.length === 0 && zaptecData.length === 0) {
        this.logger.debug(`No data available for ${dateStr} ${hour}:00, skipping`);
        throw new Error(`No data available for aggregation`);
      }

      // Compute aggregation
      const aggregationData = await this.computeHourlyAggregation(new Date(dateStr), hour, solisData, zaptecData);

      // Save to database
      const aggregation = await this.hourlyAggregationDb.save(aggregationData);

      this.logger.log(
        `Successfully calculated hourly aggregation for ${dateStr} ${hour}:00: ${aggregationData.solarProduction.totalEnergyKwh.toFixed(2)} kWh solar`
      );
      return aggregation as HourlyAggregation;
    } catch (error) {
      this.logger.error(`Error calculating hourly aggregation for ${dateStr} ${hour}:00:`, error);
      throw error;
    }
  }

  /**
   * Compute hourly aggregation from raw data
   * @param {Date} date - Date for the aggregation
   * @param {number} hour - Hour for the aggregation (0-23)
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @param {ZaptecData[]} zaptecData - Array of Zaptec charger data points
   * @returns {Promise<Partial<HourlyAggregation>>} Computed hourly aggregation data
   */
  private async computeHourlyAggregation(
    date: Date,
    hour: number,
    solisData: SolisData[],
    zaptecData: ZaptecData[]
  ): Promise<Partial<HourlyAggregation>> {
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
      hour,
      solarProduction,
      houseConsumption,
      gridExchange,
      zaptecConsumption,
      battery,
      dataQuality
    };
  }

  /**
   * Calculate solar production aggregation for one hour
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @returns {HourlySolarProductionAggregation} Solar production aggregation metrics
   */
  private calculateSolarAggregation(solisData: SolisData[]): HourlySolarProductionAggregation {
    if (!solisData || solisData.length === 0) {
      return { totalEnergyKwh: 0, maxPowerW: 0, avgPowerW: 0 };
    }

    const totalEnergyKwh = this.calculateTotalEnergy(solisData, (item) => item.pv?.totalPowerDC || 0);
    const powers = solisData.map((item) => item.pv?.totalPowerDC || 0);

    return {
      totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3)),
      maxPowerW: Math.max(...powers, 0),
      avgPowerW: powers.length > 0 ? Math.round(powers.reduce((sum, p) => sum + p, 0) / powers.length) : 0
    };
  }

  /**
   * Calculate house consumption aggregation for one hour
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @returns {HourlyHouseConsumptionAggregation} House consumption aggregation metrics
   */
  private calculateHouseAggregation(solisData: SolisData[]): HourlyHouseConsumptionAggregation {
    if (!solisData || solisData.length === 0) {
      return { totalEnergyKwh: 0, maxPowerW: 0, avgPowerW: 0 };
    }

    const totalEnergyKwh = this.calculateTotalEnergy(solisData, (item) => item.house?.consumption || 0);
    const powers = solisData.map((item) => item.house?.consumption || 0);

    return {
      totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3)),
      maxPowerW: Math.max(...powers, 0),
      avgPowerW: powers.length > 0 ? Math.round(powers.reduce((sum, p) => sum + p, 0) / powers.length) : 0
    };
  }

  /**
   * Calculate grid exchange aggregation for one hour
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @returns {HourlyGridExchangeAggregation} Grid exchange aggregation metrics
   */
  private calculateGridAggregation(solisData: SolisData[]): HourlyGridExchangeAggregation {
    if (!solisData || solisData.length === 0) {
      return { importedEnergyKwh: 0, exportedEnergyKwh: 0, maxImportW: 0, maxExportW: 0 };
    }

    const importedEnergyKwh = this.calculateTotalEnergy(solisData, (item) =>
      item.grid?.activePower > 0 ? item.grid.activePower : 0
    );

    const exportedEnergyKwh = this.calculateTotalEnergy(solisData, (item) =>
      item.grid?.activePower < 0 ? Math.abs(item.grid.activePower) : 0
    );

    const imports = solisData.map((item) => (item.grid?.activePower > 0 ? item.grid.activePower : 0));
    const exports = solisData.map((item) => (item.grid?.activePower < 0 ? Math.abs(item.grid.activePower) : 0));

    return {
      importedEnergyKwh: parseFloat(importedEnergyKwh.toFixed(3)),
      exportedEnergyKwh: parseFloat(exportedEnergyKwh.toFixed(3)),
      maxImportW: Math.max(...imports, 0),
      maxExportW: Math.max(...exports, 0)
    };
  }

  /**
   * Calculate Zaptec consumption aggregation for one hour
   * @param {ZaptecData[]} zaptecData - Array of Zaptec charger data points
   * @returns {HourlyZaptecConsumptionAggregation} Zaptec consumption aggregation metrics
   */
  private calculateZaptecAggregation(zaptecData: ZaptecData[]): HourlyZaptecConsumptionAggregation {
    if (!zaptecData || zaptecData.length === 0) {
      return { totalEnergyKwh: 0, chargingTimeMinutes: 0, maxPowerW: 0 };
    }

    const totalEnergyKwh = this.calculateTotalEnergy(zaptecData, (item) => (item.charging ? item.power || 0 : 0));
    const chargingPoints = zaptecData.filter((item) => item.charging);
    const chargingTimeMinutes = Math.min(chargingPoints.length, 60); // Max 60 minutes in an hour
    const chargingPowers = zaptecData.map((item) => (item.charging ? item.power || 0 : 0));

    return {
      totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3)),
      chargingTimeMinutes,
      maxPowerW: Math.max(...chargingPowers, 0)
    };
  }

  /**
   * Calculate battery aggregation for one hour
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @returns {HourlyBatteryAggregation} Battery aggregation metrics
   */
  private calculateBatteryAggregation(solisData: SolisData[]): HourlyBatteryAggregation {
    if (!solisData || solisData.length === 0) {
      return { chargedEnergyKwh: 0, dischargedEnergyKwh: 0, minSoc: 0, maxSoc: 0 };
    }

    // Simple approximation - would need actual battery power data for precise calculation
    const chargedEnergyKwh = 0; // Placeholder - implement based on your battery data structure
    const dischargedEnergyKwh = 0; // Placeholder - implement based on your battery data structure

    const socs = solisData.map((item) => item.battery?.soc).filter((soc) => soc !== undefined && soc !== null);

    return {
      chargedEnergyKwh: parseFloat(chargedEnergyKwh.toFixed(3)),
      dischargedEnergyKwh: parseFloat(dischargedEnergyKwh.toFixed(3)),
      minSoc: socs.length > 0 ? Math.min(...socs) : 0,
      maxSoc: socs.length > 0 ? Math.max(...socs) : 0
    };
  }

  /**
   * Assess data quality for the hour
   * @param {SolisData[]} solisData - Array of Solis inverter data points
   * @param {ZaptecData[]} zaptecData - Array of Zaptec charger data points
   * @returns {HourlyDataQualityAggregation} Data quality assessment metrics
   */
  private assessDataQuality(solisData: SolisData[], zaptecData: ZaptecData[]): HourlyDataQualityAggregation {
    const expectedPointsPerHour = 60; // One point per minute
    const solisDataPoints = solisData ? solisData.length : 0;
    const zaptecDataPoints = zaptecData ? zaptecData.length : 0;

    // Calculate data gaps
    const totalExpectedPoints = expectedPointsPerHour;
    const actualPoints = Math.max(solisDataPoints, zaptecDataPoints);
    const dataGapMinutes = Math.max(0, totalExpectedPoints - actualPoints);

    // Consider complete if we have at least 80% of expected data
    const completenessThreshold = 0.8;
    const isComplete = actualPoints >= totalExpectedPoints * completenessThreshold;

    return {
      solisDataPoints,
      zaptecDataPoints,
      dataGapMinutes,
      isComplete
    };
  }

  /**
   * Calculate total energy from power data for one hour
   * @param {T[]} rawData - Array of raw data points
   * @param {Function} valueExtractor - Function to extract power value from each data point
   * @returns {number} Total energy in kWh
   */
  private calculateTotalEnergy<T extends { timestamp: Date }>(
    rawData: T[],
    valueExtractor: (item: T) => number
  ): number {
    if (!rawData || rawData.length === 0) {
      return 0;
    }

    // Sort data by timestamp to ensure correct chronological order
    const sortedData = rawData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let totalEnergy = 0;

    for (let i = 0; i < sortedData.length - 1; i++) {
      const currentPoint = sortedData[i];
      const nextPoint = sortedData[i + 1];

      const currentPowerWatts = valueExtractor(currentPoint);
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
   * Get aggregated data for a time range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<HourlyAggregation[]>} Array of hourly aggregations
   */
  public async getAggregatedData(startDate: Date, endDate: Date): Promise<HourlyAggregation[]> {
    return await this.hourlyAggregationDb.getAggregatedData(startDate, endDate);
  }

  /**
   * Backfill hourly aggregations for the last 30 days
   * Checks if data exists for each hour and if aggregation is missing, then creates it
   */
  public async backfillLastMonth(): Promise<HourlyBackfillResult> {
    this.logger.log('Starting backfill of last 30 days hourly aggregations');

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    // Start from 30 days ago, go up to yesterday
    for (let dayOffset = 30; dayOffset >= 1; dayOffset--) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - dayOffset);
      targetDate.setHours(0, 0, 0, 0);

      // Process each hour of the day
      for (let hour = 0; hour < 24; hour++) {
        const hourDate = new Date(targetDate);
        hourDate.setHours(hour);

        const dateStr = targetDate.toISOString().split('T')[0];

        try {
          // Check if aggregation already exists for this hour
          const existingAggregation = await this.hourlyAggregationDb.findOne(targetDate, hour);

          if (existingAggregation) {
            skipped++;
            continue;
          }

          // Check if we have any data for this hour
          const hourStart = new Date(hourDate);
          const hourEnd = new Date(hourDate);
          hourEnd.setMinutes(59, 59, 999);

          const [solisData, zaptecData] = await Promise.all([
            this.solisDataService.getDataInTimeRange(hourStart, hourEnd),
            this.zaptecDataService.getDataInTimeRange(hourStart, hourEnd)
          ]);

          // Skip if no data available for this hour
          if (solisData.length === 0 && zaptecData.length === 0) {
            skipped++;
            continue;
          }

          // Calculate and store aggregation
          await this.calculateAndStoreHourlyAggregation(hourDate);
          processed++;

          if (processed % 100 === 0) {
            this.logger.log(`Processed ${processed} hourly aggregations...`);
          }
        } catch (error) {
          errors++;
          this.logger.error(`Error processing hourly backfill for ${dateStr} ${hour}:00:`, error);
        }
      }
    }

    const result = { processed, skipped, errors };
    this.logger.log(`Hourly backfill completed: ${processed} processed, ${skipped} skipped, ${errors} errors`);

    return result;
  }
}
