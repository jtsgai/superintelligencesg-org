// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

// In-isolate sliding window. Cloudflare may run many isolates, so this is a
// per-isolate guard, not a global counter. It stores timestamps only.
const buckets = new Map();

export const DEFAULT_RATE_LIMIT = 60;
export const RATE_WINDOW_MS = 60_000;

export function resetRateLimit() {
  buckets.clear();
}

export function rateLimitFor(env) {
  if (env?.ENVIRONMENT === 'test') {
    const parsed = Number(env.RATE_LIMIT_PER_MINUTE);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= DEFAULT_RATE_LIMIT) return parsed;
  }
  return DEFAULT_RATE_LIMIT;
}

export function takeRateLimit(key, limit = DEFAULT_RATE_LIMIT, windowMs = RATE_WINDOW_MS, now = Date.now()) {
  const stamps = (buckets.get(key) || []).filter(ts => now - ts < windowMs);
  if (stamps.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((stamps[0] + windowMs - now) / 1000));
    buckets.set(key, stamps);
    return { ok: false, retryAfter, limit };
  }
  stamps.push(now);
  buckets.set(key, stamps);
  return { ok: true, remaining: limit - stamps.length, limit };
}
