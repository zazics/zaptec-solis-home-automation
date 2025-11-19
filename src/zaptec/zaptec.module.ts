import { Module } from '@nestjs/common';
import { ZaptecService } from './zaptec.service';
import { ZaptecDataService } from './zaptec-data.service';
import { LoggingService } from '../common/logging.service';

@Module({
  imports: [],
  providers: [ZaptecService, ZaptecDataService, LoggingService],
  controllers: [],
  exports: [ZaptecService, ZaptecDataService],
})
export class ZaptecModule {}
