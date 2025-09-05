/**
 * Schema for storing pre-aggregated daily data
 * This data is calculated nightly to optimize chart performance
 */

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type DailyAggregationDocument = DailyAggregation & Document;

@Schema({ 
  timestamps: true,
  collection: 'daily_aggregations'
})
export class DailyAggregation {
  @Prop({ required: true, type: Date, index: true })
  public date: Date; // Date of the aggregation (YYYY-MM-DD format)

  // Solar production data
  @Prop({ required: true, type: Object })
  public solarProduction: {
    totalEnergyKwh: number; // Total energy produced during the day
    maxPowerW: number; // Peak power during the day
    avgPowerW: number; // Average power during daylight hours
  };

  // House consumption data
  @Prop({ required: true, type: Object })
  public houseConsumption: {
    totalEnergyKwh: number; // Total energy consumed during the day
    maxPowerW: number; // Peak consumption
    avgPowerW: number; // Average consumption
  };

  // Grid exchange data
  @Prop({ required: true, type: Object })
  public gridExchange: {
    importedEnergyKwh: number; // Total energy imported from grid
    exportedEnergyKwh: number; // Total energy exported to grid
    maxImportW: number; // Peak import power
    maxExportW: number; // Peak export power
  };

  // Zaptec charging data
  @Prop({ required: true, type: Object })
  public zaptecConsumption: {
    totalEnergyKwh: number; // Total energy used for charging
    chargingTimeHours: number; // Total hours of charging
    maxPowerW: number; // Peak charging power
  };

  // Battery data
  @Prop({ required: true, type: Object })
  public battery: {
    chargedEnergyKwh: number; // Energy stored in battery
    dischargedEnergyKwh: number; // Energy released from battery
    minSoc: number; // Minimum state of charge
    maxSoc: number; // Maximum state of charge
  };

  // Data quality indicators
  @Prop({ required: true, type: Object })
  public dataQuality: {
    solisDataPoints: number; // Number of Solis data points processed
    zaptecDataPoints: number; // Number of Zaptec data points processed
    dataGapMinutes: number; // Total minutes of missing data
    isComplete: boolean; // Whether the day has complete data
  };
}

export const DailyAggregationSchema = SchemaFactory.createForClass(DailyAggregation);

// Create compound index for efficient querying
DailyAggregationSchema.index({ date: 1 }, { unique: true });
DailyAggregationSchema.index({ 'dataQuality.isComplete': 1, date: 1 });