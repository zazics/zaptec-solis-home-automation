import { Controller, Get, Post, Put, Body, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { HomeAutomationService } from './home-automation.service';
import {
  AutomationActionResponse,
  AutomationConfig,
  AutomationStatus,
  ConfigUpdateResponse,
  DashboardResponse
} from './models/home-automation.model';

/**
 * Controller for managing home automation system
 * Provides REST API endpoints for controlling and monitoring the automation logic
 * that coordinates between solar production and EV charging
 */
@Controller('automation')
export class HomeAutomationController {
  @Inject(HomeAutomationService)
  private readonly homeAutomationService: HomeAutomationService;

  constructor() {}

  /**
   * Retrieves the current status of the automation system
   * @returns {Promise<AutomationStatus>} Current automation status including solar production, consumption, and charging state
   */
  @Get('status')
  public async getStatus(): Promise<AutomationStatus> {
    try {
      return await this.homeAutomationService.getAutomationStatus();
    } catch (error) {
      throw new HttpException('Failed to get automation status', HttpStatus.SERVICE_UNAVAILABLE);
    }
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

      if (config.mode !== undefined && !['surplus', 'manual'].includes(config.mode)) {
        throw new HttpException('mode must be one of: surplus, manual', HttpStatus.BAD_REQUEST);
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
   * Manually triggers a single automation cycle
   * @returns {Promise<AutomationActionResponse>} Operation result with success status and message
   */
  @Post('run')
  public async runManualAutomation(): Promise<AutomationActionResponse> {
    try {
      await this.homeAutomationService.runManualAutomation();
      return {
        success: true,
        message: 'Manual automation cycle executed',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException('Failed to run manual automation', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * Retrieves comprehensive dashboard data including status, config, and summary metrics
   * @returns {Promise<DashboardResponse>} Complete dashboard data with efficiency metrics and system overview
   */
  @Get('dashboard')
  public async getDashboard(): Promise<DashboardResponse> {
    try {
      const status = await this.homeAutomationService.getAutomationStatus();
      const config = this.homeAutomationService.getConfig();

      return {
        status,
        config,
        summary: {
          systemStatus: status.enabled ? 'active' : 'inactive',
          currentMode: config.mode,
          solarEfficiency:
            status.solarProduction > 0 ? Math.round((status.availableForCharging / status.solarProduction) * 100) : 0,
          chargingEfficiency: status.chargingStatus.active
            ? Math.round((status.chargingStatus.power / status.availableForCharging) * 100)
            : 0
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new HttpException('Failed to get dashboard data', HttpStatus.SERVICE_UNAVAILABLE);
    }
  }
}
