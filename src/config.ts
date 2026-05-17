import { z } from 'zod';

const accountsSchema = z.string().transform(str =>
  str.split(',').flatMap(entry => {
    const parts = entry.trim().split(':');
    const id = parts[0].trim();
    return id.length > 0 ? [{ id, alias: parts[1]?.trim() || undefined }] : [];
  })
);

const schema = z.object({
  DISCORD_WEBHOOK_URL: z.string().url({ message: 'must be a valid URL' }),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1, 'required'),
  INSTAGRAM_ACCOUNTS: accountsSchema,
  POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(300),
  POST_EXISTING_ON_FIRST_RUN: z.string().optional().transform(v => v?.toLowerCase() === 'true'),
  FIRST_RUN_POST_LIMIT: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_PATH: z.string().default('/data/bot.sqlite'),
  GRAPH_API_VERSION: z.string().default('v21.0'),
  MEDIA_FETCH_LIMIT: z.coerce.number().int().min(1).max(100).default(25),
  CAPTION_PREVIEW_CHARS: z.coerce.number().int().positive().default(300),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof schema>;
export type AccountConfig = { id: string; alias?: string };

export function loadConfig(): Config {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const msgs = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuration error:\n${msgs}`);
  }
  return result.data;
}
