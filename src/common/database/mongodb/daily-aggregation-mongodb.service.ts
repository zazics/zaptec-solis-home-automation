/**
 * MongoDB implementation for daily aggregation data storage
 * Handles saving, updating, and retrieving daily aggregated data
 */

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DailyAggregation, DailyAggregationDocument } from '../../schemas/daily-aggregation.schema';
import { IDailyAggregationDatabase } from '../interfaces/daily-aggregation-database.interface';

@Injectable()
export class DailyAggregationMongoDBService implements IDailyAggregationDatabase {
  constructor(
    @InjectModel(DailyAggregation.name)
    private readonly dailyAggregationModel: Model<DailyAggregationDocument>
  ) {}

  /**
   * Saves or updates daily aggregation data in MongoDB
   * @param {Date} date - Date for the aggregation
   * @param {Partial<DailyAggregation>} aggregation - Daily aggregation data
   * @returns {Promise<DailyAggregationDocument>} Saved or updated document
   */
  public async findOneAndUpdate(date: Date, aggregation: Partial<DailyAggregation>): Promise<DailyAggregationDocument> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);

    return await this.dailyAggregationModel.findOneAndUpdate(
      { date: startDate },
      aggregation,
      { upsert: true, new: true }
    );
  }

  /**
   * Finds existing daily aggregation for a specific date
   * @param {Date} date - Date for the aggregation
   * @returns {Promise<DailyAggregationDocument | null>} Existing aggregation or null
   */
  public async findOne(date: Date): Promise<DailyAggregationDocument | null> {
    return await this.dailyAggregationModel.findOne({ date }).exec();
  }

  /**
   * Get aggregated data for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<DailyAggregationDocument[]>} Array of daily aggregations
   */
  public async getAggregatedData(startDate: Date, endDate: Date): Promise<DailyAggregationDocument[]> {
    return await this.dailyAggregationModel
      .find({
        date: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .sort({ date: 1 })
      .exec();
  }

  /**
   * Get aggregated data for specific dates
   * @param {Date[]} dates - Array of dates
   * @returns {Promise<DailyAggregationDocument[]>} Array of daily aggregations
   */
  public async getAggregatedDataForDates(dates: Date[]): Promise<DailyAggregationDocument[]> {
    const startDates = dates.map((date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d;
    });

    return await this.dailyAggregationModel
      .find({
        date: { $in: startDates }
      })
      .sort({ date: 1 })
      .exec();
  }
}
