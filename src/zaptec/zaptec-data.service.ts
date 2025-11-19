import { Injectable, Inject } from '@nestjs/common';
import { ZaptecStatus } from './models/zaptec.model';
import { IZaptecDatabase } from '../common/database/interfaces/zaptec-database.interface';
import { DATABASE_TOKENS } from '../common/database/database.constants';

/**
 * Service for handling Zaptec data storage and retrieval (Database-agnostic version)
 *
 * This service provides methods for:
 * - Saving real-time Zaptec charger data
 * - Retrieving historical charging data for analysis and reporting
 * - Calculating daily charging statistics and energy totals
 * - Managing charging session data retention and cleanup operations
 *
 * Uses dependency injection to support both MongoDB and CouchDB
 */
@Injectable()
export class ZaptecDataService {
  constructor(
    @Inject(DATABASE_TOKENS.ZAPTEC_DATABASE) private readonly database: IZaptecDatabase
  ) {}

  /**
   * Saves Zaptec charger data to database
   * @param {ZaptecStatus} data - Complete charger status data to save
   * @returns {Promise<void>}
   */
  public async saveData(data: ZaptecStatus): Promise<void> {
    return await this.database.saveData(data);
  }

  /**
   * Retrieves recent Zaptec data from database
   * @param {number} limit - Maximum number of records to retrieve (default: 100)
   * @returns {Promise<any[]>} Array of recent charger data points
   */
  public async getRecentData(limit: number = 100): Promise<any[]> {
    return await this.database.getRecentData(limit);
  }

  /**
   * Retrieves the latest Zaptec data entry
   * @returns {Promise<any | null>} Latest charger data point or null if none found
   */
  public async getLatestData(): Promise<any | null> {
    return await this.database.getLatestData();
  }

  /**
   * Calculates daily charging statistics for a given date
   * @param {Date} date - Date to calculate statistics for
   * @returns {Promise<any>} Daily charging statistics
   */
  public async getDailyStats(date: Date): Promise<any> {
    return await this.database.getDailyStats(date);
  }

  /**
   * Retrieves Zaptec data within a specific time range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<any[]>} Array of data points in time range
   */
  public async getDataInTimeRange(startDate: Date, endDate: Date): Promise<any[]> {
    return await this.database.getDataInTimeRange(startDate, endDate);
  }

  /**
   * Deletes old Zaptec data to manage storage space
   * @param {number} daysToKeep - Number of days of data to retain (default: 30)
   * @returns {Promise<number>} Number of deleted records
   */
  public async cleanupOldData(daysToKeep: number = 30): Promise<number> {
    return await this.database.cleanupOldData(daysToKeep);
  }
}
