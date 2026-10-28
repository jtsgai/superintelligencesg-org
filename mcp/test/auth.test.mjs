// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorize, bearerToken, expectedSecret, sameSecret } from '../src/auth.js';

describe('auth', () => {
  it('selects the production or test secret and ignores the other', () => {
    const env = { MCP_API_KEY: 'prod', MCP_API_KEY_TEST: 'test' };
    assert.deepEqual(expectedSecret({ ...env, ENVIRONMENT: 'production' }), { environment: 'production', secret: 'prod' });
    assert.deepEqual(expectedSecret({ ...env, ENVIRONMENT: 'test' }), { environment: 'test', secret: 'test' });
    assert.equal(expectedSecret({ ...env, ENVIRONMENT: 'staging' }).secret, '');
  });

  it('trims configured secrets and rejects a missing bearer', () => {
    assert.equal(expectedSecret({ ENVIRONMENT: 'production', MCP_API_KEY: '  prod-key \n' }).secret, 'prod-key');
    assert.equal(bearerToken('Bearer prod-key'), 'prod-key');
    assert.equal(bearerToken('bearer prod-key'), 'prod-key');
    assert.equal(bearerToken('Basic prod-key'), '');
    assert.equal(bearerToken('Bearer one two'), '');
  });

  it('matches only the exact secret', async () => {
    assert.equal(await sameSecret('prod-key', 'prod-key'), true);
    assert.equal(await sameSecret('prod-key', 'prod-key-2'), false);
    assert.equal(await sameSecret('short', 'a-much-longer-secret'), false);
    assert.equal(await sameSecret('', 'prod-key'), false);
  });

  it('authorizes the key for that environment only', async () => {
    const prod = { ENVIRONMENT: 'production', MCP_API_KEY: 'prod-key', MCP_API_KEY_TEST: 'test-key' };
    const test = { ENVIRONMENT: 'test', MCP_API_KEY: 'prod-key', MCP_API_KEY_TEST: 'test-key' };
    const request = key => new Request('https://mcp.superintelligencesg.org/mcp', { headers: { Authorization: `Bearer ${key}` } });
    assert.equal((await authorize(request('prod-key'), prod)).ok, true);
    assert.equal((await authorize(request('test-key'), prod)).status, 'unauthorized');
    assert.equal((await authorize(request('test-key'), test)).ok, true);
    assert.equal((await authorize(request('prod-key'), test)).status, 'unauthorized');
    assert.equal((await authorize(request('prod-key'), { ENVIRONMENT: 'production' })).status, 'not_configured');
    assert.equal((await authorize(request('test-key'), { ENVIRONMENT: 'test', MCP_API_KEY: 'prod-key' })).status, 'not_configured');
  });
});
