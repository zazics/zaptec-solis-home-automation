import { Injectable } from '@nestjs/common';
import { ZaptecService } from './zaptec/zaptec.service';
import { LoggingService } from './common/logging.service';

@Injectable()
export class AppService {
  private readonly context = AppService.name;

  /**
   * Constructor
   */
  constructor(
    private zaptecService: ZaptecService,
    private readonly logger: LoggingService,
  ) {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    //const zaptecStatus = await this.zaptecService.getChargerStatus();
    //await this.zaptecService.setMaxCurrent(6);
    //this.logger.log('AppService initialized with Zaptec status', this.context);
  }

  public getHello(): string {
    return 'Zaptec-Solis Home Automation API';
  }
}
