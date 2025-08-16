import { Injectable } from '@nestjs/common';
import { ZaptecService } from './zaptec/zaptec.service';

@Injectable()
export class AppService {
  /**
   * Constructor
   */
  constructor(private zaptecService: ZaptecService) {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    const zaptecStatus = await this.zaptecService.getChargerStatus();
    console.info('AppService', zaptecStatus);
  }

  public getHello(): string {
    return 'Zaptec-Solis Home Automation API';
  }
}
