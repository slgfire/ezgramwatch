# TODO / Backlog

## Features

- [ ] Instagram Stories support (24 h TTL, separate endpoint, `instagram_content_publish` permission required)
- [ ] Meta Webhooks subscription instead of polling (real-time, reduces API call volume)
- [ ] Per-profile Discord webhook URL (`INSTAGRAM_ACCOUNTS=id:alias:webhookUrl`)
- [ ] Multiple Discord Channels support (post to different channels by media type or account)

## Infrastructure

- [ ] GitHub Actions CI pipeline (npm build + typecheck + tests on push)
- [ ] Prometheus metrics endpoint (posts_fetched_total, posts_posted_total, api_errors_total)
- [ ] Docker healthcheck via `/data/.last-poll` mtime sentinel file
- [ ] Dependabot / Renovate for dependency updates

## Quality

- [ ] Integration test with mocked Graph API responses
- [ ] Retry queue with exponential backoff for Discord 5xx errors
- [ ] `MEDIA_FETCH_LIMIT` pagination (cursor-based) for initial backfill of large accounts
