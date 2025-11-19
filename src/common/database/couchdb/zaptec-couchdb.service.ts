/**
 * CouchDB implementation for Zaptec data storage and retrieval
 *
 * This service provides methods for:
 * - Saving real-time Zaptec charger data to CouchDB
 * - Retrieving historical charging data for analysis and reporting
 * - Calculating daily charging statistics and energy totals
 * - Managing charging session data retention and cleanup operations
 */

import { Injectable, Inject } from '@nestjs/common';
import * as Nano from 'nano';
import { ZaptecStatus } from '../../../zaptec/models/zaptec.model';
import { IZaptecDatabase } from '../interfaces/zaptec-database.interface';
import { LoggingService } from '../../logging.service';

interface ZaptecDocument {
  _id?: string;
  _rev?: string;
  timestamp: Date;
  id: string;
  name: string;
  online: boolean;
  charging: boolean;
  power: number;
  totalPower: number;
  ChargeCurrentSet: number;
  vehicleConnected: boolean;
  operatingMode: string;
  deviceType: number;
  serialNo: string;
  type: 'zaptec-data';
}

@Injectable()
export class ZaptecCouchDBService implements IZaptecDatabase {
  private readonly context = ZaptecCouchDBService.name;
  private db: Nano.DocumentScope<ZaptecDocument>;

  constructor(
    @Inject(LoggingService) private readonly logger: LoggingService,
    @Inject('COUCHDB_CONNECTION') private readonly nano: Nano.ServerScope
  ) {
    this.db = this.nano.use<ZaptecDocument>('zaptec_data');
  }

  /**
   * Saves Zaptec charger data to CouchDB
   * @param {ZaptecStatus} data - Complete charger status data to save
   * @returns {Promise<void>}
   */
  public async saveData(data: ZaptecStatus): Promise<void> {
    try {
      const timestamp = new Date();
      const doc: ZaptecDocument = {
        _id: `zaptec-${timestamp.getTime()}`,
        timestamp,
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
        serialNo: data.serialNo,
        type: 'zaptec-data'
      };

      await this.db.insert(doc);
      this.logger.debug('Zaptec data saved successfully to CouchDB', this.context);
    } catch (error) {
      this.logger.error('Failed to save Zaptec data to CouchDB', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves recent Zaptec data from CouchDB
   * @param {number} limit - Maximum number of records to retrieve (default: 100)
   * @returns {Promise<any[]>} Array of recent charger data points
   */
  public async getRecentData(limit: number = 100): Promise<any[]> {
    try {
      const response = await this.db.list({
        descending: true,
        limit,
        include_docs: true
      });

      const data = response.rows.map(row => row.doc).filter(doc => doc);
      this.logger.debug(`Retrieved ${data.length} Zaptec data records from CouchDB`, this.context);
      return data;
    } catch (error) {
      this.logger.error('Failed to retrieve Zaptec data from CouchDB', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves the latest Zaptec data entry
   * @returns {Promise<any | null>} Latest charger data point or null if none found
   */
  public async getLatestData(): Promise<any | null> {
    try {
      const response = await this.db.list({
        descending: true,
        limit: 1,
        include_docs: true
      });

      const data = response.rows.length > 0 ? response.rows[0].doc : null;

      if (data) {
        this.logger.debug('Retrieved latest Zaptec data from CouchDB', this.context);
      } else {
        this.logger.warn('No Zaptec data found in CouchDB', this.context);
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to retrieve latest Zaptec data from CouchDB', error, this.context);
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

      const data = await this.getDataInTimeRange(startOfDay, endOfDay);

      // Calculate statistics manually
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
   * @returns {Promise<any[]>} Array of data points in time range
   */
  public async getDataInTimeRange(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const selector = {
        type: 'zaptec-data',
        timestamp: {
          $gte: startDate.toISOString(),
          $lte: endDate.toISOString()
        }
      };

      const response = await this.db.find({
        selector,
        sort: [{ timestamp: 'asc' }]
      });

      this.logger.debug(`Retrieved ${response.docs.length} Zaptec data records from time range ${startDate.toISOString()} to ${endDate.toISOString()}`, this.context);
      return response.docs;
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

      const selector = {
        type: 'zaptec-data',
        timestamp: {
          $lt: cutoffDate.toISOString()
        }
      };

      const response = await this.db.find({ selector });
      const docsToDelete = response.docs.map(doc => ({
        ...doc,
        _deleted: true
      }));

      if (docsToDelete.length > 0) {
        await this.db.bulk({ docs: docsToDelete });
        this.logger.log(`Deleted ${docsToDelete.length} old Zaptec data records (older than ${daysToKeep} days)`, this.context);
      }

      return docsToDelete.length;
    } catch (error) {
      this.logger.error('Failed to cleanup old Zaptec data', error, this.context);
      throw error;
    }
  }
}
