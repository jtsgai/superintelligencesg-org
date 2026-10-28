// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

const encoder = new TextEncoder();

export function expectedSecret(env) {
  if (env?.ENVIRONMENT === 'production') {
    return { environment: 'production', secret: String(env.MCP_API_KEY || '').trim() };
  }
  if (env?.ENVIRONMENT === 'test') {
    return { environment: 'test', secret: String(env.MCP_API_KEY_TEST || '').trim() };
  }
  return { environment: '', secret: '' };
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return new Uint8Array(digest);
}

// Compare hashes so the check does not leak the secret's length or contents.
export async function sameSecret(provided, expected) {
  const [left, right] = await Promise.all([sha256(String(provided)), sha256(String(expected))]);
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left[index] || 0) ^ (right[index] || 0);
  return difference === 0;
}

export function bearerToken(header) {
  const match = /^Bearer ([^\s]+)$/i.exec(header || '');
  return match ? match[1] : '';
}

export async function authorize(request, env) {
  const configured = expectedSecret(env);
  if (!configured.secret) {
    return { ok: false, status: 'not_configured', environment: configured.environment };
  }
  const token = bearerToken(request.headers.get('Authorization'));
  const valid = await sameSecret(token, configured.secret);
  if (!valid) return { ok: false, status: 'unauthorized', environment: configured.environment };
  return { ok: true, status: 'ok', environment: configured.environment };
}
