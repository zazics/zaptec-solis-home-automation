import { Module } from '@nestjs/common';
import { HomeAutomationService } from './home-automation.service';
import { HomeAutomationController } from './home-automation.controller';
import { SolisModule } from '../solis/solis.module';
import { ZaptecModule } from '../zaptec/zaptec.module';

@Module({
  imports: [SolisModule, ZaptecModule],
  providers: [HomeAutomationService],
  controllers: [HomeAutomationController],
})
export class HomeAutomationModule {}