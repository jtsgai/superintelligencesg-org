import { missingSource, validateRecord } from '../worker/index.js';
// Validates data/*.json against data/schema/*.schema.json (dependency-free
// subset of JSON Schema 2020-12), enforces the source_url rule and runs the
// no-ranking lint. Existing moved text listed in data/lint-baseline.json is
// reported as a warning instead of being edited.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATASETS = ['entries', 'changes', 'signals'];
// Text fields written by us. Names and quoted source titles are not linted.
const LINT_FIELDS = ['title', 'label', 'founder', 'description', 'summary', 'tags', 'conclusion', 'action', 'evidence.summary', 'evidence.history.note'];
// Fields that only a reviewer writes; a hit here is always an error.
const STRICT_FIELDS = new Set(['conclusion', 'action']);
const LINT_TERMS = [
  ['top', /\btop\b/i],
  ['best', /\bbest\b/i],
  ['#1', /#1(?!\d)/],
  ['leading', /\bleading\b/i],
  ['AI ecosystem', /\bAI ecosystem\b/i],
];

const typeOf = value => value === null ? 'null' : Array.isArray(value) ? 'array' : Number.isInteger(value) ? 'integer' : typeof value;

export function check(schema, value, path, rootSchema, errors) {
  if (schema === true) return;
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((node, key) => node?.[key], rootSchema);
    if (!target) throw Error(`Unresolved $ref ${schema.$ref}`);
    return check(target, value, path, rootSchema, errors);
  }
  const before = errors.length;
  for (const branch of schema.allOf || []) check(branch, value, path, rootSchema, errors);
  if (schema.type) {
    const types = [].concat(schema.type);
    const actual = typeOf(value);
    if (!types.includes(actual) && !(actual === 'integer' && types.includes('number'))) errors.push(`${path}: expected ${types.join('|')}, got ${actual}`);
  }
  if ('const' in schema && JSON.stringify(value) !== JSON.stringify(schema.const)) errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some(option => JSON.stringify(option) === JSON.stringify(value))) errors.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (Array.isArray(value) && schema.items) value.forEach((item, index) => check(schema.items, item, `${path}[${index}]`, rootSchema, errors));
  if (typeOf(value) === 'object') {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) check(schema.properties[key], item, `${path}.${key}`, rootSchema, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected property ${key}`);
    }
  }
  if (schema.if && errors.length === before) {
    const probe = [];
    check(schema.if, value, path, rootSchema, probe);
    const branch = probe.length ? schema.else : schema.then;
    if (branch !== undefined) check(branch, value, path, rootSchema, errors);
  }
}

function texts(record) {
  const out = [];
  for (const field of LINT_FIELDS) {
    const [head, ...rest] = field.split('.');
    let values = [record[head]];
    for (const key of rest) values = values.flat().filter(Boolean).map(value => value?.[key]);
    for (const value of values.flat()) if (typeof value === 'string') out.push([field, value]);
  }
  return out;
}

export async function validateData() {
  const baseline = JSON.parse(await readFile(resolve(root, 'data/lint-baseline.json'), 'utf8')).allowed || [];
  const allowed = new Set(baseline.map(item => `${item.file}|${item.id}|${item.field}|${item.term}`));
  const errors = [], warnings = [], needsReview = [], missingSources = [], summary = {};
  for (const name of DATASETS) {
    const file = `data/${name}.json`;
    const schema = JSON.parse(await readFile(resolve(root, `data/schema/${name}.schema.json`), 'utf8'));
    const data = JSON.parse(await readFile(resolve(root, file), 'utf8'));
    const schemaErrors = [];
    check(schema, data, file, schema, schemaErrors);
    errors.push(...schemaErrors);
    const records = Array.isArray(data.records) ? data.records : [];
    const ids = new Set();
    let reviewCount = 0;
    for (const record of records) {
      if (name === 'entries') errors.push(...validateRecord(record).map(error => `${file} ${record.id}: ${error}`));
      if (name === 'entries' && (record.type ?? 'organization') === 'organization' && missingSource(record)) missingSources.push({ id: record.id, name: record.name, status: record.evidence?.status ?? null });
      if (ids.has(record.id)) errors.push(`${file}: duplicate id ${record.id}`);
      ids.add(record.id);
      const status = record.evidence?.status;
      if (status === 'needs_review') {
        reviewCount += 1;
        if (!record.source_url) needsReview.push(`${file} ${record.id}: source_url is null (needs_review)`);
      } else if (!(name === 'entries' ? /^https?:\/\// : /^https:\/\//).test(record.source_url || '')) {
        errors.push(`${file} ${record.id}: source_url is required unless evidence.status is needs_review`);
      }
      if (status === 'needs_review' && (record.conclusion || record.action)) errors.push(`${file} ${record.id}: needs_review records must not carry a conclusion or action`);
      for (const [field, value] of texts(record)) {
        for (const [term, pattern] of LINT_TERMS) {
          if (!pattern.test(value)) continue;
          const message = `${file} ${record.id} ${field}: "${term}" in "${value.length > 120 ? `${value.slice(0, 117)}...` : value}"`;
          if (!STRICT_FIELDS.has(field) && allowed.has(`${file}|${record.id}|${field}|${term}`)) warnings.push(message);
          else errors.push(`no-ranking lint: ${message}`);
        }
      }
    }
    summary[name] = { records: records.length, needs_review: reviewCount };
  }
  return { errors, warnings, needsReview, missingSources, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { errors, warnings, needsReview, missingSources, summary } = await validateData();
  for (const [name, counts] of Object.entries(summary)) console.log(`data/${name}.json: ${counts.records} records, ${counts.needs_review} needs_review`);
  if (missingSources.length) console.log(`missing_source: legacy organizations without a valid source_url (${missingSources.length}, not enforced):\n  ${missingSources.map(item => item.id).join('\n  ')}`);
  if (needsReview.length) console.log(`needs_review without source_url (${needsReview.length}):\n  ${needsReview.join('\n  ')}`);
  if (warnings.length) console.log(`no-ranking lint warnings in existing moved text (${warnings.length}, not edited):\n  ${warnings.join('\n  ')}`);
  if (errors.length) {
    console.error(`Data validation failed (${errors.length}):\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  console.log('Data files are valid');
}
