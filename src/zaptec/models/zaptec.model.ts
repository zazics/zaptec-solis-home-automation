export interface ZaptecStatus {
  id: string;
  name?: string;
  online?: boolean;
  charging?: boolean;
  power?: number; // Watts
  totalPower?: number; // W
  ChargeCurrentSet?: number; // A
  vehicleConnected?: boolean;
  operatingMode?: string; // ChargerOperationMode:0=Unknown, 1=Disconnected, 2=Connected_Requesting, 3=Connected_Charging, 5=Connected_Finished
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

export interface ZaptecInstallationInfo {
  Id: string;
  Name: string;
  Address: string;
  ZipCode: string;
  City: string;
  CountryId: string;
  InstallationType: number;
  MaxCurrent: number;
  AvailableCurrent: number;
  AvailableCurrentPhase1: number;
  AvailableCurrentPhase2: number;
  AvailableCurrentPhase3: number;
  AvailableCurrentMode: number;
  AvailableCurrentScheduleWeekendActive: boolean;
  DefaultThreeToOneSwitchCurrent: number;
  InstallationCategoryId: string;
  InstallationCategory: string;
  UseLoadBalancing: boolean;
  IsRequiredAuthentication: boolean;
  Latitude: number;
  Longitude: number;
  Active: boolean;
  NetworkType: number;
  AvailableInternetAccessPLC: boolean;
  AvailableInternetAccessWiFi: boolean;
  CreatedOnDate: string;
  UpdatedOn: string;
  CurrentUserRoles: number;
  AuthenticationType: number;
  MessagingEnabled: boolean;
  RoutingId: string;
  OcppCloudUrlVersion: number;
  TimeZoneName: string;
  TimeZoneIanaName: string;
  IsSubscriptionsAvailableForCurrentUser: boolean;
  AvailableFeatures: number;
  EnabledFeatures: number;
  ActiveChargerCount: number;
  Feature_PowerManagement_EcoMode_DepartureTime: number;
  Feature_PowerManagement_EcoMode_MinEnergy: number;
  Feature_PowerManagement_Apm_SinglePhaseMappedToPhase: number;
  PropertyIsMinimumPowerOfflineMode: boolean;
  PropertyOfflineModeAllowAnonymous: boolean;
  PropertyEnergySensorUniqueId: string;
  PropertyMainFuseCurrent: number;
  PropertyExperimentalFeaturesEnabled: number;
  PropertyEnergySensorRippleEnabled: boolean;
  PropertyEnergySensorRippleNumBits: number;
  PropertyEnergySensorRipplePercentBits00: number;
  PropertyEnergySensorRipplePercentBits01: number;
  PropertyEnergySensorRipplePercentBits10: number;
  PropertyFirmwareAutomaticUpdates: boolean;
  PropertySessionMaxStopCount: number;
}

export interface ZaptecInstallationUpdateRequest {
  availableCurrent?: number | null; // Available current to set on all phases
  availableCurrentPhase1?: number | null; // Available current to set on phase 1. When setting current on individual phases, any phase without specified current will be set to default
  availableCurrentPhase2?: number | null; // Available current to set on phase 2. When setting current on individual phases, any phase without specified current will be set to default
  availableCurrentPhase3?: number | null; // Available current to set on phase 3. When setting current on individual phases, any phase without specified current will be set to default
  maxCurrent?: number | null; // The maximum allowed current for the installation. This setting requires caller to have service permission (electrician) for the installation
  minPowerOfflineMode?: boolean | null; // When set to true, offline power will be limited to the chargers minimum charge current
  threeToOnePhaseSwitchCurrent?: number | null; // Set 3to1 switch current for installation
}

export interface ApiResponse {
  success: boolean;
  message: string;
  timestamp: string;
}
