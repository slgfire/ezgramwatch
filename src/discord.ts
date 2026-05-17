import type { MediaRow } from './db.js';
import type { GraphCarouselChild } from './graph-api.js';

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  image?: { url: string };
  footer?: { text: string };
}

interface DiscordWebhookPayload {
  username: string;
  embeds: DiscordEmbed[];
}

export class DiscordWebhookError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'DiscordWebhookError';
  }
  get isRateLimit(): boolean {
    return this.status === 429;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[*_~|`>#\[\]()\\]/g, '\\$&');
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}

export function buildEmbeds(
  displayName: string,
  media: MediaRow,
  children: GraphCarouselChild[],
  captionPreviewChars: number,
): DiscordEmbed[] {
  const color = media.media_product_type === 'REELS' ? 0xe1306c : 0x8134af;
  const typeLabel = media.media_product_type === 'REELS' ? 'Reel' : 'Post';
  const caption = media.caption
    ? escapeMarkdown(truncate(media.caption, captionPreviewChars))
    : undefined;
  const permalink = media.permalink ?? undefined;

  if (media.media_type === 'CAROUSEL_ALBUM' && children.length > 0) {
    const items = children.slice(0, 10);
    return items.map((child, i): DiscordEmbed => {
      const imageUrl = child.thumbnail_url ?? child.media_url ?? undefined;
      return {
        // Same url on all embeds → Discord renders them as a gallery
        url: permalink,
        color,
        ...(i === 0 && { title: `@${displayName}`, description: caption, timestamp: media.timestamp ?? undefined }),
        ...(imageUrl && { image: { url: imageUrl } }),
        ...(i === items.length - 1 && {
          footer: { text: `${typeLabel} · Carousel · ${children.length} items` },
        }),
      };
    });
  }

  const imageUrl = media.thumbnail_url ?? media.media_url ?? undefined;
  return [
    {
      title: `@${displayName}`,
      url: permalink,
      description: caption,
      timestamp: media.timestamp ?? undefined,
      color,
      ...(imageUrl && { image: { url: imageUrl } }),
      footer: { text: typeLabel },
    },
  ];
}

export async function sendWebhook(
  webhookUrl: string,
  displayName: string,
  media: MediaRow,
  children: GraphCarouselChild[],
  captionPreviewChars: number,
): Promise<void> {
  const payload: DiscordWebhookPayload = {
    username: 'ezgramwatch',
    embeds: buildEmbeds(displayName, media, children, captionPreviewChars),
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 204 || res.status === 200) return;

  let retryAfterMs: number | undefined;
  let message = `HTTP ${res.status}`;

  if (res.headers.get('content-type')?.includes('json')) {
    const body = (await res.json()) as Record<string, unknown>;
    if (typeof body['message'] === 'string') message = body['message'] as string;
    if (res.status === 429 && typeof body['retry_after'] === 'number') {
      retryAfterMs = (body['retry_after'] as number) * 1000;
    }
  }

  throw new DiscordWebhookError(res.status, message, retryAfterMs);
}
