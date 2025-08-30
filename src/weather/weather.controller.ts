import { Controller, Get, Query, Logger } from '@nestjs/common';
import { SolarForecastService } from './solar-forecast.service';
import { SolarPowerForecast, DailySolarForecast } from './models/weather.model';

/**
 * WeatherController provides REST endpoints for solar power forecasts
 * 
 * Endpoints:
 * - GET /weather/solar/current - Current solar power prediction
 * - GET /weather/solar/today - Today's hourly solar power forecast
 * - GET /weather/solar/forecast - Solar power forecast for next hours/days
 * - GET /weather/solar/daily - Daily solar power forecast summary
 */
@Controller('weather')
export class WeatherController {
  private readonly logger = new Logger(WeatherController.name);

  constructor(
    private readonly solarForecastService: SolarForecastService
  ) {}

  /**
   * Get current solar power prediction
   * @returns Promise<SolarPowerForecast> - Current solar power forecast
   */
  @Get('solar/current')
  public async getCurrentSolarPowerForecast(): Promise<SolarPowerForecast> {
    try {
      return await this.solarForecastService.getCurrentSolarPowerForecast();
    } catch (error) {
      this.logger.error(`Failed to get current solar forecast: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get today's hourly solar power forecast
   * @returns Promise<SolarPowerForecast[]> - Today's hourly solar power predictions
   */
  @Get('solar/today')
  public async getTodaySolarForecast(): Promise<SolarPowerForecast[]> {
    try {
      const allForecasts = await this.solarForecastService.getSolarPowerForecast(48);
      const today = new Date().toISOString().split('T')[0]!;
      
      // Filter forecasts for today only
      return allForecasts.filter(forecast => 
        forecast.time.startsWith(today)
      );
    } catch (error) {
      this.logger.error(`Failed to get today's solar forecast: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get hourly solar power forecast
   * @param hours - Number of hours to forecast (default: 48)
   * @returns Promise<SolarPowerForecast[]> - Hourly solar power predictions
   */
  @Get('solar/forecast')
  public async getSolarPowerForecast(
    @Query('hours') hours?: string
  ): Promise<SolarPowerForecast[]> {
    try {
      const forecastHours = hours ? parseInt(hours) : 48;
      return await this.solarForecastService.getSolarPowerForecast(forecastHours);
    } catch (error) {
      this.logger.error(`Failed to get solar power forecast: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get daily solar power forecast summary
   * @param days - Number of days to forecast (default: 2)
   * @returns Promise<DailySolarForecast[]> - Daily solar power summaries
   */
  @Get('solar/daily')
  public async getDailySolarForecast(
    @Query('days') days?: string
  ): Promise<DailySolarForecast[]> {
    try {
      const forecastDays = days ? parseInt(days) : 2;
      return await this.solarForecastService.getDailySolarForecast(forecastDays);
    } catch (error) {
      this.logger.error(`Failed to get daily solar forecast: ${error.message}`);
      throw error;
    }
  }
}