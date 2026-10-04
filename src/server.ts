import { config } from './config';
import { createApp } from './app';

const app = createApp();

const server = app.listen(config.PORT, () => {
  console.log(
    `[server] Smart IT Helpdesk API running on port ${config.PORT} (${config.NODE_ENV})`,
  );
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received — shutting down gracefully');
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[server] SIGINT received — shutting down gracefully');
  server.close(() => {
    console.log('[server] HTTP server closed');
    process.exit(0);
  });
});

export default server;
