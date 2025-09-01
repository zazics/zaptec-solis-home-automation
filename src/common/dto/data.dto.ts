/**
 * DTO for Solis solar inverter data
 * Clean representation without database-specific fields
 */
export interface SolisDataDTO {
  timestamp: Date;
  status: {
    code: number;
    text: string;
  };
  pv: {
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
  };
  ac: {
    totalPowerAC: number;
    frequency: number;
    temperature: number;
  };
  house: {
    consumption: number;
    backupConsumption: number;
  };
  grid: {
    activePower: number;
    inverterPower: number;
    importedEnergyTotal: number;
    exportedEnergyTotal: number;
  };
  battery: {
    power: number;
    soc: number;
    voltage: number;
    current: number;
  };
}

/**
 * DTO for Zaptec charger data
 * Clean representation without database-specific fields like timestamp
 */
export interface ZaptecDataDTO {
  id: string;
  name: string;
  online: boolean;
  charging: boolean;
  power: number;
  totalPower: number;
  ChargeCurrentSet: number;
  vehicleConnected: boolean;
  operatingMode: string;
  deviceType: number;
  serialNo: string;
}