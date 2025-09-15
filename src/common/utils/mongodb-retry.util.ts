import { LoggingService } from '../logging.service';

/**
 * Utility for handling MongoDB operation retries with exponential backoff
 */
export class MongoDbRetryUtil {
  private static readonly MAX_RETRIES = 3;
  private static readonly INITIAL_DELAY = 1000; // 1 second
  private static readonly MAX_DELAY = 10000; // 10 seconds

  /**
   * Execute a MongoDB operation with retry logic
   */
  public static async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    logger: LoggingService,
    context: string,
    maxRetries: number = MongoDbRetryUtil.MAX_RETRIES
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if it's a connection error that we should retry
        if (MongoDbRetryUtil.isRetryableError(error)) {
          if (attempt < maxRetries) {
            const delay = MongoDbRetryUtil.calculateDelay(attempt);
            logger.warn(
              `${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms: ${error.message}`,
              context
            );
            await MongoDbRetryUtil.sleep(delay);
            continue;
          } else {
            logger.error(
              `${operationName} failed after ${maxRetries} attempts`,
              error,
              context
            );
          }
        } else {
          // Non-retryable error, throw immediately
          logger.error(`${operationName} failed with non-retryable error`, error, context);
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * Check if an error is retryable
   */
  private static isRetryableError(error: any): boolean {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorName = error.name?.toLowerCase() || '';

    // Connection-related errors that are worth retrying
    const retryablePatterns = [
      'connection closed',
      'connection reset',
      'connection timeout',
      'network error',
      'socket timeout',
      'connection refused',
      'server selection timeout',
      'mongonetworkerror',
      'mongotimeouterror',
      'econnreset',
      'econnrefused',
      'etimedout'
    ];

    return retryablePatterns.some(pattern =>
      errorMessage.includes(pattern) || errorName.includes(pattern)
    );
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private static calculateDelay(attempt: number): number {
    const exponentialDelay = MongoDbRetryUtil.INITIAL_DELAY * Math.pow(2, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, MongoDbRetryUtil.MAX_DELAY);

    // Add jitter (±25% random variation)
    const jitter = cappedDelay * 0.25 * (Math.random() - 0.5) * 2;

    return Math.round(cappedDelay + jitter);
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}