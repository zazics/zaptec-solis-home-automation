import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ZaptecStateObservation, ZaptecStatus, ZaptecChargerInfo } from './models/zaptec.model';

@Injectable()
export class ZaptecService {
  private readonly logger = new Logger(ZaptecService.name);

  // Configuration
  private readonly baseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly chargerId: string;

  // Auth token
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

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

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('ZAPTEC_API_URL', 'https://api.zaptec.com');
    this.apiBaseUrl = this.configService.get<string>('ZAPTEC_API_BASE_URL', 'https://api.zaptec.com/api');
    this.username = this.configService.get<string>('ZAPTEC_USERNAME', '');
    this.password = this.configService.get<string>('ZAPTEC_PASSWORD', '');
    this.chargerId = this.configService.get<string>('ZAPTEC_CHARGER_ID', '');
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

      this.logger.log('Successfully authenticated with Zaptec API');
    } catch (error) {
      this.logger.error('Failed to authenticate with Zaptec API:', error);
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
      this.logger.error('Failed to get charger status:', error);
      throw error;
    }
  }

  /**
   * Sets the maximum charging current
   */
  public async setMaxCurrent(maxCurrent: number): Promise<void> {
    try {
      await this.apiCall(`/chargers/${this.chargerId}/settings`, {
        method: 'PUT',
        body: JSON.stringify({
          MaxCurrent: maxCurrent,
        }),
      });

      this.logger.log(`Set max current to ${maxCurrent}A`);
    } catch (error) {
      this.logger.error('Failed to set max current:', error);
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

      this.logger.log(`Charging ${enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      this.logger.error('Failed to set charging state:', error);
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

    // Limit current between 6A (minimum for charging) and 32A (typical maximum)
    const minCurrent = 6;
    const maxCurrent = 32;
    const optimizedCurrent = Math.max(minCurrent, Math.min(maxCurrent, maxPossibleCurrent));

    this.logger.log(`Optimizing charging: ${availablePower}W available, setting to ${optimizedCurrent}A`);

    if (availablePower < minCurrent * voltage) {
      // Not enough power to charge, disable
      await this.setChargingEnabled(false);
      this.logger.log('Insufficient power, charging disabled');
    } else {
      // Configure current and enable charging
      await this.setMaxCurrent(optimizedCurrent);
      await this.setChargingEnabled(true);
      this.logger.log(`Charging optimized to ${optimizedCurrent}A`);
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
      this.logger.error('Failed to get charging history:', error);
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
      this.logger.error('Zaptec connection test failed:', error);
      return false;
    }
  }
}
