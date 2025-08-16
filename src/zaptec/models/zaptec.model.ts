export interface ZaptecStatus {
  id: string;
  name?: string;
  online?: boolean;
  charging?: boolean;
  power?: number; // Watts
  totalPower?: number;
  vehicleConnected?: boolean;
  operatingMode?: number; // ChargerOperationMode value
  deviceType?: number; // Device type from API
  serialNo?: string; // Serial number
}

export interface ZaptecStateObservation {
  ChargerId: string;
  StateId: number;
  Timestamp: string;
  ValueAsString?: string;
}

export interface ZaptecChargerInfo {
  Id: string;
  Name: string;
  DeviceId: string;
  SerialNo: string;
  CreatedOnDate: string;
  CircuitId: string;
  Active: boolean;
  IsOnline: boolean;
  OperatingMode: number;
  CurrentUserRoles: number;
  Pin: string;
  PropertyPinOfflinePhase: boolean;
  PropertyAuthenticationDisabled: boolean;
  HasSessions: boolean;
  PropertyOfflinePhaseOverride: number;
  SignedMeterValueKwh: number;
  SignedMeterValue: string;
  DeviceType: number;
  InstallationName: string;
  InstallationId: string;
  AuthenticationType: number;
  IsAuthorizationRequired: boolean;
  MID?: string;
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
