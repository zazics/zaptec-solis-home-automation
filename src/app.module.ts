import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SolisModule } from './solis/solis.module';
import { ZaptecModule } from './zaptec/zaptec.module';
import { HomeAutomationModule } from './home-automation/home-automation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    SolisModule,
    ZaptecModule,
    HomeAutomationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}