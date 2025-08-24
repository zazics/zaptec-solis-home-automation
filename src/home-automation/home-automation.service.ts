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
  private automationRunCounter: number = 0;

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
      priorityLoadReserve: Constants.AUTOMATION.PRIORITY_LOAD_RESERVE
    };

    this.logger.log(`Home automation service initialized with config ${JSON.stringify(this.config)}`, this.context);
  }

  /**
   * Automated task that runs every minute to optimize charging
   */
  //@Cron(CronExpression.EVERY_HOUR)
  @Cron(CronExpression.EVERY_MINUTE)
  public async runAutomation(): Promise<void> {
    if (!this.config.enabled || !this.automationEnabled) {
      return;
    }

    try {
      this.logger.debug('Running automation cycle...', this.context);

      // Retrieve data from Solis inverter
      const solisData = await this.solisService.getAllData();

      // Store Solis data in MongoDB for historical analysis (according to frequency set)
      if (this.automationRunCounter % Constants.AUTOMATION.MONGODB_SAVE_FREQUENCY === 0) {
        await this.saveDataToMongoDB(solisData);
      }
      this.automationRunCounter++;

      // Retrieve Zaptec charging station status first
      const zaptecStatus = await this.zaptecService.getChargerStatus();

      // Calculate available power (including current charging power)
      const availablePower = this.calculateAvailablePower(solisData, zaptecStatus);

      // Execute automation logic according to mode
      await this.executeAutomationLogic(availablePower, solisData, zaptecStatus);

      this.lastAutomationRun = new Date();
    } catch (error) {
      this.logger.error('Automation cycle failed', error, this.context);
    }
  }

  /**
   * Calculates available power for charging based on Solis data and current charging status
   */
  private calculateAvailablePower(solisData: SolisInverterData, zaptecStatus: ZaptecStatus): number {
    const solarProduction = Math.min(solisData.pv.totalPowerDC, Constants.POWER.INVERTER_MAX_POWER);
    const houseConsumption = solisData.house.consumption;
    const batterySoc = solisData.battery.soc; // State of charge in %
    const currentChargingPower = zaptecStatus.charging ? zaptecStatus.power || 0 : 0;

    // Calculate house consumption without Zaptec charging
    const houseConsumptionWithoutZaptec = Math.max(0, houseConsumption - currentChargingPower);

    // Base available power = solar production - house consumption (without Zaptec)
    let basePowerAvailable = Math.max(0, solarProduction - houseConsumptionWithoutZaptec);

    // Battery management based on SOC
    let batteryReservePower = 0;
    if (batterySoc < 40) {
      // Battery SOC < 40%: prioritize battery charging only
      this.logger.debug(`Battery SOC=${batterySoc}% < 40%, prioritizing battery charging only`, this.context);
      return 0; // No power available for EV charging
    } else if (batterySoc < 70) {
      // Battery SOC 40-80%: reserve some power for battery charging
      const batteryReservePercent = 0.1; // Reserve 10% of available power for battery
      batteryReservePower = basePowerAvailable * batteryReservePercent;
      basePowerAvailable = basePowerAvailable * (1 - batteryReservePercent);
      this.logger.debug(
        `Battery SOC=${batterySoc}% < 80%, reserving ${batteryReservePower}W for battery charging`,
        this.context
      );
    }

    // Apply priority load reserve
    let totalAvailablePower = Math.max(0, basePowerAvailable - this.config.priorityLoadReserve);

    // High consumption reduction: if total house consumption > inverter max power, reduce available power
    if (houseConsumption > Constants.POWER.INVERTER_MAX_POWER) {
      const reductionPercent = Constants.AUTOMATION.HIGH_CONSUMPTION_REDUCTION_PERCENT / 100;
      const reductionAmount = totalAvailablePower * reductionPercent;
      totalAvailablePower = Math.max(0, totalAvailablePower - reductionAmount);
      this.logger.debug(
        `High consumption detected (${houseConsumption}W > ${Constants.POWER.INVERTER_MAX_POWER}W), ` +
          `reducing available power by ${Constants.AUTOMATION.HIGH_CONSUMPTION_REDUCTION_PERCENT}% (${reductionAmount}W)`,
        this.context
      );
    }

    // If current charging exceeds solar production, limit to solar production only
    if (currentChargingPower > solarProduction) {
      let limitedPower = Math.max(0, solarProduction - this.config.priorityLoadReserve);

      // Apply high consumption reduction to limited power as well
      if (houseConsumption > Constants.POWER.INVERTER_MAX_POWER) {
        const reductionPercent = Constants.AUTOMATION.HIGH_CONSUMPTION_REDUCTION_PERCENT / 100;
        const reductionAmount = limitedPower * reductionPercent;
        limitedPower = Math.max(0, limitedPower - reductionAmount);
      }

      this.logger.debug(
        `Current charging (${currentChargingPower}W) exceeds solar production (${solarProduction}W), ` +
          `limiting to solar production: ${limitedPower}W`,
        this.context
      );

      this.logger.debug(
        `Power calculation: Solar=${solarProduction}W, HouseWithoutZaptec=${houseConsumptionWithoutZaptec}W, ` +
          `Battery=${batterySoc}%, CurrentCharging=${currentChargingPower}W, ` +
          `BatteryReserve=${batteryReservePower}W, Available=${limitedPower}W (LIMITED)`,
        this.context
      );

      return limitedPower;
    }

    this.logger.debug(
      `Power calculation: Solar=${solarProduction}W, HouseWithoutZaptec=${houseConsumptionWithoutZaptec}W, ` +
        `Battery=${batterySoc}%, CurrentCharging=${currentChargingPower}W, ` +
        `BatteryReserve=${batteryReservePower}W, Available=${totalAvailablePower}W`,
      this.context
    );

    return totalAvailablePower;
  }

  /**
   * Executes automation logic according to configured mode
   */
  private async executeAutomationLogic(
    availablePower: number,
    solisData: SolisInverterData,
    zaptecStatus: ZaptecStatus
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
      //not enough surplus and charging
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
        this.context
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
      const availablePower = this.calculateAvailablePower(solisData, zaptecStatus);

      return {
        enabled: this.config.enabled && this.automationEnabled,
        lastUpdate: this.lastAutomationRun,
        solarProduction: solisData.pv.totalPowerDC,
        houseConsumption: solisData.house.consumption,
        availableForCharging: availablePower,
        chargingStatus: {
          active: zaptecStatus.charging,
          current: 0, // zaptecStatus.current,
          power: zaptecStatus.power
        },
        mode: this.config.mode
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
   * Saves data to MongoDB according to configured frequency
   */
  private async saveDataToMongoDB(solisData: SolisInverterData): Promise<void> {
    try {
      await this.solisDataService.saveData(solisData);
      this.logger.debug(
        `Solis data saved to MongoDB (run ${this.automationRunCounter}/${Constants.AUTOMATION.MONGODB_SAVE_FREQUENCY})`,
        this.context
      );
    } catch (mongoError) {
      this.logger.warn(
        `Failed to save data to MongoDB (attempt ${this.automationRunCounter}): ${mongoError.message}`,
        this.context
      );
      // Continue with automation even if MongoDB save fails
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
