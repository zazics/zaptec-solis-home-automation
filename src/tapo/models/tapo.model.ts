/**
 * Tapo Smart Plug Models and Interfaces
 * 
 * Data models for TP-Link Tapo P110 smart plugs including device information,
 * power consumption metrics, and control states.
 */

/**
 * Tapo device information and status
 */
export interface TapoDeviceInfo {
  /** Device ID/MAC address */
  deviceId: string;
  /** Device friendly name */
  nickname: string;
  /** Device model (e.g., P110) */
  model: string;
  /** Firmware version */
  firmwareVersion: string;
  /** Hardware version */
  hardwareVersion: string;
  /** Device IP address */
  ip: string;
  /** Device online status */
  online: boolean;
  /** Device on/off state */
  deviceOn: boolean;
  /** Signal strength (0-100) */
  signalLevel: number;
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
  deviceInfo: TapoDeviceInfo;
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
      endTime: string;   // HH:mm format
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