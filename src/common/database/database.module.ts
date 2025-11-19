/**
 * Database module that provides database abstraction layer
 * Allows switching between MongoDB and CouchDB based on configuration
 */

import { Module, Global, DynamicModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import Nano from 'nano';

import { DATABASE_TOKENS, DatabaseType } from './database.constants';

// MongoDB implementations
import { SolisMongoDBService } from './mongodb/solis-mongodb.service';
import { ZaptecMongoDBService } from './mongodb/zaptec-mongodb.service';
import { HourlyAggregationMongoDBService } from './mongodb/hourly-aggregation-mongodb.service';
import { DailyAggregationMongoDBService } from './mongodb/daily-aggregation-mongodb.service';

// CouchDB implementations
import { SolisCouchDBService } from './couchdb/solis-couchdb.service';
import { ZaptecCouchDBService } from './couchdb/zaptec-couchdb.service';
import { HourlyAggregationCouchDBService } from './couchdb/hourly-aggregation-couchdb.service';
import { DailyAggregationCouchDBService } from './couchdb/daily-aggregation-couchdb.service';

// Schemas
import { SolisData, SolisDataSchema } from '../../solis/schemas/solis-data.schema';
import { ZaptecData, ZaptecDataSchema } from '../../zaptec/schemas/zaptec-data.schema';
import { HourlyAggregation, HourlyAggregationSchema } from '../schemas/hourly-aggregation.schema';
import { DailyAggregation, DailyAggregationSchema } from '../schemas/daily-aggregation.schema';

// Logging service
import { LoggingService } from '../logging.service';

@Global()
@Module({})
export class DatabaseModule {
  /**
   * Creates a dynamic module based on the selected database type
   * @param {DatabaseType} databaseType - Type of database to use (mongodb or couchdb)
   * @param {any} options - Database connection options
   * @returns {DynamicModule} Configured database module
   */
  public static forRoot(databaseType: DatabaseType, options?: any): DynamicModule {
    const providers = [];
    const imports = [];

    if (databaseType === DatabaseType.MONGODB) {
      // MongoDB setup
      imports.push(
        MongooseModule.forFeature([
          { name: SolisData.name, schema: SolisDataSchema },
          { name: ZaptecData.name, schema: ZaptecDataSchema },
          { name: HourlyAggregation.name, schema: HourlyAggregationSchema },
          { name: DailyAggregation.name, schema: DailyAggregationSchema }
        ])
      );

      providers.push(
        {
          provide: DATABASE_TOKENS.SOLIS_DATABASE,
          useClass: SolisMongoDBService
        },
        {
          provide: DATABASE_TOKENS.ZAPTEC_DATABASE,
          useClass: ZaptecMongoDBService
        },
        {
          provide: DATABASE_TOKENS.HOURLY_AGGREGATION_DATABASE,
          useClass: HourlyAggregationMongoDBService
        },
        {
          provide: DATABASE_TOKENS.DAILY_AGGREGATION_DATABASE,
          useClass: DailyAggregationMongoDBService
        }
      );
    } else if (databaseType === DatabaseType.COUCHDB) {
      // CouchDB setup
      const couchdbUrl = options?.url || 'http://localhost:5984';
      const nano = Nano(couchdbUrl);

      providers.push(
        {
          provide: 'COUCHDB_CONNECTION',
          useValue: nano
        },
        {
          provide: DATABASE_TOKENS.SOLIS_DATABASE,
          useClass: SolisCouchDBService
        },
        {
          provide: DATABASE_TOKENS.ZAPTEC_DATABASE,
          useClass: ZaptecCouchDBService
        },
        {
          provide: DATABASE_TOKENS.HOURLY_AGGREGATION_DATABASE,
          useClass: HourlyAggregationCouchDBService
        },
        {
          provide: DATABASE_TOKENS.DAILY_AGGREGATION_DATABASE,
          useClass: DailyAggregationCouchDBService
        }
      );
    }

    return {
      module: DatabaseModule,
      imports,
      providers: [...providers, LoggingService],
      exports: [
        DATABASE_TOKENS.SOLIS_DATABASE,
        DATABASE_TOKENS.ZAPTEC_DATABASE,
        DATABASE_TOKENS.HOURLY_AGGREGATION_DATABASE,
        DATABASE_TOKENS.DAILY_AGGREGATION_DATABASE
      ]
    };
  }
}
