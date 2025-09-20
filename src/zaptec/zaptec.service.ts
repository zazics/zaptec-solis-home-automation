import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  ZaptecStateObservation,
  ZaptecStatus,
  ZaptecChargerInfo,
  ZaptecInstallationInfo,
  ZaptecInstallationUpdateRequest
} from './models/zaptec.model';
import { LoggingService } from '../common/logging.service';
import { Constants } from '../constants';
import _ from 'lodash';

/**
 * Service for managing Zaptec EV charging station operations
 *
 * Handles authentication, API communication, and control of Zaptec charging stations.
 * Provides methods for monitoring charger status, setting charging parameters,
 * and optimizing charging based on available power from solar panels.
 *
 * Features:
 * - OAuth2 authentication with automatic token refresh
 * - Real-time charger status monitoring via state endpoint
 * - Dynamic current adjustment based on solar surplus
 * - Installation-level configuration management
 * - Charging history retrieval and analytics
 */
@Injectable()
export class ZaptecService implements OnModuleInit {
  private readonly context = ZaptecService.name;

  @Inject(LoggingService) private readonly logger: LoggingService;

  // Configuration
  private baseUrl: string;
  private apiBaseUrl: string;
  private username: string;
  private password: string;
  private chargerId: string;
  private installationId: string;

  // Auth token
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  // Solar panel max power configuration
  private maxSolarPowerWatts: number;

  // Cached status to avoid redundant API calls
  private cachedStatus: ZaptecStatus | null = null;
  private statusCacheTimestamp: Date | null = null;

  // Charging interruption delay to avoid frequent stops
  private insufficientPowerFirstDetected: Date | null = null;

  // StateId constants mapping based on Zaptec constants file
  private readonly stateIdMappings = {
    // Core power and charging states
    513: 'TotalChargePower', // Current power being delivered
    553: 'TotalChargePowerSession', // Total power for current session
    708: 'ChargeCurrentSet', // Set charging current
    710: 'ChargerOperationMode', // Operation mode: 0=Unknown, 1=Disconnected, 2=Connected_Requesting, 3=Connected_Charging, 5=Connected_Finished

    // Voltage and current measurements
    501: 'VoltagePhase1',
    502: 'VoltagePhase2',
    503: 'VoltagePhase3',
    507: 'CurrentPhase1',
    508: 'CurrentPhase2',
    509: 'CurrentPhase3',

    // Charger limits and settings
    510: 'ChargerMaxCurrent',
    511: 'ChargerMinCurrent',
    512: 'ActivePhases',

    // Status and capabilities
    100: 'Capabilities', // Device capabilities
    711: 'IsEnabled', // Charger enabled state
    718: 'FinalStopActive', // Final stop active
    716: 'DetectedCar' // Car detection
  };

  constructor() {}

  /**
   * Module initialization
   */
  public onModuleInit(): void {
    this.baseUrl = Constants.ZAPTEC.API_BASE_URL;
    this.apiBaseUrl = `${Constants.ZAPTEC.API_BASE_URL}/api`;
    this.username = Constants.ZAPTEC.USERNAME;
    this.password = Constants.ZAPTEC.PASSWORD;
    this.chargerId = Constants.ZAPTEC.CHARGER_ID;
    this.installationId = process.env.ZAPTEC_INSTALLATION_ID || '';
    this.maxSolarPowerWatts = process.env.MAX_SOLAR_POWER_WATTS ? parseInt(process.env.MAX_SOLAR_POWER_WATTS) : 5000;
  }

  /**
   * Authenticates with the Zaptec API
   */
  private async authenticate(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return; // Token still valid
    }

    try {
      const response = await fetch(`${this.baseUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: this.username,
          password: this.password
        })
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.status}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;

      // Set expiry to 5 minutes before actual expiry for safety
      const expiresIn = (data.expires_in - 300) * 1000;
      this.tokenExpiry = new Date(Date.now() + expiresIn);

      this.logger.log('Successfully authenticated with Zaptec API', this.context);
    } catch (error) {
      this.logger.error('Failed to authenticate with Zaptec API', error, this.context);
      throw error;
    }
  }

  /**
   * Performs an authenticated API call
   */
  private async apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await this.authenticate();

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    // Check if response has content and is JSON
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');

    // Return empty object for empty responses or non-JSON content
    if (contentLength === '0' || !contentType?.includes('application/json')) {
      return {} as T;
    }

    // Try to parse JSON, return empty object if parsing fails
    try {
      return await response.json();
    } catch (error) {
      this.logger.warn('Failed to parse API response as JSON, returning empty object', this.context);
      return {} as T;
    }
  }

  /**
   * Parses state observations into a key-value map
   */
  private parseStateObservations(observations: ZaptecStateObservation[]): Record<string, any> {
    const stateMap: Record<string, any> = {};

    for (const obs of observations) {
      const stateName = this.stateIdMappings[obs.StateId];
      stateMap[stateName] = obs.ValueAsString;
      // stateMap[`${stateName}_Timestamp`] = obs.Timestamp;
    }

    return stateMap;
  }

  /**
   * Retrieves the charging station status using the state endpoint
   */
  public async getChargerStatus(): Promise<ZaptecStatus> {
    try {
      // Check if simulation is enabled
      if (Constants.ZAPTEC.SIMULATE_DATA) {
        return this.generateSimulatedZaptecStatus();
      }

      // Get basic charger info
      const chargerInfo = await this.apiCall<ZaptecChargerInfo>(`/chargers/${this.chargerId}`);

      const zaptecStatus: ZaptecStatus = {
        id: this.chargerId,
        online: chargerInfo.IsOnline,
        name: chargerInfo.Name,
        deviceType: chargerInfo.DeviceType,
        serialNo: chargerInfo.SerialNo
      };

      // Get detailed state information
      const stateObservations = await this.apiCall<ZaptecStateObservation[]>(`/chargers/${this.chargerId}/state`);

      const stateMap = this.parseStateObservations(stateObservations);

      // Extract values with correct StateId mappings
      zaptecStatus.operatingMode = stateMap.ChargerOperationMode;
      zaptecStatus.charging = stateMap.ChargerOperationMode === '3';
      zaptecStatus.power = _.toNumber(stateMap.TotalChargePower);
      zaptecStatus.totalPower = _.toNumber(stateMap.TotalChargePowerSession);
      zaptecStatus.ChargeCurrentSet = _.round(stateMap.ChargeCurrentSet);
      zaptecStatus.vehicleConnected =
        _.toInteger(stateMap.ChargerOperationMode) >= 2 && _.toInteger(stateMap.ChargerOperationMode) <= 5;

      // Cache the status with timestamp
      this.cachedStatus = zaptecStatus;
      this.statusCacheTimestamp = new Date();

      return zaptecStatus;
    } catch (error) {
      this.logger.error('Failed to get charger status', error, this.context);
      throw error;
    }
  }

  /**
   * Sets the available charging current for the installation
   */
  public async setMaxCurrent(maxCurrent: number): Promise<void> {
    try {
      await this.updateInstallationInfo({
        availableCurrent: maxCurrent
      });

      this.logger.log(`Set available current to ${maxCurrent}A`, this.context);
    } catch (error) {
      this.logger.error('Failed to set available current', error, this.context);
      throw error;
    }
  }

  /**
   * Enables or disables charging using Zaptec commands
   */
  public async setChargingEnabled(enabled: boolean): Promise<void> {
    try {
      // Command IDs according to Zaptec API documentation
      const commandId = enabled ? 507 : 506; // 507 = Resume charging, 506 = Stop/pause charging

      await this.apiCall(`/chargers/${this.chargerId}/sendCommand/${commandId}`, {
        method: 'POST'
      });

      this.logger.log(`Charging ${enabled ? 'resumed' : 'paused'} (command ${commandId})`, this.context);
    } catch (error) {
      this.logger.error('Failed to set charging state', error, this.context);
      throw error;
    }
  }

  /**
   * Completely stops and deauthorizes charging session
   */
  public async stopChargingSession(): Promise<void> {
    try {
      const commandId = 10001; // Deauthorize and stop charging

      await this.apiCall(`/chargers/${this.chargerId}/sendCommand/${commandId}`, {
        method: 'POST'
      });

      this.logger.log(`Charging session stopped and deauthorized (command ${commandId})`, this.context);
    } catch (error) {
      this.logger.error('Failed to stop charging session', error, this.context);
      throw error;
    }
  }

  /**
   * Simple charging control at 6A for minimum modes
   * Checks if charger should be charging at 6A based on current status
   */
  public async manageMinimumCharging(sufficientPower: boolean): Promise<void> {
    const MINIMUM_CURRENT = 6; // 6A minimum charging current

    // Use cached status to avoid redundant API calls
    const currentStatus = this.cachedStatus;
    if (!currentStatus) {
      this.logger.warn('No cached status available, cannot manage minimum charging', this.context);
      return;
    }

    if (sufficientPower) {
      // Sufficient power available - ensure charging at 6A
      const needsCurrentUpdate = currentStatus.ChargeCurrentSet !== MINIMUM_CURRENT;
      const needsChargingEnable = !currentStatus.charging;

      if (needsCurrentUpdate) {
        await this.setMaxCurrent(MINIMUM_CURRENT);
        this.logger.log(`Set charging current to ${MINIMUM_CURRENT}A for minimum charging`, this.context);
      }

      if (needsChargingEnable) {
        await this.setChargingEnabled(true);
        this.logger.log(`Enabled charging at ${MINIMUM_CURRENT}A`, this.context);
      }

      if (!needsCurrentUpdate && !needsChargingEnable) {
        this.logger.debug(`Already charging at ${MINIMUM_CURRENT}A`, this.context);
      }
    } else {
      // Insufficient power - stop charging if active
      if (currentStatus.charging) {
        await this.setChargingEnabled(false);
        this.logger.log('Stopped charging due to insufficient power for minimum mode', this.context);
      } else {
        this.logger.debug('Charging already stopped due to insufficient power', this.context);
      }
    }
  }

  /**
   * Configures optimal charging parameters based on available power and battery level
   */
  public async optimizeCharging(availablePower: number, batterySoc?: number, config?: { neverStopCharging?: boolean; boostLevel?: number }): Promise<void> {
    // Extract config values with defaults
    const neverStopCharging = config?.neverStopCharging || false;
    const boostLevel = config?.boostLevel || 0;

    // Typical voltage in Europe (230V single-phase)
    const voltage = 230;
    const minCurrent = 6;
    const minPowerFor6A = minCurrent * voltage; // 1380W for 6A

    // Calculate tolerance based on battery SOC
    // No tolerance if battery < 60%, proportional tolerance up to 25% if battery > 90%
    let tolerancePercent = 0.15; // Default 15% tolerance

    if (batterySoc !== undefined) {
      if (batterySoc < 60) {
        tolerancePercent = 0; // No tolerance below 60%
      } else if (batterySoc >= 60 && batterySoc <= 90) {
        // Linear interpolation between 0% (at 60%) and 15% (at 90%)
        tolerancePercent = 0.15 * ((batterySoc - 60) / 30);
      } else if (batterySoc > 90) {
        // Linear interpolation between 15% (at 90%) and 25% (at 100%)
        tolerancePercent = 0.15 + 0.1 * ((batterySoc - 90) / 10);
        tolerancePercent = Math.min(tolerancePercent, 0.25); // Cap at 25%
      }
    }

    const minPowerWithTolerance = minPowerFor6A * (1 - tolerancePercent);

    this.logger.debug(
      `Battery SOC: ${batterySoc}%, tolerance: ${(tolerancePercent * 100).toFixed(1)}%, ` +
        `min power threshold: ${minPowerWithTolerance.toFixed(0)}W`,
      this.context
    );

    // Calculate the maximum possible current with available power
    // P = U * I, so I = P / U
    const maxPossibleCurrent = Math.floor(availablePower / voltage);

    // Limit current between 6A (minimum for charging) and calculated max from solar panels
    const maxCurrentFromSolar = Math.floor(this.maxSolarPowerWatts / voltage);
    const maxCurrent = Math.min(20, maxCurrentFromSolar); // Never exceed 20A or solar panel capacity (20A to not overpass inverter max power)
    let optimizedCurrent = Math.max(minCurrent, Math.min(maxCurrent, maxPossibleCurrent));

    // Apply boost level if configured (add to calculated current, capped at 20A)
    if (boostLevel > 0) {
      const boostedCurrent = optimizedCurrent + boostLevel;
      const finalCurrent = Math.min(20, boostedCurrent); // Never exceed 20A total
      this.logger.log(
        `Applying boost: ${optimizedCurrent}A + ${boostLevel}A boost = ${boostedCurrent}A (capped at ${finalCurrent}A)`,
        this.context
      );
      optimizedCurrent = finalCurrent;
    }

    this.logger.log(`Optimizing charging: ${availablePower}W available, setting to ${optimizedCurrent}A (boost: ${boostLevel}A)`, this.context);

    // Use cached status to avoid redundant API calls
    const currentStatus = this.cachedStatus;
    if (!currentStatus) {
      this.logger.warn('No cached status available, cannot optimize charging without current state', this.context);
      return;
    }

    if (availablePower < minPowerWithTolerance && !neverStopCharging) {
      // Not enough power to charge and neverStopCharging is disabled
      if (currentStatus.charging) {
        const now = new Date();

        // First time detecting insufficient power
        if (!this.insufficientPowerFirstDetected) {
          this.insufficientPowerFirstDetected = now;

          // Immediately reduce to minimum charging + boost on first detection
          const minimumCurrentWithBoost = Math.min(20, minCurrent + boostLevel);
          await this.setMaxCurrent(minimumCurrentWithBoost);
          this.logger.log(
            `Insufficient power detected (${availablePower}W < ${minPowerWithTolerance}W), reduced to minimum charging (${minimumCurrentWithBoost}A = 6A + ${boostLevel}A boost), waiting for next verification before stopping`,
            this.context
          );
        } else {
          // Check if enough time has passed since first detection (wait for next automation cycle)
          const timeSinceFirstDetected = now.getTime() - this.insufficientPowerFirstDetected.getTime();
          const waitTimeMs = 90000; // 90 seconds (more than one automation cycle)

          if (timeSinceFirstDetected >= waitTimeMs) {
            await this.setChargingEnabled(false);
            this.logger.log(
              `Insufficient power confirmed after ${Math.round(timeSinceFirstDetected / 1000)}s, charging disabled`,
              this.context
            );
            this.insufficientPowerFirstDetected = null; // Reset for next time
          } else {
            this.logger.log(
              `Insufficient power still detected, waiting ${Math.round((waitTimeMs - timeSinceFirstDetected) / 1000)}s more before stopping`,
              this.context
            );
          }
        }
      } else {
        this.logger.log(
          `Insufficient power (${availablePower}W < ${minPowerWithTolerance}W), charging already disabled`,
          this.context
        );
      }
    } else if (availablePower < minPowerWithTolerance && neverStopCharging) {
      // Not enough power but neverStopCharging is enabled - keep charging at minimum + boost
      const minimumCurrentWithBoost = Math.min(20, minCurrent + boostLevel); // Apply boost to minimum current too
      await this.setMaxCurrent(minimumCurrentWithBoost);

      if (!currentStatus.charging) {
        await this.setChargingEnabled(true);
      }

      this.logger.log(
        `Insufficient power (${availablePower}W < ${minPowerWithTolerance}W) but neverStopCharging enabled, ${currentStatus.charging ? 'continuing' : 'starting charging'} at ${minimumCurrentWithBoost}A (6A + ${boostLevel}A boost)`,
        this.context
      );
    } else {
      // Reset insufficient power detection since power is now sufficient
      if (this.insufficientPowerFirstDetected) {
        this.logger.log('Power is now sufficient, resetting insufficient power detection', this.context);
        this.insufficientPowerFirstDetected = null;
      }

      // Configure current and enable charging, but only if needed
      const needsCurrentUpdate = currentStatus.ChargeCurrentSet !== optimizedCurrent;
      const needsChargingEnable = !currentStatus.charging;

      if (needsCurrentUpdate) {
        await this.setMaxCurrent(optimizedCurrent);
        this.logger.log(
          `Updated charging current from ${currentStatus.ChargeCurrentSet}A to ${optimizedCurrent}A`,
          this.context
        );
      }

      if (needsChargingEnable) {
        await this.setChargingEnabled(true);
        this.logger.log('Charging enabled', this.context);
      }

      if (!needsCurrentUpdate && !needsChargingEnable) {
        this.logger.log(`Charging already optimized at ${optimizedCurrent}A and enabled`, this.context);
      }
    }
  }

  /**
   * Retrieves charging history
   */
  public async getChargingHistory(days: number = 7): Promise<any[]> {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);

      const data = await this.apiCall<any>(
        `/chargers/${this.chargerId}/sessions?from=${startDate.toISOString()}&to=${endDate.toISOString()}`
      );

      return data;
    } catch (error) {
      this.logger.error('Failed to get charging history', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves installation information
   */
  public async getInstallationInfo(): Promise<ZaptecInstallationInfo> {
    try {
      const data = await this.apiCall<ZaptecInstallationInfo>(`/installation/${this.installationId}`);
      return data;
    } catch (error) {
      this.logger.error('Failed to get installation info', error, this.context);
      throw error;
    }
  }

  /**
   * Updates installation settings (do not update more than once every 15 minutes)
   */
  public async updateInstallationInfo(updateData: ZaptecInstallationUpdateRequest): Promise<void> {
    try {
      await this.apiCall(`/installation/${this.installationId}/update`, {
        method: 'POST',
        body: JSON.stringify(updateData)
      });

      this.logger.log('Installation info updated successfully', this.context);
    } catch (error) {
      this.logger.error('Failed to update installation info', error, this.context);
      throw error;
    }
  }

  /**
   * Retrieves cached status without making API call
   * @returns {ZaptecStatus | null} Cached status or null if no cache available
   */
  public getCachedStatus(): ZaptecStatus | null {
    return this.cachedStatus;
  }

  /**
   * Gets the timestamp of the last status cache update
   * @returns {Date | null} Cache timestamp or null if no cache available
   */
  public getCacheTimestamp(): Date | null {
    return this.statusCacheTimestamp;
  }

  /**
   * Generates simulated Zaptec charger status for development/testing
   * @returns Simulated ZaptecStatus with realistic data
   */
  private generateSimulatedZaptecStatus(): ZaptecStatus {
    const now = Date.now();
    const scenarios = [
      {
        name: 'Charging High Power',
        charging: true,
        power: 7200,
        current: 32,
        vehicleConnected: true,
        operatingMode: '3' // Connected_Charging
      },
      {
        name: 'Charging Medium Power',
        charging: true,
        power: 3680,
        current: 16,
        vehicleConnected: true,
        operatingMode: '3' // Connected_Charging
      },
      {
        name: 'Vehicle Connected Not Charging',
        charging: false,
        power: 0,
        current: 0,
        vehicleConnected: true,
        operatingMode: '5' // Connected_Finished
      },
      {
        name: 'No Vehicle',
        charging: false,
        power: 0,
        current: 0,
        vehicleConnected: false,
        operatingMode: '1' // Disconnected
      }
    ];

    // Cycle through scenarios every 2 minutes for demo purposes
    const scenarioIndex = Math.floor((now / (2 * 60 * 1000)) % scenarios.length);
    const scenario = scenarios[scenarioIndex];

    const simulatedStatus: ZaptecStatus = {
      id: Constants.ZAPTEC.CHARGER_ID || 'simulated-charger-001',
      name: 'Simulated Zaptec Charger',
      online: true,
      charging: scenario.charging,
      power: scenario.power,
      totalPower: 125000 + (now % 50000), // Simulate gradually increasing total
      ChargeCurrentSet: scenario.current,
      vehicleConnected: scenario.vehicleConnected,
      operatingMode: scenario.operatingMode,
      deviceType: 2,
      serialNo: 'SIM000001'
    };

    this.logger.log(
      `Generated simulated Zaptec status: ${scenario.name} - Power: ${scenario.power}W, Current: ${scenario.current}A`,
      this.context
    );

    return simulatedStatus;
  }
}
