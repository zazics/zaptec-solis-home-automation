/**
 * Open-Meteo API response structure
 */
export interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  hourly_units: {
    time: string;
    shortwave_radiation: string;
    cloudcover: string;
    temperature_2m: string;
  };
  hourly: {
    time: string[];
    shortwave_radiation: number[];
    cloudcover: number[];
    temperature_2m: number[];
  };
}

/**
 * Weather forecast data for a specific hour
 */
export interface WeatherForecast {
  time: string;
  solarRadiation: number; // W/m²
  cloudCover: number; // 0-100%
  temperature: number; // °C
}

/**
 * Solar power forecast for a specific hour
 */
export interface SolarPowerForecast {
  time: string;
  predictedPower: number; // Watts
  solarRadiation: number; // W/m²
  cloudCover: number; // 0-100%
  efficiency: number; // 0-1 (efficiency factor based on conditions)
}

/**
 * Daily solar power forecast summary
 */
export interface DailySolarForecast {
  date: string;
  totalEnergyKWh: number;
  peakPowerW: number;
  averagePowerW: number;
  hourlyForecasts: SolarPowerForecast[];
}

/**
 * Solar panel configuration
 */
export interface SolarPanelConfig {
  totalCapacityW: number; // Total installed capacity in Watts
  efficiency: number; // Panel efficiency (0-1, typically 0.15-0.22)
  temperatureCoefficient: number; // Power loss per °C above 25°C (typically -0.004)
  systemLosses: number; // Inverter and wiring losses (typically 0.1-0.15)
}