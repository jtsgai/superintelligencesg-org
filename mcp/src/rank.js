// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

// Rank from the record fields only. Affiliated listings use the same score
// as any other record: the founder relationship adds no points.

import { disclosureFor } from './affiliated.js';

const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'for', 'and', 'or', 'to', 'in', 'on', 'with', 'by', 'from', 'at', 'as', 'is', 'are', 'be', 'that', 'this', 'these', 'those', 'into', 'over', 'per', 'via']);

const FIELD_WEIGHT = { name: 5, kind: 4, description: 3, founder: 2 };
const PHRASE_BONUS = 6;

export function tokensOf(need) {
  const seen = new Set();
  const tokens = [];
  for (const token of String(need).toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < 2 || STOPWORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

function words(value) {
  return new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function fieldHits(entry, tokens) {
  const fields = {
    name: words(entry.name),
    kind: words(entry.kind),
    description: words(entry.description),
    founder: words(entry.founder),
  };
  const hits = [];
  for (const token of tokens) {
    for (const field of Object.keys(FIELD_WEIGHT)) {
      if (fields[field].has(token)) hits.push({ field, token });
    }
  }
  return hits;
}

export function scoreOrganisation(entry, need) {
  const tokens = tokensOf(need);
  const hits = fieldHits(entry, tokens);
  let score = 0;
  const matched = new Set();
  for (const hit of hits) {
    const key = `${hit.field}:${hit.token}`;
    if (matched.has(key)) continue;
    matched.add(key);
    score += FIELD_WEIGHT[hit.field];
  }
  const phrase = String(need).toLowerCase().replace(/\s+/g, ' ').trim();
  if (phrase.length >= 4) {
    const name = String(entry.name || '').toLowerCase();
    const description = String(entry.description || '').toLowerCase();
    if (name.includes(phrase) || description.includes(phrase)) score += PHRASE_BONUS;
  }
  return { score, hits };
}

function whyFrom(entry, hits, phraseMatched) {
  const fields = new Set(hits.map(hit => hit.field));
  const parts = [];
  if (fields.has('name') && entry.name) parts.push(`Name matches: ${entry.name}.`);
  if (fields.has('kind') && entry.kind) parts.push(`Kind matches: ${entry.kind}.`);
  if (fields.has('founder') && entry.founder) parts.push(`Founder matches: ${entry.founder}.`);
  if (fields.has('description')) parts.push('Description matches the need.');
  if (phraseMatched && !parts.length) parts.push('Name or description contains the need.');
  return parts.join(' ');
}

function byName(a, b) {
  const name = String(a.name).localeCompare(String(b.name), 'en', { sensitivity: 'base' });
  if (name) return name;
  return String(a.id).localeCompare(String(b.id));
}

export function rankOrganisations(records, need, limit) {
  const phrase = String(need).toLowerCase().replace(/\s+/g, ' ').trim();
  const ranked = [];
  for (const entry of records) {
    if (!entry || (entry.type && entry.type !== 'organization')) continue;
    const { score, hits } = scoreOrganisation(entry, need);
    const phraseMatched = phrase.length >= 4 && (
      String(entry.name || '').toLowerCase().includes(phrase)
      || String(entry.description || '').toLowerCase().includes(phrase)
    );
    if (score <= 0) continue;
    ranked.push({ entry, score, hits, phraseMatched });
  }
  ranked.sort((a, b) => b.score - a.score || byName(a.entry, b.entry));
  return ranked.slice(0, limit).map(item => ({
    entry: item.entry,
    score: item.score,
    why: whyFrom(item.entry, item.hits, item.phraseMatched),
    disclosure: disclosureFor(item.entry),
  }));
}
