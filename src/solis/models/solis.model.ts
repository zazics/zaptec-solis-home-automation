/**
 * Interface for solar PV panel data
 */
export interface SolisPVData {
  pv1: {
    voltage: number;
    current: number;
    power: number;
  };
  pv2: {
    voltage: number;
    current: number;
    power: number;
  };
  totalPowerDC: number;
}

/**
 * Interface for AC power data
 */
export interface SolisACData {
  totalPowerAC: number;
  frequency: number;
  temperature: number;
}

/**
 * Interface for house consumption data
 */
export interface SolisHouseData {
  consumption: number;
  backupConsumption: number;
}

/**
 * Interface for electrical grid data
 */
export interface SolisGridData {
  activePower: number;
  inverterPower: number;
  importedEnergyTotal: number;
  exportedEnergyTotal: number;
}

/**
 * Interface for battery data
 */
export interface SolisBatteryData {
  power: number;
  soc: number;
  voltage: number;
  current: number;
}

/**
 * Interface for complete Solis inverter data
 */
export interface SolisInverterData {
  status: {
    code: number;
    text: string;
  };
  timestamp: Date;
  pv: SolisPVData;
  ac: SolisACData;
  house: SolisHouseData;
  grid: SolisGridData;
  battery: SolisBatteryData;
}

/**
 * Configuration options for Solis connection
 */
export interface SolisConnectionOptions {
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'mark' | 'odd' | 'space';
  slaveId?: number;
  responseTimeout?: number;
  retryCount?: number;
  retryDelay?: number;
}