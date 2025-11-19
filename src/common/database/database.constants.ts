/**
 * Dependency injection tokens for database services
 * These tokens are used to inject the appropriate database implementation
 */

export const DATABASE_TOKENS = {
  SOLIS_DATABASE: 'SOLIS_DATABASE',
  ZAPTEC_DATABASE: 'ZAPTEC_DATABASE',
  HOURLY_AGGREGATION_DATABASE: 'HOURLY_AGGREGATION_DATABASE',
  DAILY_AGGREGATION_DATABASE: 'DAILY_AGGREGATION_DATABASE',
} as const;

export enum DatabaseType {
  MONGODB = 'mongodb',
  COUCHDB = 'couchdb',
}
