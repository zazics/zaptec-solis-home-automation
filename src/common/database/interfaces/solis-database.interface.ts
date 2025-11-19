/**
 * Interface for Solis data database operations
 * Provides database-agnostic methods for storing and retrieving Solis inverter data
 */

import { SolisDataDTO } from '../../../solis/models/solis.model';

export interface ISolisDatabase {
  /**
   * Saves Solis inverter data to the database
   * @param {SolisDataDTO} data - Complete inverter data from Solis service
   * @returns {Promise<any>} Saved document
   */
  saveData(data: SolisDataDTO): Promise<any>;

  /**
   * Retrieves recent Solis data
   * @param {number} limit - Number of records to retrieve (default: 100)
   * @returns {Promise<any[]>} Array of recent data points
   */
  getRecentData(limit?: number): Promise<any[]>;

  /**
   * Retrieves Solis data within a date range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<any[]>} Array of data points in date range
   */
  getDataByDateRange(startDate: Date, endDate: Date): Promise<any[]>;

  /**
   * Retrieves daily energy statistics
   * @param {Date} date - Date to get statistics for (defaults to today)
   * @returns {Promise<any>} Daily energy statistics
   */
  getDailyStats(date?: Date): Promise<any>;

  /**
   * Retrieves Solis data within a time range
   * @param {Date} startDate - Start date for data retrieval
   * @param {Date} endDate - End date for data retrieval
   * @returns {Promise<any[]>} Array of data points in time range
   */
  getDataInTimeRange(startDate: Date, endDate: Date): Promise<any[]>;

  /**
   * Cleans up old data beyond retention period
   * @param {number} retentionDays - Number of days to retain data (default: 90)
   * @returns {Promise<number>} Number of deleted records
   */
  cleanupOldData(retentionDays?: number): Promise<number>;
}
