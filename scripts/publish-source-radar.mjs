import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = process.env.GITHUB_REPOSITORY;
if (repository !== 'jtsgai/superintelligencesg-org' || process.env.GITHUB_REF_NAME !== 'main' || !process.env.GH_TOKEN) throw new Error('Missing authorised main-branch publication context.');
const operations = resolve(dirname(fileURLToPath(import.meta.url)), '../../Growth/operations');
const report = JSON.parse(await readFile(resolve(operations, 'latest.json'), 'utf8'));
const queue = JSON.parse(await readFile(resolve(operations, 'work-queue.json'), 'utf8'));
if (report.execution?.platform !== 'github_actions' || report.execution.run_id !== process.env.GITHUB_RUN_ID || !report.health?.length || !report.health.every(item => item.passed)) throw new Error('Expected the successful report from this hosted run.');
const allowed = new Set(['www.mddi.gov.sg', 'www.imda.gov.sg', 'aisingapore.org', 'www.smartnation.gov.sg']);
const eligible = report.discovery.items.filter(item => {
  const decision = queue.items.find(job => job.type === 'official_source_discovery' && job.evidence.url === item.url);
  return item.outcome === 'discovered_review_required' && !['older_article_recently_modified', 'future_publication_date_review_required'].includes(item.freshness) && decision?.status !== 'not_actionable' && allowed.has(new URL(item.url).hostname);
}).sort((a, b) => b.source_updated_at.localeCompare(a.source_updated_at) || a.url.localeCompare(b.url));

// Keep the public radar useful as an ecosystem view: rotate through each
// official provider before filling any remaining slots by recency.
const providerOrder = ['MDDI', 'IMDA', 'AI Singapore', 'Smart Nation'];
const groups = new Map(providerOrder.map(provider => [provider, []]));
for (const item of eligible) groups.get(item.provider)?.push(item);
const selected = [];
for (let round = 0; round < 3 && selected.length < 12; round += 1) {
  for (const provider of providerOrder) {
    const item = groups.get(provider)?.[round];
    if (item) selected.push(item);
    if (selected.length === 12) break;
  }
}
for (const item of eligible) {
  if (selected.length === 12) break;
  if (!selected.includes(item)) selected.push(item);
}

const items = selected.map(item => {
  const words = item.title.split(/\s+/);
  return { provider: item.provider, title: words.slice(0, 20).join(' ') + (words.length > 20 ? '…' : ''), url: item.url, published_at: item.published_at, source_updated_at: item.source_updated_at, discovered_at: item.first_seen, status: ['reviewed', 'published'].includes(queue.items.find(job => job.type === 'official_source_discovery' && job.evidence.url === item.url)?.status) ? 'source_reviewed' : 'automatically_discovered' };
});
const snapshot = { version: 1, checked_at: report.checked_at, run_url: report.execution.run_url, notice: 'Automatically discovered official source links. Discovery is not editorial verification; page modification is not publication.', items };
const encoded = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n').toString('base64');
const endpoint = 'https://api.github.com/repos/' + repository + '/contents/assets/product/source-radar.json';
const headers = { Authorization: 'Bearer ' + process.env.GH_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
const before = await fetch(endpoint + '?ref=main', { headers, signal: AbortSignal.timeout(20000) });
if (!before.ok && before.status !== 404) throw new Error('Cannot read current radar snapshot: ' + before.status);
const current = before.ok ? await before.json() : null;
const saved = await fetch(endpoint, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Refresh automatically discovered official sources', content: encoded, branch: 'main', ...(current ? { sha: current.sha } : {}) }), signal: AbortSignal.timeout(20000) });
if (!saved.ok) throw new Error('Radar publication failed: ' + saved.status);
const result = await saved.json();
const readback = await fetch(endpoint + '?ref=main', { headers, signal: AbortSignal.timeout(20000) });
if (!readback.ok) throw new Error('Radar readback failed: ' + readback.status);
const actual = await readback.json();
if (actual.sha !== result.content.sha || Buffer.from(actual.content, 'base64').toString('utf8') !== Buffer.from(encoded, 'base64').toString('utf8')) throw new Error('Radar readback does not match this run.');
console.log(JSON.stringify({ published: 'assets/product/source-radar.json', items: items.length, commit: result.commit.sha, checked_at: snapshot.checked_at }));
