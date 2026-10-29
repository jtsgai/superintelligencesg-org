// Lists curated records whose source or update date is missing or not yet
// individually checked. Read-only: it never edits data/*.json.
//   node scripts/check-sources.mjs                 plain-text summary
//   node scripts/check-sources.mjs --md [--out f]  Markdown report
//   node scripts/check-sources.mjs --strict        exit 1 if any record lacks a valid source_url
//   --today YYYY-MM-DD                             reference date for the stale check (default: today, UTC)
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validSourceURL } from '../worker/index.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const today = option('--today') || new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw Error('--today must be YYYY-MM-DD');
const STALE_DAYS = 180;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Field that carries the record's update date in each dataset (existing names, no new fields).
const DATASETS = { entries: 'updated', changes: 'date', signals: 'date' };
const CHECKS = [
  ['missing_source', '缺来源：source_url 为空或不是有效的 http/https 链接'],
  ['unreviewed_source', '有来源但未逐条核查：evidence.status = needs_review，checked_at 为空'],
  ['missing_updated', '缺更新日期：更新日期字段为空或格式不对'],
  ['evidence_mismatch', '已核查但 evidence.source_url 与 source_url 不一致'],
  ['stale_check', `核查日期距 ${today} 超过 ${STALE_DAYS} 天`],
  ['homepage_only', '提示：source_url 与机构官网 url 相同（只有主页作来源，可补更具体的来源页）'],
];

const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

export function inspect(record, dateField, isEntry) {
  const issues = [];
  const status = record.evidence?.status ?? null;
  if (!validSourceURL(record.source_url)) issues.push('missing_source');
  else if (status === 'needs_review') issues.push('unreviewed_source');
  if (!DAY.test(record[dateField] || '')) issues.push('missing_updated');
  if (status && status !== 'needs_review' && record.evidence?.source_url && record.evidence.source_url !== record.source_url) issues.push('evidence_mismatch');
  if (DAY.test(record.checked_at || '') && daysBetween(record.checked_at, today) > STALE_DAYS) issues.push('stale_check');
  if (isEntry && record.url && validSourceURL(record.source_url) && record.source_url.replace(/\/+$/, '') === record.url.replace(/\/+$/, '')) issues.push('homepage_only');
  return issues;
}

const results = [];
const totals = {};
for (const [name, dateField] of Object.entries(DATASETS)) {
  const data = JSON.parse(await readFile(resolve(root, `data/${name}.json`), 'utf8'));
  const records = data.records || [];
  totals[name] = records.length;
  for (const record of records) {
    const issues = inspect(record, dateField, name === 'entries');
    if (issues.length) results.push({ file: `data/${name}.json`, id: record.id, name: record.name || record.title || '', source_url: record.source_url || null, status: record.evidence?.status ?? null, date: record[dateField] ?? null, checked_at: record.checked_at ?? null, withdrawn: record.published === false, issues });
  }
}
const byCheck = Object.fromEntries(CHECKS.map(([key]) => [key, results.filter(item => item.issues.includes(key))]));

function markdown() {
  const cell = value => String(value ?? '—').replace(/\|/g, '\\|');
  const lines = [`# 缺来源报告 ${today}`, '', `由 \`node scripts/check-sources.mjs --md --today ${today}\` 生成，只读检查 \`data/entries.json\`、\`data/changes.json\`、\`data/signals.json\`，不修改任何数据。`, ''];
  lines.push('## 总览', '', '| 数据集 | 记录数 |', '|---|---|');
  for (const [name, count] of Object.entries(totals)) lines.push(`| data/${name}.json | ${count} |`);
  lines.push('', '| 检查项 | 条数 |', '|---|---|');
  for (const [key, label] of CHECKS) lines.push(`| ${label} | ${byCheck[key].length} |`);
  for (const [key, label] of CHECKS) {
    lines.push('', `## ${label}`, '');
    if (!byCheck[key].length) { lines.push('无。'); continue; }
    lines.push('| 文件 | id | 名称 | source_url | 更新日期 | checked_at | 备注 |', '|---|---|---|---|---|---|---|');
    for (const item of byCheck[key]) lines.push(`| ${item.file} | ${item.id} | ${cell(item.name)} | ${cell(item.source_url)} | ${cell(item.date)} | ${cell(item.checked_at)} | ${item.withdrawn ? '已撤下（published:false）' : ''} |`);
  }
  return `${lines.join('\n')}\n`;
}

function text() {
  const lines = [`Source check (${today}): ${Object.entries(totals).map(([name, count]) => `${name} ${count}`).join(', ')}`];
  for (const [key] of CHECKS) {
    lines.push(`${key}: ${byCheck[key].length}`);
    for (const item of byCheck[key]) lines.push(`  ${item.file} ${item.id}${item.withdrawn ? ' (withdrawn)' : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

const output = flag('--md') ? markdown() : text();
if (option('--out')) { await writeFile(option('--out'), output); console.log(`Wrote ${option('--out')} (${results.length} records with findings)`); }
else process.stdout.write(output);
if (flag('--strict') && byCheck.missing_source.length) process.exit(1);
