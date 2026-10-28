// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

import { ToolError } from './errors.js';

export const SEARCH_LIMIT_DEFAULT = 10;
export const SEARCH_LIMIT_MAX = 50;
export const QUERY_MAX = 120;
export const NEED_MAX = 500;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,119}$/;
const LENS_PATTERN = /^[a-z0-9-]{1,40}$/;

function blank(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

export function readLimit(value, fallback = SEARCH_LIMIT_DEFAULT) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > SEARCH_LIMIT_MAX) {
    throw new ToolError('invalid_argument', 'Use a limit between 1 and 50.');
  }
  return value;
}

export function readQuery(value) {
  const query = blank(value);
  if (!query) return '';
  if (query.length > QUERY_MAX) throw new ToolError('invalid_argument', 'Use a query of at most 120 characters.');
  return query;
}

export function readKind(value) {
  const kind = blank(value);
  if (!kind) return '';
  if (kind.length > 50) throw new ToolError('invalid_argument', 'Use a kind of at most 50 characters.');
  return kind;
}

export function readLens(value) {
  const lens = blank(value).toLowerCase();
  if (!lens) return '';
  if (!LENS_PATTERN.test(lens)) throw new ToolError('invalid_argument', 'Use a lens of lowercase letters, numbers, and hyphens (up to 40 characters).');
  return lens;
}

export function readOrigin(value) {
  const origin = blank(value);
  if (!origin) return '';
  if (origin !== 'curated' && origin !== 'commons') throw new ToolError('invalid_argument', 'Choose origin curated or commons.');
  return origin;
}

export function readSort(value) {
  const sort = blank(value);
  if (!sort) return 'name';
  if (sort !== 'name' && sort !== 'updated') throw new ToolError('invalid_argument', 'Sort by name or updated.');
  return sort;
}

export function readId(value) {
  const id = blank(value);
  if (!ID_PATTERN.test(id)) throw new ToolError('invalid_argument', 'Use an organisation id made of letters, numbers, and hyphens.');
  return id;
}

export function readNeed(value) {
  const need = blank(value);
  if (!need) throw new ToolError('invalid_argument', 'Describe the need in a few words.');
  if (need.length > NEED_MAX) throw new ToolError('invalid_argument', 'Use a need of at most 500 characters.');
  return need;
}
