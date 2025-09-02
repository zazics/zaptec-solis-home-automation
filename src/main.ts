// Load environment variables before anything else
import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { Constants } from './constants';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Debug environment variable
  logger.debug(`Environment PORT variable: ${process.env.PORT}`);
  logger.debug(`Constants.SERVER.PORT: ${Constants.SERVER.PORT}`);
  
  const port = Constants.SERVER.PORT || 3000;
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();
