import { Module } from '@nestjs/common';
import { ZaptecService } from './zaptec.service';
import { ZaptecController } from './zaptec.controller';

@Module({
  providers: [ZaptecService],
  controllers: [ZaptecController],
  exports: [ZaptecService],
})
export class ZaptecModule {}