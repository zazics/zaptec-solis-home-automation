import { Module } from '@nestjs/common';
import { SolisService } from './solis.service';
import { LoggingService } from '../common/logging.service';
import { SolisDataService } from './solis-data.service';
import { MongooseModule } from '@nestjs/mongoose';
import { SolisData, SolisDataSchema } from './schemas/solis-data.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: SolisData.name, schema: SolisDataSchema }])],
  providers: [SolisService, LoggingService, SolisDataService],
  exports: [SolisService, SolisDataService],
})
export class SolisModule {}
