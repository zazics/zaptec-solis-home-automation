import { Controller, Get, Post, Put, Body, HttpException, HttpStatus, Inject, Query } from '@nestjs/common';
import { HomeAutomationService } from './home-automation.service';
import {
  AutomationActionResponse,
  AutomationConfig,
  ConfigUpdateResponse,
  SolisDailyStats,
  ZaptecDailyStats
} from './models/home-automation.model';
import {
  SolarProductionChartData,
  GridExchangeChartData,
  HouseConsumptionChartData,
  ZaptecConsumptionChartData,
  DashboardChartData,
  CHART_PERIODS,
  ChartPeriodOption
} from '../common/dto/chart-data.dto';
import { SolisDataService } from '../solis/solis-data.service';
import { ZaptecDataService } from '../zaptec/zaptec-data.service';
import { SolisData } from '../solis/schemas/solis-data.schema';
import { ZaptecData } from '../zaptec/schemas/zaptec-data.schema';
import { SolisDataDTO, ZaptecDataDTO } from '../common/dto/data.dto';

/**
 * Controller for managing home automation system
 * Provides REST API endpoints for controlling and monitoring the automation logic
 * that coordinates between solar production and EV charging
 */
@Controller('automation')
export class HomeAutomationController {
  @Inject(HomeAutomationService)
  private readonly homeAutomationService: HomeAutomationService;

  @Inject(SolisDataService)
  private readonly solisDataService: SolisDataService;

  @Inject(ZaptecDataService)
  private readonly zaptecDataService: ZaptecDataService;

  constructor() {}

  /**
   * Converts SolisData (database entity) to SolisDataDTO (DTO)
   * @param {SolisData} solisData - Database entity
   * @returns {SolisDataDTO} DTO for API response
   */
  private convertToSolisDataDTO(solisData: SolisData): SolisDataDTO {
    return {
      timestamp: solisData.timestamp,
      status: {
        code: solisData.statusCode,
        text: solisData.statusText
      },
      pv: solisData.pv,
      ac: solisData.ac,
      house: solisData.house,
      grid: solisData.grid,
      battery: solisData.battery
    };
  }

  /**
   * Converts ZaptecData (database entity) to ZaptecDataDTO (DTO)
   * @param {ZaptecData} zaptecData - Database entity
   * @returns {ZaptecDataDTO} DTO for API response
   */
  private convertToZaptecDataDTO(zaptecData: ZaptecData): ZaptecDataDTO {
    return {
      id: zaptecData.id,
      name: zaptecData.name,
      online: zaptecData.online,
      charging: zaptecData.charging,
      power: zaptecData.power,
      totalPower: zaptecData.totalPower,
      ChargeCurrentSet: zaptecData.ChargeCurrentSet,
      vehicleConnected: zaptecData.vehicleConnected,
      operatingMode: zaptecData.operatingMode,
      deviceType: zaptecData.deviceType,
      serialNo: zaptecData.serialNo
    };
  }

  /**
   * Retrieves the current automation configuration
   * @returns {Promise<AutomationConfig>} Current automation settings and parameters
   */
  @Get('config')
  public async getConfig(): Promise<AutomationConfig> {
    try {
      return this.homeAutomationService.getConfig();
    } catch (error) {
      throw new HttpException('Failed to get automation config', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Updates the automation configuration with new settings
   * @param {Partial<AutomationConfig>} config - Partial configuration object with settings to update
   * @returns {Promise<ConfigUpdateResponse>} Updated configuration and operation result
   */
  @Put('config')
  public async updateConfig(@Body() config: Partial<AutomationConfig>): Promise<ConfigUpdateResponse> {
    try {
      // Validation basique
      if (config.maxChargingPower !== undefined && config.maxChargingPower < 0) {
        throw new HttpException('maxChargingPower must be positive', HttpStatus.BAD_REQUEST);
      }

      if (config.mode !== undefined && !['surplus', 'manual', 'minimum', 'force_minimum'].includes(config.mode)) {
        throw new HttpException('mode must be one of: surplus, manual, minimum, force_minimum', HttpStatus.BAD_REQUEST);
      }

      const updatedConfig = await this.homeAutomationService.updateConfig(config);

      return {
        success: true,
        config: updatedConfig,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to update automation config', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Enables the automation system
   * @returns {Promise<AutomationActionResponse>} Operation result with success status and message
   */
  @Post('enable')
  public async enableAutomation(): Promise<AutomationActionResponse> {
    try {
      await this.homeAutomationService.setAutomationEnabled(true);
      return {
        success: true,
        message: 'Automation enabled',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException('Failed to enable automation', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Disables the automation system
   * @returns {Promise<AutomationActionResponse>} Operation result with success status and message
   */
  @Post('disable')
  public async disableAutomation(): Promise<AutomationActionResponse> {
    try {
      await this.homeAutomationService.setAutomationEnabled(false);
      return {
        success: true,
        message: 'Automation disabled',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException('Failed to disable automation', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves recent solar inverter data from database
   * @param {string} limit - Number of records to retrieve (default: 100, max: 1000)
   * @returns {Promise<SolisDataDTO[]>} Array of historical solar data points
   */
  @Get('solis/history')
  public async getSolisHistory(@Query('limit') limit: string = '100'): Promise<SolisDataDTO[]> {
    try {
      const numLimit = parseInt(limit, 10);
      if (isNaN(numLimit) || numLimit < 1 || numLimit > 1000) {
        throw new HttpException('Invalid limit parameter. Must be between 1 and 1000.', HttpStatus.BAD_REQUEST);
      }

      const dbData = await this.solisDataService.getRecentData(numLimit);
      return dbData.map((data) => this.convertToSolisDataDTO(data));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get solar history data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves complete solar inverter data from database (latest entry)
   * @returns {Promise<SolisDataDTO>} Latest complete solar data including PV, AC, house, grid, and battery
   */
  @Get('solis/latest')
  public async getLatestSolisData(): Promise<SolisDataDTO> {
    try {
      const latestData = await this.solisDataService.getRecentData(1);
      if (latestData.length === 0) {
        throw new HttpException('No solar data available', HttpStatus.NOT_FOUND);
      }
      return this.convertToSolisDataDTO(latestData[0]);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get latest solar data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves daily solar statistics for a specific date
   * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
   * @returns {Promise<SolisDailyStats>} Daily energy statistics
   */
  @Get('solis/stats/daily')
  public async getSolisDailyStats(@Query('date') date?: string): Promise<SolisDailyStats> {
    try {
      let targetDate = new Date();

      if (date) {
        targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
          throw new HttpException('Invalid date format. Use YYYY-MM-DD.', HttpStatus.BAD_REQUEST);
        }
      }

      return await this.solisDataService.getDailyStats(targetDate);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get daily solar statistics', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves latest Zaptec charger status from database
   * @returns {Promise<ZaptecDataDTO>} Current charger status including power, current, and connection state
   */
  @Get('zaptec/status')
  public async getZaptecStatus(): Promise<ZaptecDataDTO> {
    try {
      const latestData = await this.zaptecDataService.getLatestData();
      if (!latestData) {
        throw new HttpException('No charger data available', HttpStatus.NOT_FOUND);
      }
      return this.convertToZaptecDataDTO(latestData);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get charger status', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves recent Zaptec charger data from database
   * @param {string} limit - Number of records to retrieve (default: 100, max: 1000)
   * @returns {Promise<ZaptecDataDTO[]>} Array of historical charger data points
   */
  @Get('zaptec/history')
  public async getZaptecHistory(@Query('limit') limit: string = '100'): Promise<ZaptecDataDTO[]> {
    try {
      const numLimit = parseInt(limit, 10);
      if (isNaN(numLimit) || numLimit < 1 || numLimit > 1000) {
        throw new HttpException('Invalid limit parameter. Must be between 1 and 1000.', HttpStatus.BAD_REQUEST);
      }

      const dbData = await this.zaptecDataService.getRecentData(numLimit);
      return dbData.map((data) => this.convertToZaptecDataDTO(data));
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get charger history data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves daily Zaptec charging statistics for a specific date
   * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
   * @returns {Promise<ZaptecDailyStats>} Daily charging statistics
   */
  @Get('zaptec/stats/daily')
  public async getZaptecDailyStats(@Query('date') date?: string): Promise<ZaptecDailyStats> {
    try {
      let targetDate = new Date();

      if (date) {
        targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
          throw new HttpException('Invalid date format. Use YYYY-MM-DD.', HttpStatus.BAD_REQUEST);
        }
      }

      return await this.zaptecDataService.getDailyStats(targetDate);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get daily charging statistics', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves available chart periods for frontend selection
   * @returns {Array} List of available chart period configurations
   */
  @Get('charts/periods')
  public getChartPeriods(): ChartPeriodOption[] {
    return CHART_PERIODS;
  }

  /**
   * Retrieves solar production chart data for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<SolarProductionChartData>} Solar production data aggregated by period
   */
  @Get('charts/solar-production')
  public async getSolarProductionChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<SolarProductionChartData> {
    try {
      return await this.homeAutomationService.getSolarProductionChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get solar production chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves grid exchange chart data (import/export) for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<GridExchangeChartData>} Grid import/export data aggregated by period
   */
  @Get('charts/grid-exchange')
  public async getGridExchangeChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<GridExchangeChartData> {
    try {
      return await this.homeAutomationService.getGridExchangeChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get grid exchange chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves house consumption chart data for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<HouseConsumptionChartData>} House consumption data aggregated by period
   */
  @Get('charts/house-consumption')
  public async getHouseConsumptionChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<HouseConsumptionChartData> {
    try {
      return await this.homeAutomationService.getHouseConsumptionChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get house consumption chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves Zaptec charger consumption chart data for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<ZaptecConsumptionChartData>} Zaptec consumption data aggregated by period
   */
  @Get('charts/zaptec-consumption')
  public async getZaptecConsumptionChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<ZaptecConsumptionChartData> {
    try {
      return await this.homeAutomationService.getZaptecConsumptionChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get Zaptec consumption chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves combined dashboard chart data for specified period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {Promise<DashboardChartData>} Combined chart data for dashboard view
   */
  @Get('charts/dashboard')
  public async getDashboardChart(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ): Promise<DashboardChartData> {
    try {
      return await this.homeAutomationService.getDashboardChart(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get dashboard chart data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Debug endpoint to check data count for a specific period
   * @param {string} period - Chart period: day, week, month, year
   * @param {string} date - Optional specific date (YYYY-MM-DD format)
   * @returns {object} Data count information
   */
  @Get('charts/debug/count')
  public async getDataCount(
    @Query('period') period: 'day' | 'week' | 'month' | 'year' = 'day',
    @Query('date') date?: string
  ) {
    try {
      return await this.homeAutomationService.debugDataCount(period, date);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Failed to get data count', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
