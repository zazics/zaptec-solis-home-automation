import { Module } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { WeatherController } from './weather.controller';
import { SolarForecastService } from './solar-forecast.service';

/**
 * WeatherModule handles weather data collection and solar power forecasting using Open-Meteo API
 * 
 * Features:
 * - Weather data from Open-Meteo API (free, no API key required)
 * - Solar radiation and cloud cover forecasts
 * - Solar power prediction based on panel specifications
 * - Hourly forecasts for current day and next day
 */
@Module({
  imports: [],
  controllers: [WeatherController],
  providers: [WeatherService, SolarForecastService],
  exports: [WeatherService, SolarForecastService],
})
export class WeatherModule {}