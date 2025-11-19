/**
 * Interface for daily aggregation database operations
 * Provides database-agnostic methods for storing and retrieving daily aggregated data
 */

import { DailyAggregation } from '../../schemas/daily-aggregation.schema';

export interface IDailyAggregationDatabase {
  /**
   * Saves or updates daily aggregation data in the database
   * @param {Date} date - Date for the aggregation
   * @param {Partial<DailyAggregation>} aggregation - Daily aggregation data
   * @returns {Promise<any>} Saved or updated document
   */
  findOneAndUpdate(date: Date, aggregation: Partial<DailyAggregation>): Promise<any>;

  /**
   * Finds existing daily aggregation for a specific date
   * @param {Date} date - Date for the aggregation
   * @returns {Promise<any | null>} Existing aggregation or null
   */
  findOne(date: Date): Promise<any | null>;

  /**
   * Get aggregated data for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<any[]>} Array of daily aggregations
   */
  getAggregatedData(startDate: Date, endDate: Date): Promise<any[]>;

  /**
   * Get aggregated data for specific dates
   * @param {Date[]} dates - Array of dates
   * @returns {Promise<any[]>} Array of daily aggregations
   */
  getAggregatedDataForDates(dates: Date[]): Promise<any[]>;
}
