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
import {
  SolarProductionChartData,
  GridExchangeChartData,
  HouseConsumptionChartData,
  ZaptecConsumptionChartData,
  BatteryChartData,
  DashboardChartData,
  ChartDataPoint
} from '../common/dto/chart-data.dto';
import { Constants } from '../constants';
import * as SunCalc from 'suncalc';
import { TapoService } from '../tapo/tapo.service';
import { DailyAggregationService } from '../common/services/daily-aggregation.service';
import { HourlyAggregationService } from '../common/services/hourly-aggregation.service';

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
  @Inject(DailyAggregationService) private readonly dailyAggregationService: DailyAggregationService;
  @Inject(HourlyAggregationService) private readonly hourlyAggregationService: HourlyAggregationService;

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
    if (batterySoc < 40) {
      // Battery SOC < 40%: prioritize battery charging only
      this.logger.debug(`Battery SOC=${batterySoc}% < 40%, prioritizing battery charging only`, this.context);
      return 0; // No power available for EV charging
    } else if (batterySoc < 70) {
      // Battery SOC 40-70%: reserve some power for battery charging
      const batteryReservePercent = 0.1; // Reserve 10% of available power for battery
      const calculatedReserve = basePowerAvailable * batteryReservePercent;
      batteryReservePower = Math.min(calculatedReserve, 300); // Max 300W reserve for battery
      basePowerAvailable = Math.max(0, basePowerAvailable - batteryReservePower);
      this.logger.debug(
        `Battery SOC=${batterySoc}% < 80%, reserving ${batteryReservePower}W (max 400W) for battery charging`,
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

      case 'force_minimum':
        await this.executeForceMinimumMode(availablePower, solisData, zaptecStatus);
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
  private async executeSurplusMode(
    availablePower: number,
    solisData: SolisDataDTO,
    zaptecStatus: ZaptecStatus
  ): Promise<void> {
    if (zaptecStatus.vehicleConnected) {
      // Vehicle connected - let optimizeCharging handle all power decisions
      const chargingPower = Math.min(availablePower, this.config.maxChargingPower);
      this.logger.log(`Surplus mode: Processing ${chargingPower}W available for charging`, this.context);
      await this.zaptecService.optimizeCharging(chargingPower, solisData.battery.soc);
    } else if (zaptecStatus.charging) {
      // Vehicle disconnected but charging active
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Surplus mode: Stopping charging - vehicle disconnected', this.context);
    }
  }

  /**
   * Minimum mode: charge at 6A when sufficient solar power is available
   * Minimum power required: 6A * 230V * 1 phase = 1380W
   */
  private async executeMinimumMode(
    availablePower: number,
    solisData: SolisDataDTO,
    zaptecStatus: ZaptecStatus
  ): Promise<void> {
    const MINIMUM_CHARGING_POWER = 1380; // 6A * 230V * 1 phase

    if (zaptecStatus.vehicleConnected) {
      const sufficientPower = availablePower >= MINIMUM_CHARGING_POWER;
      this.logger.log(
        `Minimum mode: ${availablePower}W available (need ${MINIMUM_CHARGING_POWER}W), sufficient: ${sufficientPower}`,
        this.context
      );

      // Use simple charging management at 6A
      await this.zaptecService.manageMinimumCharging(sufficientPower);
    } else if (zaptecStatus.charging) {
      // Vehicle disconnected but charging active
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Minimum mode: Stopping charging - vehicle disconnected', this.context);
    }
  }

  /**
   * Force minimum mode: always charge at 6A regardless of solar power availability
   */
  private async executeForceMinimumMode(
    availablePower: number,
    solisData: SolisDataDTO,
    zaptecStatus: ZaptecStatus
  ): Promise<void> {
    const MINIMUM_CHARGING_POWER = 1380; // 6A * 230V * 1 phase

    if (zaptecStatus.vehicleConnected) {
      // Always charge at 6A when vehicle connected, regardless of solar production
      this.logger.log(
        `Force minimum mode: Charging at 6A (${MINIMUM_CHARGING_POWER}W) regardless of solar power (${availablePower}W available)`,
        this.context
      );

      // Always sufficient power in force mode
      await this.zaptecService.manageMinimumCharging(true);
    } else if (zaptecStatus.charging) {
      // Vehicle disconnected but charging active
      await this.zaptecService.setChargingEnabled(false);
      this.logger.log('Force minimum mode: Stopping charging - vehicle disconnected', this.context);
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
   * Forces manual execution of automation
   */
  public async runManualAutomation(): Promise<void> {
    this.logger.log('Manual automation run requested', this.context);
    await this.runAutomation();
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

  /**
   * Calculates total energy in kWh from power data collected every minute
   * @param {any[]} rawData - Array of data points with power values
   * @param {Function} valueExtractor - Function to extract power value from each data point
   * @returns {number} Total energy in kWh
   */
  private calculateTotalEnergy(rawData: any[], valueExtractor: (item: any) => number): number {
    if (!rawData || rawData.length === 0) {
      return 0;
    }

    // Sort data by timestamp to ensure correct chronological order
    const sortedData = rawData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    let totalEnergy = 0;

    for (let i = 0; i < sortedData.length - 1; i++) {
      const currentPoint = sortedData[i];
      const nextPoint = sortedData[i + 1];

      const currentPowerWatts = valueExtractor(currentPoint); // Power in Watts
      const currentTime = new Date(currentPoint.timestamp).getTime();
      const nextTime = new Date(nextPoint.timestamp).getTime();

      // Calculate time difference in hours
      const timeDifferenceHours = (nextTime - currentTime) / (1000 * 60 * 60);

      // Convert Watts to kW and calculate energy
      const nextPowerWatts = valueExtractor(nextPoint);
      const averagePowerKW = (currentPowerWatts + nextPowerWatts) / 2 / 1000; // Convert W to kW

      // Energy = Power × Time (kWh = kW × hours)
      totalEnergy += averagePowerKW * timeDifferenceHours;
    }

    return totalEnergy;
  }

  /**
   * Gets time range for chart data based on period
   * @param {string} period - Chart period (day, week, month, year)
   * @param {string} date - Optional specific date
   * @returns {object} Start and end dates with grouping period
   */
  private getTimeRange(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): { startDate: Date; endDate: Date; groupBy: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly' } {
    const referenceDate = date ? new Date(date) : new Date();
    if (isNaN(referenceDate.getTime())) {
      throw new Error('Invalid date format');
    }

    let startDate: Date;
    let endDate: Date;
    let groupBy: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly';

    switch (period) {
      case 'day':
        startDate = new Date(referenceDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        groupBy = 'quarterly'; // Use 15-minute intervals for day view
        break;

      case 'week':
        {
          const dayOfWeek = referenceDate.getDay();
          const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
          startDate = new Date(referenceDate);
          startDate.setDate(referenceDate.getDate() - daysToMonday);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          groupBy = 'hourly'; // Use hourly intervals for week view
        }
        break;

      case 'month':
        startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
        endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        groupBy = 'daily'; // Use daily intervals for month view
        break;

      case 'year':
        startDate = new Date(referenceDate.getFullYear(), 0, 1);
        endDate = new Date(referenceDate.getFullYear(), 11, 31);
        endDate.setHours(23, 59, 59, 999);
        groupBy = 'monthly'; // Use monthly intervals for year view
        break;
    }

    return {
      startDate,
      endDate,
      groupBy
    };
  }

  /**
   * Aggregates data points by time period
   * @param {Array} data - Raw data array
   * @param {string} groupBy - Grouping period (quarterly, hourly, daily, monthly)
   * @param {Function} valueExtractor - Function to extract value from data point
   * @returns {Array} Aggregated chart data points
   */
  private aggregateData(data: any[], groupBy: string, valueExtractor: (item: any) => number): ChartDataPoint[] {
    const groups = new Map<string, { sum: number; count: number; timestamp: Date }>();

    data.forEach((item) => {
      const timestamp = new Date(item.timestamp);
      let groupKey: string;

      switch (groupBy) {
        case 'quarterly': {
          // Group by 15-minute intervals
          const quarter = Math.floor(timestamp.getMinutes() / 15) * 15;
          groupKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}-${timestamp.getHours()}-${quarter}`;
          break;
        }
        case 'hourly':
          groupKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}-${timestamp.getHours()}`;
          break;
        case 'daily':
          groupKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;
          break;
        case 'monthly':
          groupKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}`;
          break;
        default:
          throw new Error(`Invalid groupBy: ${groupBy}`);
      }

      const value = valueExtractor(item);
      if (groups.has(groupKey)) {
        const group = groups.get(groupKey)!;
        group.sum += value;
        group.count += 1;
      } else {
        let groupTimestamp: Date;
        switch (groupBy) {
          case 'quarterly': {
            const quarter = Math.floor(timestamp.getMinutes() / 15) * 15;
            groupTimestamp = new Date(
              timestamp.getFullYear(),
              timestamp.getMonth(),
              timestamp.getDate(),
              timestamp.getHours(),
              quarter
            );
            break;
          }
          case 'hourly':
            groupTimestamp = new Date(
              timestamp.getFullYear(),
              timestamp.getMonth(),
              timestamp.getDate(),
              timestamp.getHours()
            );
            break;
          case 'daily':
            groupTimestamp = new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate());
            break;
          case 'monthly':
            groupTimestamp = new Date(timestamp.getFullYear(), timestamp.getMonth(), 1);
            break;
        }
        groups.set(groupKey, { sum: value, count: 1, timestamp: groupTimestamp! });
      }
    });

    return Array.from(groups.values())
      .map((group) => ({
        timestamp: group.timestamp,
        value: group.sum / group.count // Average value
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Converts daily aggregations to chart data format
   * @param {any[]} aggregations - Array of daily aggregations
   * @param {Function} valueExtractor - Function to extract value from aggregation
   * @returns {ChartDataPoint[]} Chart data points
   */
  private convertAggregationsToChartData(aggregations: any[], valueExtractor: (agg: any) => number): ChartDataPoint[] {
    return aggregations
      .map((agg) => ({
        timestamp: new Date(agg.date),
        value: valueExtractor(agg)
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Determines whether to use pre-aggregated data or real-time calculation
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {boolean} True if should use pre-aggregated data
   */
  private shouldUsePreAggregatedData(period: 'day' | 'week' | 'month' | 'year', date?: string): boolean {
    if (period === 'day') {
      // For day period, only use pre-aggregated data if it's not today
      const targetDate = date ? new Date(date) : new Date();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      targetDate.setHours(0, 0, 0, 0);

      return targetDate.getTime() < today.getTime();
    }

    if (period === 'week') {
      // For week period, use hourly pre-aggregated data (not daily)
      return true;
    }
    
    // For month, year periods, use daily pre-aggregated data
    return true;
  }

  /**
   * Converts hourly aggregations to chart data format for week view
   * @param {any[]} hourlyAggregations - Array of hourly aggregations
   * @param {Function} valueExtractor - Function to extract value from aggregation
   * @returns {ChartDataPoint[]} Chart data points
   */
  private convertHourlyAggregationsToChartData(hourlyAggregations: any[], valueExtractor: (agg: any) => number): ChartDataPoint[] {
    return hourlyAggregations.map(agg => {
      const timestamp = new Date(agg.date);
      timestamp.setHours(agg.hour, 0, 0, 0);
      return {
        timestamp,
        value: valueExtractor(agg)
      };
    }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Retrieves solar production chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<SolarProductionChartData>} Solar production chart data
   */
  public async getSolarProductionChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<SolarProductionChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (this.shouldUsePreAggregatedData(period, date)) {
      if (period === 'week') {
        // Use hourly aggregations for week view to show hourly granularity
        const hourlyAggregations = await this.hourlyAggregationService.getAggregatedData(startDate, endDate);
        
        const chartData = this.convertHourlyAggregationsToChartData(
          hourlyAggregations,
          (agg) => agg.solarProduction?.avgPowerW || 0  // Use average power for hourly display
        );
        
        // Calculate total energy from hourly aggregations
        const totalEnergyKwh = hourlyAggregations.reduce((sum, agg) => sum + (agg.solarProduction?.totalEnergyKwh || 0), 0);
        
        return {
          period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
          startDate,
          endDate,
          data: chartData,
          totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3))
        };
      } else if (period === 'month' || period === 'year') {
        // Use daily aggregations for month/year view
        const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);
        
        const chartData = this.convertAggregationsToChartData(
          aggregations,
          (agg) => agg.solarProduction?.maxPowerW || 0  // Use max power for chart display
        );
        
        // Calculate total energy from aggregations
        const totalEnergyKwh = aggregations.reduce((sum, agg) => sum + (agg.solarProduction?.totalEnergyKwh || 0), 0);
        
        return {
          period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
          startDate,
          endDate,
          data: chartData,
          totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3))
        };
      }
    }

    // Fallback to real-time calculation for current day or when aggregations are not available
    const rawData = await this.solisDataService.getDataInTimeRange(startDate, endDate);
    const chartData = this.aggregateData(rawData, groupBy, (item) => item.pv?.totalPowerDC || 0);
    const totalEnergyKwh = this.calculateTotalEnergy(rawData, (item) => item.pv?.totalPowerDC || 0);

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      data: chartData,
      totalEnergyKwh: parseFloat(totalEnergyKwh.toFixed(3))
    };
  }

  /**
   * Retrieves grid exchange chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<GridExchangeChartData>} Grid exchange chart data
   */
  public async getGridExchangeChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<GridExchangeChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const importedData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.gridExchange?.maxImportW || 0
      );

      const exportedData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.gridExchange?.maxExportW || 0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        imported: importedData,
        exported: exportedData
      };
    }

    // Fallback to real-time calculation for current day
    const rawData = await this.solisDataService.getDataInTimeRange(startDate, endDate);

    const importedData = this.aggregateData(rawData, groupBy, (item) =>
      item.grid?.activePower > 0 ? item.grid.activePower : 0
    );

    const exportedData = this.aggregateData(rawData, groupBy, (item) =>
      item.grid?.activePower < 0 ? Math.abs(item.grid.activePower) : 0
    );

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      imported: importedData,
      exported: exportedData
    };
  }

  /**
   * Retrieves house consumption chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<HouseConsumptionChartData>} House consumption chart data
   */
  public async getHouseConsumptionChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<HouseConsumptionChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const chartData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.houseConsumption?.maxPowerW || 0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        data: chartData
      };
    }

    // Fallback to real-time calculation for current day
    const rawData = await this.solisDataService.getDataInTimeRange(startDate, endDate);
    const chartData = this.aggregateData(rawData, groupBy, (item) => item.house?.consumption || 0);

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      data: chartData
    };
  }

  /**
   * Retrieves Zaptec consumption chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<ZaptecConsumptionChartData>} Zaptec consumption chart data
   */
  public async getZaptecConsumptionChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<ZaptecConsumptionChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const chartData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.zaptecConsumption?.maxPowerW || 0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        data: chartData
      };
    }

    // Fallback to real-time calculation for current day
    const rawData = await this.zaptecDataService.getDataInTimeRange(startDate, endDate);
    const chartData = this.aggregateData(rawData, groupBy, (item) => (item.charging ? item.power || 0 : 0));

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      data: chartData
    };
  }

  /**
   * Retrieves combined dashboard chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<DashboardChartData>} Combined dashboard chart data
   */
  public async getDashboardChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<DashboardChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const solarProduction = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.solarProduction?.maxPowerW || 0
      );

      const houseConsumption = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.houseConsumption?.maxPowerW || 0
      );

      const gridImported = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.gridExchange?.maxImportW || 0
      );

      const gridExported = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.gridExchange?.maxExportW || 0
      );

      const zaptecConsumption = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.zaptecConsumption?.maxPowerW || 0
      );

      // Calculate total solar energy from aggregations
      const totalSolarEnergyKwh = aggregations.reduce(
        (sum, agg) => sum + (agg.solarProduction?.totalEnergyKwh || 0),
        0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        solarProduction,
        houseConsumption,
        zaptecConsumption,
        gridImported,
        gridExported,
        totalSolarEnergyKwh: parseFloat(totalSolarEnergyKwh.toFixed(3))
      };
    }

    // Fallback to real-time calculation for current day
    const [solisData, zaptecData] = await Promise.all([
      this.solisDataService.getDataInTimeRange(startDate, endDate),
      this.zaptecDataService.getDataInTimeRange(startDate, endDate)
    ]);

    const solarProduction = this.aggregateData(solisData, groupBy, (item) => item.pv?.totalPowerDC || 0);
    const houseConsumption = this.aggregateData(solisData, groupBy, (item) => item.house?.consumption || 0);
    const gridImported = this.aggregateData(solisData, groupBy, (item) =>
      item.grid?.activePower > 0 ? item.grid.activePower : 0
    );
    const gridExported = this.aggregateData(solisData, groupBy, (item) =>
      item.grid?.activePower < 0 ? Math.abs(item.grid.activePower) : 0
    );
    const zaptecConsumption = this.aggregateData(zaptecData, groupBy, (item) => (item.charging ? item.power || 0 : 0));

    // Calculate total solar energy in kWh from power data in Watts
    const totalSolarEnergyKwh = this.calculateTotalEnergy(solisData, (item) => item.pv?.totalPowerDC || 0);

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      solarProduction,
      houseConsumption,
      zaptecConsumption,
      gridImported,
      gridExported,
      totalSolarEnergyKwh: parseFloat(totalSolarEnergyKwh.toFixed(3)) // Round to 3 decimal places
    };
  }

  /**
   * Retrieves battery charge and power chart data for specified period
   * @param {string} period - Chart period
   * @param {string} date - Optional specific date
   * @returns {Promise<BatteryChartData>} Battery SOC and power chart data
   */
  public async getBatteryChart(
    period: 'day' | 'week' | 'month' | 'year',
    date?: string
  ): Promise<BatteryChartData> {
    const { startDate, endDate, groupBy } = this.getTimeRange(period, date);

    // Use pre-aggregated data for historical periods
    if (
      this.shouldUsePreAggregatedData(period, date) &&
      (period === 'week' || period === 'month' || period === 'year')
    ) {
      const aggregations = await this.dailyAggregationService.getAggregatedData(startDate, endDate);

      const socData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.battery?.avgSocPercent || 0
      );

      const powerData = this.convertAggregationsToChartData(
        aggregations,
        (agg) => agg.battery?.avgPowerW || 0
      );

      return {
        period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
        startDate,
        endDate,
        data: socData,
        powerData: powerData
      };
    }

    // Fallback to real-time calculation for current day
    const rawData = await this.solisDataService.getDataInTimeRange(startDate, endDate);
    
    const socData = this.aggregateData(rawData, groupBy, (item) => item.battery?.soc || 0);
    const powerData = this.aggregateData(rawData, groupBy, (item) => item.battery?.activePower || 0);

    return {
      period: groupBy as 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly',
      startDate,
      endDate,
      data: socData,
      powerData: powerData
    };
  }
}
