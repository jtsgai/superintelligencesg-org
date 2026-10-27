import { validateRecord } from '../worker/index.js';
// Inlines this commit's data files into dist/server/index.js as the last-resort
// fallback for /api/v1/* when raw GitHub and the caches are unavailable.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const target = resolve(root, 'dist/server/index.js');
const marker = '/* @bundled-data */ null';
const files = { entries: 'data/entries.json', changes: 'data/changes.json', signals: 'data/signals.json', radar: 'assets/product/source-radar.json' };
const bundled = {};
for (const [name, file] of Object.entries(files)) bundled[name] = JSON.parse(await readFile(resolve(root, file), 'utf8'));
for (const record of bundled.entries.records) {
  const errors = validateRecord(record);
  if (errors.length) throw Error(`${record.id}: ${errors.join(' ')}`);
}
const source = await readFile(target, 'utf8');
if (source.split(marker).length !== 2) throw Error(`Expected exactly one ${marker} marker in dist/server/index.js`);
await writeFile(target, source.replace(marker, () => `/* @bundled-data */ ${JSON.stringify(bundled)}`));
console.log(`Bundled ${Object.keys(bundled).join(', ')} into dist/server/index.js`);
