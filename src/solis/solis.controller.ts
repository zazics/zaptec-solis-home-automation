import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { SolisService } from './solis.service';

@Controller('solis')
export class SolisController {
  constructor(private readonly solisService: SolisService) {}

  @Get('status')
  async getStatus() {
    try {
      return await this.solisService.getStatus();
    } catch (error) {
      throw new HttpException(
        'Failed to get inverter status',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('pv')
  async getPVData() {
    try {
      return await this.solisService.getPVData();
    } catch (error) {
      throw new HttpException(
        'Failed to get PV data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('ac')
  async getACData() {
    try {
      return await this.solisService.getACData();
    } catch (error) {
      throw new HttpException(
        'Failed to get AC data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('house')
  async getHouseData() {
    try {
      return await this.solisService.getHouseData();
    } catch (error) {
      throw new HttpException(
        'Failed to get house data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('grid')
  async getGridData() {
    try {
      return await this.solisService.getGridData();
    } catch (error) {
      throw new HttpException(
        'Failed to get grid data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('battery')
  async getBatteryData() {
    try {
      return await this.solisService.getBatteryData();
    } catch (error) {
      throw new HttpException(
        'Failed to get battery data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('all')
  async getAllData() {
    try {
      return await this.solisService.getAllData();
    } catch (error) {
      throw new HttpException(
        'Failed to get all inverter data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('test')
  async testConnection() {
    try {
      const isConnected = await this.solisService.testConnection();
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