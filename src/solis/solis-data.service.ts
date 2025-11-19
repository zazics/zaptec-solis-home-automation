import { Injectable, Inject } from '@nestjs/common';
import { SolisDataDTO } from './models/solis.model';
import { ISolisDatabase } from '../common/database/interfaces/solis-database.interface';
import { DATABASE_TOKENS } from '../common/database/database.constants';

/**
 * Service for managing Solis data storage (Database-agnostic version)
 * Handles saving, retrieving, and analyzing historical inverter data
 * Uses dependency injection to support both MongoDB and CouchDB
 */
@Injectable()
export class SolisDataService {
  constructor(
    @Inject(DATABASE_TOKENS.SOLIS_DATABASE) private readonly database: ISolisDatabase
  ) {}

  /**
   * Saves Solis inverter data to database
   * @param {SolisDataDTO} data - Complete inverter data from Solis service
   * @returns {Promise<any>} Saved document
   */
  public async saveData(data: SolisDataDTO): Promise<any> {
    return await this.database.saveData(data);
  }

  /**
   * Retrieves recent Solis data
   * @param {number} limit - Number of records to retrieve (default: 100)
   * @returns {Promise<any[]>} Array of recent data points
   */
  public async getRecentData(limit: number = 100): Promise<any[]> {
    return await this.database.getRecentData(limit);
  }

  /**
   * Retrieves Solis data within a date range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<any[]>} Array of data points in date range
   */
  public async getDataByDateRange(startDate: Date, endDate: Date): Promise<any[]> {
    return await this.database.getDataByDateRange(startDate, endDate);
  }

  /**
   * Retrieves daily energy statistics
   * @param {Date} date - Date to get statistics for (defaults to today)
   * @returns {Promise<any>} Daily energy statistics
   */
  public async getDailyStats(date: Date = new Date()): Promise<any> {
    return await this.database.getDailyStats(date);
  }

  /**
   * Alias for getDataByDateRange - retrieves Solis data within a time range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<any[]>} Array of data points in time range
   */
  public async getDataInTimeRange(startDate: Date, endDate: Date): Promise<any[]> {
    return await this.database.getDataInTimeRange(startDate, endDate);
  }

  /**
   * Cleans up old data beyond retention period
   * @param {number} retentionDays - Number of days to retain data (default: 90)
   * @returns {Promise<number>} Number of deleted records
   */
  public async cleanupOldData(retentionDays: number = 90): Promise<number> {
    return await this.database.cleanupOldData(retentionDays);
  }
}
