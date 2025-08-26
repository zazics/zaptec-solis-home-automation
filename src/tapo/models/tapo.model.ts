/**
 * Tapo Smart Plug Models and Interfaces
 *
 * Data models for TP-Link Tapo P110 smart plugs including device information,
 * power consumption metrics, and control states.
 */

import { TapoDevice, TapoDeviceInfo } from 'tp-link-tapo-connect';

/**
 * Import types from tp-link-tapo-connect library
 */
export { TapoDevice, TapoDeviceInfo } from 'tp-link-tapo-connect';

/**
 * Tapo Cloud API interface returned by cloudLogin()
 */
export interface TapoCloudApi {
  /** List all devices */
  listDevices(): Promise<TapoDevice[]>;
  /** List devices by type */
  listDevicesByType(deviceType: string): Promise<TapoDevice[]>;
  /** Get Tapo Care cloud videos */
  tapoCareCloudVideos(
    deviceId: string,
    order?: string,
    page?: number,
    pageSize?: number,
    startTime?: string | null,
    endTime?: string | null
  ): Promise<any>;
}

/**
 * Tapo Device Controller interface returned by loginDeviceByIp() and loginDevice()
 */
export interface TapoDeviceController {
  /** Turn device on */
  turnOn(deviceId?: string): Promise<void>;
  /** Turn device off */
  turnOff(deviceId?: string): Promise<void>;
  /** Set brightness for smart bulbs */
  setBrightness(brightnessLevel?: number): Promise<void>;
  /** Set color for smart bulbs */
  setColour(colour?: string): Promise<void>;
  /** Set HSL for smart bulbs */
  setHSL(hue: number, sat: number, lum: number): Promise<void>;
  /** Get device information */
  getDeviceInfo(): Promise<TapoDeviceInfo>;
  /** Get child devices info (for hubs) */
  getChildDevicesInfo(): Promise<TapoDeviceInfo[]>;
  /** Get energy usage data */
  getEnergyUsage(): Promise<TapoDeviceInfo>;
}

/**
 * Extended Tapo device info with additional fields for our service
 */
export interface TapoDeviceInfoExtended extends TapoDeviceInfo {
  /** Last update timestamp */
  lastUpdate: Date;
}

/**
 * Power consumption data from P110 energy monitoring
 */
export interface TapoPowerData {
  /** Current power consumption in watts */
  currentPower: number;
  /** Today's energy consumption in kWh */
  todayEnergy: number;
  /** This month's energy consumption in kWh */
  monthEnergy: number;
  /** Current voltage in volts */
  voltage: number;
  /** Current amperage in amps */
  current: number;
  /** Timestamp of the measurement */
  timestamp: Date;
}

/**
 * Complete Tapo device status including power data
 */
export interface TapoStatus {
  /** Device information */
  deviceInfo: TapoDeviceInfoExtended;
  /** Power/energy data (only for P110) */
  powerData?: TapoPowerData;
}

/**
 * Tapo device configuration for connection
 */
export interface TapoDeviceConfig {
  /** Device friendly name for identification */
  name: string;
  /** Device IP address on local network */
  ip: string;
  /** Device type (P100, P110, etc.) */
  type: 'P100' | 'P110' | 'P105' | 'P115';
  /** Device description/purpose */
  description?: string;
  /** Room or location */
  location?: string;
}

/**
 * Tapo automation rule for device control
 */
export interface TapoAutomationRule {
  /** Rule unique identifier */
  id: string;
  /** Rule friendly name */
  name: string;
  /** Target device name */
  deviceName: string;
  /** Condition for activation */
  condition: {
    /** Available power threshold in watts */
    availablePowerThreshold?: number;
    /** Battery SOC threshold in percentage */
    batterySocThreshold?: number;
    /** Time-based condition */
    timeCondition?: {
      startTime: string; // HH:mm format
      endTime: string; // HH:mm format
    };
    /** Solar production threshold */
    solarProductionThreshold?: number;
  };
  /** Action to perform when condition is met */
  action: 'turn_on' | 'turn_off';
  /** Action to perform when condition is not met */
  fallbackAction?: 'turn_on' | 'turn_off';
  /** Rule enabled status */
  enabled: boolean;
  /** Priority (higher number = higher priority) */
  priority: number;
}

/**
 * Tapo service status and statistics
 */
export interface TapoServiceStatus {
  /** Number of configured devices */
  deviceCount: number;
  /** Number of online devices */
  onlineDevices: number;
  /** Number of devices currently on */
  activeDevices: number;
  /** Total current power consumption of all devices */
  totalPowerConsumption: number;
  /** Last successful update timestamp */
  lastUpdate: Date;
  /** List of device statuses */
  devices: TapoStatus[];
}
