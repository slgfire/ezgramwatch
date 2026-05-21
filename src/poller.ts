import {
  fetchMedia,
  fetchCarouselChildren,
  resolveUsername,
  refreshToken,
  GraphApiError,
} from './graph-api.js';
import { sendWebhook, DiscordWebhookError } from './discord.js';
import { logger } from './logger.js';
import type { Config, AccountConfig } from './config.js';
import type { Db } from './db.js';

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

export function bootstrapToken(config: Config, db: Db): void {
  if (!db.getState('access_token')) {
    db.setState('access_token', config.INSTAGRAM_ACCESS_TOKEN);
    const expires = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
    db.setState('access_token_expires_at', expires);
    logger.debug({ expires }, 'token.bootstrap');
  }
}

async function checkAndRefreshToken(config: Config, db: Db): Promise<void> {
  const expiresAtStr = db.getState('access_token_expires_at');
  if (!expiresAtStr) return;

  const daysLeft = (new Date(expiresAtStr).getTime() - Date.now()) / 864e5;
  if (daysLeft >= 7) return;

  const currentToken = db.getState('access_token') ?? config.INSTAGRAM_ACCESS_TOKEN;
  try {
    logger.info({ daysLeft: Math.round(daysLeft) }, 'token.refresh.start');
    const result = await refreshToken(currentToken);
    db.setState('access_token', result.access_token);
    db.setState('access_token_expires_at', result.expires_at);
    logger.info({ expires_at: result.expires_at }, 'token.refresh.done');
  } catch (err) {
    logger.error({ err }, 'token.refresh.error');
  }
}

// ---------------------------------------------------------------------------
// Per-account polling
// ---------------------------------------------------------------------------

async function pollAccount(
  config: Config,
  db: Db,
  token: string,
  account: AccountConfig,
): Promise<void> {
  const { id: accountId, alias } = account;

  // Ensure account row exists and username is resolved
  const row = db.getAccount(accountId);
  let username = row?.username ?? null;
  if (!username) {
    try {
      username = await resolveUsername(config, accountId, token);
    } catch (err) {
      logger.warn({ err, accountId }, 'account.resolveUsername.error');
    }
  }
  db.upsertAccount(accountId, username, alias);
  const displayName = alias ?? username ?? accountId;

  // Fetch latest media from Graph API
  let items;
  try {
    items = await fetchMedia(config, accountId, token);
  } catch (err) {
    if (err instanceof GraphApiError) {
      if (err.isAuthError) {
        logger.error({ accountId, code: err.code }, 'graph.authError — token may be invalid or revoked');
        return;
      }
      if (err.isRateLimit) {
        const wait = err.retryAfter ?? 60;
        logger.warn({ accountId, wait }, 'graph.rateLimit — backing off');
        await sleep(wait * 1000);
        return;
      }
    }
    logger.error({ err, accountId }, 'graph.fetchMedia.error');
    return;
  }

  // Insert new items (INSERT OR IGNORE deduplicates)
  let newCount = 0;
  for (const item of items) {
    const isNew = db.insertMedia({
      id: item.id,
      account_id: accountId,
      media_type: item.media_type,
      media_product_type: item.media_product_type ?? null,
      permalink: item.permalink ?? null,
      caption: item.caption ?? null,
      timestamp: item.timestamp ?? null,
      thumbnail_url: item.thumbnail_url ?? null,
      media_url: item.media_url ?? null,
    });
    if (isNew) newCount++;
  }

  // Initial import: decide what to post on first run
  const isFirstRun = (db.getAccount(accountId)?.initial_import_done ?? 0) === 0;
  if (isFirstRun) {
    if (config.POST_EXISTING_ON_FIRST_RUN) {
      db.limitFirstRunItems(accountId, config.FIRST_RUN_POST_LIMIT);
      logger.info({ accountId, keepN: config.FIRST_RUN_POST_LIMIT }, 'account.firstRun.postNewest');
    } else {
      db.markAllPosted(accountId);
      logger.info({ accountId, skipped: items.length }, 'account.firstRun.skipAll');
    }
    db.setInitialImportDone(accountId);
  }

  // Post unposted items to Discord
  const unposted = db.getUnposted(accountId);
  let postedCount = 0;

  for (let i = 0; i < unposted.length; i++) {
    const media = unposted[i];

    if (i > 0) await sleep(1500);

    let children: Awaited<ReturnType<typeof fetchCarouselChildren>> = [];
    if (media.media_type === 'CAROUSEL_ALBUM') {
      try {
        children = await fetchCarouselChildren(config, media.id, token);
      } catch (err) {
        logger.warn({ err, mediaId: media.id }, 'graph.fetchChildren.error — posting without carousel images');
      }
    }

    try {
      await sendWebhook(config.DISCORD_WEBHOOK_URL, displayName, media, children, config.CAPTION_PREVIEW_CHARS);
      db.markPosted(media.id);
      postedCount++;
      logger.debug({ mediaId: media.id, type: media.media_product_type }, 'discord.posted');
    } catch (err) {
      if (err instanceof DiscordWebhookError && err.isRateLimit) {
        const wait = err.retryAfterMs ?? 5000;
        logger.warn({ wait }, 'discord.rateLimit — retrying once');
        await sleep(wait);
        try {
          await sendWebhook(config.DISCORD_WEBHOOK_URL, displayName, media, children, config.CAPTION_PREVIEW_CHARS);
          db.markPosted(media.id);
          postedCount++;
        } catch (retryErr) {
          logger.error({ retryErr, mediaId: media.id }, 'discord.send.error — will retry next poll');
          break;
        }
      } else {
        logger.error({ err, mediaId: media.id }, 'discord.send.error — will retry next poll');
        break;
      }
    }
  }

  db.setLastPolledAt(accountId);
  logger.info({ accountId, displayName, fetched: items.length, new: newCount, posted: postedCount }, 'poll.account');
}

// ---------------------------------------------------------------------------
// Poll loop
// ---------------------------------------------------------------------------

export async function runPollerOnce(config: Config, db: Db): Promise<void> {
  logger.debug({ accounts: config.INSTAGRAM_ACCOUNTS.length }, 'poll.start');
  await checkAndRefreshToken(config, db);

  const token = db.getState('access_token') ?? config.INSTAGRAM_ACCESS_TOKEN;

  for (const account of config.INSTAGRAM_ACCOUNTS) {
    await pollAccount(config, db, token, account);
  }
}

export function startPoller(config: Config, db: Db, signal: AbortSignal): void {
  bootstrapToken(config, db);

  async function tick(): Promise<void> {
    if (signal.aborted) return;
    try {
      await runPollerOnce(config, db);
    } catch (err) {
      logger.error({ err }, 'poll.uncaught');
    }
    if (!signal.aborted) {
      setTimeout(() => void tick(), config.POLL_INTERVAL_SECONDS * 1000);
    }
  }

  void tick();
}
