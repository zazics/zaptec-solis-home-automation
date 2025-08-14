import { Module } from '@nestjs/common';
import { SolisService } from './solis.service';
import { SolisController } from './solis.controller';

@Module({
  providers: [SolisService],
  controllers: [SolisController],
  exports: [SolisService],
})
export class SolisModule {}