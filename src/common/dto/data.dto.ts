// SolisDataDTO is now defined in src/solis/models/solis.model.ts
// with better structure using specific interfaces for each component
export { SolisDataDTO } from '../../solis/models/solis.model';

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