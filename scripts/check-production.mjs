import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';

const apiOrigin = 'https://data.superintelligencesg.org';
const navigatorOrigin = 'https://superintelligencesg.com';
const tokenPath = `${homedir()}/.config/superintelligence-sg/source-desk-admin-token.txt`;

async function request(url, options = {}) {
  const response = await fetch(url, { redirect: 'follow', ...options });
  const body = await response.text();
  let data = null;
  try {
    data = JSON.parse(body);
  } catch {
    // HTML checks use the raw response body below.
  }
  return { response, body, data };
}

function check(condition, message) {
  assert.ok(condition, message);
  console.log(`PASS ${message}`);
}

const directory = await request(`${apiOrigin}/directory/api/organizations`);
check(directory.response.status === 200, 'directory API returns HTTP 200');
check(Array.isArray(directory.data?.organizations), 'directory API returns organizations array');

const health = await request(`${apiOrigin}/directory/api/health`);
check(health.response.status === 200, 'Commons API health check returns HTTP 200');
check(health.data?.ok === true && health.data?.database === 'ok', 'Commons API reports a healthy database');

const updates = await request(`${apiOrigin}/directory/api/source-updates`);
check(updates.response.status === 200, 'public Source Desk updates return HTTP 200');
check(Array.isArray(updates.data?.updates), 'public Source Desk updates return updates array');

const unauthenticatedQueue = await request(`${apiOrigin}/directory/api/source-suggestions`);
check(unauthenticatedQueue.response.status === 401, 'review queue rejects requests without an admin key');

for (const path of ['/changelog.html', '/source-desk-admin.html', '/directory.html']) {
  const page = await request(`${navigatorOrigin}${path}`);
  check(page.response.status === 200, `${path} is reachable`);
}

let token = '';
try {
  token = (await readFile(tokenPath, 'utf8')).trim();
} catch {
  console.log(`SKIP authenticated queue checks (admin key not found at ${tokenPath})`);
}

if (token) {
  const queue = await request(`${apiOrigin}/directory/api/source-suggestions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(queue.response.status === 200, 'authenticated review queue returns HTTP 200');
  check(Array.isArray(queue.data?.submissions), 'authenticated review queue returns submissions array');
  check(queue.data.submissions.every((item) => 'review_note' in item && 'published_at' in item), 'review queue includes review and publication fields');

  const first = queue.data.submissions[0];
  if (first?.id) {
    const events = await request(`${apiOrigin}/directory/api/source-suggestions/${encodeURIComponent(first.id)}/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(events.response.status === 200, 'review history endpoint returns HTTP 200');
    check(Array.isArray(events.data?.events), 'review history endpoint returns events array');
  } else {
    console.log('SKIP review history check (queue is empty)');
  }
}

console.log('Production check completed');
