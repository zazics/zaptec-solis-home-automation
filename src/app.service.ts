import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggingService } from './common/logging.service';
import { HomeAutomationService } from './home-automation/home-automation.service';

@Injectable()
export class AppService implements OnModuleInit {
  private readonly context = AppService.name;

  /**
   * Constructor
   */
  constructor(
    private readonly homeAutomationService: HomeAutomationService,
    private readonly logger: LoggingService
  ) {}

  /**
   * Called after all dependencies have been injected and modules initialized
   */
  public async onModuleInit(): Promise<void> {
    // await this.test();
  }

  private async test(): Promise<void> {
    try {
      /*const zaptecStatus = await this.zaptecService.getChargerStatus();
      await this.zaptecService.setMaxCurrent(6);
      this.logger.log('AppService initialized with Zaptec status', this.context);*/
      /*const solisData = await this.solisService.getAllData();
      await this.solisDataService.saveData(solisData);*/
      await this.homeAutomationService.runAutomation();
    } catch (error) {
      this.logger.error('Failed to test Zaptec service', error, this.context);
    }
  }

  public getHello(): string {
    return 'Zaptec-Solis Home Automation API';
  }
}
