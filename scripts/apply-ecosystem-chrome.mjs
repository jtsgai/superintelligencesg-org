// Copies the marked regions of assets/product/sisg-ecosystem-snippet.html into
// every public page, so the cross-site ecosystem chrome and the footer
// disclosure stay identical. With --check it only reports drift (npm test).
// The footer disclosure must match the about.html master wording verbatim.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const check = process.argv.includes('--check');
const PAGES = [
  'index.html', 'about.html', 'organizations.html', 'manage.html',
  'static/index.html', 'static/about.html', 'static/organizations.html', 'static/manage.html',
  'dist-source/manage.html',
];
const MASTERS = ['about.html', 'static/about.html'];
// Where a region goes the first time it is added to a page.
const ANCHORS = {
  style: html => html.indexOf('</head>'),
  // After <body>, but behind a leading skip link so that stays the first stop.
  bar: html => { const match = /<body[^>]*>(\s*<a class="skip"[^>]*>[^<]*<\/a>)?/.exec(html); return match ? match.index + match[0].length : -1; },
  footer: html => html.indexOf('</footer>'),
};

const snippet = await readFile(resolve(root, 'assets/product/sisg-ecosystem-snippet.html'), 'utf8');
const regions = {};
for (const [, name, body] of snippet.matchAll(/<!-- sisg-eco:(\w+) -->\n([\s\S]*?)\n<!-- \/sisg-eco:\1 -->/g)) regions[name] = body;
for (const name of Object.keys(regions)) if (!ANCHORS[name]) throw Error(`Unknown snippet region ${name}`);
if (!regions.footer) throw Error('Snippet has no footer region');

const disclosure = /<p class="sisg-foot__disclosure">(Disclosure: [^<]*)<\/p>/.exec(regions.footer)?.[1];
if (!disclosure) throw Error('Snippet footer has no disclosure text');
const errors = [];
for (const page of MASTERS) {
  const html = await readFile(resolve(root, page), 'utf8');
  if (!html.includes(`<p class="note" id="disclosure">${disclosure}</p>`)) errors.push(`${page}: master disclosure (#disclosure) differs from the snippet footer`);
}

for (const page of PAGES) {
  const file = resolve(root, page);
  let html = await readFile(file, 'utf8');
  if ((html.match(/<footer[\s>]/g) || []).length !== 1) errors.push(`${page}: expected exactly one <footer>`);
  for (const [name, body] of Object.entries(regions)) {
    const block = `<!-- sisg-eco:${name} -->${body}<!-- /sisg-eco:${name} -->`;
    const existing = new RegExp(`<!-- sisg-eco:${name} -->[\\s\\S]*?<!-- /sisg-eco:${name} -->`);
    if (existing.test(html)) html = html.replace(existing, () => block);
    else {
      const at = ANCHORS[name](html);
      if (at < 0) { errors.push(`${page}: no anchor for ${name}`); continue; }
      html = html.slice(0, at) + block + html.slice(at);
    }
  }
  const current = await readFile(file, 'utf8');
  if (html === current) continue;
  if (check) errors.push(`${page}: out of date, run node scripts/apply-ecosystem-chrome.mjs`);
  else { await writeFile(file, html); console.log(`Updated ${page}`); }
}

if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}
console.log(`Ecosystem chrome (${Object.keys(regions).join(', ')}) is in sync on ${PAGES.length} pages`);
