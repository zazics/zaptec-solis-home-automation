import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ZaptecModule } from './zaptec/zaptec.module';
import { HomeAutomationModule } from './home-automation/home-automation.module';
import { WeatherModule } from './weather/weather.module';
import { LoggingService } from './common/logging.service';
import { ApiKeyMiddleware } from './common/middleware/api-key.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI', 'mongodb://localhost:27017/solis-automation'),
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferMaxEntries: 0,
        retryWrites: true,
        retryReads: true,
        connectTimeoutMS: 10000
      }),
      inject: [ConfigService]
    }),
    ScheduleModule.forRoot(),
    ZaptecModule,
    HomeAutomationModule,
    WeatherModule
  ],
  controllers: [AppController],
  providers: [AppService, LoggingService]
})
export class AppModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    // Apply API key middleware to all routes except health check
    consumer.apply(ApiKeyMiddleware).exclude('health').forRoutes('*');
  }
}
