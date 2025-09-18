import { Module } from '@nestjs/common';
import { HomeAutomationService } from './home-automation.service';
import { HomeAutomationController } from './home-automation.controller';
import { SolisModule } from '../solis/solis.module';
import { ZaptecModule } from '../zaptec/zaptec.module';
import { LoggingService } from '../common/logging.service';
import { TapoModule } from '../tapo/tapo.module';
import { ChartModule } from '../chart/chart.module';

@Module({
  imports: [
    SolisModule,
    ZaptecModule,
    TapoModule,
    ChartModule
  ],
  providers: [HomeAutomationService, LoggingService],
  controllers: [HomeAutomationController],
  exports: [HomeAutomationService]
})
export class HomeAutomationModule {}
