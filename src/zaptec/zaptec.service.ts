import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ZaptecStatus {
  id: string;
  name: string;
  online: boolean;
  charging: boolean;
  current: number; // Amperes
  power: number; // Watts
  energy: number; // kWh
  vehicleConnected: boolean;
}

export interface ZaptecChargingSettings {
  maxCurrent: number; // Amperes
  enabled: boolean;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

@Injectable()
export class ZaptecService {
  private readonly logger = new Logger(ZaptecService.name);

  // Configuration
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly chargerId: string;

  // Auth token
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('ZAPTEC_API_URL', 'https://api.zaptec.com');
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
  private async apiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
    await this.authenticate();

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
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
   * Retrieves the charging station status
   */
  public async getChargerStatus(): Promise<ZaptecStatus> {
    try {
      const data = await this.apiCall(`/chargers/${this.chargerId}`);

      return {
        id: data.Id,
        name: data.Name || 'Zaptec Charger',
        online: data.IsOnline || false,
        charging: data.IsCharging || false,
        current: data.ChargeCurrent || 0,
        power: data.ChargePower || 0,
        energy: data.ChargeEnergy || 0,
        vehicleConnected: data.IsConnected || false,
      };
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

      const data = await this.apiCall(
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
