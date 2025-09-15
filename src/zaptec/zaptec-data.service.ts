import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ZaptecData, ZaptecDataDocument } from './schemas/zaptec-data.schema';
import { ZaptecStatus } from './models/zaptec.model';
import { LoggingService } from '../common/logging.service';

/**
 * Service for handling Zaptec data storage and retrieval in MongoDB
 * 
 * This service provides methods for:
 * - Saving real-time Zaptec charger data to MongoDB
 * - Retrieving historical charging data for analysis and reporting
 * - Calculating daily charging statistics and energy totals
 * - Managing charging session data retention and cleanup operations
 */
@Injectable()
export class ZaptecDataService {
  private readonly context = ZaptecDataService.name;

  @Inject(LoggingService) private readonly logger: LoggingService;

  constructor(
    @InjectModel(ZaptecData.name) private zaptecDataModel: Model<ZaptecDataDocument>
  ) {}

  /**
   * Saves Zaptec charger data to MongoDB
   * @param {ZaptecStatus} data - Complete charger status data to save
   * @returns {Promise<void>}
   */
  public async saveData(data: ZaptecStatus): Promise<void> {
    try {
      const zaptecDataDoc = new this.zaptecDataModel({
        timestamp: new Date(),
        id: data.id,
        name: data.name,
        online: data.online,
        charging: data.charging,
        power: data.power,
        totalPower: data.totalPower,
        ChargeCurrentSet: data.ChargeCurrentSet,
        vehicleConnected: data.vehicleConnected,
        operatingMode: data.operatingMode,
        deviceType: data.deviceType,
        serialNo: data.serialNo
      });

      await zaptecDataDoc.save();
      this.logger.debug('Zaptec data saved successfully to MongoDB', this.context);
    } catch (error) {
      this.logger.error('Failed to save Zaptec data to MongoDB', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves recent Zaptec data from MongoDB
   * @param {number} limit - Maximum number of records to retrieve (default: 100)
   * @returns {Promise<ZaptecDataDocument[]>} Array of recent charger data points
   */
  public async getRecentData(limit: number = 100): Promise<ZaptecDataDocument[]> {
    try {
      const data = await this.zaptecDataModel
        .find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .exec();

      this.logger.debug(`Retrieved ${data.length} Zaptec data records from MongoDB`, this.context);
      return data;
    } catch (error) {
      this.logger.error('Failed to retrieve Zaptec data from MongoDB', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves the latest Zaptec data entry
   * @returns {Promise<ZaptecDataDocument | null>} Latest charger data point or null if none found
   */
  public async getLatestData(): Promise<ZaptecDataDocument | null> {
    try {
      const data = await this.zaptecDataModel
        .findOne()
        .sort({ timestamp: -1 })
        .exec();

      if (data) {
        this.logger.debug('Retrieved latest Zaptec data from MongoDB', this.context);
      } else {
        this.logger.warn('No Zaptec data found in MongoDB', this.context);
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to retrieve latest Zaptec data from MongoDB', error, this.context);
      throw error;
    }
  }

  /**
   * Calculates daily charging statistics for a given date
   * @param {Date} date - Date to calculate statistics for
   * @returns {Promise<any>} Daily charging statistics
   */
  public async getDailyStats(date: Date): Promise<any> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const data = await this.zaptecDataModel
        .find({
          timestamp: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        })
        .sort({ timestamp: 1 })
        .exec();

      // Calculate statistics
      const totalRecords = data.length;
      const chargingRecords = data.filter(d => d.charging);
      const totalChargingTime = chargingRecords.length;
      const averagePower = chargingRecords.length > 0
        ? chargingRecords.reduce((sum, d) => sum + (d.power || 0), 0) / chargingRecords.length
        : 0;
      const maxPower = data.reduce((max, d) => Math.max(max, d.power || 0), 0);

      const stats = {
        date: date.toISOString().split('T')[0],
        totalRecords,
        chargingTime: totalChargingTime,
        chargingPercentage: totalRecords > 0 ? Math.round((totalChargingTime / totalRecords) * 100) : 0,
        averagePower: Math.round(averagePower),
        maxPower,
        firstRecord: data.length > 0 ? data[0].timestamp : null,
        lastRecord: data.length > 0 ? data[data.length - 1].timestamp : null
      };

      this.logger.debug(`Calculated daily Zaptec stats for ${stats.date}`, this.context);
      return stats;
    } catch (error) {
      this.logger.error('Failed to calculate daily Zaptec statistics', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves Zaptec data within a specific time range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<ZaptecDataDocument[]>} Array of data points in time range
   */
  public async getDataInTimeRange(startDate: Date, endDate: Date): Promise<ZaptecDataDocument[]> {
    try {
      const data = await this.zaptecDataModel
        .find({
          timestamp: {
            $gte: startDate,
            $lte: endDate
          }
        })
        .sort({ timestamp: 1 })
        .exec();

      this.logger.debug(`Retrieved ${data.length} Zaptec data records from time range ${startDate.toISOString()} to ${endDate.toISOString()}`, this.context);
      return data;
    } catch (error) {
      this.logger.error('Failed to retrieve Zaptec data by time range', error, this.context);
      throw error;
    }
  }

  /**
   * Deletes old Zaptec data to manage storage space
   * @param {number} daysToKeep - Number of days of data to retain (default: 30)
   * @returns {Promise<number>} Number of deleted records
   */
  public async cleanupOldData(daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await this.zaptecDataModel
        .deleteMany({
          timestamp: { $lt: cutoffDate }
        })
        .exec();

      this.logger.log(`Deleted ${result.deletedCount} old Zaptec data records (older than ${daysToKeep} days)`, this.context);
      return result.deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup old Zaptec data', error, this.context);
      throw error;
    }
  }
}