import { Module } from '@nestjs/common';
import { ZaptecService } from './zaptec.service';
import { ZaptecController } from './zaptec.controller';
import { LoggingService } from '../common/logging.service';

@Module({
  providers: [ZaptecService, LoggingService],
  controllers: [ZaptecController],
  exports: [ZaptecService],
})
export class ZaptecModule {}
