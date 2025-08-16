import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class LoggingService {
  private readonly logDir: string;
  private readonly appName: string;

  constructor(private readonly configService: ConfigService) {
    this.logDir = this.configService.get<string>('LOG_DIR', 'logs');
    this.appName = this.configService.get<string>('APP_NAME', 'zaptec-solis-automation');
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private writeToFile(level: string, message: string, context?: string): void {
    const timestamp = new Date().toISOString();
    const contextString = context ? `[${context}] ` : '';
    const logMessage = `${timestamp} [${level.toUpperCase()}] ${contextString}${message}\n`;
    
    try {
      // Write to main log file
      fs.appendFileSync(path.join(this.logDir, `${this.appName}.log`), logMessage);
      
      // Write errors to separate file
      if (level === 'error') {
        fs.appendFileSync(path.join(this.logDir, `${this.appName}-error.log`), logMessage);
      }
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Log debug message
   */
  public debug(message: string, context?: string): void {
    console.debug(`[DEBUG] ${context ? `[${context}] ` : ''}${message}`);
    this.writeToFile('debug', message, context);
  }

  /**
   * Log info message
   */
  public log(message: string, context?: string): void {
    console.log(`[INFO] ${context ? `[${context}] ` : ''}${message}`);
    this.writeToFile('info', message, context);
  }

  /**
   * Log warning message
   */
  public warn(message: string, context?: string): void {
    console.warn(`[WARN] ${context ? `[${context}] ` : ''}${message}`);
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
    console.log(`[VERBOSE] ${context ? `[${context}] ` : ''}${message}`);
    this.writeToFile('verbose', message, context);
  }
}