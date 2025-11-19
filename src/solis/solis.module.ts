import { Module } from '@nestjs/common';
import { SolisService } from './solis.service';
import { LoggingService } from '../common/logging.service';
import { SolisDataService } from './solis-data.service';

@Module({
  imports: [],
  providers: [SolisService, LoggingService, SolisDataService],
  exports: [SolisService, SolisDataService],
})
export class SolisModule {}
