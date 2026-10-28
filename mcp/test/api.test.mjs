// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearResponseCache } from '../src/cache.js';
import { getOrg, recentChanges, searchOrgs } from '../src/directory.js';
import { ToolError } from '../src/errors.js';
import { siGet } from '../src/si-api.js';

const env = { SI_API_BASE: 'https://api.superintelligencesg.org' };

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('public API client', () => {
  beforeEach(() => clearResponseCache());

  it('calls only the public SI origin and does not send an Origin header', async () => {
    let seen;
    const envWithFetch = {
      ...env,
      __fetch: async (url, init) => {
        seen = { url: String(url), init };
        return jsonResponse({ version: 1, total: 0, by_type: {}, by_kind: {} });
      },
    };
    await siGet(envWithFetch, '/v1/stats');
    assert.equal(seen.url, 'https://api.superintelligencesg.org/v1/stats');
    assert.equal(seen.init.method, 'GET');
    assert.equal(seen.init.headers.origin, undefined);
    assert.equal(seen.init.headers.Origin, undefined);
    assert.equal(seen.init.redirect, 'manual');
  });

  it('refuses any other API host before calling fetch', async () => {
    let called = false;
    await assert.rejects(
      () => siGet({ SI_API_BASE: 'https://example.com', __fetch: async () => { called = true; } }, '/v1/stats'),
      error => error instanceof ToolError && error.code === 'upstream_unavailable' && !error.retryable,
    );
    assert.equal(called, false);
  });

  it('passes through the API 400 message and maps 404, 5xx, and timeouts', async () => {
    const bad = { ...env, __fetch: async () => jsonResponse({ error: 'Choose a valid record type.' }, 400) };
    await assert.rejects(() => siGet(bad, '/v1/entries'), error => error.code === 'invalid_argument' && error.message === 'Choose a valid record type.' && !error.retryable);

    const missing = { ...env, __fetch: async () => jsonResponse({ error: 'Not found' }, 404) };
    await assert.rejects(() => siGet(missing, '/v1/entries/public-ai-singapore'), error => error.code === 'not_found' && error.message === 'Not found');

    const down = { ...env, __fetch: async () => new Response('busy', { status: 503 }) };
    await assert.rejects(() => siGet(down, '/v1/stats'), error => error.code === 'upstream_unavailable' && error.retryable);

    const slow = {
      ...env,
      __fetch: (_url, init) => new Promise((resolve, reject) => {
        const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (init.signal.aborted) fail();
        else init.signal.addEventListener('abort', fail, { once: true });
        setTimeout(() => resolve(jsonResponse({})), 1000).unref?.();
      }),
    };
    await assert.rejects(() => siGet(slow, '/v1/stats', {}, { timeoutMs: 20 }), error => error.code === 'upstream_unavailable' && error.retryable && /5 seconds/.test(error.message));
  });

  it('caches the full organisation list and does not cache search text', async () => {
    let calls = 0;
    const fetched = {
      ...env,
      __fetch: async () => {
        calls += 1;
        return jsonResponse({ version: 1, total: 0, entries: [] });
      },
    };
    await siGet(fetched, '/v1/entries', { type: 'organization' });
    await siGet(fetched, '/v1/entries', { type: 'organization' });
    await siGet(fetched, '/v1/entries', { type: 'organization', q: 'governance', limit: 10 });
    await siGet(fetched, '/v1/entries', { type: 'organization', q: 'governance', limit: 10 });
    assert.equal(calls, 3);
  });

  it('resolves get_org from the list because there is no id route', async () => {
    const record = {
      id: 'public-ai-singapore',
      type: 'organization',
      name: 'AI Singapore',
      description: 'National programmes.',
      kind: 'Ecosystem',
      url: 'https://aisingapore.org/',
      source_url: 'https://aisingapore.org/',
      updated: '2026-10-12',
      evidence: { status: 'source_verified', history: [{ at: '2026-10-12', kind: 'individual_source_review', note: 'Checked.' }] },
    };
    const fetched = {
      ...env,
      __fetch: async url => {
        assert.equal(String(url).includes('/v1/entries/'), false);
        assert.match(String(url), /\/v1\/entries\?type=organization$/);
        return jsonResponse({ total: 1, entries: [record] });
      },
    };
    const result = await getOrg(fetched, { id: 'public-ai-singapore' });
    assert.equal(result.as_of, '2026-10-12');
    assert.equal(result.source_url, 'https://aisingapore.org/');
    assert.equal(result.record.evidence.history[0].note, 'Checked.');
    await assert.rejects(() => getOrg(fetched, { id: 'missing-org' }), error => error.code === 'not_found');
  });

  it('sends search filters the API implements and keeps its total', async () => {
    const fetched = {
      ...env,
      __fetch: async url => {
        const parsed = new URL(url);
        assert.equal(parsed.searchParams.get('type'), 'organization');
        assert.equal(parsed.searchParams.get('q'), 'governance');
        assert.equal(parsed.searchParams.get('kind'), 'Governance');
        assert.equal(parsed.searchParams.get('lens'), 'trust');
        assert.equal(parsed.searchParams.get('origin'), 'curated');
        assert.equal(parsed.searchParams.get('sort'), 'updated');
        assert.equal(parsed.searchParams.get('limit'), '2');
        return jsonResponse({
          sort: 'updated',
          total: 11,
          entries: [{ id: 'public-gov', name: 'AI Verify Foundation', kind: 'Governance', description: 'Testing.', founder: 'IMDA', url: 'https://aiverifyfoundation.sg/', source_url: 'https://aiverifyfoundation.sg/', updated: '2026-09-01', evidence: { status: 'needs_review' } }],
        });
      },
    };
    const result = await searchOrgs(fetched, { query: 'governance', kind: 'Governance', lens: 'Trust', origin: 'curated', sort: 'updated', limit: 2 });
    assert.equal(result.total, 11);
    assert.equal(result.entries[0].evidence.status, 'needs_review');
    assert.equal(result.entries[0].as_of, '2026-09-01');
    assert.equal(result.source_url, 'https://api.superintelligencesg.org/v1/entries');
  });

  it('rejects a local limit above the tool maximum before calling the API', async () => {
    let called = false;
    const fetched = { ...env, __fetch: async () => { called = true; return jsonResponse({ changes: [] }); } };
    await assert.rejects(() => recentChanges(fetched, { limit: 500 }), error => error.code === 'invalid_argument' && error.message === 'Use a limit between 1 and 50.');
    assert.equal(called, false);
  });
});
