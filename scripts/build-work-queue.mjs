import { digest } from './discover-official-sources.mjs';

export function buildWorkQueue(report, previous = {}, decisions = []) {
  const jobs = [];
  const old = new Map((previous.items || []).map(item => [item.id, item]));
  function add(type, key, evidence, priority) {
    const id = type + ':' + digest(key).slice(0, 20);
    const revision = digest(JSON.stringify(evidence));
    const decision = decisions.findLast(item => item.id === id && item.revision === revision);
    const status = decision && typeof decision.note === 'string' && decision.note.trim() && Number.isFinite(Date.parse(decision.at)) && ['reviewed', 'published', 'not_actionable'].includes(decision.status) ? decision.status : 'pending';
    jobs.push({ id, revision, type, priority, status, first_seen: old.get(id)?.first_seen || report.checked_at, last_seen: report.checked_at, evidence, ...(status !== 'pending' ? { decision: { at: decision.at, note: decision.note, public_url: decision.public_url || null } } : {}) });
  }
  for (const item of report.health.filter(item => !item.passed)) add('service_failure', item.url, { url: item.url, status: item.status, error: item.error }, 1);
  for (const item of report.sources.filter(item => !['baseline', 'unchanged'].includes(item.outcome))) add('cited_source_review', item.url, { url: item.url, outcome: item.outcome, observed_hash: item.hash || null, status: item.status }, 2);
  for (const item of report.pending_references) add('reference_review', item.id, { id: item.id, name: item.name, url: item.url, status: item.status, final_url: item.final_url || null, outcome: item.outcome }, 3);
  for (const provider of report.discovery.providers.filter(item => item.outcome !== 'ok')) add('discovery_access', provider.url, { url: provider.url, provider: provider.provider, status: provider.status, error: provider.error }, 3);
  for (const item of report.discovery.items) add('official_source_discovery', item.url, { url: item.url, provider: item.provider, title: item.title || null, source_updated_at: item.source_updated_at, published_at: item.published_at || null, content_hash: item.content_hash || null, outcome: item.outcome, freshness: item.freshness || null }, 4);
  jobs.sort((a, b) => a.priority - b.priority || a.first_seen.localeCompare(b.first_seen) || a.id.localeCompare(b.id));
  return { checked_at: report.checked_at, items: jobs, pending: jobs.filter(item => item.status === 'pending').length, closed: jobs.filter(item => item.status !== 'pending').length };
}
