/**
 * CouchDB implementation for hourly aggregation data storage
 * Handles saving, retrieving hourly aggregated data using CouchDB
 */

import { Injectable, Inject } from '@nestjs/common';
import * as Nano from 'nano';
import { HourlyAggregation } from '../../schemas/hourly-aggregation.schema';
import { IHourlyAggregationDatabase } from '../interfaces/hourly-aggregation-database.interface';

interface HourlyAggregationDocument extends Partial<HourlyAggregation> {
  _id?: string;
  _rev?: string;
  type: 'hourly-aggregation';
}

@Injectable()
export class HourlyAggregationCouchDBService implements IHourlyAggregationDatabase {
  private db: Nano.DocumentScope<HourlyAggregationDocument>;

  constructor(
    @Inject('COUCHDB_CONNECTION') private readonly nano: Nano.ServerScope
  ) {
    this.db = this.nano.use<HourlyAggregationDocument>('hourly_aggregations');
  }

  /**
   * Saves hourly aggregation data to CouchDB
   * @param {Partial<HourlyAggregation>} aggregationData - Hourly aggregation data to save
   * @returns {Promise<any>} Saved document
   */
  public async save(aggregationData: Partial<HourlyAggregation>): Promise<any> {
    const dateStr = aggregationData.date.toISOString().split('T')[0];
    const doc: HourlyAggregationDocument = {
      _id: `hourly-${dateStr}-${aggregationData.hour}`,
      ...aggregationData,
      type: 'hourly-aggregation'
    };

    const response = await this.db.insert(doc);
    return { ...doc, _id: response.id, _rev: response.rev };
  }

  /**
   * Finds existing hourly aggregation for a specific date and hour
   * @param {Date} date - Date for the aggregation
   * @param {number} hour - Hour for the aggregation (0-23)
   * @returns {Promise<any | null>} Existing aggregation or null
   */
  public async findOne(date: Date, hour: number): Promise<any | null> {
    try {
      const dateStr = new Date(date).toISOString().split('T')[0];
      const docId = `hourly-${dateStr}-${hour}`;
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
   * Deletes hourly aggregation for a specific date and hour
   * @param {Date} date - Date for the aggregation
   * @param {number} hour - Hour for the aggregation (0-23)
   * @returns {Promise<void>}
   */
  public async deleteOne(date: Date, hour: number): Promise<void> {
    try {
      const dateStr = new Date(date).toISOString().split('T')[0];
      const docId = `hourly-${dateStr}-${hour}`;
      const doc = await this.db.get(docId);
      await this.db.destroy(docId, doc._rev);
    } catch (error) {
      if (error.statusCode !== 404) {
        throw error;
      }
    }
  }

  /**
   * Get aggregated data for a time range
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<any[]>} Array of hourly aggregations
   */
  public async getAggregatedData(startDate: Date, endDate: Date): Promise<any[]> {
    const selector = {
      type: 'hourly-aggregation',
      date: {
        $gte: startDate.toISOString(),
        $lte: endDate.toISOString()
      }
    };

    const response = await this.db.find({
      selector,
      sort: [{ date: 'asc' }, { hour: 'asc' }]
    });

    return response.docs;
  }
}
