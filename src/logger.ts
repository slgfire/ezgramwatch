import pino from 'pino';

const pretty = process.env.LOG_PRETTY === 'true';

export const logger = pino(
  { level: process.env.LOG_LEVEL ?? 'info' },
  pretty
    ? pino.transport({ target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } })
    : undefined,
);
