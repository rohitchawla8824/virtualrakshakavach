import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import './modules/models.js';
import { expireMissedPeriods } from './modules/subscriptions/subscription.service.js';
import { runOverdueInvoiceJob } from './modules/finance/finance.service.js';
import {
  recoverStaleNotificationDeliveries,
  runNotificationDeliveryJob,
} from './modules/operations/notification.service.js';

async function start() {
  await connectDatabase();
  const expiryTimer = setInterval(
    () => {
      void expireMissedPeriods().catch((error: unknown) => {
        logger.error(
          { errorName: error instanceof Error ? error.name : 'UnknownError' },
          'Subscription expiry check failed',
        );
      });
    },
    5 * 60 * 1000,
  );
  expiryTimer.unref();
  void expireMissedPeriods().catch((error: unknown) => {
    logger.error(
      { errorName: error instanceof Error ? error.name : 'UnknownError' },
      'Initial subscription expiry check failed',
    );
  });
  const overdueTimer = setInterval(
    () => {
      void runOverdueInvoiceJob().catch((error: unknown) =>
        logger.error(
          { errorName: error instanceof Error ? error.name : 'UnknownError' },
          'Overdue invoice check failed',
        ),
      );
    },
    5 * 60 * 1000,
  );
  overdueTimer.unref();
  void runOverdueInvoiceJob().catch((error: unknown) =>
    logger.error(
      { errorName: error instanceof Error ? error.name : 'UnknownError' },
      'Initial overdue invoice check failed',
    ),
  );
  const notificationTimer = setInterval(() => {
    void recoverStaleNotificationDeliveries()
      .then(() => runNotificationDeliveryJob())
      .catch((error: unknown) =>
        logger.error(
          { errorName: error instanceof Error ? error.name : 'UnknownError' },
          'Notification delivery check failed',
        ),
      );
  }, 60 * 1000);
  notificationTimer.unref();
  void recoverStaleNotificationDeliveries()
    .then(() => runNotificationDeliveryJob())
    .catch((error: unknown) =>
      logger.error(
        { errorName: error instanceof Error ? error.name : 'UnknownError' },
        'Initial notification delivery check failed',
      ),
    );
  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ host: env.HOST, port: env.PORT }, 'Virtual Raksha Kavach API listening');
  });

  async function shutdown(signal: string) {
    logger.info({ signal }, 'Shutting down API');
    clearInterval(expiryTimer);
    clearInterval(overdueTimer);
    clearInterval(notificationTimer);
    server.close(async (error) => {
      if (error) logger.error({ err: error }, 'Error while closing HTTP server');
      await disconnectDatabase();
      process.exit(error ? 1 : 0);
    });
  }

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((error: unknown) => {
  logger.fatal(
    { errorName: error instanceof Error ? error.name : 'UnknownError' },
    'API startup failed; verify server configuration and database connectivity.',
  );
  process.exitCode = 1;
});
