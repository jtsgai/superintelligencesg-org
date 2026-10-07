import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = await readFile(resolve(root, 'dist/server/index.js'), 'utf8');
const worker = (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)).default;
const id = '11111111-1111-1111-1111-111111111111';
const adminToken = 'a'.repeat(64);
const calls = [];
const row = {
  id,
  request_type: 'addition',
  subject_name: 'Candidate Test Group',
  subject_url: 'https://example.org',
  source_url: 'https://example.org/evidence',
  status: 'received',
  navigator_candidate_status: 'none',
  navigator_candidate_name: '',
  navigator_candidate_founder: '',
  navigator_candidate_description: '',
  navigator_candidate_kind: 'Organization',
  navigator_candidate_logo_url: '',
};

const DB = {
  prepare(sql) {
    const call = { sql, values: [] };
    calls.push(call);
    return {
      bind(...values) { call.values = values; return this; },
      async all() {
        if (sql.includes('source_desk_submissions s LEFT JOIN')) return { results: [{ ...row, details: 'Source-backed candidate detail.', contact_email: '', review_note: '', reviewed_at: null, created_at: 1, updated_at: 1, navigator_candidate_updated_at: null, public_summary: '', published_at: null }] };
        if (sql.includes('source_desk_review_events')) return { results: [] };
        return { results: [] };
      },
      async first() {
        if (sql.includes('SELECT 1')) return { ok: 1 };
        if (sql.includes('FROM source_desk_submissions WHERE id')) return { ...row };
        if (sql.includes('source_desk_public_updates')) return null;
        return null;
      },
      async run() {
        if (sql.startsWith('UPDATE source_desk_submissions')) {
          const [status, reviewNote, reviewedAt, updatedAt, candidateStatus, name, founder, description, kind, logoURL, candidateUpdatedAt] = call.values;
          Object.assign(row, { status, review_note: reviewNote, reviewed_at: reviewedAt, updated_at: updatedAt, navigator_candidate_status: candidateStatus, navigator_candidate_name: name, navigator_candidate_founder: founder, navigator_candidate_description: description, navigator_candidate_kind: kind, navigator_candidate_logo_url: logoURL, navigator_candidate_updated_at: candidateUpdatedAt });
        }
        return { meta: { changes: 1 } };
      },
    };
  },
  async batch(statements) {
    for (const statement of statements) await statement.run();
    return [{}, { results: [{ count: 1 }] }, {}];
  },
};

const response = await worker.fetch(new Request(`https://data.superintelligencesg.org/directory/api/source-suggestions/${id}`, {
  method: 'PATCH',
  headers: { Origin: 'https://superintelligencesg.com', Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    status: 'accepted',
    review_note: 'Checked the primary source.',
    public_summary: 'Candidate draft validation.',
    publish_changelog: false,
    navigator_candidate: {
      status: 'ready',
      name: 'Candidate Test Group',
      founder: 'Test institution',
      description: 'A source-backed candidate prepared for manual Navigator review.',
      kind: 'Research',
      logo_url: 'https://example.org/logo.png',
    },
  }),
}), { DB, SOURCE_DESK_ADMIN_TOKEN: adminToken });

assert.equal(response.status, 200, 'accepted review should save a Navigator candidate');
assert.equal((await response.json()).navigator_candidate_status, 'ready');
assert.equal(row.navigator_candidate_description, 'A source-backed candidate prepared for manual Navigator review.');
assert(calls.some((call) => call.sql.includes('navigator_candidate_status')), 'review should persist candidate fields');
console.log('Navigator candidate workflow is valid');
