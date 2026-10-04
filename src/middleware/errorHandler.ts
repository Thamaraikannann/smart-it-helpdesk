import { Request, Response, NextFunction } from 'express';
import { AppError, PayloadTooLargeError } from '../lib/errors';
import { logger } from './requestLogger';

/**
 * Global Express error-handling middleware.
 *
 * - Maps every AppError subclass to the standard JSON error envelope.
 * - Handles the Express body-parser "entity.too.large" error (HTTP 413).
 * - Logs unhandled (non-AppError) errors at ERROR level via pino.
 * - Never leaks stack traces to the client.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // Handle Express body-parser payload size error
  if (
    (err as NodeJS.ErrnoException & { type?: string }).type ===
    'entity.too.large'
  ) {
    const payloadError = new PayloadTooLargeError('Request payload too large');
    res.status(payloadError.statusCode).json({
      error_code: payloadError.errorCode,
      message: payloadError.message,
    });
    return;
  }

  // Handle known application errors
  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      error_code: err.errorCode,
      message: err.message,
    };
    if (err.details !== undefined) {
      body.details = err.details;
    }
    res.status(err.statusCode).json(body);
    return;
  }

  // Unknown / unhandled error — log it, never expose internals to the client
  logger.error(
    { err: { message: err.message, name: err.name } },
    'Unhandled error',
  );

  res.status(500).json({
    error_code: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred',
  });
}
