// One-off seed for data/*.json. It MOVES existing published records into the
// shared data layer; it never adds facts. Records without an evidence block are
// marked evidence.status "needs_review" and keep conclusion/action as null.
//
// Usage: node scripts/seed-data.mjs <path-to-superintelligencesg-com>
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const comRoot = process.argv[2];
if (!comRoot) throw Error('Pass the path to the superintelligencesg-com repository.');
const COM = 'https://superintelligencesg.com/';

// Lens definitions copied from com/assets/product/navigator.js (LENSES, LENS_IDS).
const LENSES = { research: ['Research', 'Applied research', 'Education & research'], deployment: ['Company', 'Health AI'], trust: ['Governance'], public: ['Public capability', 'Ecosystem'] };
const LENS_IDS = { 'trusted-deployment': ['public-ai-verify-foundation', 'public-digital-trust-centre', 'public-singapore-aisi', 'public-ai-agents-sandbox', 'public-project-moonshot', 'public-ai-verify', 'public-model-ai-governance-framework-for-agentic-ai', 'public-national-ai-council', 'public-csa-singapore', 'public-govtech-singapore'] };

const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const decode = value => value.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const plain = html => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

async function entries() {
  const source = JSON.parse(await readFile(resolve(comRoot, 'assets/product/organizations.json'), 'utf8'));
  return source.map(record => {
    const lenses = Object.keys(LENSES).filter(key => LENSES[key].includes(record.kind));
    for (const [key, ids] of Object.entries(LENS_IDS)) if (ids.includes(record.id)) lenses.push(key);
    const evidence = record.evidence || { status: 'needs_review' };
    return {
      id: record.id,
      name: record.name,
      founder: record.founder,
      description: record.description,
      kind: record.kind,
      source: record.source,
      url: record.url,
      logo: record.logo,
      updated: record.updated,
      lenses,
      source_url: evidence.source_url || record.url || null,
      evidence,
      checked_at: evidence.checked_at || null,
      conclusion: null,
      action: null,
    };
  });
}

async function changes() {
  const html = await readFile(resolve(comRoot, 'changelog.html'), 'utf8');
  return [...html.matchAll(/<article class="entry">([\s\S]*?)<\/article>/g)].map(([, body]) => {
    const [, date, label] = body.match(/<time class="date" datetime="([^"]+)">([^<]*)<\/time>/);
    const title = plain(body.match(/<h2>([\s\S]*?)<\/h2>/)[1]);
    const paragraphs = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(match => match[1]);
    const links = [...body.matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)].map(([, href, text]) => ({ label: plain(text).replace(/\s*↗$/, ''), url: new URL(decode(href), `${COM}changelog.html`).href }));
    const unique = links.filter((link, index) => links.findIndex(other => other.url === link.url) === index);
    const tags = [...body.matchAll(/<div class="evidence-line">([\s\S]*?)<\/div>/g)].flatMap(match => [...match[1].matchAll(/<span>([\s\S]*?)<\/span>/g)].map(span => plain(span[1])));
    const linkOnly = paragraph => /^\s*(<a [^>]*>[\s\S]*?<\/a>\s*(·\s*)?)+$/.test(paragraph);
    const labelText = plain(label);
    return {
      id: `change-${date}-${slug(title)}`,
      date,
      label: labelText.includes(' / ') ? labelText.split(' / ').slice(1).join(' / ') : labelText,
      title,
      summary: paragraphs.filter(paragraph => !linkOnly(paragraph)).map(plain).join(' '),
      tags,
      links: unique,
      url: unique[0]?.url || null,
      brief_url: `${COM}changelog.html`,
      source_url: unique[0]?.url || null,
      evidence: { status: 'needs_review' },
      checked_at: null,
      conclusion: null,
      action: null,
    };
  });
}

async function signals() {
  const html = await readFile(resolve(comRoot, 'index.html'), 'utf8');
  return [...html.matchAll(/<section class="section signal"[^>]*>([\s\S]*?)<\/section>/g)].map(([, body]) => {
    const label = plain(body.match(/<span class="signal-label">([\s\S]*?)<\/span>/)[1]);
    const heading = body.match(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/);
    const sources = [...body.match(/<p class="signal-source">([\s\S]*?)<\/p>/)[1].matchAll(/<a href="([^"]+)">([\s\S]*?)<\/a>/g)].map(([, url, text]) => ({ label: plain(text), url: decode(url) }));
    const updated = new Date(`${label.match(/updated (\d{1,2} \w+ \d{4})/)[1]} UTC`).toISOString().slice(0, 10);
    const title = plain(heading[2]);
    return {
      id: `signal-${updated}-${slug(title)}`,
      date: updated,
      label,
      title,
      summary: plain(body.match(/<p class="signal-copy">([\s\S]*?)<\/p>/)[1]),
      sources,
      url: `${COM}#${heading[1]}`,
      source_url: sources[0]?.url || null,
      evidence: { status: 'needs_review' },
      checked_at: null,
      conclusion: null,
      action: null,
    };
  });
}

const provenance = {
  entries: 'Moved from jtsgai/superintelligencesg-com assets/product/organizations.json (2026-10-27).',
  changes: 'Moved from the published Change Brief, superintelligencesg-com changelog.html (2026-10-27).',
  signals: 'Moved from the Signals block on superintelligencesg-com index.html (2026-10-27).',
};
for (const [name, build] of Object.entries({ entries, changes, signals })) {
  const records = await build();
  const file = { $schema: `./schema/${name}.schema.json`, version: 1, provenance: provenance[name], records };
  await writeFile(resolve(root, `data/${name}.json`), `${JSON.stringify(file, null, 2)}\n`);
  console.log(`data/${name}.json: ${records.length} records`);
}
