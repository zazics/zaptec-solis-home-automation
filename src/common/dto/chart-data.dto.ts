/**
 * DTO for chart data points with timestamp and values
 */
export interface ChartDataPoint {
  timestamp: Date;
  value: number;
}

/**
 * DTO for multi-series chart data (e.g., production vs consumption)
 */
export interface MultiSeriesChartData {
  timestamp: Date;
  values: Record<string, number>;
}

/**
 * DTO for solar production chart data by time period
 */
export interface SolarProductionChartData {
  period: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly';
  startDate: Date;
  endDate: Date;
  data: ChartDataPoint[];
  totalEnergyKwh: number; // Total energy production in kWh for the period
}

/**
 * DTO for grid exchange chart data (import/export)
 */
export interface GridExchangeChartData {
  period: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly';
  startDate: Date;
  endDate: Date;
  imported: ChartDataPoint[];
  exported: ChartDataPoint[];
}

/**
 * DTO for house consumption chart data
 */
export interface HouseConsumptionChartData {
  period: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly';
  startDate: Date;
  endDate: Date;
  data: ChartDataPoint[];
}

/**
 * DTO for Zaptec charger consumption chart data
 */
export interface ZaptecConsumptionChartData {
  period: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly';
  startDate: Date;
  endDate: Date;
  data: ChartDataPoint[];
}

/**
 * DTO for battery charge and power chart data
 */
export interface BatteryChartData {
  period: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly';
  startDate: Date;
  endDate: Date;
  data: ChartDataPoint[]; // SOC values in %
  powerData: ChartDataPoint[]; // Power values in W (positive = discharging, negative = charging)
}

/**
 * Combined dashboard chart data
 */
export interface DashboardChartData {
  period: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly';
  startDate: Date;
  endDate: Date;
  solarProduction: ChartDataPoint[];
  houseConsumption: ChartDataPoint[];
  zaptecConsumption: ChartDataPoint[];
  gridImported: ChartDataPoint[];
  gridExported: ChartDataPoint[];
  totalSolarEnergyKwh: number; // Total solar energy production in kWh for the period
}

/**
 * Chart period options with predefined ranges
 */
export interface ChartPeriodOption {
  key: 'day' | 'week' | 'month' | 'year';
  label: string;
  groupBy: 'quarterly' | 'hourly' | 'daily' | 'monthly' | 'yearly';
  daysBack: number;
}

export const CHART_PERIODS: ChartPeriodOption[] = [
  { key: 'day', label: 'Jour (/15min)', groupBy: 'quarterly', daysBack: 1 },
  { key: 'week', label: 'Semaine (/h)', groupBy: 'hourly', daysBack: 7 },
  { key: 'month', label: 'Mois (/jour)', groupBy: 'daily', daysBack: 30 },
  { key: 'year', label: 'Année (/mois)', groupBy: 'monthly', daysBack: 365 }
];
