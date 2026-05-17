import type { Config } from './config.js';

const BASE = (v: string) => `https://graph.facebook.com/${v}`;

export class GraphApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: number | undefined,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'GraphApiError';
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.code === 190 || this.code === 102;
  }

  get isRateLimit(): boolean {
    return this.status === 429 || this.code === 4 || this.code === 17 || this.code === 32;
  }
}

export interface GraphMediaItem {
  id: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_product_type?: 'FEED' | 'REELS' | 'STORY';
  permalink?: string;
  caption?: string;
  timestamp?: string;
  thumbnail_url?: string;
  media_url?: string;
}

export interface GraphCarouselChild {
  id: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
}

export interface TokenRefreshResult {
  access_token: string;
  expires_at: string;
}

async function graphFetch(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const err = (body as { error?: Record<string, unknown> }).error ?? {};
    const retryAfter = res.headers.has('Retry-After')
      ? parseInt(res.headers.get('Retry-After')!, 10)
      : undefined;
    throw new GraphApiError(
      res.status,
      typeof err['code'] === 'number' ? (err['code'] as number) : undefined,
      typeof err['message'] === 'string' ? (err['message'] as string) : `HTTP ${res.status}`,
      retryAfter,
    );
  }

  return body;
}

export async function fetchMedia(
  config: Config,
  accountId: string,
  token: string,
): Promise<GraphMediaItem[]> {
  const fields = 'id,media_type,media_product_type,permalink,caption,timestamp,thumbnail_url,media_url';
  const url = `${BASE(config.GRAPH_API_VERSION)}/${accountId}/media?fields=${fields}&limit=${config.MEDIA_FETCH_LIMIT}`;
  const data = (await graphFetch(url, token)) as { data?: GraphMediaItem[] };
  return data.data ?? [];
}

export async function resolveUsername(
  config: Config,
  accountId: string,
  token: string,
): Promise<string> {
  const url = `${BASE(config.GRAPH_API_VERSION)}/${accountId}?fields=username`;
  const data = (await graphFetch(url, token)) as { username: string };
  return data.username;
}

export async function fetchCarouselChildren(
  config: Config,
  mediaId: string,
  token: string,
): Promise<GraphCarouselChild[]> {
  const url = `${BASE(config.GRAPH_API_VERSION)}/${mediaId}/children?fields=id,media_type,media_url,thumbnail_url`;
  const data = (await graphFetch(url, token)) as { data?: GraphCarouselChild[] };
  return data.data ?? [];
}

export async function refreshToken(
  appId: string,
  appSecret: string,
  currentToken: string,
): Promise<TokenRefreshResult> {
  // Token is passed as query param here — required by Meta's OAuth endpoint design.
  const url = `https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${currentToken}`;
  const res = await fetch(url);
  const body = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    const err = (body as { error?: Record<string, unknown> }).error ?? {};
    throw new GraphApiError(
      res.status,
      typeof err['code'] === 'number' ? (err['code'] as number) : undefined,
      typeof err['message'] === 'string' ? (err['message'] as string) : `HTTP ${res.status}`,
    );
  }

  const expiresInSeconds = typeof body['expires_in'] === 'number' ? body['expires_in'] : 5184000;
  return {
    access_token: body['access_token'] as string,
    expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  };
}
