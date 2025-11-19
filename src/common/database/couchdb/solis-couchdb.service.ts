/**
 * CouchDB implementation for Solis data storage
 * Handles saving, retrieving, and analyzing historical inverter data using CouchDB
 */

import { Injectable, Inject } from '@nestjs/common';
import * as Nano from 'nano';
import { SolisDataDTO } from '../../../solis/models/solis.model';
import { ISolisDatabase } from '../interfaces/solis-database.interface';
import { LoggingService } from '../../logging.service';

interface SolisDocument {
  _id?: string;
  _rev?: string;
  timestamp: Date;
  statusCode: number;
  statusText: string;
  pv: any;
  ac: any;
  house: any;
  grid: any;
  battery: any;
  availableForCharging?: number;
  gridInjection?: number;
  gridConsumption?: number;
  type: 'solis-data';
}

@Injectable()
export class SolisCouchDBService implements ISolisDatabase {
  private readonly context = SolisCouchDBService.name;
  private db: Nano.DocumentScope<SolisDocument>;

  constructor(
    @Inject(LoggingService) private readonly logger: LoggingService,
    @Inject('COUCHDB_CONNECTION') private readonly nano: Nano.ServerScope
  ) {
    this.db = this.nano.use<SolisDocument>('solis_data');
  }

  /**
   * Saves Solis inverter data to CouchDB
   * @param {SolisDataDTO} data - Complete inverter data from Solis service
   * @returns {Promise<any>} Saved document
   */
  public async saveData(data: SolisDataDTO): Promise<any> {
    try {
      // Calculate additional metrics
      const gridInjection = data.grid.activePower > 0 ? data.grid.activePower : 0;
      const gridConsumption = data.grid.activePower < 0 ? Math.abs(data.grid.activePower) : 0;
      const availableForCharging = Math.max(0, gridInjection - 500); // Reserve 500W

      const doc: SolisDocument = {
        _id: `solis-${data.timestamp.getTime()}`,
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
        type: 'solis-data'
      };

      const response = await this.db.insert(doc);
      this.logger.debug(`Saved Solis data: ${response.id}`, this.context);

      return { ...doc, _id: response.id, _rev: response.rev };
    } catch (error) {
      this.logger.error('Failed to save Solis data', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves recent Solis data
   * @param {number} limit - Number of records to retrieve (default: 100)
   * @returns {Promise<any[]>} Array of recent data points
   */
  public async getRecentData(limit: number = 100): Promise<any[]> {
    try {
      const response = await this.db.list({
        descending: true,
        limit,
        include_docs: true
      });

      return response.rows.map(row => row.doc).filter(doc => doc);
    } catch (error) {
      this.logger.error('Failed to retrieve recent data', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves Solis data within a date range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<any[]>} Array of data points in date range
   */
  public async getDataByDateRange(startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const selector = {
        type: 'solis-data',
        timestamp: {
          $gte: startDate.toISOString(),
          $lte: endDate.toISOString()
        }
      };

      const response = await this.db.find({
        selector,
        sort: [{ timestamp: 'asc' }]
      });

      return response.docs;
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

      const data = await this.getDataByDateRange(startOfDay, endOfDay);

      // Calculate statistics manually (CouchDB doesn't have aggregation pipeline like MongoDB)
      if (data.length === 0) {
        return {};
      }

      const stats = {
        maxPvPower: Math.max(...data.map(d => d.pv?.totalPowerDC || 0)),
        avgPvPower: data.reduce((sum, d) => sum + (d.pv?.totalPowerDC || 0), 0) / data.length,
        maxAcPower: Math.max(...data.map(d => d.ac?.totalPowerAC || 0)),
        avgAcPower: data.reduce((sum, d) => sum + (d.ac?.totalPowerAC || 0), 0) / data.length,
        maxHouseConsumption: Math.max(...data.map(d => d.house?.consumption || 0)),
        avgHouseConsumption: data.reduce((sum, d) => sum + (d.house?.consumption || 0), 0) / data.length,
        maxGridInjection: Math.max(...data.map(d => d.gridInjection || 0)),
        avgGridInjection: data.reduce((sum, d) => sum + (d.gridInjection || 0), 0) / data.length,
        totalDataPoints: data.length,
        minBatterySoc: Math.min(...data.map(d => d.battery?.soc || 100)),
        maxBatterySoc: Math.max(...data.map(d => d.battery?.soc || 0)),
        avgBatterySoc: data.reduce((sum, d) => sum + (d.battery?.soc || 0), 0) / data.length
      };

      return stats;
    } catch (error) {
      this.logger.error('Failed to calculate daily stats', error, this.context);
      throw error;
    }
  }

  /**
   * Alias for getDataByDateRange - retrieves Solis data within a time range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<any[]>} Array of data points in time range
   */
  public async getDataInTimeRange(startDate: Date, endDate: Date): Promise<any[]> {
    return this.getDataByDateRange(startDate, endDate);
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

      const selector = {
        type: 'solis-data',
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
        this.logger.log(`Cleaned up ${docsToDelete.length} old records older than ${retentionDays} days`, this.context);
      }

      return docsToDelete.length;
    } catch (error) {
      this.logger.error('Failed to cleanup old data', error, this.context);
      throw error;
    }
  }
}
