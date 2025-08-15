import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SolisService } from './solis.service';
import { SolisController } from './solis.controller';
import { SolisDataService } from './solis-data.service';
import { SolisData, SolisDataSchema } from './schemas/solis-data.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SolisData.name, schema: SolisDataSchema }]),
  ],
  providers: [SolisService, SolisDataService],
  controllers: [SolisController],
  exports: [SolisService, SolisDataService],
})
export class SolisModule {}