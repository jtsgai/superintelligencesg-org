// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { asToolError } from './errors.js';
import { ecosystemStats, getOrg, matchPartners, recentChanges, searchOrgs } from './directory.js';

const READ_ONLY = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});

const limitSchema = z.number().int().min(1).max(50).nullish().describe('Maximum number of records to return, from 1 to 50. Defaults to 10.');

function textResult(payload, isError = false) {
  return {
    isError,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

function toolError(error) {
  const wrapped = asToolError(error);
  return textResult({
    error: wrapped.code,
    message: wrapped.message,
    retryable: wrapped.retryable,
  }, true);
}

async function run(outcome, fn) {
  try {
    const payload = await fn();
    outcome.status = 'ok';
    return textResult(payload);
  } catch (error) {
    const wrapped = asToolError(error);
    outcome.status = wrapped.code || 'error';
    return toolError(wrapped);
  }
}

export function createServer(env, outcome) {
  const server = new McpServer({
    name: 'si-commons',
    version: '1.0.0',
    title: 'SI Commons',
    websiteUrl: 'https://superintelligencesg.org',
    description: 'Read-only search of the public Superintelligence SG directory.',
  }, {
    instructions: 'Read-only public directory of Singapore AI organisations, programmes, statistics, and change records from Superintelligence SG. Records are in English. Each record includes its evidence status and source URL. Listings affiliated with the founder are labelled and receive no ranking boost.',
    maxToolInputElements: 64,
  });

  server.registerTool('search_sg_ai_orgs', {
    title: 'Search Singapore AI organisations',
    description: 'Search public Superintelligence SG organisation records. Optional filters: query text (matched by the API against name, founder, description, and kind, at most 120 characters), kind, lens, origin (curated or commons), and sort (name or updated). Returns id, name, kind, founder, description, url, source_url, evidence status, and updated, plus the total match count. Read-only.',
    inputSchema: {
      query: z.string().max(120).nullish().describe('Search text, at most 120 characters.'),
      kind: z.string().max(50).nullish().describe('Exact organisation kind, such as Governance or Research.'),
      lens: z.string().max(40).nullish().describe('Lens id, such as public, research, or trust.'),
      origin: z.enum(['curated', 'commons']).nullish().describe('Record origin: curated or commons.'),
      sort: z.enum(['name', 'updated']).nullish().describe('Sort by name or updated.'),
      limit: limitSchema,
    },
    annotations: READ_ONLY,
  }, args => run(outcome, () => searchOrgs(env, args)));

  server.registerTool('get_org', {
    title: 'Get one organisation',
    description: 'Return one public Superintelligence SG organisation record by its id, including evidence history when the directory has it. Unknown ids return not_found. Read-only.',
    inputSchema: {
      id: z.string().min(1).max(121).describe('Organisation id, such as public-ai-singapore.'),
    },
    annotations: READ_ONLY,
  }, args => run(outcome, () => getOrg(env, args)));

  server.registerTool('ecosystem_stats', {
    title: 'Ecosystem statistics',
    description: 'Return public counts from Superintelligence SG: total records, counts by type, and counts by kind. The stats endpoint has no record date, so as_of is null. Read-only.',
    inputSchema: {},
    annotations: READ_ONLY,
  }, () => run(outcome, () => ecosystemStats(env)));

  server.registerTool('recent_changes', {
    title: 'Recent directory changes',
    description: 'Return the latest public Superintelligence SG change records, newest dates first, with title, summary, date, evidence status, and source URL. Includes records still marked needs_review. Read-only.',
    inputSchema: {
      limit: limitSchema,
    },
    annotations: READ_ONLY,
  }, args => run(outcome, () => recentChanges(env, args)));

  server.registerTool('match_sg_ai_partners', {
    title: 'Match organisations to a need',
    description: 'Rank public Superintelligence SG organisation records against a stated need using only each record\'s name, kind, founder, and description. The response includes a short why drawn from those fields. Listings affiliated with the founder are labelled and receive no ranking boost. Read-only.',
    inputSchema: {
      need: z.string().min(1).max(500).describe('What the reader is looking for, in at most 500 characters.'),
      limit: limitSchema,
    },
    annotations: READ_ONLY,
  }, args => run(outcome, () => matchPartners(env, args)));

  return server;
}

export async function handleMcp(request, env, outcome) {
  const server = createServer(env, outcome);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: 64 * 1024,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close().catch(() => {});
  }
}
