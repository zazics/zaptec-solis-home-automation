import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SolisDataDocument = SolisData & Document;

/**
 * MongoDB schema for storing Solis inverter data
 * Stores all inverter data points with timestamp for historical analysis
 */
@Schema({ timestamps: true })
export class SolisData {
  @Prop({ required: true })
  public timestamp: Date;

  // Status information
  @Prop({ required: true })
  public statusCode: number;

  @Prop({ required: true })
  public statusText: string;

  // PV data
  @Prop({ type: Object, required: true })
  public pv: {
    pv1: {
      voltage: number;
      current: number;
      power: number;
    };
    pv2: {
      voltage: number;
      current: number;
      power: number;
    };
    totalPowerDC: number;
  };

  // AC data
  @Prop({ type: Object, required: true })
  public ac: {
    totalPowerAC: number;
    frequency: number;
    temperature: number;
  };

  // House consumption data
  @Prop({ type: Object, required: true })
  public house: {
    consumption: number;
    backupConsumption: number;
  };

  // Grid data
  @Prop({ type: Object, required: true })
  public grid: {
    activePower: number;
    inverterPower: number;
    importedEnergyTotal: number;
    exportedEnergyTotal: number;
  };

  // Battery data
  @Prop({ type: Object, required: true })
  public battery: {
    power: number;
    soc: number;
    voltage: number;
    current: number;
  };

  // Calculated values
  @Prop()
  public availableForCharging?: number;

  @Prop()
  public gridInjection?: number;

  @Prop()
  public gridConsumption?: number;
}

export const SolisDataSchema = SchemaFactory.createForClass(SolisData);
