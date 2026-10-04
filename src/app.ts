import express, { Application } from 'express';
import { requestLogger } from './middleware/requestLogger';
import { sanitizeInputs } from './middleware/sanitize';
import { authenticatedRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';

import authRouter from './modules/auth/auth.router';
import incidentsRouter from './modules/incidents/incidents.router';
import commentsRouter from './modules/comments/comments.router';
import auditRouter from './modules/audit/audit.router';
import usersRouter from './modules/users/users.router';
import dashboardRouter from './modules/dashboard/dashboard.router';

export function createApp(): Application {
  const app = express();

  // ── Body parsing ────────────────────────────────────────────────────────────
  // Reject request bodies > 1 MB (Requirement 12.7)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  // ── Middleware stack (order matters) ────────────────────────────────────────
  app.use(requestLogger);       // HTTP request logging (Task 2.1)
  app.use(sanitizeInputs);      // XSS input sanitization (Task 2.2)
  app.use(authenticatedRateLimiter); // Authenticated rate limiter (Task 2.3)

  // ── Routes ──────────────────────────────────────────────────────────────────
  const API_PREFIX = '/api/v1';

  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/incidents`, incidentsRouter);
  app.use(`${API_PREFIX}/incidents/:id/comments`, commentsRouter);
  app.use(`${API_PREFIX}/incidents/:id/audit`, auditRouter);
  app.use(`${API_PREFIX}/users`, usersRouter);
  app.use(`${API_PREFIX}/dashboard`, dashboardRouter);

  // ── Global error handler (must be last) ─────────────────────────────────────
  app.use(errorHandler);

  return app;
}
