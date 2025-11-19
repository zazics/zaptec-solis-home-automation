/**
 * Interface for Zaptec data database operations
 * Provides database-agnostic methods for storing and retrieving Zaptec charger data
 */

import { ZaptecStatus } from '../../../zaptec/models/zaptec.model';

export interface IZaptecDatabase {
  /**
   * Saves Zaptec charger data to the database
   * @param {ZaptecStatus} data - Complete charger status data to save
   * @returns {Promise<void>}
   */
  saveData(data: ZaptecStatus): Promise<void>;

  /**
   * Retrieves recent Zaptec data from the database
   * @param {number} limit - Maximum number of records to retrieve (default: 100)
   * @returns {Promise<any[]>} Array of recent charger data points
   */
  getRecentData(limit?: number): Promise<any[]>;

  /**
   * Retrieves the latest Zaptec data entry
   * @returns {Promise<any | null>} Latest charger data point or null if none found
   */
  getLatestData(): Promise<any | null>;

  /**
   * Calculates daily charging statistics for a given date
   * @param {Date} date - Date to calculate statistics for
   * @returns {Promise<any>} Daily charging statistics
   */
  getDailyStats(date: Date): Promise<any>;

  /**
   * Retrieves Zaptec data within a specific time range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<any[]>} Array of data points in time range
   */
  getDataInTimeRange(startDate: Date, endDate: Date): Promise<any[]>;

  /**
   * Deletes old Zaptec data to manage storage space
   * @param {number} daysToKeep - Number of days of data to retain (default: 30)
   * @returns {Promise<number>} Number of deleted records
   */
  cleanupOldData(daysToKeep?: number): Promise<number>;
}
