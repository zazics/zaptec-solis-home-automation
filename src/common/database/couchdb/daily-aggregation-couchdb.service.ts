/**
 * CouchDB implementation for daily aggregation data storage
 * Handles saving, updating, and retrieving daily aggregated data using CouchDB
 */

import { Injectable, Inject } from '@nestjs/common';
import * as Nano from 'nano';
import { DailyAggregation } from '../../schemas/daily-aggregation.schema';
import { IDailyAggregationDatabase } from '../interfaces/daily-aggregation-database.interface';

interface DailyAggregationDocument extends Partial<DailyAggregation> {
  _id?: string;
  _rev?: string;
  type: 'daily-aggregation';
}

@Injectable()
export class DailyAggregationCouchDBService implements IDailyAggregationDatabase {
  private db: Nano.DocumentScope<DailyAggregationDocument>;

  constructor(
    @Inject('COUCHDB_CONNECTION') private readonly nano: Nano.ServerScope
  ) {
    this.db = this.nano.use<DailyAggregationDocument>('daily_aggregations');
  }

  /**
   * Saves or updates daily aggregation data in CouchDB
   * @param {Date} date - Date for the aggregation
   * @param {Partial<DailyAggregation>} aggregation - Daily aggregation data
   * @returns {Promise<any>} Saved or updated document
   */
  public async findOneAndUpdate(date: Date, aggregation: Partial<DailyAggregation>): Promise<any> {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const dateStr = startDate.toISOString().split('T')[0];
    const docId = `daily-${dateStr}`;

    try {
      // Try to get existing document
      const existingDoc = await this.db.get(docId);
      const updatedDoc: DailyAggregationDocument = {
        ...existingDoc,
        ...aggregation,
        type: 'daily-aggregation'
      };
      const response = await this.db.insert(updatedDoc);
      return { ...updatedDoc, _id: response.id, _rev: response.rev };
    } catch (error) {
      if (error.statusCode === 404) {
        // Document doesn't exist, create new one
        const newDoc: DailyAggregationDocument = {
          _id: docId,
          ...aggregation,
          type: 'daily-aggregation'
        };
        const response = await this.db.insert(newDoc);
        return { ...newDoc, _id: response.id, _rev: response.rev };
      }
      throw error;
    }
  }

  /**
   * Finds existing daily aggregation for a specific date
   * @param {Date} date - Date for the aggregation
   * @returns {Promise<any | null>} Existing aggregation or null
   */
  public async findOne(date: Date): Promise<any | null> {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const docId = `daily-${dateStr}`;
      const doc = await this.db.get(docId);
      return doc;
    } catch (error) {
      if (error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get aggregated data for a date range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<any[]>} Array of daily aggregations
   */
  public async getAggregatedData(startDate: Date, endDate: Date): Promise<any[]> {
    const selector = {
      type: 'daily-aggregation',
      date: {
        $gte: startDate.toISOString(),
        $lte: endDate.toISOString()
      }
    };

    const response = await this.db.find({
      selector,
      sort: [{ date: 'asc' }]
    });

    return response.docs;
  }

  /**
   * Get aggregated data for specific dates
   * @param {Date[]} dates - Array of dates
   * @returns {Promise<any[]>} Array of daily aggregations
   */
  public async getAggregatedDataForDates(dates: Date[]): Promise<any[]> {
    const startDates = dates.map((date) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    });

    const selector = {
      type: 'daily-aggregation',
      date: { $in: startDates }
    };

    const response = await this.db.find({
      selector,
      sort: [{ date: 'asc' }]
    });

    return response.docs;
  }
}
