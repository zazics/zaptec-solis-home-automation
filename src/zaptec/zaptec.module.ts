import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ZaptecService } from './zaptec.service';
import { ZaptecDataService } from './zaptec-data.service';
import { ZaptecData, ZaptecDataSchema } from './schemas/zaptec-data.schema';
import { LoggingService } from '../common/logging.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ZaptecData.name, schema: ZaptecDataSchema }])
  ],
  providers: [ZaptecService, ZaptecDataService, LoggingService],
  controllers: [],
  exports: [ZaptecService, ZaptecDataService],
})
export class ZaptecModule {}
