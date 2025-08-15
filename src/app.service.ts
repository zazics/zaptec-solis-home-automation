import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  public getHello(): string {
    return 'Zaptec-Solis Home Automation API';
  }
}
