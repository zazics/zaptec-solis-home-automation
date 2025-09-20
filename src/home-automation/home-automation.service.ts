import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SolisService } from '../solis/solis.service';
import { SolisDataService } from '../solis/solis-data.service';
import { ZaptecService } from '../zaptec/zaptec.service';
import { ZaptecDataService } from '../zaptec/zaptec-data.service';
import { ZaptecStatus } from '../zaptec/models/zaptec.model';
import { LoggingService } from '../common/logging.service';
import { SolisDataDTO } from '../solis/models/solis.model';
import { AutomationConfig } from './models/home-automation.model';
import { Constants } from '../constants';
import * as SunCalc from 'suncalc';
import { TapoService } from '../tapo/tapo.service';

/**
 * Core automation service that coordinates solar energy production with EV charging
 *
 * This service implements the main automation logic that monitors solar panel production
 * via the Solis inverter and automatically controls the Zaptec charging station to
 * optimize energy usage and maximize solar surplus utilization.
 *
 * Automation Modes:
 * - **Surplus Mode**: Charges only when solar production exceeds house consumption
 * - **Manual Mode**: Direct control without automation
 * - **Minimum Mode**: Charges at 6A when there's sufficient solar power
 * - **Force Minimum Mode**: Always charges at 6A regardless of solar power
 *
 * Features:
 * - Real-time power flow monitoring and calculation
 * - Dynamic charging current adjustment based on available surplus
 * - Load balancing with configurable priority load reserves
 * - Historical data logging and analysis (when MongoDB enabled)
 * - Automated cycles with configurable intervals
 * - Vehicle detection and charging session management
 * - Safety thresholds and maximum power limits
 *
 * The service runs automated cycles every minute to evaluate current conditions
 * and adjust charging parameters accordingly, ensuring optimal energy utilization
 * while respecting safety limits and user preferences.
 */
@Injectable()
export class HomeAutomationService implements OnModuleInit {
  private readonly context = HomeAutomationService.name;
  @Inject(SolisService) private readonly solisService: SolisService;
  @Inject(SolisDataService) private readonly solisDataService: SolisDataService;
  @Inject(ZaptecService) private readonly zaptecService: ZaptecService;
  @Inject(ZaptecDataService) private readonly zaptecDataService: ZaptecDataService;
  @Inject(TapoService) private readonly tapoService: TapoService;

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
      maxChargingPower: Constants.AUTOMATION.MAX_CHARGING_POWER,
      priorityLoadReserve: Constants.AUTOMATION.PRIORITY_LOAD_RESERVE,
      neverStopCharging: Constants.AUTOMATION.NEVER_STOP_CHARGING,
      boostLevel: Constants.AUTOMATION.BOOST_LEVEL
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
      this.logger.log('Running automation cycle...', this.context);

      // Retrieve data from Solis inverter
      const solisData = await this.solisService.getAllData();

      // Store Solis data in MongoDB for historical analysis (every cycle now)
      await this.saveDataToMongoDB(solisData);
      this.automationRunCounter++;

      // Check if it's night time based on sunrise/sunset - no solar production expected
      const now = new Date();
      const sunTimes = SunCalc.getTimes(now, Constants.LOCATION.LATITUDE, Constants.LOCATION.LONGITUDE);
      const isNightTime = now < sunTimes.sunrise || now > sunTimes.sunset;

      if (isNightTime) {
        const sunriseTime = sunTimes.sunrise.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        const sunsetTime = sunTimes.sunset.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
        this.logger.debug(
          `Night time detected (sunrise: ${sunriseTime}, sunset: ${sunsetTime}), skipping power calculation and automation`,
          this.context
        );
        return; // Only save inverter data, skip power calculation and charging logic
      }

      // Retrieve Zaptec charging station status first
      const zaptecStatus = await this.zaptecService.getChargerStatus();

      // Save Zaptec data during daytime only
      await this.saveZaptecDataToMongoDB(zaptecStatus);

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
  private calculateAvailablePower(solisData: SolisDataDTO, zaptecStatus: ZaptecStatus): number {
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
    if (batterySoc < 30) {
      // Battery SOC < 30%: prioritize battery charging only
      this.logger.log(`Battery SOC=${batterySoc}% < 30%, prioritizing battery charging only`, this.context);
      return 0; // No power available for EV charging
    } else if (batterySoc < 60) {
      // Battery SOC 30-60%: reserve some power for battery charging
      const batteryReservePercent = 0.1; // Reserve 10% of available power for battery
      const calculatedReserve = basePowerAvailable * batteryReservePercent;
      batteryReservePower = Math.min(calculatedReserve, 300); // Max 300W reserve for battery
      basePowerAvailable = Math.max(0, basePowerAvailable - batteryReservePower);
      this.logger.log(
        `Battery SOC=${batterySoc}% < 60%, reserving ${batteryReservePower}W (max 300W) for battery charging`,
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
      this.logger.log(
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

      this.logger.log(
        `Current charging (${currentChargingPower}W) exceeds solar production (${solarProduction}W), ` +
          `limiting to solar production: ${limitedPower}W`,
        this.context
      );

      this.logger.log(
        `Power calculation: Solar=${solarProduction}W, HouseWithoutZaptec=${houseConsumptionWithoutZaptec}W, ` +
          `Battery=${batterySoc}%, CurrentCharging=${currentChargingPower}W, ` +
          `BatteryReserve=${batteryReservePower}W, Available=${limitedPower}W (LIMITED)`,
        this.context
      );

      return limitedPower;
    }

    this.logger.log(
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
    solisData: SolisDataDTO,
    zaptecStatus: ZaptecStatus
  ): Promise<void> {
    switch (this.config.mode) {
      case 'surplus':
        await this.executeSurplusMode(availablePower, solisData, zaptecStatus);
        break;

      case 'minimum':
        await this.executeMinimumMode(availablePower, solisData, zaptecStatus);
        break;

      case 'manual':
        // Manual mode - no automation
        this.logger.debug('Manual mode - no automatic control', this.context);
        break;
    }
  }

  /**
   * Surplus mode: charge only when there is solar surplus
   * If neverStopCharging is enabled, charging continues even with insufficient surplus
   */
  private async executeSurplusMode(
    availablePower: number,
    solisData: SolisDataDTO,
    zaptecStatus: ZaptecStatus
  ): Promise<void> {
    if (zaptecStatus.vehicleConnected) {
      // Vehicle connected - let optimizeCharging handle all power decisions
      const chargingPower = Math.min(availablePower, this.config.maxChargingPower);
      this.logger.log(
        `Surplus mode: Processing ${chargingPower}W available for charging (neverStopCharging: ${this.config.neverStopCharging})`,
        this.context
      );
      await this.zaptecService.optimizeCharging(chargingPower, solisData.battery.soc, {
        neverStopCharging: this.config.neverStopCharging,
        boostLevel: this.config.boostLevel
      });
    }
    // Note: No need to handle vehicle disconnection - Zaptec charger automatically stops charging
  }

  /**
   * Minimum mode: charge at 6A when sufficient solar power is available
   * If neverStopCharging is enabled, always charge at 6A regardless of power availability
   * Minimum power required: 6A * 230V * 1 phase = 1380W
   */
  private async executeMinimumMode(
    availablePower: number,
    solisData: SolisDataDTO,
    zaptecStatus: ZaptecStatus
  ): Promise<void> {
    const MINIMUM_CHARGING_POWER = 1380; // 6A * 230V * 1 phase

    if (zaptecStatus.vehicleConnected) {
      const sufficientPower = availablePower >= MINIMUM_CHARGING_POWER || this.config.neverStopCharging;
      this.logger.log(
        `Minimum mode: ${availablePower}W available (need ${MINIMUM_CHARGING_POWER}W), sufficient: ${sufficientPower} (neverStopCharging: ${this.config.neverStopCharging})`,
        this.context
      );

      // Use simple charging management at 6A
      await this.zaptecService.manageMinimumCharging(sufficientPower);
    }
    // Note: No need to handle vehicle disconnection - Zaptec charger automatically stops charging
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
  private async saveDataToMongoDB(solisData: SolisDataDTO): Promise<void> {
    try {
      await this.solisDataService.saveData(solisData);
      this.logger.debug(`Solis data saved to MongoDB (run ${this.automationRunCounter})`, this.context);
    } catch (mongoError) {
      this.logger.warn(
        `Failed to save data to MongoDB (attempt ${this.automationRunCounter}): ${mongoError.message}`,
        this.context
      );
      // Continue with automation even if MongoDB save fails
    }
  }

  /**
   * Saves Zaptec data to MongoDB (only during daytime)
   */
  private async saveZaptecDataToMongoDB(zaptecStatus: ZaptecStatus): Promise<void> {
    try {
      await this.zaptecDataService.saveData(zaptecStatus);
      this.logger.debug(`Zaptec data saved to MongoDB (run ${this.automationRunCounter})`, this.context);
    } catch (mongoError) {
      this.logger.warn(
        `Failed to save Zaptec data to MongoDB (attempt ${this.automationRunCounter}): ${mongoError.message}`,
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
   * Retrieves real-time solar inverter data directly from COM port
   * Bypasses database and queries the Solis inverter directly via RS485/Modbus
   * @returns {Promise<SolisDataDTO>} Real-time solar data fresh from the device
   */
  public async getSolisRealTimeData(): Promise<SolisDataDTO> {
    this.logger.log('Real-time Solis data requested', this.context);
    try {
      const realTimeData = await this.solisService.getAllData();
      this.logger.debug('Real-time Solis data retrieved successfully', this.context);
      return realTimeData;
    } catch (error) {
      this.logger.error('Failed to retrieve real-time Solis data from COM port', error, this.context);
      throw error;
    }
  }
}
