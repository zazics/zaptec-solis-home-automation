export interface AutomationStatus {
  enabled: boolean;
  lastUpdate: Date;
  solarProduction: number; // W
  houseConsumption: number; // W
  availableForCharging: number; // W
  chargingStatus: {
    active: boolean;
    current: number; // A
    power: number; // W
  };
  mode: 'surplus' | 'scheduled' | 'manual';
}

export interface AutomationConfig {
  enabled: boolean;
  mode: 'surplus' | 'scheduled' | 'manual';
  minSurplusPower: number; // Minimum surplus power to start charging (W)
  maxChargingPower: number; // Maximum charging power (W)
  scheduledHours: string[]; // Hours when charging is allowed (24h format)
  priorityLoadReserve: number; // Power to reserve for priority loads (W)
}

/**
 * Interface for configuration update response
 */
export interface ConfigUpdateResponse {
  success: boolean;
  config: AutomationConfig;
  timestamp: string;
}

/**
 * Interface for automation action response
 */
export interface AutomationActionResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

/**
 * Interface for dashboard data response
 */
export interface DashboardResponse {
  status: AutomationStatus;
  config: AutomationConfig;
  summary: {
    systemStatus: 'active' | 'inactive';
    currentMode: 'surplus' | 'scheduled' | 'manual';
    solarEfficiency: number;
    chargingEfficiency: number;
  };
  timestamp: string;
}
