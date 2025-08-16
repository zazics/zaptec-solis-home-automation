import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ZaptecStateObservation,
  ZaptecStatus,
  ZaptecChargerInfo,
  ZaptecInstallationInfo,
  ZaptecInstallationUpdateRequest,
} from './models/zaptec.model';
import { LoggingService } from '../common/logging.service';

@Injectable()
export class ZaptecService {
  private readonly context = ZaptecService.name;

  // Configuration
  private readonly baseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly chargerId: string;
  private readonly installationId: string;

  // Auth token
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  // Solar panel max power configuration
  private readonly maxSolarPowerWatts: number;

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
    716: 'DetectedCar', // Car detection
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggingService,
  ) {
    this.baseUrl = this.configService.get<string>('ZAPTEC_API_URL', 'https://api.zaptec.com');
    this.apiBaseUrl = this.configService.get<string>('ZAPTEC_API_BASE_URL', 'https://api.zaptec.com/api');
    this.username = this.configService.get<string>('ZAPTEC_USERNAME', '');
    this.password = this.configService.get<string>('ZAPTEC_PASSWORD', '');
    this.chargerId = this.configService.get<string>('ZAPTEC_CHARGER_ID', '');
    this.installationId = this.configService.get<string>('ZAPTEC_INSTALLATION_ID', '');
    this.maxSolarPowerWatts = this.configService.get<number>('MAX_SOLAR_POWER_WATTS', 5000);
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
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'password',
          username: this.username,
          password: this.password,
        }),
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
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
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
      // Get basic charger info
      const chargerInfo = await this.apiCall<ZaptecChargerInfo>(`/chargers/${this.chargerId}`);

      const zaptecStatus: ZaptecStatus = {
        id: this.chargerId,
        online: chargerInfo.IsOnline,
        name: chargerInfo.Name,
        deviceType: chargerInfo.DeviceType,
        serialNo: chargerInfo.SerialNo,
      };

      // Get detailed state information
      const stateObservations = await this.apiCall<ZaptecStateObservation[]>(`/chargers/${this.chargerId}/state`);

      const stateMap = this.parseStateObservations(stateObservations);

      // Extract values with correct StateId mappings
      zaptecStatus.operatingMode = stateMap.ChargerOperationMode;
      zaptecStatus.charging = stateMap.ChargerOperationMode === 3;
      zaptecStatus.power = stateMap.TotalChargePower;
      zaptecStatus.vehicleConnected = stateMap.operatingMode >= 2 && stateMap.operatingMode <= 5;

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
        availableCurrent: maxCurrent,
      });

      this.logger.log(`Set available current to ${maxCurrent}A`, this.context);
    } catch (error) {
      this.logger.error('Failed to set available current', error, this.context);
      throw error;
    }
  }

  /**
   * Enables or disables charging
   */
  public async setChargingEnabled(enabled: boolean): Promise<void> {
    try {
      const endpoint = enabled ? 'start_charging' : 'stop_charging';
      await this.apiCall(`/chargers/${this.chargerId}/${endpoint}`, {
        method: 'POST',
      });

      this.logger.log(`Charging ${enabled ? 'enabled' : 'disabled'}`, this.context);
    } catch (error) {
      this.logger.error('Failed to set charging state', error, this.context);
      throw error;
    }
  }

  /**
   * Configures optimal charging parameters based on available power
   */
  public async optimizeCharging(availablePower: number): Promise<void> {
    // Typical voltage in Europe (230V single-phase)
    const voltage = 230;

    // Calculate the maximum possible current with available power
    // P = U * I, so I = P / U
    const maxPossibleCurrent = Math.floor(availablePower / voltage);

    // Limit current between 6A (minimum for charging) and calculated max from solar panels
    const minCurrent = 6;
    const maxCurrentFromSolar = Math.floor(this.maxSolarPowerWatts / voltage);
    const maxCurrent = Math.min(32, maxCurrentFromSolar); // Never exceed 32A or solar panel capacity
    const optimizedCurrent = Math.max(minCurrent, Math.min(maxCurrent, maxPossibleCurrent));

    this.logger.log(`Optimizing charging: ${availablePower}W available, setting to ${optimizedCurrent}A`, this.context);

    if (availablePower < minCurrent * voltage) {
      // Not enough power to charge, disable
      await this.setChargingEnabled(false);
      this.logger.log('Insufficient power, charging disabled', this.context);
    } else {
      // Configure current and enable charging
      await this.setMaxCurrent(optimizedCurrent);
      await this.setChargingEnabled(true);
      this.logger.log(`Charging optimized to ${optimizedCurrent}A`, this.context);
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
        `/chargers/${this.chargerId}/sessions?from=${startDate.toISOString()}&to=${endDate.toISOString()}`,
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
        body: JSON.stringify(updateData),
      });

      this.logger.log('Installation info updated successfully', this.context);
    } catch (error) {
      this.logger.error('Failed to update installation info', error, this.context);
      throw error;
    }
  }

  /**
   * Tests connectivity with the Zaptec API
   */
  public async testConnection(): Promise<boolean> {
    try {
      await this.authenticate();
      await this.getChargerStatus();
      return true;
    } catch (error) {
      this.logger.error('Zaptec connection test failed', error, this.context);
      return false;
    }
  }
}
