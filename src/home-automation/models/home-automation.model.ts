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
  mode: 'surplus' | 'manual' | 'minimum';
}

export interface AutomationConfig {
  enabled: boolean;
  mode: 'surplus' | 'manual' | 'minimum';
  maxChargingPower: number; // Maximum charging power (W)
  priorityLoadReserve: number; // Power to reserve for priority loads (W)
  neverStopCharging: boolean; // Never stop charging once started (overrides power thresholds)
  boostLevel: number; // Boost charging current by this many amps (0-10A, capped at 20A total)
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
    currentMode: 'surplus' | 'manual' | 'minimum';
    solarEfficiency: number;
    chargingEfficiency: number;
  };
  timestamp: string;
}

/**
 * Interface for daily Solis statistics
 */
export interface SolisDailyStats {
  date: string;
  maxPvPower: number;
  avgPvPower: number;
  maxAcPower: number;
  avgAcPower: number;
  maxHouseConsumption: number;
  avgHouseConsumption: number;
  maxGridInjection: number;
  avgGridInjection: number;
  totalDataPoints: number;
  minBatterySoc: number;
  maxBatterySoc: number;
  avgBatterySoc: number;
}

/**
 * Interface for daily Zaptec statistics
 */
export interface ZaptecDailyStats {
  date: string;
  totalRecords: number;
  chargingTime: number;
  chargingPercentage: number;
  averagePower: number;
  maxPower: number;
  firstRecord: Date | null;
  lastRecord: Date | null;
}
