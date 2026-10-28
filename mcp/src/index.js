// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

import { authorize } from './auth.js';
import { logCall, logToolName } from './log.js';
import { rateLimitFor, takeRateLimit } from './rate-limit.js';
import { handleMcp } from './server.js';

const MAX_BODY_BYTES = 64 * 1024;

const ALLOWED_HOSTS = new Set([
  'mcp.superintelligencesg.org',
  'mcp-test.superintelligencesg.org',
  'localhost',
  '127.0.0.1',
  '::1',
]);

function hostnameOf(value) {
  if (!value) return '';
  return String(value).replace(/:\d+$/, '').replace(/^\[|\]$/g, '').toLowerCase();
}

export function hostAllowed(request) {
  let urlHost = '';
  try {
    urlHost = new URL(request.url).hostname.toLowerCase();
  } catch {
    return false;
  }
  // Host is a forbidden header in some runtimes, so a missing header is not treated as a pass.
  const headerHost = hostnameOf(request.headers.get('Host'));
  if (headerHost && headerHost !== urlHost) return false;
  if (ALLOWED_HOSTS.has(urlHost)) return true;
  return urlHost.endsWith('.workers.dev');
}

function json(body, status, extra = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const [key, value] of Object.entries(extra)) headers.set(key, value);
  return new Response(JSON.stringify(body), { status, headers });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID');
  headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate, Retry-After');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function unauthorized() {
  return json({
    error: 'unauthorized',
    message: 'A valid API key is required. Send Authorization: Bearer <key>.',
  }, 401, { 'WWW-Authenticate': 'Bearer realm="si-commons-mcp"' });
}

function notConfigured() {
  return json({
    error: 'not_configured',
    message: 'This connector environment has no API key configured.',
  }, 503);
}

function rateLimited(retryAfter) {
  return json({
    error: 'rate_limited',
    message: `Rate limit exceeded for this API key. Try again in ${retryAfter} seconds.`,
    retryable: true,
  }, 429, { 'Retry-After': String(retryAfter) });
}

async function toolForLog(request) {
  if (request.method !== 'POST') return 'http';
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_BODY_BYTES) return 'http';
  try {
    return logToolName(await request.clone().json());
  } catch {
    return 'mcp';
  }
}

export default {
  async fetch(request, env) {
    const started = Date.now();
    const finish = (response, tool, status) => {
      logCall({ tool, status, latencyMs: Date.now() - started });
      return withCors(response);
    };
    if (!hostAllowed(request)) {
      return finish(json({ error: 'forbidden', message: 'This host is not served by the connector.' }, 403), 'http', 'error');
    }
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }
    if (url.pathname === '/' && request.method === 'GET') {
      return finish(json({
        service: 'si-commons-mcp',
        mcp: '/mcp',
        read_only: true,
        environment: env?.ENVIRONMENT === 'test' ? 'test' : env?.ENVIRONMENT === 'production' ? 'production' : 'unconfigured',
      }), 'http', 'ok');
    }
    if (url.pathname !== '/mcp') {
      return finish(json({ error: 'not_found', message: 'Not found.' }, 404), 'http', 'not_found');
    }
    const auth = await authorize(request, env);
    if (!auth.ok) {
      return finish(auth.status === 'not_configured' ? notConfigured() : unauthorized(), 'auth', auth.status);
    }
    const limit = takeRateLimit(auth.environment, rateLimitFor(env));
    if (!limit.ok) return finish(rateLimited(limit.retryAfter), 'auth', 'rate_limited');
    if (request.method !== 'POST') {
      return finish(json({
        error: 'method_not_allowed',
        message: 'This stateless connector accepts POST /mcp only.',
      }, 405, { Allow: 'POST' }), 'http', 'error');
    }
    const declared = Number(request.headers.get('Content-Length') || 0);
    if (declared > MAX_BODY_BYTES) {
      return finish(json({ error: 'invalid_request', message: 'Request body is too large.' }, 413), 'http', 'error');
    }
    const tool = await toolForLog(request);
    const outcome = { status: 'ok' };
    try {
      const response = await handleMcp(request, env, outcome);
      const status = response.status >= 400 ? 'error' : response.status === 202 ? 'accepted' : outcome.status;
      return finish(response, tool, status);
    } catch {
      return finish(json({
        error: 'upstream_unavailable',
        message: 'The connector could not complete the request. Try again.',
        retryable: true,
      }, 500), tool, 'error');
    }
  },
};
