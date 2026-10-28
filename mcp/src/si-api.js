// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

// Public routes from worker/index.js. `/v1/...` is rewritten to `/api/v1/...`
// by apiPath. There is no `/v1/entries/{id}` route (that path is HTTP 404).
// Filters and 400 messages used here match v1EntryList / limitParam / v1.

import { ToolError } from './errors.js';
import { cacheGet, cacheSet, isCacheable } from './cache.js';

export const API_ORIGIN = 'https://api.superintelligencesg.org';
export const UPSTREAM_TIMEOUT_MS = 5000;

export function apiOrigin(env) {
  const configured = String(env?.SI_API_BASE || API_ORIGIN).replace(/\/+$/, '');
  if (configured !== API_ORIGIN) {
    throw new ToolError('upstream_unavailable', 'SI_API_BASE must be https://api.superintelligencesg.org.', { retryable: false });
  }
  return API_ORIGIN;
}

function fetchImplFor(env) {
  return typeof env?.__fetch === 'function' ? env.__fetch : fetch;
}

async function errorMessage(response, fallback) {
  try {
    const text = (await response.text()).slice(0, 500);
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.error === 'string' && parsed.error.length > 0 && parsed.error.length <= 300) return parsed.error;
  } catch {
    // Unreadable upstream bodies stay on the fallback message.
  }
  return fallback;
}

export async function siGet(env, path, params = {}, options = {}) {
  const origin = apiOrigin(env);
  const url = new URL(path, origin);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  const timeoutMs = options.timeoutMs ?? UPSTREAM_TIMEOUT_MS;
  const cacheable = options.cache !== false && isCacheable(url);
  if (cacheable) {
    const hit = cacheGet(url.href);
    if (hit !== undefined) return { url, body: hit, cached: true };
  }
  const controller = new AbortController();
  let timer;
  const timedOut = new Promise(resolve => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ timedOut: true });
    }, timeoutMs);
  });
  const pending = Promise.resolve().then(() => fetchImplFor(env)(url, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: 'application/json' },
    signal: controller.signal,
  })).then(
    response => ({ response }),
    error => ({ error }),
  );
  let response;
  try {
    const outcome = await Promise.race([pending, timedOut]);
    if (outcome.timedOut || outcome.error) {
      const error = outcome.error;
      const expired = outcome.timedOut || error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new ToolError(
        'upstream_unavailable',
        expired
          ? 'The Superintelligence SG API did not respond within 5 seconds. Try again.'
          : 'The Superintelligence SG API could not be reached. Try again.',
        { retryable: true },
      );
    }
    response = outcome.response;
  } finally {
    clearTimeout(timer);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new ToolError('upstream_unavailable', 'The Superintelligence SG API redirected the request. Try again.', { retryable: true });
  }
  if (response.status === 400) {
    throw new ToolError('invalid_argument', await errorMessage(response, 'The Superintelligence SG API rejected the request.'));
  }
  if (response.status === 404) {
    throw new ToolError('not_found', await errorMessage(response, 'Not found'));
  }
  if (!response.ok) {
    throw new ToolError('upstream_unavailable', 'The Superintelligence SG API is temporarily unavailable. Try again.', { retryable: true });
  }
  let body;
  try {
    body = await response.json();
  } catch {
    throw new ToolError('upstream_unavailable', 'The Superintelligence SG API returned an unreadable response. Try again.', { retryable: true });
  }
  if (cacheable) cacheSet(url.href, body);
  return { url, body, cached: false };
}
