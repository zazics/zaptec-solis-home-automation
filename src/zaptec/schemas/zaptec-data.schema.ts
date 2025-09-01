import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ZaptecDataDocument = ZaptecData & Document;

@Schema({ timestamps: true })
export class ZaptecData {
  @Prop()
  timestamp: Date;

  @Prop()
  id: string;

  @Prop()
  name: string;

  @Prop()
  online: boolean;

  @Prop()
  charging: boolean;

  @Prop()
  power: number; // Watts

  @Prop()
  totalPower: number; // W

  @Prop()
  ChargeCurrentSet: number; // A

  @Prop()
  vehicleConnected: boolean;

  @Prop()
  operatingMode: string; // ChargerOperationMode

  @Prop()
  deviceType: number;

  @Prop()
  serialNo: string;
}

export const ZaptecDataSchema = SchemaFactory.createForClass(ZaptecData);