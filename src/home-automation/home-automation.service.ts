import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SolisService, SolisInverterData } from '../solis/solis.service';
import { SolisDataService } from '../solis/solis-data.service';
import { ZaptecService } from '../zaptec/zaptec.service';
import { ZaptecStatus } from '../zaptec/models/zaptec.model';

export interface AutomationStatus {
  enabled: boolean;
  lastUpdate: Date;
  solarProduction: number; // W
  houseConsumption: number; // W
  availableForCharging: number; // W
  chargingStatus: {
    active: boolean;
    current: number; // A
    power: number; // W
  };
  mode: 'surplus' | 'scheduled' | 'manual';
}

export interface AutomationConfig {
  enabled: boolean;
  mode: 'surplus' | 'scheduled' | 'manual';
  minSurplusPower: number; // Minimum surplus power to start charging (W)
  maxChargingPower: number; // Maximum charging power (W)
  scheduledHours: string[]; // Hours when charging is allowed (24h format)
  priorityLoadReserve: number; // Power to reserve for priority loads (W)
}

@Injectable()
export class HomeAutomationService {
  private readonly logger = new Logger(HomeAutomationService.name);

  private config: AutomationConfig;
  private lastAutomationRun: Date = new Date();
  private automationEnabled: boolean = true;

  constructor(
    private readonly configService: ConfigService,
    private readonly solisService: SolisService,
    private readonly solisDataService: SolisDataService,
    private readonly zaptecService: ZaptecService,
  ) {
    this.config = {
      enabled: this.configService.get<boolean>('AUTOMATION_ENABLED', true),
      mode: this.configService.get<'surplus' | 'scheduled' | 'manual'>('AUTOMATION_MODE', 'surplus'),
      minSurplusPower: this.configService.get<number>('MIN_SURPLUS_POWER', 500), // 500W minimum
      maxChargingPower: this.configService.get<number>('MAX_CHARGING_POWER', 7360), // 32A * 230V
      scheduledHours: this.configService.get<string>('SCHEDULED_HOURS', '10,11,12,13,14,15,16').split(','),
      priorityLoadReserve: this.configService.get<number>('PRIORITY_LOAD_RESERVE', 500), // 500W reserve
    };

    this.logger.log('Home automation service initialized with config:', this.config);
  }

  /**
   * Automated task that runs every minute to optimize charging
   */
  //  @Cron(CronExpression.EVERY_MINUTE)
  public async runAutomation(): Promise<void> {
    if (!this.config.enabled || !this.automationEnabled) {
      return;
    }

    try {
      this.logger.debug('Running automation cycle...');

      // Retrieve data from Solis inverter
      const solisData = await this.solisService.getAllData();

      // Store Solis data in MongoDB for historical analysis
      try {
        await this.solisDataService.saveData(solisData);
        this.logger.debug('Solis data saved to MongoDB');
      } catch (mongoError) {
        this.logger.warn('Failed to save Solis data to MongoDB:', mongoError);
        // Continue with automation even if MongoDB save fails
      }

      // Retrieve Zaptec charging station status
      const zaptecStatus = await this.zaptecService.getChargerStatus();

      // Calculate available power for charging
      const availablePower = this.calculateAvailablePower(solisData);

      // Execute automation logic according to mode
      await this.executeAutomationLogic(availablePower, solisData, zaptecStatus);

      this.lastAutomationRun = new Date();
    } catch (error) {
      this.logger.error('Automation cycle failed:', error);
    }
  }

  /**
   * Calculates available power for charging based on Solis data
   */
  private calculateAvailablePower(solisData: SolisInverterData): number {
    const solarProduction = solisData.pv.totalPowerDC;
    const houseConsumption = solisData.house.consumption;
    const gridPower = solisData.grid.activePower; // + = injection, - = consumption
    const batteryPower = solisData.battery.power; // + = discharge, - = charge

    // Calculate available surplus
    // If injecting to grid (gridPower > 0), this power can be used for charging
    let availablePower = 0;

    if (gridPower > 0) {
      // Injecting to grid, can use this power for charging
      availablePower = gridPower - this.config.priorityLoadReserve;
    } else if (solarProduction > houseConsumption) {
      // Production > consumption, surplus available
      availablePower = solarProduction - houseConsumption - this.config.priorityLoadReserve;
    }

    // Ensure value is positive
    return Math.max(0, availablePower);
  }

  /**
   * Executes automation logic according to configured mode
   */
  private async executeAutomationLogic(
    availablePower: number,
    solisData: SolisInverterData,
    zaptecStatus: ZaptecStatus,
  ): Promise<void> {
    switch (this.config.mode) {
      case 'surplus':
        await this.executeSurplusMode(availablePower, zaptecStatus);
        break;

      case 'scheduled':
        await this.executeScheduledMode(availablePower, zaptecStatus);
        break;

      case 'manual':
        // Manual mode - no automation
        this.logger.debug('Manual mode - no automatic control');
        break;
    }
  }

  /**
   * Surplus mode: charge only when there is solar surplus
   */
  private async executeSurplusMode(availablePower: number, zaptecStatus: ZaptecStatus): Promise<void> {
    if (availablePower >= this.config.minSurplusPower && zaptecStatus.vehicleConnected) {
      // Enough surplus and vehicle connected
      const chargingPower = Math.min(availablePower, this.config.maxChargingPower);
      await this.zaptecService.optimizeCharging(chargingPower);
      this.logger.log(`Surplus mode: Starting/optimizing charging with ${chargingPower}W`);
    } else if (availablePower < this.config.minSurplusPower && zaptecStatus.charging) {
      // Pas assez de surplus et en cours de charge
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Surplus mode: Stopping charging - insufficient surplus');
    } else if (!zaptecStatus.vehicleConnected && zaptecStatus.charging) {
      // Vehicle disconnected but charging active
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Surplus mode: Stopping charging - vehicle disconnected');
    }
  }

  /**
   * Scheduled mode: charge during defined hours if surplus available
   */
  private async executeScheduledMode(availablePower: number, zaptecStatus: ZaptecStatus): Promise<void> {
    const currentHour = new Date().getHours().toString();
    const isScheduledHour = this.config.scheduledHours.includes(currentHour);

    if (isScheduledHour && availablePower >= this.config.minSurplusPower && zaptecStatus.vehicleConnected) {
      // Scheduled hour, surplus available and vehicle connected
      const chargingPower = Math.min(availablePower, this.config.maxChargingPower);
      await this.zaptecService.optimizeCharging(chargingPower);
      this.logger.log(`Scheduled mode: Charging with ${chargingPower}W during scheduled hour ${currentHour}`);
    } else if (!isScheduledHour && zaptecStatus.charging) {
      // Outside scheduled time slot
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Scheduled mode: Stopping charging - outside scheduled hours');
    } else if (!zaptecStatus.vehicleConnected && zaptecStatus.charging) {
      // Vehicle disconnected
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Scheduled mode: Stopping charging - vehicle disconnected');
    }
  }

  /**
   * Retrieves complete automation status
   */
  public async getAutomationStatus(): Promise<AutomationStatus> {
    try {
      const solisData = await this.solisService.getAllData();
      const zaptecStatus = await this.zaptecService.getChargerStatus();
      const availablePower = this.calculateAvailablePower(solisData);

      return {
        enabled: this.config.enabled && this.automationEnabled,
        lastUpdate: this.lastAutomationRun,
        solarProduction: solisData.pv.totalPowerDC,
        houseConsumption: solisData.house.consumption,
        availableForCharging: availablePower,
        chargingStatus: {
          active: zaptecStatus.charging,
          current: 0, // zaptecStatus.current,
          power: zaptecStatus.power,
        },
        mode: this.config.mode,
      };
    } catch (error) {
      this.logger.error('Failed to get automation status:', error);
      throw error;
    }
  }

  /**
   * Updates automation configuration
   */
  public async updateConfig(newConfig: Partial<AutomationConfig>): Promise<AutomationConfig> {
    this.config = { ...this.config, ...newConfig };
    this.logger.log('Automation config updated:', this.config);
    return this.config;
  }

  /**
   * Enables/disables automation
   */
  public async setAutomationEnabled(enabled: boolean): Promise<void> {
    this.automationEnabled = enabled;
    this.logger.log(`Automation ${enabled ? 'enabled' : 'disabled'}`);

    if (!enabled) {
      // If disabled, stop charging if active
      try {
        const zaptecStatus = await this.zaptecService.getChargerStatus();
        if (zaptecStatus.charging) {
          await this.zaptecService.setChargingEnabled(false);
          this.logger.log('Stopped charging due to automation being disabled');
        }
      } catch (error) {
        this.logger.error('Failed to stop charging when disabling automation:', error);
      }
    }
  }

  /**
   * Retrieves current configuration
   */
  public getConfig(): AutomationConfig {
    return { ...this.config };
  }

  /**
   * Forces manual execution of automation
   */
  public async runManualAutomation(): Promise<void> {
    this.logger.log('Manual automation run requested');
    await this.runAutomation();
  }
}
