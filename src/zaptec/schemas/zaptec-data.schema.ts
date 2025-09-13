import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ZaptecDataDocument = ZaptecData & Document;

@Schema({ timestamps: true })
export class ZaptecData {
  @Prop()
  public timestamp: Date;

  @Prop()
  public id: string;

  @Prop()
  public name: string;

  @Prop()
  public online: boolean;

  @Prop()
  public charging: boolean;

  @Prop()
  public power: number; // Watts

  @Prop()
  public totalPower: number; // W

  @Prop()
  public ChargeCurrentSet: number; // A

  @Prop()
  public vehicleConnected: boolean;

  @Prop()
  public operatingMode: string; // ChargerOperationMode

  @Prop()
  public deviceType: number;

  @Prop()
  public serialNo: string;
}

export const ZaptecDataSchema = SchemaFactory.createForClass(ZaptecData);
