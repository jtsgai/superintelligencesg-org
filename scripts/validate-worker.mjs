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
console.log('Worker routes and Source Desk intake are valid');
