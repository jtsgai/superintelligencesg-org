// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

export const ERROR_CODES = Object.freeze([
  'invalid_argument',
  'not_found',
  'upstream_unavailable',
]);

export class ToolError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
  }
}

export function asToolError(error) {
  if (error instanceof ToolError) return error;
  return new ToolError('upstream_unavailable', 'The Superintelligence SG API request failed. Try again.', { retryable: true });
}
