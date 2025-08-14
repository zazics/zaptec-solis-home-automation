import { Controller, Get, Post, Put, Body, HttpException, HttpStatus } from '@nestjs/common';
import { HomeAutomationService, AutomationConfig } from './home-automation.service';

@Controller('automation')
export class HomeAutomationController {
  constructor(private readonly homeAutomationService: HomeAutomationService) {}

  @Get('status')
  async getStatus() {
    try {
      return await this.homeAutomationService.getAutomationStatus();
    } catch (error) {
      throw new HttpException(
        'Failed to get automation status',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('config')
  async getConfig() {
    try {
      return this.homeAutomationService.getConfig();
    } catch (error) {
      throw new HttpException(
        'Failed to get automation config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Put('config')
  async updateConfig(@Body() config: Partial<AutomationConfig>) {
    try {
      // Validation basique
      if (config.minSurplusPower !== undefined && config.minSurplusPower < 0) {
        throw new HttpException(
          'minSurplusPower must be positive',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (config.maxChargingPower !== undefined && config.maxChargingPower < 0) {
        throw new HttpException(
          'maxChargingPower must be positive',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (config.mode !== undefined && !['surplus', 'scheduled', 'manual'].includes(config.mode)) {
        throw new HttpException(
          'mode must be one of: surplus, scheduled, manual',
          HttpStatus.BAD_REQUEST,
        );
      }

      const updatedConfig = await this.homeAutomationService.updateConfig(config);
      
      return {
        success: true,
        config: updatedConfig,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to update automation config',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('enable')
  async enableAutomation() {
    try {
      await this.homeAutomationService.setAutomationEnabled(true);
      return {
        success: true,
        message: 'Automation enabled',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to enable automation',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('disable')
  async disableAutomation() {
    try {
      await this.homeAutomationService.setAutomationEnabled(false);
      return {
        success: true,
        message: 'Automation disabled',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to disable automation',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Post('run')
  async runManualAutomation() {
    try {
      await this.homeAutomationService.runManualAutomation();
      return {
        success: true,
        message: 'Manual automation cycle executed',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to run manual automation',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('dashboard')
  async getDashboard() {
    try {
      const status = await this.homeAutomationService.getAutomationStatus();
      const config = this.homeAutomationService.getConfig();

      return {
        status,
        config,
        summary: {
          systemStatus: status.enabled ? 'active' : 'inactive',
          currentMode: config.mode,
          solarEfficiency: status.solarProduction > 0 
            ? Math.round((status.availableForCharging / status.solarProduction) * 100) 
            : 0,
          chargingEfficiency: status.chargingStatus.active 
            ? Math.round((status.chargingStatus.power / status.availableForCharging) * 100) 
            : 0,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        'Failed to get dashboard data',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}