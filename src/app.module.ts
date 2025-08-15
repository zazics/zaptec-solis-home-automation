import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
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
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI', 'mongodb://localhost:27017/solis-automation'),
      }),
      inject: [ConfigService],
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