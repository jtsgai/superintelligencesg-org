import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = await readFile(resolve(root, 'dist/server/index.js'), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const worker = (await import(moduleUrl)).default;
assert.equal(typeof worker.fetch, 'function', 'Worker must export fetch');

const calls = [];
const DB = {
  prepare(sql) {
    const call = { sql, values: [] };
    calls.push(call);
    return {
      bind(...values) { call.values = values; return this; },
      async all() { return { results: [] }; },
      async first() { return null; },
      async run() { return { meta: { changes: 1 } }; },
    };
  },
  async batch(statements) {
    for (const statement of statements) await statement.run();
    return [{}, { results: [{ count: 1 }] }, {}];
  },
};

for (const path of ['/directory/organizations', '/directory/api/organizations']) {
  const response = await worker.fetch(new Request(`https://data.superintelligencesg.org${path}`), { DB });
  assert.equal(response.status, 200, `${path} should return the directory`);
  assert.deepEqual(await response.json(), { organizations: [] });
}

const request = new Request('https://data.superintelligencesg.org/directory/api/source-suggestions', {
  method: 'POST',
  headers: { Origin: 'https://superintelligencesg.com', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'addition',
    subject_name: 'Test Research Group',
    subject_url: 'https://example.org',
    source_url: 'https://example.org/evidence',
    details: 'This request validates the durable Source Desk intake route.',
    contact_email: 'editor@example.org',
    consent: true,
    website: '',
  }),
});
const response = await worker.fetch(request, { DB });
assert.equal(response.status, 201, 'Source Desk should accept a valid request');
assert.deepEqual(await response.json(), { ok: true, status: 'received' });
assert(calls.some(call => call.sql.includes('INSERT INTO source_desk_submissions')), 'Source Desk must write to the existing table');
for (const origin of ['https://superintelligencesg.si', 'https://www.superintelligencesg.si']) {
  const preflight = await worker.fetch(new Request('https://data.superintelligencesg.org/api/organizations', { method: 'OPTIONS', headers: { Origin: origin } }), { DB });
  assert.equal(preflight.status, 204, `${origin} preflight should be allowed`);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  const read = await worker.fetch(new Request('https://data.superintelligencesg.org/api/organizations', { headers: { Origin: origin } }), { DB });
  assert.equal(read.status, 200, `${origin} should be able to read the directory`);
  assert.equal(read.headers.get('Access-Control-Allow-Origin'), origin);
}
const blocked = await worker.fetch(new Request('https://data.superintelligencesg.org/api/organizations', { headers: { Origin: 'https://superintelligencesg.si.example.com' } }), { DB });
assert.equal(blocked.status, 403, 'unlisted origins stay blocked');
for (const path of ['/api/organizations', '/api/source-updates', '/api/health']) {
  const v0 = await worker.fetch(new Request(`https://data.superintelligencesg.org${path}`), { DB });
  assert.equal(v0.headers.get('Cache-Control'), 'no-store', `${path} keeps no-store`);
  assert.equal(v0.headers.get('ETag'), null, `${path} has no v1 ETag`);
}
console.log('Worker routes and Source Desk intake are valid');

// ---- API v1 ----
const V1_CACHE = 'public, max-age=300, stale-while-revalidate=86400';
const DATA_FILES = { 'data/entries.json': 1, 'data/changes.json': 1, 'data/signals.json': 1, 'assets/product/source-radar.json': 1 };
const realFetch = globalThis.fetch;
const fetched = [];
globalThis.fetch = async (input, init) => {
  const href = String(input?.url || input);
  fetched.push(href);
  const match = href.match(/^https:\/\/(live|edge)\.test\/repo\/(.+)$/);
  if (match && DATA_FILES[match[2]]) return new Response(await readFile(resolve(root, match[2]), 'utf8'), { status: 200 });
  if (href.startsWith('https://down.test/')) throw new TypeError('network down');
  if (href.startsWith('https://raw.githubusercontent.com/')) return new Response('nope', { status: 503 });
  return realFetch(input, init);
};
const commonsRow = { id: '9dead00b-115e-4312-8d4d-6a4f2904a958', name: 'JT M&C', founder: 'Jerry Tuo', business: 'Self-submitted description.', logo_key: 'https://jt-sgai.com/favicon.ico', created_at: 1790482477, updated_at: 1790482477, website_url: 'https://jt-sgai.com/', category: 'Organization', verification_status: 'submitted' };
const v1DB = {
  prepare(sql) {
    calls.push({ sql, values: [] });
    return { bind() { return this; }, async all() { return { results: sql.includes('FROM organizations o') ? [{ ...commonsRow }] : [] }; }, async first() { return null; }, async run() { return { meta: { changes: 1 } }; } };
  },
};
const live = { DB: v1DB, DATA_BASE_URL: 'https://live.test/repo/' };
const get = (path, env = live, headers = {}) => worker.fetch(new Request(`https://data.superintelligencesg.org${path}`, { headers }), env, { waitUntil() {} });
const curated = JSON.parse(await readFile(resolve(root, 'data/entries.json'), 'utf8')).records;

let res = await get('/api/v1/entries');
assert.equal(res.status, 200, 'v1 entries should respond');
assert.equal(res.headers.get('Cache-Control'), V1_CACHE, 'v1 entries are publicly cacheable');
assert.match(res.headers.get('ETag'), /^"[a-f0-9]{32}"$/, 'v1 entries carry an ETag');
assert.match(res.headers.get('X-Data-Source'), /entries=origin; commons=ok/);
assert(fetched.includes('https://live.test/repo/data/entries.json'), 'DATA_BASE_URL selects the data source');
let body = await res.json();
assert.equal(body.total, curated.length + 1, 'curated entries merge with Commons profiles');
assert.equal(body.entries.filter(entry => entry.origin === 'curated').length, curated.length);
assert.equal(body.entries.filter(entry => entry.origin === 'commons').length, 1);
const names = body.entries.map(entry => entry.name);
assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })), 'default order is alphabetical');
assert(body.entries.every(entry => !('score' in entry) && !('rank' in entry) && !('position' in entry)), 'no scores or ranks are exposed');
for (const entry of body.entries) for (const key of ['source_url', 'evidence', 'checked_at', 'conclusion', 'action', 'review_label']) assert(key in entry, `${entry.id} exposes ${key}`);
const needsReview = body.entries.filter(entry => entry.evidence.status === 'needs_review');
assert.equal(needsReview.length, 20, '20 moved entries remain needs_review after the 2026-10-28 source review (76 verified)');
assert(needsReview.every(entry => entry.review_label === 'Needs review' && entry.conclusion === null && entry.action === null));
assert(body.entries.filter(entry => entry.evidence.status !== 'needs_review').every(entry => entry.review_label === null));
assert.equal(body.entries.find(entry => entry.origin === 'commons').evidence.status, 'self_submitted');
assert.equal(body.entries.find(entry => entry.origin === 'commons').kind, 'Organization', 'JT M&C uses the stored default category');
assert.equal(body.entries.find(entry => entry.origin === 'commons').review_label, null, 'Commons profiles carry no review label');
assert.equal(body.entries.filter(entry => entry.review_label === 'Needs review').length, 20, 'Needs review label is emitted');

// ?origin= filter
const curatedOnly = await (await get('/api/v1/entries?origin=curated')).json();
assert.equal(curatedOnly.total, curated.length, 'origin=curated returns only curated entries');
assert(curatedOnly.entries.every(entry => entry.origin === 'curated'));
const commonsOnly = await (await get('/api/v1/entries?origin=commons')).json();
assert.equal(commonsOnly.total, 1, 'origin=commons returns only Commons profiles');
assert(commonsOnly.entries.every(entry => entry.origin === 'commons' && entry.name === 'JT M&C'));
assert.equal((await get('/api/v1/entries?origin=bogus')).status, 400, 'unknown origin is rejected');
assert.equal(body.entries.find(entry => entry.id === 'public-ai-singapore').logo_url, 'https://superintelligencesg.com/assets/navigator/ai-singapore.png');

const etag = res.headers.get('ETag');
res = await get('/api/v1/entries', live, { 'If-None-Match': etag });
assert.equal(res.status, 304, 'matching If-None-Match returns 304');
assert.equal(res.headers.get('ETag'), etag);
assert.equal(await res.text(), '');
res = await get('/api/v1/entries', live, { 'If-None-Match': `W/${etag}, "other"` });
assert.equal(res.status, 304, 'weak/list If-None-Match also matches');
res = await get('/api/v1/entries', live, { 'If-None-Match': '"stale"' });
assert.equal(res.status, 200, 'a different ETag returns the body');

body = await (await get('/api/v1/entries?sort=updated')).json();
const updated = body.entries.map(entry => entry.updated || '');
assert.deepEqual(updated, [...updated].sort().reverse(), 'sort=updated orders by date only');
body = await (await get('/api/v1/entries?kind=Governance')).json();
assert(body.total > 0 && body.entries.every(entry => entry.kind === 'Governance'), 'kind filter');
body = await (await get('/api/v1/entries?lens=trusted-deployment')).json();
assert.equal(body.total, 10, 'lens filter uses the Navigator lens definitions');
body = await (await get('/api/v1/entries?q=singapore&origin=curated&limit=5')).json();
assert(body.count === 5 && body.total > 5 && body.entries.every(entry => entry.origin === 'curated' && JSON.stringify(entry).toLowerCase().includes('singapore')), 'q, origin and limit filters');
assert.equal((await get('/api/v1/entries?sort=score')).status, 400, 'score ordering is rejected');
assert.equal((await get('/api/v1/entries?sort=score')).headers.get('Cache-Control'), 'no-store', 'errors are not cached');

for (const [path, key] of [['/api/v1/signals', 'signals'], ['/api/v1/changes', 'changes']]) {
  res = await get(path);
  assert.equal(res.status, 200, `${path} should respond`);
  assert.equal(res.headers.get('Cache-Control'), V1_CACHE);
  assert(res.headers.get('ETag'));
  body = await res.json();
  assert(Array.isArray(body[key]) && body[key].length > 0, `${path} returns records`);
  assert(body[key].every(record => 'source_url' in record && record.evidence?.status && 'checked_at' in record && 'conclusion' in record && 'action' in record));
}
body = await (await get('/api/v1/changes?limit=3')).json();
assert.equal(body.changes.length, 3, 'changes honours limit');
assert.deepEqual(body.changes.map(change => change.date), [...body.changes.map(change => change.date)].sort().reverse(), 'changes are newest first');
res = await get('/api/v1/radar');
assert.equal(res.status, 200);
assert(Array.isArray((await res.json()).items), 'radar returns the Source Radar snapshot');
res = await get('/api/v1/snapshot');
body = await res.json();
assert.equal(res.headers.get('Cache-Control'), V1_CACHE);
assert(body.entries.length === curated.length + 1 && body.changes.length && body.signals.length && Array.isArray(body.radar.items), 'snapshot bundles every dataset');

res = await get('/api/v1/feed.json', live, { Origin: 'https://reader.example.net' });
assert.equal(res.status, 200, 'feed is readable from any origin');
assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
assert.equal(res.headers.get('Cache-Control'), V1_CACHE);
body = await res.json();
assert.equal(body.version, 'https://jsonfeed.org/version/1.1');
assert(body.items.length > 0);
for (const item of body.items) {
  const draft = item._x_draft;
  assert(draft.text.length <= 240, `${item.id} X draft is at most 240 characters`);
  assert(draft.text.startsWith(item.title.slice(0, 20)), 'X draft text is built from the title');
  assert.match(draft.text, /\(Source: [^,]+, \d{1,2} \w{3} \d{4}\)$/, 'X draft text ends with source and date');
  const link = new URL(draft.url);
  assert.equal(link.searchParams.get('utm_source'), 'x');
  assert.equal(link.searchParams.get('utm_campaign'), 'change-brief');
  assert.deepEqual(draft.media, { required: true, type: 'gif|video', asset_url: null });
  assert.equal(draft.auto_post, false);
  assert.equal(draft.status, 'draft_needs_human_approval');
}
res = await worker.fetch(new Request('https://data.superintelligencesg.org/api/v1/feed.json', { method: 'OPTIONS', headers: { Origin: 'https://reader.example.net' } }), live);
assert.equal(res.status, 204);
assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');

res = await get('/api/v1/entries', live, { Origin: 'https://superintelligencesg.si' });
assert.equal(res.status, 200, '.si can read v1 entries');
assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://superintelligencesg.si');
assert.equal(res.headers.get('Vary'), 'Origin');
res = await get('/v1/entries', live);
assert.equal(res.status, 200, 'the short v1 alias returns entries');
res = await get('/api/v1/entries', live, { Origin: 'https://reader.example.net' });
assert.equal(res.status, 403, 'non-feed v1 routes keep the origin allowlist');
res = await worker.fetch(new Request('https://data.superintelligencesg.org/api/v1/entries', { method: 'POST', headers: { Origin: 'https://superintelligencesg.org' }, body: '{}' }), live);
assert.equal(res.status, 404, 'v1 has no write routes');
assert.equal(res.headers.get('Cache-Control'), 'no-store');

// Fallbacks: raw GitHub down -> bundled data in dist; no DB -> curated only.
res = await get('/api/v1/entries', { DATA_BASE_URL: 'https://down.test/repo', ENABLE_SNAPSHOT_CACHE: '1' });
assert.equal(res.status, 200, 'entries still respond when GitHub and D1 are unavailable');
assert.match(res.headers.get('X-Data-Source'), /entries=bundled; commons=unavailable/);
assert.equal((await res.json()).total, curated.length, 'bundled fallback serves the committed data');
const plain = (await import(`data:text/javascript;base64,${Buffer.from((await readFile(resolve(root, 'worker/index.js'), 'utf8'))).toString('base64')}`)).default;
res = await plain.fetch(new Request('https://data.superintelligencesg.org/api/v1/changes'), { DATA_BASE_URL: 'https://down.test/repo' });
assert.equal(res.status, 200);
assert.match(res.headers.get('X-Data-Source'), /changes=empty/);
assert.deepEqual((await res.json()).changes, [], 'unbundled source falls back to an empty list');

// Edge cache: feature-detected caches.default is written, then read by a fresh isolate.
const edgeStore = new Map();
globalThis.caches = { default: { async match(request) { const hit = edgeStore.get(request.url); return hit ? hit.clone() : undefined; }, async put(request, response) { edgeStore.set(request.url, response.clone()); } } };
const edgeEnv = { DB: v1DB, DATA_BASE_URL: 'https://edge.test/repo' };
res = await get('/api/v1/signals', edgeEnv);
assert.match(res.headers.get('X-Data-Source'), /signals=origin/);
assert.equal(edgeStore.size, 1, 'the edge cache stores the fetched data file');
assert.match([...edgeStore.values()][0].headers.get('Cache-Control'), /max-age=300/, 'edge copy has a 300 s TTL');
const fresh = (await import(`${moduleUrl}#edge`)).default;
const before = fetched.length;
res = await fresh.fetch(new Request('https://data.superintelligencesg.org/api/v1/signals'), edgeEnv, { waitUntil() {} });
assert.match(res.headers.get('X-Data-Source'), /signals=edge/, 'a new isolate reads the edge cache');
assert.equal(fetched.length, before, 'an edge hit does not refetch GitHub');
res = await get('/api/v1/signals', edgeEnv);
assert.match(res.headers.get('X-Data-Source'), /signals=memory/, 'the in-memory copy is used within the TTL');
delete globalThis.caches;
globalThis.fetch = realFetch;

// Guardrails: no new D1 tables, snapshot_cache stays a flagged stub, no X posting.
const workerSource = await readFile(resolve(root, 'worker/index.js'), 'utf8');
const tables = [...workerSource.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/gi)].map(match => match[1]).sort();
assert.deepEqual(tables, ['source_desk_public_updates', 'source_desk_review_events'], 'no new D1 CREATE TABLE statements');
assert(!/(?:INSERT INTO|FROM|UPDATE)\s+snapshot_cache/i.test(workerSource), 'snapshot_cache is not queried');
assert(workerSource.includes("env.ENABLE_SNAPSHOT_CACHE !== '1'") && workerSource.includes('TODO(needs 劲涛 approval): D1 snapshot_cache'), 'snapshot_cache is a flagged TODO stub');
assert(!calls.some(call => /snapshot_cache|CREATE TABLE/i.test(call.sql) && !/source_desk/.test(call.sql)), 'v1 requests never touch new tables');
assert(!/api\.(twitter|x)\.com|upload\.twitter\.com/i.test(workerSource), 'the worker never calls X');
console.log('API v1 routes, caching, CORS and fallbacks are valid');
