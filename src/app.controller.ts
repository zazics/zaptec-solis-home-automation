import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  public getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  public getHealth(): any {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Zaptec-Solis Home Automation',
    };
  }
}
