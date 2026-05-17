# ezgramwatch

A headless Docker service that polls one or more Instagram Business/Creator accounts
via the **official Meta Graph API** and forwards new posts and Reels to a Discord channel
using Webhook embeds.

> **Important:** This bot only works with Instagram accounts that *you own* and have
> connected to a Meta Developer App. Monitoring third-party profiles is not supported
> by the official API. See [`.ai/API_LIMITATIONS.md`](.ai/API_LIMITATIONS.md) for details.

## Features

- Polls Instagram Business/Creator accounts on a configurable interval
- Detects new posts, videos, and Reels; deduplicates via SQLite
- Sends rich Discord embeds with caption preview, post type, timestamp, and thumbnail
- Carousel posts rendered as a multi-image Discord gallery (up to 10 images per embed)
- Graceful first-run behaviour: existing posts are imported silently without spamming Discord
- Optional automatic token refresh before the 60-day expiry (requires Meta App credentials)
- Structured JSON logs via [pino](https://github.com/pinojs/pino)
- Fully configured via environment variables — no config files

## Requirements

- A **Meta Developer account** and a Facebook App with the following permissions:
  - `instagram_basic`
  - `pages_read_engagement`
- One or more **Instagram Business or Creator accounts** connected to a Facebook Page
- A **Discord server** with a Webhook URL (Server Settings → Integrations → Webhooks)
- Docker and Docker Compose

## Instagram API Setup

### 1. Create a Meta App

1. Go to [developers.facebook.com](https://developers.facebook.com) and create an account.
2. Create a new App of type **Business**.
3. Under **App Dashboard → Add a Product**, add **Instagram Graph API**.

### 2. Connect your Instagram account

1. Under **Instagram Graph API → Settings**, connect your Facebook Page.
2. Make sure your Instagram account is set as **Business** or **Creator** in the Instagram app.

### 3. Obtain a Long-Lived Access Token

The easiest path for self-hosted deployments:

1. In the **Graph API Explorer** (`developers.facebook.com/tools/explorer`):
   - Select your app.
   - Add permissions: `instagram_basic`, `pages_read_engagement`.
   - Generate a User Access Token.
2. Exchange for a **long-lived token** (valid 60 days):
   ```
   GET https://graph.facebook.com/oauth/access_token
     ?grant_type=fb_exchange_token
     &client_id=<app_id>
     &client_secret=<app_secret>
     &fb_exchange_token=<short_lived_token>
   ```
3. Store the result in `INSTAGRAM_ACCESS_TOKEN`.

### 4. Find your Instagram User ID

```
GET https://graph.facebook.com/me/accounts?access_token=<token>
```

This returns the connected Pages. From the Page, fetch the connected IG account:

```
GET https://graph.facebook.com/<page_id>?fields=instagram_business_account&access_token=<token>
```

The `instagram_business_account.id` is what you put in `INSTAGRAM_ACCOUNTS`.

## Configuration

Copy `.env.example` to `.env` and fill in your values.

| Variable | Required | Default | Description |
|---|---|---|---|
| `DISCORD_WEBHOOK_URL` | yes | — | Full Discord Webhook URL |
| `INSTAGRAM_ACCESS_TOKEN` | yes | — | Long-lived User Access Token (bootstrap) |
| `INSTAGRAM_ACCOUNTS` | yes | — | `<ig_user_id>[:<display_name>],…` comma-separated |
| `META_APP_ID` | no | — | Meta App ID (enables auto token refresh) |
| `META_APP_SECRET` | no | — | Meta App Secret (enables auto token refresh) |
| `POLL_INTERVAL_SECONDS` | no | `300` | Polling interval in seconds |
| `POST_EXISTING_ON_FIRST_RUN` | no | `false` | Post existing media on first start |
| `FIRST_RUN_POST_LIMIT` | no | `10` | Max posts to send when `POST_EXISTING_ON_FIRST_RUN=true` |
| `CAPTION_PREVIEW_CHARS` | no | `300` | Caption characters shown in embed |
| `MEDIA_FETCH_LIMIT` | no | `25` | Items fetched per poll (1–100) |
| `LOG_LEVEL` | no | `info` | Pino log level |
| `DATABASE_PATH` | no | `/data/bot.sqlite` | SQLite path inside the container |
| `GRAPH_API_VERSION` | no | `v21.0` | Meta Graph API version |

### Token auto-refresh

When `META_APP_ID` and `META_APP_SECRET` are set, the bot automatically refreshes the
access token when it has fewer than 7 days remaining. The refreshed token is stored in
SQLite — you do not need to update the `.env` file.

Without these vars the bot will log a warning as the token approaches expiry.
You can also use a **System User Token** (which never expires) and skip auto-refresh.

## Quick Start

```bash
git clone https://github.com/slgfire/ezgramwatch
cd ezgramwatch
cp .env.example .env
# Edit .env with your credentials
mkdir -p data
docker compose up --build -d
docker compose logs -f
```

## Volume and Permissions

The container runs as user `node` (uid=1000). The `./data` directory must be writable
by uid=1000:

```bash
sudo chown -R 1000:1000 ./data
```

SQLite data survives container restarts as long as `./data` is mounted.

## Updating

```bash
docker compose pull   # if using a pre-built image
docker compose up --build -d
```

## Limitations

See [`.ai/API_LIMITATIONS.md`](.ai/API_LIMITATIONS.md) for a full list of known API constraints,
rate limits, and caveats.

Key points:
- **Own accounts only** — cannot monitor third-party or personal profiles.
- **Stories not supported** — different endpoint, 24-hour lifetime, out of scope.
- **60-day token expiry** — set `META_APP_ID` + `META_APP_SECRET` for auto-refresh.
- **Pagination** — only the most recent `MEDIA_FETCH_LIMIT` items are fetched per poll.

## License

MIT — see [LICENSE](LICENSE).
