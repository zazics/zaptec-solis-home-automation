/**
 * MongoDB implementation for hourly aggregation data storage
 * Handles saving, retrieving hourly aggregated data
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { HourlyAggregation, HourlyAggregationDocument } from '../../schemas/hourly-aggregation.schema';
import { IHourlyAggregationDatabase } from '../interfaces/hourly-aggregation-database.interface';

@Injectable()
export class HourlyAggregationMongoDBService implements IHourlyAggregationDatabase {
  constructor(
    @InjectModel(HourlyAggregation.name)
    private readonly hourlyAggregationModel: Model<HourlyAggregationDocument>
  ) {}

  /**
   * Saves hourly aggregation data to MongoDB
   * @param {Partial<HourlyAggregation>} aggregationData - Hourly aggregation data to save
   * @returns {Promise<HourlyAggregationDocument>} Saved document
   */
  public async save(aggregationData: Partial<HourlyAggregation>): Promise<HourlyAggregationDocument> {
    const aggregation = new this.hourlyAggregationModel(aggregationData);
    return await aggregation.save();
  }

  /**
   * Finds existing hourly aggregation for a specific date and hour
   * @param {Date} date - Date for the aggregation
   * @param {number} hour - Hour for the aggregation (0-23)
   * @returns {Promise<HourlyAggregationDocument | null>} Existing aggregation or null
   */
  public async findOne(date: Date, hour: number): Promise<HourlyAggregationDocument | null> {
    return await this.hourlyAggregationModel
      .findOne({
        date: new Date(date),
        hour
      })
      .exec();
  }

  /**
   * Deletes hourly aggregation for a specific date and hour
   * @param {Date} date - Date for the aggregation
   * @param {number} hour - Hour for the aggregation (0-23)
   * @returns {Promise<void>}
   */
  public async deleteOne(date: Date, hour: number): Promise<void> {
    await this.hourlyAggregationModel.deleteOne({ date: new Date(date), hour }).exec();
  }

  /**
   * Get aggregated data for a time range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<HourlyAggregationDocument[]>} Array of hourly aggregations
   */
  public async getAggregatedData(startDate: Date, endDate: Date): Promise<HourlyAggregationDocument[]> {
    return await this.hourlyAggregationModel
      .find({
        date: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .sort({ date: 1, hour: 1 })
      .exec();
  }
}
