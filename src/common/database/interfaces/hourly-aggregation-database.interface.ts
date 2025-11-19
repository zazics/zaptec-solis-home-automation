/**
 * Interface for hourly aggregation database operations
 * Provides database-agnostic methods for storing and retrieving hourly aggregated data
 */

import { HourlyAggregation } from '../../schemas/hourly-aggregation.schema';

export interface IHourlyAggregationDatabase {
  /**
   * Saves hourly aggregation data to the database
   * @param {Partial<HourlyAggregation>} aggregationData - Hourly aggregation data to save
   * @returns {Promise<any>} Saved document
   */
  save(aggregationData: Partial<HourlyAggregation>): Promise<any>;

  /**
   * Finds existing hourly aggregation for a specific date and hour
   * @param {Date} date - Date for the aggregation
   * @param {number} hour - Hour for the aggregation (0-23)
   * @returns {Promise<any | null>} Existing aggregation or null
   */
  findOne(date: Date, hour: number): Promise<any | null>;

  /**
   * Deletes hourly aggregation for a specific date and hour
   * @param {Date} date - Date for the aggregation
   * @param {number} hour - Hour for the aggregation (0-23)
   * @returns {Promise<void>}
   */
  deleteOne(date: Date, hour: number): Promise<void>;

  /**
   * Get aggregated data for a time range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<any[]>} Array of hourly aggregations
   */
  getAggregatedData(startDate: Date, endDate: Date): Promise<any[]>;
}
