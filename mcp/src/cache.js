// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

// Short-lived memory cache of public API responses that contain no search text.
// Search queries (the `q` parameter, kind, and lens) are never cache keys.

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 32;
const entries = new Map();

export function clearResponseCache() {
  entries.clear();
}

export function isCacheable(url) {
  const keys = [...url.searchParams.keys()];
  if (url.pathname === '/v1/stats' && keys.length === 0) return true;
  if (url.pathname === '/v1/entries' && keys.length === 1 && url.searchParams.get('type') === 'organization') return true;
  if (url.pathname === '/v1/changes' && keys.length === 1 && /^[1-9]\d*$/.test(url.searchParams.get('limit') || '')) return true;
  return false;
}

export function cacheGet(key, now = Date.now()) {
  const hit = entries.get(key);
  if (!hit) return undefined;
  if (hit.expires <= now) {
    entries.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key, value, now = Date.now()) {
  if (entries.size >= CACHE_MAX && !entries.has(key)) {
    const oldest = entries.keys().next().value;
    entries.delete(oldest);
  }
  entries.set(key, { value, expires: now + CACHE_TTL_MS });
}
