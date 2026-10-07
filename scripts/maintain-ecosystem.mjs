import { readFile, readdir, mkdir, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverOfficialSources } from './discover-official-sources.mjs';
import { buildWorkQueue } from './build-work-queue.mjs';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = dirname(siteRoot);
const reportRoot = join(root, 'Growth', 'operations');
await mkdir(reportRoot, { recursive: true });
const statePath = join(reportRoot, 'watch-state.json');
let previous;
try { previous = JSON.parse(await readFile(statePath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; previous = { sources: {}, reference_cursor: 0 }; }
const checkedAt = new Date().toISOString();
const challenge = /verify (?:that )?you(?:'re| are|rself)|not a robot|access denied|captcha|just a moment|checking your browser|enable javascript and cookies|javascript is disabled|requires javascript/i;

async function fetchPage(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(18000), redirect: 'follow', headers: { 'User-Agent': 'SuperintelligenceSG-Maintenance/1.0' } });
    const body = await response.text();
    const blocked = challenge.test(body.slice(0, 12000));
    return { url, final_url: response.url, status: response.status, body, blocked, ok: response.ok && !blocked };
  } catch (error) { return { url, status: null, ok: false, blocked: false, error: error.name === 'TimeoutError' ? 'request timed out' : error.message }; }
}
async function batch(items, action) {
  const result = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) { const index = next++; result[index] = await action(items[index]); }
  }));
  return result;
}
const endpoints = [
  ...['com', 'org', 'ai'].map(domain => ({ url: `https://superintelligencesg.${domain}/`, type: 'page' })),
  { url: 'https://superintelligencesg.com/directory.html', type: 'page' },
  { url: 'https://superintelligencesg.com/source-desk.html', type: 'page' },
  { url: 'https://superintelligencesg.com/source-desk-admin.html', type: 'page' },
  { url: 'https://superintelligencesg.com/changelog.html', type: 'page' },
  { url: 'https://superintelligencesg.com/source-radar.html', type: 'page' },
  { url: 'https://raw.githubusercontent.com/jtsgai/superintelligencesg-org/main/assets/product/source-radar.json', type: 'radar' },
  { url: 'https://superintelligencesg.org/organizations.html', type: 'page' },
  { url: 'https://superintelligencesg.ai/field-notes/', type: 'page' },
  { url: 'https://data.superintelligencesg.org/directory/api/health', type: 'health' },
  { url: 'https://data.superintelligencesg.org/directory/api/organizations', type: 'organizations' },
  { url: 'https://data.superintelligencesg.org/directory/api/source-updates', type: 'updates' },
  { url: 'https://data.superintelligencesg.org/directory/api/source-suggestions', type: 'private' },
];
const health = await batch(endpoints, async endpoint => {
  const result = await fetchPage(endpoint.url);
  let data; try { data = JSON.parse(result.body); } catch {}
  let passed = result.ok;
  if (endpoint.type === 'page') passed = result.ok && /<title>[^<]*superintelligence/i.test(result.body);
  if (endpoint.type === 'health') passed = result.ok && data?.ok === true && data?.database === 'ok';
  if (endpoint.type === 'organizations') passed = result.ok && Array.isArray(data?.organizations);
  if (endpoint.type === 'radar') passed = result.ok && data?.version === 1 && Array.isArray(data?.items) && Number.isFinite(Date.parse(data?.checked_at));
  if (endpoint.type === 'updates') passed = result.ok && Array.isArray(data?.updates);
  if (endpoint.type === 'private') passed = result.status === 401;
  return { url: endpoint.url, status: result.status, passed, error: result.error || (result.blocked ? 'automated access blocked' : ''), ...(endpoint.type === 'organizations' && Array.isArray(data?.organizations) ? { count: data.organizations.length } : {}) };
});
const noteDir = join(root, 'superintelligencesg.ai', 'field-notes');
const sourceURLs = new Set();
for (const file of await readdir(noteDir)) {
  if (!file.endsWith('.html')) continue;
  const html = await readFile(join(noteDir, file), 'utf8');
  for (const match of html.matchAll(/href=["'](https:\/\/[^"']+)["']/g)) {
    const url = new URL(match[1].replace(/&amp;/g, '&'));
    if (/(^|\.)superintelligencesg\.(com|org|ai)$/.test(url.hostname)) continue;
    url.hash = ''; sourceURLs.add(url.href);
  }
}
const sources = await batch([...sourceURLs].sort(), async url => {
  const result = await fetchPage(url);
  if (!result.ok) return { url, status: result.status, outcome: result.blocked ? 'fetch_blocked' : 'unavailable', error: result.error || '' };
  const main = result.body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || result.body;
  const content = main.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (content.length < 120) return { url, status: result.status, outcome: 'review_needed', reason: 'Too little text to establish a trustworthy source snapshot.' };
  const hash = createHash('sha256').update(content).digest('hex');
  const prior = previous.sources[url];
  return { url, status: result.status, final_url: result.final_url, title: result.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() || '', excerpt: content.slice(0, 240), hash, outcome: prior?.hash ? (hash === prior.hash ? 'unchanged' : 'changed_review_required') : 'baseline', checked_at: checkedAt };
});
const organizations = JSON.parse(await readFile(join(root, 'superintelligencesg.com', 'assets', 'product', 'organizations.json'), 'utf8'));
const cursor = (previous.reference_cursor || 0) % Math.max(organizations.length, 1);
const selected = organizations.slice(cursor, cursor + 20);
const references = await batch(selected, async item => {
  const result = await fetchPage(item.url);
  return { id: item.id, name: item.name, url: item.url, status: result.status, final_url: result.final_url, outcome: result.ok ? (result.final_url === item.url ? 'reachable' : 'redirect_review_required') : (result.blocked ? 'fetch_blocked' : 'unavailable'), error: result.error || '' };
});
const pendingReferences = { ...(previous.pending_references || {}) };
for (const item of references) {
  if (item.outcome === 'reachable') delete pendingReferences[item.id];
  else pendingReferences[item.id] = { ...item, first_seen: pendingReferences[item.id]?.first_seen || checkedAt, last_checked: checkedAt };
}
const discovery = await discoverOfficialSources({ previous: previous.discovery, checkedAt, fetchPage, batch, knownURLs: sourceURLs });
const nextState = { discovery: discovery.state, checked_at: checkedAt, sources: { ...previous.sources }, pending_references: pendingReferences, reference_cursor: (cursor + selected.length) % Math.max(organizations.length, 1) };
for (const item of sources) if (item.hash) {
  const prior = previous.sources[item.url];
  nextState.sources[item.url] = item.outcome === 'changed_review_required'
    ? { ...prior, observed_hash: item.hash, checked_at: checkedAt, review_required: true }
    : { hash: item.hash, checked_at: checkedAt };
}
const report = { checked_at: checkedAt, execution: process.env.GITHUB_ACTIONS === 'true' ? { platform: 'github_actions', run_id: process.env.GITHUB_RUN_ID, run_url: 'https://github.com/' + process.env.GITHUB_REPOSITORY + '/actions/runs/' + process.env.GITHUB_RUN_ID } : { platform: 'local' }, health, sources, references, discovery: { providers: discovery.providers, items: discovery.items }, pending_references: Object.values(pendingReferences), summary: {
  health_passed: health.filter(item => item.passed).length,
  health_total: health.length,
  source_changes: sources.filter(item => item.outcome === 'changed_review_required').length,
  source_baselines: sources.filter(item => item.outcome === 'baseline').length,
  source_access_issues: sources.filter(item => ['unavailable', 'fetch_blocked'].includes(item.outcome)).length,
  source_review_items: sources.filter(item => !['unchanged', 'baseline'].includes(item.outcome)).length,
  references_checked: references.length,
  reference_issues: references.filter(item => item.outcome !== 'reachable').length,
  outstanding_reference_issues: Object.keys(pendingReferences).length,
  discovery_new_items: discovery.new_items,
  discovery_total: discovery.items.length,
  discovery_access_issues: discovery.providers.filter(item => item.outcome !== 'ok').length,
} };
let previousQueue = {};
try { previousQueue = JSON.parse(await readFile(join(reportRoot, 'work-queue.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const ledger = JSON.parse(await readFile(join(siteRoot, 'operations', 'review-decisions.json'), 'utf8'));
if (!Array.isArray(ledger.decisions)) throw new Error('Invalid review decisions ledger.');
const workQueue = buildWorkQueue(report, previousQueue, ledger.decisions);
report.summary.queue_pending = workQueue.pending;
report.summary.queue_closed = workQueue.closed;
async function saveJSON(path, value) { await writeFile(path + '.tmp', JSON.stringify(value, null, 2) + '\n'); await rename(path + '.tmp', path); }
await mkdir(join(reportRoot, 'runs'), { recursive: true });
await saveJSON(join(reportRoot, 'runs', checkedAt.replace(/[.:]/g, '-') + '.json'), report);
await saveJSON(join(reportRoot, 'latest.json'), report);
await saveJSON(statePath, nextState);
await saveJSON(join(reportRoot, 'work-queue.json'), workQueue);
const lines = [ '# Superintelligence SG maintenance', '', `Checked: ${checkedAt}`, '', `Website/API checks: ${report.summary.health_passed}/${report.summary.health_total} passed.`, `Sources: ${report.summary.source_changes} changed, ${report.summary.source_baselines} baselines, ${report.summary.source_access_issues} access issues.`, `Navigator: ${references.length} of ${organizations.length} references checked; ${report.summary.reference_issues} need review.`, '', '## Items to review', '' ];
for (const item of health.filter(item => !item.passed)) lines.push(`- Website/API failed: ${item.url} (${item.status ?? item.error})`);
for (const item of sources.filter(item => !['unchanged', 'baseline'].includes(item.outcome))) lines.push(`- Source ${item.outcome}: ${item.url}`);
for (const item of Object.values(pendingReferences)) lines.push(`- Reference ${item.outcome}: ${item.name} — ${item.url}`);
lines.push('', '## Official source discovery', '', `${discovery.new_items} newly discovered pages; ${discovery.items.length} retained candidates. Sitemap modification dates are not publication dates.`, '');
for (const item of discovery.items) lines.push(`- ${item.provider}: ${item.title || item.url} — ${item.url} (published: ${item.published_at || 'unknown'}; ${item.freshness || item.outcome})`);
lines.push('', '## Autonomous work queue', '', `${workQueue.pending} pending; ${workQueue.closed} have matching review decisions.`, '');
for (const item of workQueue.items.filter(item => item.status === 'pending')) lines.push(`- Priority ${item.priority}: ${item.type} — ${item.evidence.url}`);
lines.push('', 'A changed snapshot, redirect or blocked request needs editorial review. This run does not publish content or change organization records.', '');
await writeFile(join(reportRoot, 'latest.md'), lines.join('\n'));
console.log(JSON.stringify({ report: join(reportRoot, 'latest.md'), ...report.summary }, null, 2));
if (health.some(item => !item.passed)) process.exitCode = 1;
