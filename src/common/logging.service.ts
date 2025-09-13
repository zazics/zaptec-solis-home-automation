import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import dayjs from 'dayjs';
import { Constants } from '../constants';

/**
 * Centralized logging service for the entire application
 *
 * Provides unified logging functionality across all services and controllers
 * with support for multiple output targets including console and file logging.
 * Replaces the default NestJS Logger to ensure consistent log formatting
 * and centralized log management.
 *
 * Features:
 * - Multi-level logging (debug, info, warn, error, verbose)
 * - Daily file-based logging with automatic directory creation
 * - Context-aware logging for service identification
 * - Belgian timezone support for accurate timestamps
 * - Configurable log directory and application name
 * - Synchronous file writing for reliability
 * - Console output for errors only
 *
 * Configuration:
 * - LOG_DIR: Directory for log files (default: 'logs')
 * - APP_NAME: Application name for log file naming (default: 'zaptec-solis-automation')
 *
 * Output Files:
 * - {APP_NAME}-YYYY-MM-DD.log: Daily log files with all entries (debug, info, warn, error, verbose)
 */
@Injectable()
export class LoggingService {
  private readonly logDir: string;
  private readonly appName: string;

  constructor() {
    this.logDir = Constants.LOGGING.LOG_DIR;
    this.appName = Constants.LOGGING.APP_NAME;

    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Clean old log files on startup
    this.cleanOldLogFiles();
  }

  private writeToFile(level: string, message: string, context?: string): void {
    const now = new Date();
    const timestamp = now.toLocaleString('fr-BE'); // Belgian French format for timestamp
    const contextString = context ? `[${context}] ` : '';
    const logMessage = `${timestamp} [${level.toUpperCase()}] ${contextString}${message}\n`;

    // Create date-based filename using DayJS
    const dateStr = dayjs().format('YYYY-MM-DD');
    const logFile = path.join(this.logDir, `${this.appName}-${dateStr}.log`);

    try {
      // Write all logs to single daily file
      fs.appendFileSync(logFile, logMessage);
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Log debug message
   */
  public debug(message: string, context?: string): void {
    this.writeToFile('debug', message, context);
  }

  /**
   * Log info message
   */
  public log(message: string, context?: string): void {
    this.writeToFile('info', message, context);
  }

  /**
   * Log warning message
   */
  public warn(message: string, context?: string): void {
    this.writeToFile('warn', message, context);
  }

  /**
   * Log error message
   */
  public error(message: string, error?: Error | string, context?: string): void {
    let fullMessage = message;
    if (error instanceof Error) {
      fullMessage = `${message}: ${error.message}\n${error.stack}`;
    } else if (typeof error === 'string') {
      fullMessage = `${message}: ${error}`;
    }

    console.error(`[ERROR] ${context ? `[${context}] ` : ''}${fullMessage}`);
    this.writeToFile('error', fullMessage, context);
  }

  /**
   * Log verbose message
   */
  public verbose(message: string, context?: string): void {
    this.writeToFile('verbose', message, context);
  }

  /**
   * Clean old log files older than 5 days
   * Called automatically on service startup and daily via cron
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  private cleanOldLogFiles(): void {
    try {
      if (!fs.existsSync(this.logDir)) {
        return;
      }

      const files = fs.readdirSync(this.logDir);
      const now = Date.now();
      const maxAge = 5 * 24 * 60 * 60 * 1000; // 5 days in milliseconds

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);

        // Only process log files from this application
        if (file.startsWith(this.appName) && file.endsWith('.log')) {
          const fileAge = now - stats.mtime.getTime();

          if (fileAge > maxAge) {
            fs.unlinkSync(filePath);
            const ageInDays = Math.round(fileAge / (24 * 60 * 60 * 1000));
            const message = `Deleted old log file: ${file} (${ageInDays} days old)`;
            console.log(message);
            this.writeToFile('info', message, 'LogCleanup');
          }
        }
      });
    } catch (error) {
      console.error('Failed to clean old log files:', error);
    }
  }
}
