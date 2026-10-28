// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { DEFAULT_RATE_LIMIT, rateLimitFor, resetRateLimit, takeRateLimit } from '../src/rate-limit.js';

describe('rate limit', () => {
  beforeEach(() => resetRateLimit());

  it('allows 60 requests per key per minute and then asks the caller to wait', () => {
    const now = 1_000_000;
    for (let count = 0; count < DEFAULT_RATE_LIMIT; count += 1) {
      assert.equal(takeRateLimit('production', DEFAULT_RATE_LIMIT, 60_000, now).ok, true);
    }
    const blocked = takeRateLimit('production', DEFAULT_RATE_LIMIT, 60_000, now + 1000);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.retryAfter, 59);
    assert.equal(takeRateLimit('test', DEFAULT_RATE_LIMIT, 60_000, now).ok, true);
    assert.equal(takeRateLimit('production', DEFAULT_RATE_LIMIT, 60_000, now + 60_000).ok, true);
  });

  it('uses a lower test-environment limit and ignores that override in production', () => {
    assert.equal(rateLimitFor({ ENVIRONMENT: 'test', RATE_LIMIT_PER_MINUTE: '2' }), 2);
    assert.equal(rateLimitFor({ ENVIRONMENT: 'test', RATE_LIMIT_PER_MINUTE: 0 }), 60);
    assert.equal(rateLimitFor({ ENVIRONMENT: 'test', RATE_LIMIT_PER_MINUTE: 61 }), 60);
    assert.equal(rateLimitFor({ ENVIRONMENT: 'production', RATE_LIMIT_PER_MINUTE: 1 }), 60);
  });
});
