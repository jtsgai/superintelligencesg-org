// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { clearResponseCache } from '../src/cache.js';
import worker from '../src/index.js';
import { resetRateLimit } from '../src/rate-limit.js';

const ORGS = [
  {
    id: 'public-ai-singapore',
    type: 'organization',
    name: 'AI Singapore',
    founder: 'Singapore national AI programme',
    description: 'National programmes spanning research and talent.',
    kind: 'Ecosystem',
    url: 'https://aisingapore.org/',
    source_url: 'https://aisingapore.org/',
    updated: '2026-10-12',
    lenses: ['public'],
    evidence: { status: 'source_verified', history: [{ at: '2026-10-12', kind: 'individual_source_review', note: 'Checked the homepage.' }] },
  },
  {
    id: '9dead00b-115e-4312-8d4d-6a4f2904a958',
    type: 'organization',
    name: 'JT M&C',
    founder: 'Jerry Tuo',
    description: 'A companion company.',
    kind: 'Organization',
    url: 'https://jt-sgai.com/',
    source_url: 'https://jt-sgai.com/',
    updated: '2026-08-01',
    evidence: { status: 'self_submitted' },
  },
];

function productionEnv(fetchImpl, extra = {}) {
  return {
    ENVIRONMENT: 'production',
    MCP_API_KEY: 'prod-key',
    MCP_API_KEY_TEST: 'test-key',
    SI_API_BASE: 'https://api.superintelligencesg.org',
    __fetch: fetchImpl,
    ...extra,
  };
}

function directoryFetch() {
  const calls = [];
  const impl = async url => {
    const href = String(url);
    calls.push(href);
    const parsed = new URL(href);
    if (parsed.pathname === '/v1/stats') {
      return Response.json({ version: 1, total: 2, by_type: { organization: 2 }, by_kind: { Ecosystem: 1, Organization: 1 } });
    }
    if (parsed.pathname === '/v1/changes') {
      return Response.json({
        version: 1,
        total: 4,
        count: 1,
        changes: [{ id: 'change-1', date: '2026-10-16', title: 'A public route', summary: 'Lab page.', label: 'Research brief', url: 'https://superintelligencesg.ai/evidence-intelligence/', source_url: 'https://superintelligencesg.ai/evidence-intelligence/', evidence: { status: 'needs_review' } }],
      });
    }
    if (parsed.pathname === '/v1/entries') {
      const query = (parsed.searchParams.get('q') || '').toLowerCase();
      const entries = query ? ORGS.filter(entry => `${entry.name} ${entry.description} ${entry.kind}`.toLowerCase().includes(query)) : ORGS;
      return Response.json({ version: 1, sort: parsed.searchParams.get('sort') || 'name', total: entries.length, entries });
    }
    return Response.json({ error: 'Not found' }, { status: 404 });
  };
  return { impl, calls };
}

function mcpRequest(body, { key = 'prod-key', method = 'POST', headers = {}, url = 'https://mcp.superintelligencesg.org/mcp' } = {}) {
  return new Request(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: method === 'POST' && body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function read(response) {
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function toolPayload(message) {
  assert.equal(message.error, undefined);
  const text = message.result.content[0].text;
  return { raw: message, data: JSON.parse(text), isError: message.result.isError === true };
}

describe('MCP worker', () => {
  beforeEach(() => {
    resetRateLimit();
    clearResponseCache();
  });

  it('requires the environment key and does not accept the other one', async () => {
    const { impl } = directoryFetch();
    const missing = await read(await worker.fetch(mcpRequest({ jsonrpc: '2.0', id: 1, method: 'ping' }, { key: 'nope' }), productionEnv(impl)));
    assert.equal(missing.status, 401);
    assert.equal(missing.body.error, 'unauthorized');
    assert.match(missing.headers.get('WWW-Authenticate'), /Bearer/);

    const testEnv = { ENVIRONMENT: 'test', MCP_API_KEY: 'prod-key', MCP_API_KEY_TEST: 'test-key', __fetch: impl };
    const wrongEnv = await read(await worker.fetch(mcpRequest({ jsonrpc: '2.0', id: 1, method: 'ping' }, { key: 'prod-key' }), testEnv));
    assert.equal(wrongEnv.status, 401);
    const rightEnv = await read(await worker.fetch(mcpRequest({ jsonrpc: '2.0', id: 1, method: 'ping' }, { key: 'test-key' }), testEnv));
    assert.equal(rightEnv.status, 200);

    const unconfigured = await read(await worker.fetch(mcpRequest({ jsonrpc: '2.0', id: 1, method: 'ping' }), { ENVIRONMENT: 'production', __fetch: impl }));
    assert.equal(unconfigured.status, 503);
    assert.equal(unconfigured.body.error, 'not_configured');
  });

  it('lists five read-only tools and answers initialize over Streamable HTTP', async () => {
    const { impl, calls } = directoryFetch();
    const env = productionEnv(impl);
    const initialized = await read(await worker.fetch(mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'local', version: '0.0.1' } },
    }), env));
    assert.equal(initialized.status, 200);
    assert.equal(initialized.body.result.serverInfo.name, 'si-commons');
    assert.equal(initialized.body.result.protocolVersion, '2025-11-25');

    const listed = await read(await worker.fetch(mcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }), env));
    const tools = listed.body.result.tools;
    assert.deepEqual(tools.map(tool => tool.name), ['search_sg_ai_orgs', 'get_org', 'ecosystem_stats', 'recent_changes', 'match_sg_ai_partners']);
    assert.equal(tools.every(tool => tool.annotations.readOnlyHint === true && tool.annotations.destructiveHint === false), true);
    assert.equal(calls.length, 0);
  });

  it('searches, reads one record, stats, changes, and ranks without logging the query', async () => {
    const lines = [];
    const original = console.log;
    console.log = line => lines.push(String(line));
    try {
      const { impl, calls } = directoryFetch();
      const env = productionEnv(impl);
      const search = toolPayload(await (await worker.fetch(mcpRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'search_sg_ai_orgs', arguments: { query: 'unique-query-token-qq', limit: 10 } },
      }), env)).json());
      assert.equal(search.isError, false);
      assert.equal(search.data.total, 0);
      assert.equal(search.data.entries.length, 0);
      assert.equal(search.data.source_url, 'https://api.superintelligencesg.org/v1/entries');
      assert.equal(calls.some(url => url.includes('unique-query-token-qq') && url.startsWith('https://api.superintelligencesg.org/v1/entries?')), true);

      const org = toolPayload(await (await worker.fetch(mcpRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: { name: 'get_org', arguments: { id: 'public-ai-singapore' } },
      }), env)).json());
      assert.equal(org.data.record.evidence.history[0].note, 'Checked the homepage.');
      assert.equal(org.data.disclosure, null);

      const affiliated = toolPayload(await (await worker.fetch(mcpRequest({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'get_org', arguments: { id: '9dead00b-115e-4312-8d4d-6a4f2904a958' } },
      }), env)).json());
      assert.match(affiliated.data.disclosure, /No ranking boost/);

      const missing = toolPayload(await (await worker.fetch(mcpRequest({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'get_org', arguments: { id: 'missing-org' } },
      }), env)).json());
      assert.equal(missing.isError, true);
      assert.equal(missing.data.error, 'not_found');

      const stats = toolPayload(await (await worker.fetch(mcpRequest({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'ecosystem_stats', arguments: {} },
      }), env)).json());
      assert.equal(stats.data.total, 2);
      assert.equal(stats.data.as_of, null);
      assert.equal(stats.data.by_type.organization, 2);

      const changes = toolPayload(await (await worker.fetch(mcpRequest({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: { name: 'recent_changes', arguments: { limit: 1 } },
      }), env)).json());
      assert.equal(changes.data.changes[0].date, '2026-10-16');
      assert.equal(changes.data.as_of, '2026-10-16');
      assert.equal(changes.data.changes[0].evidence.status, 'needs_review');

      const matched = toolPayload(await (await worker.fetch(mcpRequest({
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: { name: 'match_sg_ai_partners', arguments: { need: 'research talent programmes' } },
      }), env)).json());
      assert.equal(matched.data.matches[0].id, 'public-ai-singapore');
      assert.match(matched.data.matches[0].why, /Description matches the need|Name matches/);
      assert.equal(matched.data.matches.some(item => item.id.startsWith('9dead') && item.score > matched.data.matches[0].score), false);

      const logged = lines.map(line => JSON.parse(line));
      assert.equal(logged.every(entry => Object.keys(entry).join(',') === 'ts,tool,status,latency_ms'), true);
      const blob = lines.join('\n');
      assert.equal(blob.includes('unique-query-token-qq'), false);
      assert.equal(blob.includes('prod-key'), false);
      assert.equal(blob.includes('research talent'), false);
      assert.equal(logged.some(entry => entry.tool === 'search_sg_ai_orgs' && entry.status === 'ok'), true);
      assert.equal(logged.some(entry => entry.tool === 'get_org' && entry.status === 'not_found'), true);
    } finally {
      console.log = original;
    }
  });

  it('returns the upstream 400 message as invalid_argument', async () => {
    const env = productionEnv(async () => Response.json({ error: 'Sort by name or updated.' }, { status: 400 }));
    const result = toolPayload(await (await worker.fetch(mcpRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'search_sg_ai_orgs', arguments: { query: 'governance' } },
    }), env)).json());
    assert.equal(result.isError, true);
    assert.equal(result.data.error, 'invalid_argument');
    assert.equal(result.data.message, 'Sort by name or updated.');
    assert.equal(result.data.retryable, false);
  });

  it('rate limits per environment key', async () => {
    const { impl } = directoryFetch();
    const env = {
      ENVIRONMENT: 'test',
      MCP_API_KEY_TEST: 'test-key',
      RATE_LIMIT_PER_MINUTE: 1,
      __fetch: impl,
    };
    const first = await worker.fetch(mcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { key: 'test-key' }), env);
    assert.equal(first.status, 200);
    const second = await read(await worker.fetch(mcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, { key: 'test-key' }), env));
    assert.equal(second.status, 429);
    assert.equal(second.body.error, 'rate_limited');
    assert.equal(second.body.retryable, true);
    assert.ok(Number(second.headers.get('Retry-After')) >= 1);
  });

  it('rejects other hosts, unknown paths, and non-POST MCP calls', async () => {
    const { impl } = directoryFetch();
    const env = productionEnv(impl);
    const evil = await read(await worker.fetch(mcpRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { url: 'https://evil.example/mcp' }), env));
    assert.equal(evil.status, 403);
    const health = await read(await worker.fetch(new Request('https://mcp.superintelligencesg.org/'), env));
    assert.equal(health.status, 200);
    assert.equal(health.body.mcp, '/mcp');
    assert.equal(health.body.read_only, true);
    const missing = await read(await worker.fetch(new Request('https://mcp.superintelligencesg.org/secret'), env));
    assert.equal(missing.status, 404);
    const get = await read(await worker.fetch(mcpRequest(undefined, { method: 'GET' }), env));
    assert.equal(get.status, 405);
  });

  it('does not log a tool name that is actually user text', async () => {
    const lines = [];
    const original = console.log;
    console.log = line => lines.push(String(line));
    try {
      const env = productionEnv(async () => Response.json({ total: 0, entries: [] }));
      await worker.fetch(mcpRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'unique-query-token-qq', arguments: { query: 'unique-query-token-qq' } },
      }), env);
      assert.equal(lines.join('\n').includes('unique-query-token-qq'), false);
      assert.equal(JSON.parse(lines.at(-1)).tool, 'tools/call');
    } finally {
      console.log = original;
    }
  });
});
