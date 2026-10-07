import { createHash } from 'node:crypto';

const providers = [
  { name: 'MDDI', index: 'https://www.mddi.gov.sg/sitemap.xml', path: /^\/newsroom\//, aiOnly: true },
  { name: 'IMDA', index: 'https://www.imda.gov.sg/sitemap.xml', path: /^\/resources\/press-releases-factsheets-and-speeches\//, aiOnly: true },
  { name: 'AI Singapore', index: 'https://aisingapore.org/post-sitemap1.xml', path: /^\/(?!wp-|category\/|tag\/).+/, aiOnly: false },
  { name: 'Smart Nation', index: 'https://www.smartnation.gov.sg/sitemap.xml', path: /^\/initiatives\//, aiOnly: true },
];
const aiTopic = /(?:^|[^a-z])ai(?:[^a-z]|$)|artificial[-\s]intelligence|agentic|machine[-\s]learning|sea[-\s]lion/i;
export const digest = value => createHash('sha256').update(value).digest('hex');
function plain(value = '') {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (all, code) => {
      const n = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
function articleDate(html) {
  for (const block of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visit = value => {
        if (!value || typeof value !== 'object') return null;
        if ([value['@type']].flat().some(type => ['Article', 'NewsArticle', 'BlogPosting'].includes(type)) && value.datePublished) return value.datePublished;
        for (const child of Object.values(value)) { const found = visit(child); if (found) return found; }
        return null;
      };
      const found = visit(JSON.parse(block[1]));
      if (found && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(found) && Number.isFinite(Date.parse(found))) return new Date(found).toISOString();
    } catch {}
  }
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries([...tag[0].matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), m[2]]));
    if (['article:published_time', 'datePublished'].includes(attrs.property || attrs.itemprop || attrs.name)) {
      if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(attrs.content || '') && Number.isFinite(Date.parse(attrs.content))) return new Date(attrs.content).toISOString();
    }
  }
  return null;
}

export async function discoverOfficialSources({ previous = {}, checkedAt, fetchPage, batch, knownURLs = new Set() }) {
  const items = { ...(previous.items || {}) };
  const cutoff = Date.parse(checkedAt) - 90 * 86400000;
  const observed = await batch(providers, async provider => {
    const index = await fetchPage(provider.index);
    if (!index.ok || !/<urlset\b/i.test(index.body || '')) return { provider: provider.name, url: provider.index, outcome: 'unavailable', status: index.status, error: index.error || (index.blocked ? 'automated access blocked' : 'Expected an official XML sitemap.'), pages_checked: 0 };
    const origin = new URL(provider.index).origin;
    const candidates = [];
    for (const entry of index.body.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
      const rawURL = plain(entry[1].match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i)?.[1]);
      const modified = plain(entry[1].match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i)?.[1]);
      try {
        const url = new URL(rawURL);
        if (url.origin !== origin || !provider.path.test(url.pathname) || url.search || url.hash) continue;
        if (provider.aiOnly && !aiTopic.test(decodeURIComponent(url.pathname))) continue;
        const time = Date.parse(modified);
        if (!Number.isFinite(time) || time < cutoff || time > Date.parse(checkedAt)) continue;
        candidates.push({ url: url.href, source_updated_at: new Date(time).toISOString() });
      } catch {}
    }
    candidates.sort((a, b) => b.source_updated_at.localeCompare(a.source_updated_at) || a.url.localeCompare(b.url));
    const selected = candidates.filter(item => !knownURLs.has(item.url) && (!items[item.url]?.content_hash || items[item.url].outcome !== 'discovered_review_required' || items[item.url].source_updated_at !== item.source_updated_at)).slice(0, 2);
    const results = await batch(selected, async candidate => {
      const old = items[candidate.url];
      const page = await fetchPage(candidate.url);
      const base = { ...old, ...candidate, provider: provider.name, first_seen: old?.first_seen || checkedAt, last_checked: checkedAt };
      if (!page.ok || new URL(page.final_url || candidate.url).origin !== origin) return { ...base, outcome: page.blocked ? 'fetch_blocked' : 'unavailable', status: page.status, error: page.error || 'Official page could not be read on its original host.' };
      const main = page.body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || page.body;
      const content = plain(main.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '));
      const title = plain(page.body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
      if (content.length < 120 || !title) return { ...base, outcome: 'review_needed', status: page.status, error: 'Insufficient article text or title.' };
      const publishedAt = articleDate(page.body);
      return { ...base, title, excerpt: content.slice(0, 240), content_hash: digest(content), published_at: publishedAt, final_url: page.final_url, outcome: 'discovered_review_required', status: page.status, error: '', freshness: !publishedAt ? 'publication_date_unknown' : Date.parse(publishedAt) < cutoff ? 'older_article_recently_modified' : Date.parse(publishedAt) > Date.parse(checkedAt) ? 'future_publication_date_review_required' : 'recent_publication' };
    });
    for (const item of results) items[item.url] = item;
    return { provider: provider.name, url: provider.index, outcome: 'ok', status: index.status, candidates: candidates.length, pages_checked: results.length, new_items: results.filter(item => !previous.items?.[item.url]).length };
  });
  return { state: { checked_at: checkedAt, items }, providers: observed, items: Object.values(items), new_items: observed.reduce((sum, provider) => sum + (provider.new_items || 0), 0) };
}
