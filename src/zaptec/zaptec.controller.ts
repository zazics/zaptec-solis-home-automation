import { Controller, Get, Post, Body, HttpException, HttpStatus, Query } from '@nestjs/common';
import { ZaptecService } from './zaptec.service';

@Controller('zaptec')
export class ZaptecController {
  constructor(private readonly zaptecService: ZaptecService) {}

  @Get('status')
  async getStatus() {
    try {
      return await this.zaptecService.getChargerStatus();
    } catch (error) {
      throw new HttpException(
        'Failed to get charger status',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('current')
  async setMaxCurrent(@Body('maxCurrent') maxCurrent: number) {
    if (!maxCurrent || maxCurrent < 6 || maxCurrent > 32) {
      throw new HttpException(
        'Invalid current value. Must be between 6 and 32 amperes.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.zaptecService.setMaxCurrent(maxCurrent);
      return { 
        success: true, 
        message: `Max current set to ${maxCurrent}A`,
        timestamp: new Date().toISOString() 
      };
    } catch (error) {
      throw new HttpException(
        'Failed to set max current',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('charging')
  async setCharging(@Body('enabled') enabled: boolean) {
    if (typeof enabled !== 'boolean') {
      throw new HttpException(
        'Invalid enabled value. Must be boolean.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.zaptecService.setChargingEnabled(enabled);
      return { 
        success: true, 
        message: `Charging ${enabled ? 'enabled' : 'disabled'}`,
        timestamp: new Date().toISOString() 
      };
    } catch (error) {
      throw new HttpException(
        'Failed to set charging state',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('optimize')
  async optimizeCharging(@Body('availablePower') availablePower: number) {
    if (!availablePower || availablePower < 0) {
      throw new HttpException(
        'Invalid available power value. Must be positive number in watts.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await this.zaptecService.optimizeCharging(availablePower);
      return { 
        success: true, 
        message: `Charging optimized for ${availablePower}W`,
        timestamp: new Date().toISOString() 
      };
    } catch (error) {
      throw new HttpException(
        'Failed to optimize charging',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('history')
  async getHistory(@Query('days') days: string = '7') {
    const numDays = parseInt(days, 10);
    if (isNaN(numDays) || numDays < 1 || numDays > 30) {
      throw new HttpException(
        'Invalid days parameter. Must be between 1 and 30.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      return await this.zaptecService.getChargingHistory(numDays);
    } catch (error) {
      throw new HttpException(
        'Failed to get charging history',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('test')
  async testConnection() {
    try {
      const isConnected = await this.zaptecService.testConnection();
      return {
        connected: isConnected,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Connection test failed',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}