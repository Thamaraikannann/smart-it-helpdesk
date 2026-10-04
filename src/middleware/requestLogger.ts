import pino from 'pino';
import { Request, Response, NextFunction } from 'express';

/**
 * Shared pino logger instance — exported so other modules (e.g. errorHandler,
 * AI service) can log through the same sink with consistent formatting.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // In development, pretty-print; in production, emit newline-delimited JSON.
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

/**
 * Express middleware that logs every HTTP request at INFO level.
 *
 * Logged fields: method, path, statusCode, responseTimeMs.
 *
 * Security constraints:
 *   - The Authorization header value (JWT bearer token) is NEVER logged.
 *   - Any field named "password" anywhere in the request is NEVER logged.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startMs = Date.now();

  res.on('finish', () => {
    const responseTimeMs = Date.now() - startMs;

    logger.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTimeMs,
    });
  });

  next();
}
