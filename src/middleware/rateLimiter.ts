import rateLimit from 'express-rate-limit';

// Authenticated rate limiter: 60 requests/user/minute (Requirement 12.5)
// Keys by user ID from JWT payload when available, falls back to IP address.
export const authenticatedRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  keyGenerator: (req) => (req as any).user?.id ?? req.ip ?? 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      error_code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Unauthenticated rate limiter: 10 attempts/IP/minute (Requirement 12.6)
// Applied only on the login endpoint to throttle brute-force attempts.
export const unauthenticatedRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  keyGenerator: (req) => req.ip ?? 'unknown',
  handler: (_req, res) => {
    res.status(429).json({
      error_code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts, please try again later',
    });
  },
  standardHeaders: true,
  legacyHeaders: false,
});
