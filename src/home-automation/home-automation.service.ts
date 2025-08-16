import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SolisService } from '../solis/solis.service';
import { SolisDataService } from '../solis/solis-data.service';
import { ZaptecService } from '../zaptec/zaptec.service';
import { ZaptecStatus } from '../zaptec/models/zaptec.model';
import { LoggingService } from '../common/logging.service';
import { SolisInverterData } from '../solis/models/solis.model';
import { AutomationConfig, AutomationStatus } from './models/home-automation.model';
import { Constants } from '../constants';

/**
 * Core automation service that coordinates solar energy production with EV charging
 * 
 * This service implements the main automation logic that monitors solar panel production
 * via the Solis inverter and automatically controls the Zaptec charging station to
 * optimize energy usage and maximize solar surplus utilization.
 * 
 * Automation Modes:
 * - **Surplus Mode**: Charges only when solar production exceeds house consumption
 * - **Scheduled Mode**: Time-based charging with surplus consideration
 * - **Manual Mode**: Direct control without automation
 * 
 * Features:
 * - Real-time power flow monitoring and calculation
 * - Dynamic charging current adjustment based on available surplus
 * - Load balancing with configurable priority load reserves
 * - Historical data logging and analysis (when MongoDB enabled)
 * - Scheduled automation cycles with configurable intervals
 * - Vehicle detection and charging session management
 * - Safety thresholds and maximum power limits
 * 
 * The service runs automated cycles every 30 seconds to evaluate current conditions
 * and adjust charging parameters accordingly, ensuring optimal energy utilization
 * while respecting safety limits and user preferences.
 */
@Injectable()
export class HomeAutomationService implements OnModuleInit {
  private readonly context = HomeAutomationService.name;
  @Inject(SolisService) private readonly solisService: SolisService;
  @Inject(SolisDataService) private readonly solisDataService: SolisDataService;
  @Inject(ZaptecService) private readonly zaptecService: ZaptecService;
  @Inject(LoggingService) private readonly logger: LoggingService;

  private config: AutomationConfig;
  private lastAutomationRun: Date = new Date();
  private automationEnabled: boolean = true;

  constructor() {}

  /**
   * Module initialization
   */
  public onModuleInit(): void {
    this.config = {
      enabled: Constants.AUTOMATION.ENABLED,
      mode: Constants.AUTOMATION.MODE,
      minSurplusPower: Constants.AUTOMATION.MIN_SURPLUS_POWER,
      maxChargingPower: Constants.AUTOMATION.MAX_CHARGING_POWER,
      scheduledHours: Constants.AUTOMATION.SCHEDULED_HOURS,
      priorityLoadReserve: Constants.AUTOMATION.PRIORITY_LOAD_RESERVE,
    };

    this.logger.log('Home automation service initialized with config', this.context);
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
      this.logger.debug('Running automation cycle...', this.context);

      // Retrieve data from Solis inverter
      const solisData = await this.solisService.getAllData();

      // Store Solis data in MongoDB for historical analysis
      try {
        await this.solisDataService.saveData(solisData);
        this.logger.debug('Solis data saved to MongoDB', this.context);
      } catch (mongoError) {
        this.logger.warn('Failed to save Solis data to MongoDB', this.context);
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
      this.logger.error('Automation cycle failed', error, this.context);
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
        this.logger.debug('Manual mode - no automatic control', this.context);
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
      this.logger.log(`Surplus mode: Starting/optimizing charging with ${chargingPower}W`, this.context);
    } else if (availablePower < this.config.minSurplusPower && zaptecStatus.charging) {
      // Pas assez de surplus et en cours de charge
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Surplus mode: Stopping charging - insufficient surplus', this.context);
    } else if (!zaptecStatus.vehicleConnected && zaptecStatus.charging) {
      // Vehicle disconnected but charging active
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Surplus mode: Stopping charging - vehicle disconnected', this.context);
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
      this.logger.log(
        `Scheduled mode: Charging with ${chargingPower}W during scheduled hour ${currentHour}`,
        this.context,
      );
    } else if (!isScheduledHour && zaptecStatus.charging) {
      // Outside scheduled time slot
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Scheduled mode: Stopping charging - outside scheduled hours', this.context);
    } else if (!zaptecStatus.vehicleConnected && zaptecStatus.charging) {
      // Vehicle disconnected
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Scheduled mode: Stopping charging - vehicle disconnected', this.context);
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
      this.logger.error('Failed to get automation status', error, this.context);
      throw error;
    }
  }

  /**
   * Updates automation configuration
   */
  public async updateConfig(newConfig: Partial<AutomationConfig>): Promise<AutomationConfig> {
    this.config = { ...this.config, ...newConfig };
    this.logger.log('Automation config updated', this.context);
    this.logger.debug(JSON.stringify(this.config), this.context);
    return this.config;
  }

  /**
   * Enables/disables automation
   */
  public async setAutomationEnabled(enabled: boolean): Promise<void> {
    this.automationEnabled = enabled;
    this.logger.log(`Automation ${enabled ? 'enabled' : 'disabled'}`, this.context);

    if (!enabled) {
      // If disabled, stop charging if active
      try {
        const zaptecStatus = await this.zaptecService.getChargerStatus();
        if (zaptecStatus.charging) {
          await this.zaptecService.setChargingEnabled(false);
          this.logger.log('Stopped charging due to automation being disabled', this.context);
        }
      } catch (error) {
        this.logger.error('Failed to stop charging when disabling automation', error, this.context);
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
    this.logger.log('Manual automation run requested', this.context);
    await this.runAutomation();
  }
}
