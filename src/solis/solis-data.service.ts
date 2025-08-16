import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SolisData, SolisDataDocument } from './schemas/solis-data.schema';
import { SolisInverterData } from './solis.service';
import { LoggingService } from '../common/logging.service';

/**
 * Service for managing Solis data storage in MongoDB
 * Handles saving, retrieving, and analyzing historical inverter data
 */
@Injectable()
export class SolisDataService {
  private readonly context = SolisDataService.name;

  constructor(
    @InjectModel(SolisData.name) private solisDataModel: Model<SolisDataDocument>,
    private readonly logger: LoggingService,
  ) {}

  /**
   * Saves Solis inverter data to MongoDB
   * @param {SolisInverterData} data - Complete inverter data from Solis service
   * @returns {Promise<SolisDataDocument>} Saved document
   */
  public async saveData(data: SolisInverterData): Promise<SolisDataDocument> {
    try {
      // Calculate additional metrics
      const gridInjection = data.grid.activePower > 0 ? data.grid.activePower : 0;
      const gridConsumption = data.grid.activePower < 0 ? Math.abs(data.grid.activePower) : 0;
      const availableForCharging = Math.max(0, gridInjection - 500); // Reserve 500W

      const solisData = new this.solisDataModel({
        timestamp: data.timestamp,
        statusCode: data.status.code,
        statusText: data.status.text,
        pv: data.pv,
        ac: data.ac,
        house: data.house,
        grid: data.grid,
        battery: data.battery,
        availableForCharging,
        gridInjection,
        gridConsumption,
      });

      const savedData = await solisData.save();
      this.logger.debug(`Saved Solis data: ${savedData._id}`, this.context);

      return savedData;
    } catch (error) {
      this.logger.error('Failed to save Solis data', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves recent Solis data
   * @param {number} limit - Number of records to retrieve (default: 100)
   * @returns {Promise<SolisDataDocument[]>} Array of recent data points
   */
  public async getRecentData(limit: number = 100): Promise<SolisDataDocument[]> {
    try {
      return await this.solisDataModel.find().sort({ timestamp: -1 }).limit(limit).exec();
    } catch (error) {
      this.logger.error('Failed to retrieve recent data', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves Solis data within a date range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<SolisDataDocument[]>} Array of data points in date range
   */
  public async getDataByDateRange(startDate: Date, endDate: Date): Promise<SolisDataDocument[]> {
    try {
      return await this.solisDataModel
        .find({
          timestamp: {
            $gte: startDate,
            $lte: endDate,
          },
        })
        .sort({ timestamp: 1 })
        .exec();
    } catch (error) {
      this.logger.error('Failed to retrieve data by date range', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves daily energy statistics
   * @param {Date} date - Date to get statistics for (defaults to today)
   * @returns {Promise<any>} Daily energy statistics
   */
  public async getDailyStats(date: Date = new Date()): Promise<any> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const pipeline = [
        {
          $match: {
            timestamp: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          },
        },
        {
          $group: {
            _id: null,
            maxPvPower: { $max: '$pv.totalPowerDC' },
            avgPvPower: { $avg: '$pv.totalPowerDC' },
            maxAcPower: { $max: '$ac.totalPowerAC' },
            avgAcPower: { $avg: '$ac.totalPowerAC' },
            maxHouseConsumption: { $max: '$house.consumption' },
            avgHouseConsumption: { $avg: '$house.consumption' },
            maxGridInjection: { $max: '$gridInjection' },
            avgGridInjection: { $avg: '$gridInjection' },
            totalDataPoints: { $sum: 1 },
            minBatterySoc: { $min: '$battery.soc' },
            maxBatterySoc: { $max: '$battery.soc' },
            avgBatterySoc: { $avg: '$battery.soc' },
          },
        },
      ];

      const result = await this.solisDataModel.aggregate(pipeline).exec();
      return result[0] || {};
    } catch (error) {
      this.logger.error('Failed to calculate daily stats', error, this.context);
      throw error;
    }
  }

  /**
   * Cleans up old data beyond retention period
   * @param {number} retentionDays - Number of days to retain data (default: 90)
   * @returns {Promise<number>} Number of deleted records
   */
  public async cleanupOldData(retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.solisDataModel.deleteMany({
        timestamp: { $lt: cutoffDate },
      });

      this.logger.log(`Cleaned up ${result.deletedCount} old records older than ${retentionDays} days`, this.context);
      return result.deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup old data', error, this.context);
      throw error;
    }
  }
}
