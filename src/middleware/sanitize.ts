import { Request, Response, NextFunction } from 'express';

/**
 * HTML-encode the five characters that enable stored XSS.
 * Avoids DOMPurify (browser-only) and keeps the server dependency-free.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Recursively walk an arbitrary parsed-JSON value and escape every string leaf.
 * Arrays and plain objects are traversed; all other types are left untouched.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return escapeHtml(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = sanitizeValue(val);
    }
    return sanitized;
  }

  // Numbers, booleans, null — pass through unchanged
  return value;
}

/**
 * Express middleware that sanitizes all string values in `req.body` to
 * prevent stored XSS (Requirement 12.3).
 * Applied before any route handler so user-supplied strings are clean
 * by the time they reach service / persistence layer.
 */
export function sanitizeInputs(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.body !== undefined && req.body !== null) {
    req.body = sanitizeValue(req.body);
  }
  next();
}
