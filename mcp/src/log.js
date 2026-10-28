// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

// Application logs are timestamp, tool name, status, and latency only.
// Query text, arguments, API keys, and IP addresses are not written.

const TOOLS = new Set([
  'search_sg_ai_orgs',
  'get_org',
  'ecosystem_stats',
  'recent_changes',
  'match_sg_ai_partners',
]);

const METHODS = new Set([
  'initialize',
  'notifications/initialized',
  'ping',
  'tools/list',
  'tools/call',
]);

const STATUSES = new Set([
  'ok',
  'accepted',
  'invalid_argument',
  'not_found',
  'upstream_unavailable',
  'unauthorized',
  'rate_limited',
  'not_configured',
  'error',
]);

export function logToolName(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'mcp';
  if (body.method === 'tools/call') {
    const name = body.params && body.params.name;
    return TOOLS.has(name) ? name : 'tools/call';
  }
  return METHODS.has(body.method) ? body.method : 'mcp';
}

function knownTool(tool) {
  return tool === 'mcp' || tool === 'auth' || tool === 'http' || TOOLS.has(tool) || METHODS.has(tool);
}

export function logCall({ tool, status, latencyMs }) {
  const safeTool = knownTool(tool) ? tool : 'mcp';
  const safeStatus = STATUSES.has(status) ? status : 'error';
  const latency = Number.isFinite(latencyMs) && latencyMs >= 0 ? Math.round(latencyMs) : 0;
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    tool: safeTool,
    status: safeStatus,
    latency_ms: latency,
  }));
}
