import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { SolisService, SolisPVData, SolisACData, SolisHouseData, SolisGridData, SolisBatteryData, SolisInverterData } from './solis.service';
import { SolisDataService } from './solis-data.service';

/**
 * Interface for connection test response
 */
export interface ConnectionTestResponse {
  connected: boolean;
  timestamp: string;
}

/**
 * Interface for inverter status response
 */
export interface InverterStatusResponse {
  code: number;
  text: string;
}

/**
 * Controller for managing Solis solar inverter operations
 * Provides REST API endpoints for retrieving inverter data via RS485/Modbus communication
 */
@Controller('solis')
export class SolisController {
  constructor(
    private readonly solisService: SolisService,
    private readonly solisDataService: SolisDataService,
  ) {}

  /**
   * Retrieves the current status of the Solis inverter
   * @returns {Promise<InverterStatusResponse>} Inverter status code and description
   */
  @Get('status')
  public async getStatus(): Promise<InverterStatusResponse> {
    try {
      return await this.solisService.getStatus();
    } catch (error) {
      throw new HttpException(
        'Failed to get inverter status',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Retrieves solar photovoltaic panel data
   * @returns {Promise<SolisPVData>} PV panel voltage, current, and power data for each string
   */
  @Get('pv')
  public async getPVData(): Promise<SolisPVData> {
    try {
      return await this.solisService.getPVData();
    } catch (error) {
      throw new HttpException(
        'Failed to get PV data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Retrieves AC power output data from the inverter
   * @returns {Promise<SolisACData>} AC power, frequency, and temperature data
   */
  @Get('ac')
  public async getACData(): Promise<SolisACData> {
    try {
      return await this.solisService.getACData();
    } catch (error) {
      throw new HttpException(
        'Failed to get AC data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Retrieves house consumption data
   * @returns {Promise<SolisHouseData>} House consumption and backup consumption data
   */
  @Get('house')
  public async getHouseData(): Promise<SolisHouseData> {
    try {
      return await this.solisService.getHouseData();
    } catch (error) {
      throw new HttpException(
        'Failed to get house data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Retrieves electrical grid interaction data
   * @returns {Promise<SolisGridData>} Grid power, inverter power, and energy import/export data
   */
  @Get('grid')
  public async getGridData(): Promise<SolisGridData> {
    try {
      return await this.solisService.getGridData();
    } catch (error) {
      throw new HttpException(
        'Failed to get grid data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Retrieves battery storage system data
   * @returns {Promise<SolisBatteryData>} Battery power, SOC, voltage, and current data
   */
  @Get('battery')
  public async getBatteryData(): Promise<SolisBatteryData> {
    try {
      return await this.solisService.getBatteryData();
    } catch (error) {
      throw new HttpException(
        'Failed to get battery data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Retrieves complete inverter data including all subsystems
   * @returns {Promise<SolisInverterData>} Complete dataset with PV, AC, house, grid, and battery data
   */
  @Get('all')
  public async getAllData(): Promise<SolisInverterData> {
    try {
      return await this.solisService.getAllData();
    } catch (error) {
      throw new HttpException(
        'Failed to get all inverter data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Tests the RS485 communication connection to the Solis inverter
   * @returns {Promise<ConnectionTestResponse>} Connection status and timestamp
   */
  @Get('test')
  public async testConnection(): Promise<ConnectionTestResponse> {
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

  /**
   * Retrieves recent historical data from MongoDB
   * @param {string} limit - Number of records to retrieve (default: 100)
   * @returns {Promise<any[]>} Array of historical data points
   */
  @Get('history')
  public async getHistory(@Query('limit') limit: string = '100'): Promise<any[]> {
    try {
      const numLimit = parseInt(limit, 10);
      if (isNaN(numLimit) || numLimit < 1 || numLimit > 1000) {
        throw new HttpException(
          'Invalid limit parameter. Must be between 1 and 1000.',
          HttpStatus.BAD_REQUEST,
        );
      }

      return await this.solisDataService.getRecentData(numLimit);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get historical data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Retrieves daily statistics for a specific date
   * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
   * @returns {Promise<any>} Daily energy statistics
   */
  @Get('stats/daily')
  public async getDailyStats(@Query('date') date?: string): Promise<any> {
    try {
      let targetDate = new Date();
      
      if (date) {
        targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
          throw new HttpException(
            'Invalid date format. Use YYYY-MM-DD.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      return await this.solisDataService.getDailyStats(targetDate);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to get daily statistics',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}