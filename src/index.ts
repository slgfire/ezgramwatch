import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { openDb } from './db.js';
import { startPoller } from './poller.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  logger.info(
    { accounts: config.INSTAGRAM_ACCOUNTS.length, interval: config.POLL_INTERVAL_SECONDS },
    'service.start',
  );

  const db = openDb(config.DATABASE_PATH);
  const ac = new AbortController();

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'service.shutdown');
    ac.abort();
    db.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  startPoller(config, db, ac.signal);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
