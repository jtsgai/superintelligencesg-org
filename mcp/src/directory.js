// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

import { disclosureFor } from './affiliated.js';
import { ToolError, asToolError } from './errors.js';
import { tokensOf, rankOrganisations } from './rank.js';
import { siGet } from './si-api.js';
import { readId, readKind, readLens, readLimit, readNeed, readOrigin, readQuery, readSort } from './validate.js';

const ENTRIES = 'https://api.superintelligencesg.org/v1/entries';
const STATS = 'https://api.superintelligencesg.org/v1/stats';
const CHANGES = 'https://api.superintelligencesg.org/v1/changes';

function newest(values) {
  const dates = values.filter(value => typeof value === 'string' && value);
  if (!dates.length) return null;
  return dates.reduce((latest, value) => value > latest ? value : latest);
}

function evidenceStatus(entry) {
  const status = entry?.evidence?.status;
  return typeof status === 'string' ? status : null;
}

function summary(entry) {
  return {
    id: entry.id,
    name: entry.name ?? null,
    kind: entry.kind ?? null,
    founder: entry.founder ?? null,
    description: entry.description ?? null,
    url: entry.url ?? null,
    source_url: entry.source_url ?? null,
    evidence: { status: evidenceStatus(entry) },
    updated: entry.updated ?? null,
    as_of: entry.updated ?? null,
    disclosure: disclosureFor(entry),
  };
}

function requireRecords(body, key) {
  if (!body || !Array.isArray(body[key])) {
    throw new ToolError('upstream_unavailable', 'The Superintelligence SG API returned an unexpected response. Try again.', { retryable: true });
  }
  return body[key];
}

export async function searchOrgs(env, args = {}) {
  try {
    const query = readQuery(args.query);
    const kind = readKind(args.kind);
    const lens = readLens(args.lens);
    const origin = readOrigin(args.origin);
    const sort = readSort(args.sort);
    const limit = readLimit(args.limit);
    const { body } = await siGet(env, '/v1/entries', {
      type: 'organization',
      q: query,
      kind,
      lens,
      origin,
      sort,
      limit,
    });
    const entries = requireRecords(body, 'entries').map(summary);
    return {
      as_of: newest(entries.map(entry => entry.updated)),
      source_url: ENTRIES,
      total: Number.isFinite(body.total) ? body.total : entries.length,
      count: entries.length,
      sort: body.sort || sort,
      entries,
    };
  } catch (error) {
    throw asToolError(error);
  }
}

export async function getOrg(env, args = {}) {
  try {
    const id = readId(args.id);
    // No /v1/entries/{id} route. Load the public organisation list and match id.
    const { body } = await siGet(env, '/v1/entries', { type: 'organization' });
    const entries = requireRecords(body, 'entries');
    const entry = entries.find(item => item && item.id === id);
    if (!entry) {
      if (Number.isFinite(body.total) && entries.length < body.total) {
        throw new ToolError('upstream_unavailable', 'The directory response did not include every organisation, so this id could not be resolved. Try again.', { retryable: true });
      }
      throw new ToolError('not_found', 'No organisation with that id is in the public directory.');
    }
    return {
      as_of: entry.updated ?? null,
      source_url: entry.source_url ?? null,
      disclosure: disclosureFor(entry),
      record: entry,
    };
  } catch (error) {
    throw asToolError(error);
  }
}

export async function ecosystemStats(env) {
  try {
    const { body } = await siGet(env, '/v1/stats');
    if (!body || typeof body !== 'object' || !Number.isFinite(body.total) || !body.by_type || !body.by_kind) {
      throw new ToolError('upstream_unavailable', 'The Superintelligence SG API returned an unexpected stats response. Try again.', { retryable: true });
    }
    return {
      // /v1/stats has no record date. as_of stays null rather than inventing one.
      as_of: null,
      source_url: STATS,
      total: body.total,
      by_type: body.by_type,
      by_kind: body.by_kind,
    };
  } catch (error) {
    throw asToolError(error);
  }
}

export async function recentChanges(env, args = {}) {
  try {
    const limit = readLimit(args.limit);
    const { body } = await siGet(env, '/v1/changes', { limit });
    const changes = requireRecords(body, 'changes').map(record => ({
      id: record.id,
      date: record.date ?? null,
      title: record.title ?? null,
      summary: record.summary ?? null,
      label: record.label ?? null,
      url: record.url ?? null,
      source_url: record.source_url ?? null,
      evidence: { status: evidenceStatus(record) },
      as_of: record.date ?? null,
    }));
    return {
      as_of: newest(changes.map(record => record.date)),
      source_url: CHANGES,
      total: Number.isFinite(body.total) ? body.total : changes.length,
      count: changes.length,
      changes,
    };
  } catch (error) {
    throw asToolError(error);
  }
}

export async function matchPartners(env, args = {}) {
  try {
    const need = readNeed(args.need);
    const limit = readLimit(args.limit);
    if (!tokensOf(need).length) throw new ToolError('invalid_argument', 'Describe the need with at least one word.');
    const { body } = await siGet(env, '/v1/entries', { type: 'organization' });
    const entries = requireRecords(body, 'entries');
    const matches = rankOrganisations(entries, need, limit).map(item => ({
      ...summary(item.entry),
      score: item.score,
      why: item.why,
      disclosure: item.disclosure,
    }));
    return {
      as_of: newest(matches.map(item => item.updated)),
      source_url: ENTRIES,
      total_considered: entries.length,
      count: matches.length,
      matches,
    };
  } catch (error) {
    throw asToolError(error);
  }
}
