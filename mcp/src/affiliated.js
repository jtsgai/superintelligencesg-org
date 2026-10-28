// Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved.

// Public listings tied to the founder of Superintelligence SG.
// They stay in results. They are labelled and receive no ranking boost.
export const FOUNDER_DISCLOSURE = 'Listing affiliated with the founder of Superintelligence SG (Jerry Tuo, JT M&C, Red Fun Planet). No ranking boost is applied.';

const AFFILIATED_NAMES = new Set(['jt m and c', 'jtmc', 'red fun planet']);
const AFFILIATED_HOSTS = ['jt-sgai.com', 'redfunplanet.com'];
const AFFILIATED_IDS = new Set([
  '9dead00b-115e-4312-8d4d-6a4f2904a958',
  '59054b03-5f58-4630-a7d8-cd8b999dcf91',
]);

function compactName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function hostname(value) {
  if (typeof value !== 'string' || !value) return '';
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isFounderAffiliated(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (AFFILIATED_IDS.has(entry.id)) return true;
  if (AFFILIATED_NAMES.has(compactName(entry.name))) return true;
  return [entry.url, entry.source_url, entry.profile_url, entry.logo_url]
    .map(hostname)
    .some(host => host && AFFILIATED_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`)));
}

export function disclosureFor(entry) {
  return isFounderAffiliated(entry) ? FOUNDER_DISCLOSURE : null;
}
