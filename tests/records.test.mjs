import { readFile } from 'node:fs/promises';
import { check } from '../scripts/validate-data.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { RECORD_TYPES, missingSource, validateRecord } from '../worker/index.js';

const person = { id: 'public-person', type: 'person', name: 'Public Name', public_role: 'Director', organisation: 'Public Institution', source_url: 'https://example.org/roles', checked_at: '2026-10-28', kind: 'Person' };
const records = [
  { id: 'legacy', name: 'Legacy', kind: 'Research' },
  { id: 'explicit', name: 'Organization', type: 'organization', kind: 'Research', source_url: 'https://example.org/org' },
  ...['event', 'funding', 'gov_initiative'].map(type => ({ id: type, type, name: type, kind: 'Public capability', source_url: 'http://example.org/source', checked_at: '2024-02-29' })),
  person,
];
const origin = 'https://superintelligencesg.org';
const request = (path, options = {}) => new Request(`https://worker.test${path}`, options);
const env = { DATA_BASE_URL: 'https://fixtures.test/valid' };
const realFetch = globalThis.fetch;
let loadedRecords = records;
// No test is allowed to make a real network request.
globalThis.fetch = async input => {
  assert.match(String(input), /^https:\/\/fixtures\.test\//);
  return Response.json({ records: loadedRecords });
};
process.on('exit', () => { globalThis.fetch = realFetch; });

test('validator preserves legacy records and validates every new type without mutation', () => {
  const before = structuredClone(records);
  for (const record of records) assert.deepEqual(validateRecord(record), []);
  assert.deepEqual(records, before);
  for (const type of RECORD_TYPES.filter(type => type !== 'organization')) {
    const record = type === 'person' ? person : { type };
    for (const source_url of [undefined, null, '', 'ftp://example.org', 'https://', 'https://example.org/a b', 'https://user:pass@example.org']) {
      assert(validateRecord({ ...record, source_url, checked_at: '2026-10-28' }).some(error => error.includes('source_url')));
    }
    for (const checked_at of [undefined, null, '', '2026-02-29', '2024-02-30', '2026-13-01', '2026-1-01', '2026-10-28T00:00:00Z']) {
      assert(validateRecord({ ...record, source_url: person.source_url, checked_at }).some(error => error.includes('checked_at')));
    }
  }
  for (const bad of [null, [], 'event', { type: '' }, { type: null }, { type: 'bogus' }]) assert(validateRecord(bad).length);
});

test('person records require public role and organisation and reject contact/private fields', () => {
  for (const key of ['name', 'public_role', 'organisation']) assert(validateRecord({ ...person, [key]: '' }).length);
  for (const key of ['email', 'phone', 'contact_url', 'address', 'private_notes', 'description', 'founder']) {
    assert(validateRecord({ ...person, [key]: 'private' }).some(error => error.includes(key)));
  }
});

test('both entry aliases filter every type and preserve pagination response shape', async () => {
  for (const path of ['/api/v1/entries', '/v1/entries']) {
    for (const type of RECORD_TYPES) {
      const response = await worker.fetch(request(`${path}?type=${type}&limit=1`), env);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(Object.keys(body), ['version', 'sort', 'count', 'total', 'entries']);
      assert.equal(body.count, 1);
      assert.equal(body.total, type === 'organization' ? 2 : 1);
      assert(body.entries.every(entry => entry.type === type));
    }
    for (const type of ['', 'bogus', 'Event']) {
      const response = await worker.fetch(request(`${path}?type=${type}`), env);
      assert.equal(response.status, 400);
      assert.equal(typeof (await response.json()).error, 'string');
    }
  }
  const combined = await (await worker.fetch(request('/v1/entries?type=organization&kind=Research&q=legacy'), env)).json();
  assert.equal(combined.total, 1);
});

test('stats count all entries by type and kind, including legacy and Commons organizations', async () => {
  const DB = { prepare() { return { async all() { return { results: [{ id: 'commons', name: 'Commons', business: '', category: 'Research' }] }; } }; } };
  const response = await worker.fetch(request('/api/v1/stats?limit=1&type=person'), { ...env, DB });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300, stale-while-revalidate=86400');
  const body = await response.json();
  assert.deepEqual(body, { version: 1, total: 7, by_type: { organization: 3, event: 1, funding: 1, gov_initiative: 1, person: 1 }, by_kind: { Research: 3, Person: 1, 'Public capability': 3 } });
  assert.equal((await worker.fetch(request('/v1/stats'), env)).status, 200);
});

test('invalid ingested records return HTTP 400 JSON instead of being cached or hidden by fallback', async () => {
  for (const type of RECORD_TYPES.filter(type => type !== 'organization')) {
    for (const invalid of [{ source_url: null }, { source_url: 'ftp://example.org' }, { checked_at: undefined }, { checked_at: '2026-02-30' }]) {
      loadedRecords = [{ ...person, type, ...invalid }];
      const response = await worker.fetch(request('/v1/entries'), { DATA_BASE_URL: `https://fixtures.test/bad-${type}-${JSON.stringify(invalid)}` });
      assert.equal(response.status, 400);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(typeof (await response.json()).error, 'string');
    }
  }
  loadedRecords = records;
});

test('organization write path rejects a sourceless typed record with HTTP 400 JSON before storage', async () => {
  const DB = { prepare() { return { bind() { return this; }, async run() {} }; }, async batch() { return [{}, { results: [{ count: 1 }] }]; } };
  for (const type of ['event', 'funding', 'gov_initiative', 'person']) {
    const form = new FormData();
    form.set('type', type);
    form.set('consent', 'on');
    const response = await worker.fetch(request('/api/organizations', { method: 'POST', headers: { Origin: origin }, body: form }), { DB });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /source_url/);
  }
});

test('CORS retains exact own-domain allowlist and cache duration; bogus origins return 400', async () => {
  for (const path of ['/api/v1/entries', '/v1/entries', '/api/v1/stats']) {
    for (const tld of ['org', 'com', 'ai', 'si']) for (const prefix of ['', 'www.']) {
      const allowed = `https://${prefix}superintelligencesg.${tld}`;
      const response = await worker.fetch(request(path, { headers: { Origin: allowed } }), env);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), allowed);
      assert.equal(response.headers.get('Vary'), 'Origin');
      assert.match(response.headers.get('Cache-Control'), /max-age=300/);
      const preflight = await worker.fetch(request(path, { method: 'OPTIONS', headers: { Origin: allowed } }), env);
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PATCH, OPTIONS');
      assert.equal(preflight.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization');
    }
    for (const bad of ['https://bogus.test', 'https://superintelligencesg.org.bogus.test', 'http://superintelligencesg.org', 'null']) {
      for (const method of ['GET', 'OPTIONS']) {
        const response = await worker.fetch(request(path, { method, headers: { Origin: bad } }), env);
        assert.equal(response.status, 400);
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
      }
    }
  }
});


test('entry JSON schema accepts legacy and typed records and rejects missing provenance or private person fields', async () => {
  const schema = JSON.parse(await readFile(new URL('../data/schema/entries.schema.json', import.meta.url), 'utf8'));
  const legacy = { id: 'legacy-test', name: 'Legacy', description: 'Public description', kind: 'Organization', url: 'https://example.org', updated: '2026-10-28', lenses: [], source_url: null, checked_at: null, evidence: { status: 'needs_review' }, conclusion: null, action: null };
  const errorsFor = record => {
    const errors = [];
    check(schema, { version: 1, records: [record] }, 'fixture', schema, errors);
    return errors;
  };
  assert.deepEqual(errorsFor(legacy), []);
  assert.deepEqual(errorsFor(person), []);
  assert(errorsFor({ ...person, email: 'private@example.org' }).length);
  for (const type of ['event', 'funding', 'gov_initiative']) {
    const record = { ...legacy, type, source_url: 'http://example.org/source', checked_at: '2026-10-28' };
    assert.deepEqual(errorsFor(record), []);
    assert(errorsFor({ ...record, source_url: null }).length);
    assert(errorsFor({ ...record, checked_at: null }).length);
    const { source_url, ...sourceless } = record;
    assert(errorsFor(sourceless).length);
  }
});

test('new or modified organizations need a valid source_url; legacy ones are flagged missing_source, not rejected', async () => {
  for (const source_url of [undefined, null, '', 'ftp://example.org', 'https://user:pass@example.org']) {
    assert(validateRecord({ id: 'new-org', type: 'organization', name: 'New', source_url }).some(error => error.includes('source_url')));
    assert.deepEqual(validateRecord({ id: 'old', name: 'Old', source_url }), []);
    assert.deepEqual(validateRecord({ id: 'old', type: 'organization', name: 'Old', source_url, evidence: { status: 'needs_review' } }), []);
    assert.equal(missingSource({ source_url }), true);
  }
  assert.equal(missingSource({ source_url: 'https://example.org/org' }), false);
  const body = await (await worker.fetch(request('/v1/entries?type=organization'), env)).json();
  assert.equal(body.entries.find(entry => entry.id === 'legacy').missing_source, true);
  assert.equal(body.entries.find(entry => entry.id === 'explicit').missing_source, false);
  const DB = { prepare() { return { bind() { return this; }, async run() {} }; }, async batch() { return [{}, { results: [{ count: 1 }] }]; } };
  const form = new FormData();
  for (const [key, value] of Object.entries({ consent: 'on', name: 'N', founder: 'F', business: 'B' })) form.set(key, value);
  const response = await worker.fetch(request('/api/organizations', { method: 'POST', headers: { Origin: origin }, body: form }), { DB });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /source_url/);
});
