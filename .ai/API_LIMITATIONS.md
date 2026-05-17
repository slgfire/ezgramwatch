# API Limitations

## Instagram Graph API

**Scope: own accounts only**
The Instagram Graph API only works for Business or Creator accounts that you own and have
connected to a Meta Developer App. Monitoring third-party or personal profiles is not possible.

**No Stories support**
Stories use a separate `/me/stories` endpoint with a 24-hour TTL, a distinct quota, and
additional permissions. Out of scope for this project.

**Rate limits**
Standard tier: 200 Graph API calls per hour per User Access Token.
A single poll cycle for N accounts costs approximately `N + (carousel_children_fetches)` calls.
With default settings (5 accounts, 25 items each, ~2 carousels), one cycle uses ≈ 7–10 calls.
This leaves comfortable headroom for a 5-minute poll interval.

**`caption` may be empty**
Reels in particular often have no caption. The Discord embed description will be absent.

**`thumbnail_url` on IMAGE media**
`thumbnail_url` is only returned for `VIDEO` and `REELS` media. For `IMAGE`, use `media_url`
as the embed image source.

**Token refresh window**
A Long-Lived User Access Token can only be refreshed when it is at least 24 hours old and
before it expires (60-day lifetime). The bot checks daily and refreshes when expiry is
within 7 days.

**Pagination**
Only the most recent `MEDIA_FETCH_LIMIT` (default 25, max 100) items are fetched per poll.
If an account posts more than `MEDIA_FETCH_LIMIT` items between two polls, older items
will never be seen. Increase `MEDIA_FETCH_LIMIT` or decrease `POLL_INTERVAL_SECONDS`
if this is a concern.

**Carousel children**
Fetching carousel children requires an additional API call per carousel: `GET /{media-id}/children`.
This counts against the hourly rate limit.

## Discord Webhook

**Rate limit**
30 requests per 60 seconds per webhook URL. The bot adds a 1.5 s pause between posts
to stay well within this limit.

**10 embeds per payload**
Discord accepts a maximum of 10 embeds per webhook call. Carousels with more than 10
items will be truncated; a footer note ("Carousel · N items") indicates the total count.

**Image URL expiry**
Instagram CDN URLs embedded in Discord embeds may expire after some time. Discord
proxies images at display time, but historical embeds with expired URLs will show broken
images. This is a known limitation of webhook-based image sharing without re-hosting.
