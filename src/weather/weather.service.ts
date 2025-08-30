import { Injectable, Logger } from '@nestjs/common';
import { OpenMeteoResponse, WeatherForecast } from './models/weather.model';

/**
 * WeatherService handles communication with Open-Meteo API
 * 
 * Open-Meteo is a free weather API that provides:
 * - No API key required
 * - No usage limits
 * - High-quality weather data
 * - Solar radiation forecasts
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);
  private readonly baseUrl = 'https://api.open-meteo.com/v1/forecast';

  /**
   * Gets weather forecast from Open-Meteo API
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @param forecastDays - Number of days to forecast (1-16)
   * @returns Promise<WeatherForecast[]> - Array of hourly weather forecasts
   */
  public async getWeatherForecast(
    latitude: number,
    longitude: number,
    forecastDays: number = 2
  ): Promise<WeatherForecast[]> {
    try {
      const url = this.buildApiUrl(latitude, longitude, forecastDays);
      this.logger.debug(`Fetching weather data from: ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Open-Meteo API error: ${response.status} ${response.statusText}`);
      }

      const data: OpenMeteoResponse = await response.json();
      return this.parseWeatherData(data);
    } catch (error) {
      this.logger.error(`Failed to fetch weather data: ${error.message}`);
      throw new Error(`Weather service unavailable: ${error.message}`);
    }
  }

  /**
   * Gets current weather conditions
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @returns Promise<WeatherForecast> - Current weather data
   */
  public async getCurrentWeather(
    latitude: number,
    longitude: number
  ): Promise<WeatherForecast> {
    const forecasts = await this.getWeatherForecast(latitude, longitude, 1);
    const now = new Date();
    
    // Find the forecast closest to current time
    return forecasts.reduce((closest, forecast) => {
      const forecastTime = new Date(forecast.time);
      const closestTime = new Date(closest.time);
      
      return Math.abs(forecastTime.getTime() - now.getTime()) < 
             Math.abs(closestTime.getTime() - now.getTime()) ? forecast : closest;
    });
  }

  /**
   * Builds the Open-Meteo API URL with required parameters
   * @param latitude - Latitude coordinate
   * @param longitude - Longitude coordinate
   * @param forecastDays - Number of forecast days
   * @returns string - Complete API URL
   */
  private buildApiUrl(latitude: number, longitude: number, forecastDays: number): string {
    const params = new URLSearchParams({
      latitude: latitude.toString(),
      longitude: longitude.toString(),
      hourly: 'shortwave_radiation,cloudcover,temperature_2m',
      timezone: 'auto',
      forecast_days: forecastDays.toString()
    });

    return `${this.baseUrl}?${params.toString()}`;
  }

  /**
   * Parses Open-Meteo API response into structured weather forecasts
   * @param data - Raw API response
   * @returns WeatherForecast[] - Parsed weather data
   */
  private parseWeatherData(data: OpenMeteoResponse): WeatherForecast[] {
    const forecasts: WeatherForecast[] = [];

    for (let i = 0; i < data.hourly.time.length; i++) {
      forecasts.push({
        time: data.hourly.time[i]!,
        solarRadiation: data.hourly.shortwave_radiation[i] || 0,
        cloudCover: data.hourly.cloudcover[i] || 0,
        temperature: data.hourly.temperature_2m[i] || 20
      });
    }

    return forecasts;
  }
}