import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmbeds } from './discord.js';
import type { MediaRow } from './db.js';

const BASE_MEDIA: MediaRow = {
  id: 'm1',
  account_id: 'a1',
  media_type: 'IMAGE',
  media_product_type: 'FEED',
  permalink: 'https://instagram.com/p/m1',
  caption: 'Hello _world_! #test',
  timestamp: '2025-01-01T10:00:00Z',
  thumbnail_url: null,
  media_url: 'https://cdn.instagram.com/img1.jpg',
  posted_to_discord: 0,
  seen_at: '2025-01-01T10:01:00Z',
  posted_at: null,
};

test('buildEmbeds: single IMAGE post', () => {
  const embeds = buildEmbeds('testuser', BASE_MEDIA, [], 300);
  assert.equal(embeds.length, 1);
  const e = embeds[0];
  assert.equal(e.title, '@testuser');
  assert.equal(e.url, 'https://instagram.com/p/m1');
  assert.ok(e.description?.includes('Hello'), 'description should contain caption text');
  assert.ok(!e.description?.includes('_world_'), 'underscores should be escaped');
  assert.equal(e.color, 0x8134af);
  assert.equal(e.footer?.text, 'Post');
  assert.deepEqual(e.image, { url: 'https://cdn.instagram.com/img1.jpg' });
});

test('buildEmbeds: REEL uses correct color and label', () => {
  const media: MediaRow = { ...BASE_MEDIA, media_product_type: 'REELS', media_type: 'VIDEO' };
  const embeds = buildEmbeds('testuser', media, [], 300);
  assert.equal(embeds[0].color, 0xe1306c);
  assert.equal(embeds[0].footer?.text, 'Reel');
});

test('buildEmbeds: caption truncation', () => {
  const longCaption = 'A'.repeat(400);
  const media: MediaRow = { ...BASE_MEDIA, caption: longCaption };
  const embeds = buildEmbeds('testuser', media, [], 100);
  assert.ok(embeds[0].description!.length <= 101, 'description should be truncated');
  assert.ok(embeds[0].description!.endsWith('…'), 'should end with ellipsis');
});

test('buildEmbeds: CAROUSEL_ALBUM multi-embed', () => {
  const media: MediaRow = { ...BASE_MEDIA, media_type: 'CAROUSEL_ALBUM', media_url: null };
  const children = [
    { id: 'c1', media_type: 'IMAGE', media_url: 'https://cdn.instagram.com/c1.jpg' },
    { id: 'c2', media_type: 'IMAGE', media_url: 'https://cdn.instagram.com/c2.jpg' },
    { id: 'c3', media_type: 'IMAGE', media_url: 'https://cdn.instagram.com/c3.jpg' },
  ];
  const embeds = buildEmbeds('testuser', media, children, 300);
  assert.equal(embeds.length, 3, 'one embed per carousel child');
  assert.equal(embeds[0].title, '@testuser', 'title only on first embed');
  assert.equal(embeds[1].title, undefined, 'no title on subsequent embeds');
  assert.ok(embeds[2].footer?.text.includes('Carousel'), 'footer on last embed');
  // All embeds should share the same url for gallery grouping
  const urls = embeds.map(e => e.url);
  assert.ok(urls.every(u => u === urls[0]), 'all embeds share the same url');
});

test('buildEmbeds: CAROUSEL capped at 10 embeds', () => {
  const media: MediaRow = { ...BASE_MEDIA, media_type: 'CAROUSEL_ALBUM', media_url: null };
  const children = Array.from({ length: 15 }, (_, i) => ({
    id: `c${i}`, media_type: 'IMAGE', media_url: `https://cdn.instagram.com/c${i}.jpg`,
  }));
  const embeds = buildEmbeds('testuser', media, children, 300);
  assert.equal(embeds.length, 10, 'capped at 10 embeds');
  assert.ok(embeds[9].footer?.text.includes('15 items'), 'footer shows total item count');
});
