import { Controller, Get, Post, Body, HttpException, HttpStatus, Query } from '@nestjs/common';
import { ZaptecService } from './zaptec.service';
import { ApiResponse, ZaptecStatus } from './models/zaptec.model';

/**
 * Controller for managing Zaptec EV charging station operations
 * Provides REST API endpoints for controlling and monitoring the charging station
 */
@Controller('zaptec')
export class ZaptecController {
  constructor(private readonly zaptecService: ZaptecService) {}

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
   * Sets the maximum charging current for the Zaptec station
   * @param {number} maxCurrent - Maximum current in amperes (6-32A range)
   * @returns {Promise<{success: boolean, message: string, timestamp: string}>} Operation result
   */
  @Post('current')
  public async setMaxCurrent(@Body('maxCurrent') maxCurrent: number): Promise<ApiResponse> {
    if (!maxCurrent || maxCurrent < 6 || maxCurrent > 32) {
      throw new HttpException('Invalid current value. Must be between 6 and 32 amperes.', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.zaptecService.setMaxCurrent(maxCurrent);
      return {
        success: true,
        message: `Max current set to ${maxCurrent}A`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException('Failed to set max current', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Enables or disables charging on the Zaptec station
   * @param {boolean} enabled - True to enable charging, false to disable
   * @returns {Promise<{success: boolean, message: string, timestamp: string}>} Operation result
   */
  @Post('charging')
  public async setCharging(@Body('enabled') enabled: boolean): Promise<ApiResponse> {
    if (typeof enabled !== 'boolean') {
      throw new HttpException('Invalid enabled value. Must be boolean.', HttpStatus.BAD_REQUEST);
    }

    try {
      await this.zaptecService.setChargingEnabled(enabled);
      return {
        success: true,
        message: `Charging ${enabled ? 'enabled' : 'disabled'}`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException('Failed to set charging state', HttpStatus.SERVICE_UNAVAILABLE);
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
