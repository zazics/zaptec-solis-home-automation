import { Injectable, NestMiddleware, Inject } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Constants } from '../../constants';
import { LoggingService } from '../logging.service';

/**
 * Middleware for API key validation
 *
 * Validates the X-API-Key header against the configured API key.
 * Closes connection without response if key is missing or invalid.
 */
@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  private readonly context = ApiKeyMiddleware.name;

  @Inject(LoggingService)
  private readonly logger: LoggingService;
  /**
   * Validates API key from request headers
   * @param req - Express request object
   * @param res - Express response object
   * @param next - Next function to call if validation passes
   */
  public use(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'] as string;
    const expectedApiKey = Constants.API.KEY;

    // Skip validation if no API key is configured (development mode)
    if (!expectedApiKey) {
      this.logger.warn(
        `No API key configured accept request - ${req.method} ${req.originalUrl} from ${req.ip}`,
        this.context
      );
      return next();
    }

    // Allow CORS preflight requests (OPTIONS method) to pass through
    if (req.method === 'OPTIONS') {
      return next();
    }

    // If no API key provided or invalid API key - log and close connection silently
    if (!apiKey) {
      this.logger.warn(
        `API request rejected: No API key provided - ${req.method} ${req.originalUrl} from ${req.ip}`,
        this.context
      );
      res.destroy();
      return;
    }

    if (apiKey !== expectedApiKey) {
      this.logger.warn(
        `API request rejected: Invalid API key '${apiKey}' - ${req.method} ${req.originalUrl} from ${req.ip}`,
        this.context
      );
      res.destroy();
      return;
    }

    // API key is valid, proceed to the next middleware/handler
    next();
  }
}
