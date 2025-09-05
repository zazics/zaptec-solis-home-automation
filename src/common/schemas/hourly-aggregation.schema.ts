import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HourlyAggregationDocument = HourlyAggregation & Document;

@Schema({ 
  timestamps: true,
  collection: 'hourly_aggregations'
})
export class HourlyAggregation {
  @Prop({ required: true, type: Date, index: true })
  public date: Date;

  @Prop({ required: true, type: Number, min: 0, max: 23 })
  public hour: number;

  // Solar production data
  @Prop({
    type: {
      totalEnergyKwh: { type: Number, required: true, min: 0 },
      maxPowerW: { type: Number, required: true, min: 0 },
      avgPowerW: { type: Number, required: true, min: 0 }
    },
    required: true
  })
  public solarProduction: {
    totalEnergyKwh: number;
    maxPowerW: number;
    avgPowerW: number;
  };

  // House consumption data
  @Prop({
    type: {
      totalEnergyKwh: { type: Number, required: true, min: 0 },
      maxPowerW: { type: Number, required: true, min: 0 },
      avgPowerW: { type: Number, required: true, min: 0 }
    },
    required: true
  })
  public houseConsumption: {
    totalEnergyKwh: number;
    maxPowerW: number;
    avgPowerW: number;
  };

  // Grid exchange data
  @Prop({
    type: {
      importedEnergyKwh: { type: Number, required: true, min: 0 },
      exportedEnergyKwh: { type: Number, required: true, min: 0 },
      maxImportW: { type: Number, required: true, min: 0 },
      maxExportW: { type: Number, required: true, min: 0 }
    },
    required: true
  })
  public gridExchange: {
    importedEnergyKwh: number;
    exportedEnergyKwh: number;
    maxImportW: number;
    maxExportW: number;
  };

  // Zaptec consumption data
  @Prop({
    type: {
      totalEnergyKwh: { type: Number, required: true, min: 0 },
      chargingTimeMinutes: { type: Number, required: true, min: 0, max: 60 },
      maxPowerW: { type: Number, required: true, min: 0 }
    },
    required: true
  })
  public zaptecConsumption: {
    totalEnergyKwh: number;
    chargingTimeMinutes: number;
    maxPowerW: number;
  };

  // Battery data
  @Prop({
    type: {
      chargedEnergyKwh: { type: Number, required: true, min: 0 },
      dischargedEnergyKwh: { type: Number, required: true, min: 0 },
      minSoc: { type: Number, required: true, min: 0, max: 100 },
      maxSoc: { type: Number, required: true, min: 0, max: 100 }
    },
    required: true
  })
  public battery: {
    chargedEnergyKwh: number;
    dischargedEnergyKwh: number;
    minSoc: number;
    maxSoc: number;
  };

  // Data quality assessment
  @Prop({
    type: {
      solisDataPoints: { type: Number, required: true, min: 0 },
      zaptecDataPoints: { type: Number, required: true, min: 0 },
      dataGapMinutes: { type: Number, required: true, min: 0, max: 60 },
      isComplete: { type: Boolean, required: true }
    },
    required: true
  })
  public dataQuality: {
    solisDataPoints: number;
    zaptecDataPoints: number;
    dataGapMinutes: number;
    isComplete: boolean;
  };
}

export const HourlyAggregationSchema = SchemaFactory.createForClass(HourlyAggregation);

// Indexes for efficient querying
HourlyAggregationSchema.index({ date: 1, hour: 1 }, { unique: true });
HourlyAggregationSchema.index({ date: 1 });
HourlyAggregationSchema.index({ 'dataQuality.isComplete': 1 });