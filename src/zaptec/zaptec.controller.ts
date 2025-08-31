import { Controller, Get, HttpException, HttpStatus, Query, Inject } from '@nestjs/common';
import { ZaptecService } from './zaptec.service';
import { ApiResponse, ZaptecStatus } from './models/zaptec.model';

/**
 * Controller for managing Zaptec EV charging station operations
 * Provides REST API endpoints for controlling and monitoring the charging station
 */
@Controller('zaptec')
export class ZaptecController {
  @Inject(ZaptecService)
  private readonly zaptecService: ZaptecService;

  constructor() {}

  /**
   * Retrieves the current status of the Zaptec charging station
   * @returns {Promise<ZaptecStatus>} Current charger status including power, current, and connection state
   */
  @Get('status')
  public async getStatus(): Promise<ZaptecStatus> {
    try {
      return await this.zaptecService.getChargerStatus();
    } catch (error) {
      throw new HttpException('Failed to get charger status', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }


  /**
   * Retrieves charging history for the specified number of days
   * @param {string} days - Number of days to retrieve (1-30, defaults to 7)
   * @returns {Promise<any[]>} Array of charging session data
   */
  @Get('history')
  public async getHistory(@Query('days') days: string = '7'): Promise<any[]> {
    const numDays = parseInt(days, 10);
    if (isNaN(numDays) || numDays < 1 || numDays > 30) {
      throw new HttpException('Invalid days parameter. Must be between 1 and 30.', HttpStatus.BAD_REQUEST);
    }

    try {
      return await this.zaptecService.getChargingHistory(numDays);
    } catch (error) {
      throw new HttpException('Failed to get charging history', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Tests connectivity to the Zaptec API
   * @returns {Promise<{connected: boolean, timestamp: string}>} Connection test result
   */
  @Get('test')
  public async testConnection(): Promise<{ connected: boolean; timestamp: string }> {
    try {
      const isConnected = await this.zaptecService.testConnection();
      return {
        connected: isConnected,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException('Connection test failed', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
