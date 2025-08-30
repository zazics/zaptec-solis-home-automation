import { Injectable, Logger } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { WeatherForecast, SolarPowerForecast, DailySolarForecast, SolarPanelConfig } from './models/weather.model';
import { Constants } from '../constants';

/**
 * SolarForecastService predicts solar power generation based on weather forecasts
 * 
 * Uses weather data from Open-Meteo to predict:
 * - Hourly solar power generation
 * - Daily energy production totals
 * - Peak power periods
 * - Cloud impact on efficiency
 */
@Injectable()
export class SolarForecastService {
  private readonly logger = new Logger(SolarForecastService.name);

  constructor(
    private readonly weatherService: WeatherService
  ) {}

  /**
   * Gets solar power forecast for the next hours/days
   * @param hours - Number of hours to forecast (default: 48)
   * @returns Promise<SolarPowerForecast[]> - Hourly solar power predictions
   */
  public async getSolarPowerForecast(hours: number = 48): Promise<SolarPowerForecast[]> {
    const latitude = Constants.LOCATION.LATITUDE;
    const longitude = Constants.LOCATION.LONGITUDE;
    const forecastDays = Math.ceil(hours / 24);

    try {
      const weatherData = await this.weatherService.getWeatherForecast(latitude, longitude, forecastDays);
      const panelConfig = this.getPanelConfiguration();
      
      const solarForecasts: SolarPowerForecast[] = [];
      
      for (let i = 0; i < Math.min(weatherData.length, hours); i++) {
        const weather = weatherData[i]!;
        const prediction = this.calculateSolarPower(weather, panelConfig);
        solarForecasts.push(prediction);
      }

      this.logger.debug(`Generated solar forecast for ${solarForecasts.length} hours`);
      return solarForecasts;
    } catch (error) {
      this.logger.error(`Failed to generate solar forecast: ${error.message}`);
      throw new Error(`Solar forecast unavailable: ${error.message}`);
    }
  }

  /**
   * Gets daily solar power forecast summary
   * @param days - Number of days to forecast (default: 2)
   * @returns Promise<DailySolarForecast[]> - Daily solar power summaries
   */
  public async getDailySolarForecast(days: number = 2): Promise<DailySolarForecast[]> {
    const hourlyForecasts = await this.getSolarPowerForecast(days * 24);
    const dailyForecasts: DailySolarForecast[] = [];

    // Group hourly forecasts by date
    const forecastsByDate = new Map<string, SolarPowerForecast[]>();
    
    for (const forecast of hourlyForecasts) {
      const date = forecast.time.split('T')[0]!;
      if (!forecastsByDate.has(date)) {
        forecastsByDate.set(date, []);
      }
      forecastsByDate.get(date)!.push(forecast);
    }

    // Calculate daily summaries
    for (const [date, forecasts] of forecastsByDate) {
      const totalEnergyKWh = forecasts.reduce((sum, f) => sum + (f.predictedPower / 1000), 0);
      const peakPowerW = Math.max(...forecasts.map(f => f.predictedPower));
      const averagePowerW = forecasts.reduce((sum, f) => sum + f.predictedPower, 0) / forecasts.length;

      dailyForecasts.push({
        date,
        totalEnergyKWh,
        peakPowerW,
        averagePowerW,
        hourlyForecasts: forecasts
      });
    }

    return dailyForecasts;
  }

  /**
   * Gets current predicted solar power generation
   * @returns Promise<SolarPowerForecast> - Current solar power prediction
   */
  public async getCurrentSolarPowerForecast(): Promise<SolarPowerForecast> {
    const latitude = Constants.LOCATION.LATITUDE;
    const longitude = Constants.LOCATION.LONGITUDE;

    try {
      const currentWeather = await this.weatherService.getCurrentWeather(latitude, longitude);
      const panelConfig = this.getPanelConfiguration();
      
      return this.calculateSolarPower(currentWeather, panelConfig);
    } catch (error) {
      this.logger.error(`Failed to get current solar forecast: ${error.message}`);
      throw new Error(`Current solar forecast unavailable: ${error.message}`);
    }
  }

  /**
   * Calculates solar power generation based on weather conditions
   * @param weather - Weather forecast data
   * @param panelConfig - Solar panel configuration
   * @returns SolarPowerForecast - Predicted solar power
   */
  private calculateSolarPower(weather: WeatherForecast, panelConfig: SolarPanelConfig): SolarPowerForecast {
    // Base power from solar radiation
    const standardRadiation = 1000; // W/m² (standard test conditions)
    const basePower = (weather.solarRadiation / standardRadiation) * panelConfig.totalCapacityW;

    // Temperature efficiency factor (panels lose efficiency when hot)
    const temperatureEffect = 1 + panelConfig.temperatureCoefficient * (weather.temperature - 25);
    
    // Cloud cover efficiency factor
    const cloudEffect = 1 - (weather.cloudCover / 100) * 0.7; // Clouds reduce efficiency by up to 70%
    
    // Overall efficiency
    const efficiency = panelConfig.efficiency * temperatureEffect * cloudEffect * (1 - panelConfig.systemLosses);
    
    // Final predicted power (never negative)
    const predictedPower = Math.max(0, basePower * efficiency);

    return {
      time: weather.time,
      predictedPower: Math.round(predictedPower),
      solarRadiation: weather.solarRadiation,
      cloudCover: weather.cloudCover,
      efficiency: Math.max(0, efficiency)
    };
  }

  /**
   * Gets solar panel configuration from Constants
   * Takes into account inverter power limitation as the bottleneck
   * @returns SolarPanelConfig - Panel configuration
   */
  private getPanelConfiguration(): SolarPanelConfig {
    const panelCapacityW = Constants.SOLAR_PANEL.CAPACITY_W; // 9000W (18 × 500W)
    const inverterMaxW = Constants.POWER.INVERTER_MAX_POWER; // 5000W limit
    
    // Use the lower of panel capacity or inverter maximum
    const effectiveCapacityW = Math.min(panelCapacityW, inverterMaxW);
    
    return {
      totalCapacityW: effectiveCapacityW, // Limited by inverter capacity
      efficiency: Constants.SOLAR_PANEL.EFFICIENCY,
      temperatureCoefficient: Constants.SOLAR_PANEL.TEMPERATURE_COEFFICIENT,
      systemLosses: Constants.SOLAR_PANEL.SYSTEM_LOSSES
    };
  }
}