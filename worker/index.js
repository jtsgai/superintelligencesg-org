const ORIGINS = new Set([
  'https://superintelligencesg.org',
  'https://www.superintelligencesg.org',
  'https://superintelligencesg.com',
  'https://www.superintelligencesg.com',
  'https://superintelligencesg.ai',
  'https://www.superintelligencesg.ai',
]);

const CATEGORIES = ['Organization', 'Research', 'Applied research', 'Education & research', 'Company', 'Health AI', 'Ecosystem', 'Governance', 'Public capability'];
const REVIEW_STATUSES = ['received', 'in_review', 'accepted', 'rejected', 'resolved'];
const NAVIGATOR_CANDIDATE_STATUSES = ['none', 'draft', 'ready'];
let sourceDeskReviewColumnsReady = false;
const PUBLIC_SELECT = `SELECT o.id,o.name,o.founder,o.business,o.logo_key,o.created_at,d.website_url,d.location,d.category,d.collaboration,d.collaboration_note,d.contact_url,d.updated_at,d.verification_status,d.verified_domain,d.verified_at FROM organizations o LEFT JOIN organization_details d ON d.organization_id=o.id`;

function headers(origin, type = 'application/json; charset=utf-8') {
  const result = new Headers({
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  if (ORIGINS.has(origin)) {
    result.set('Access-Control-Allow-Origin', origin);
    result.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    result.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    result.set('Vary', 'Origin');
  }
  return result;
}

function json(value, status = 200, origin) {
  return new Response(JSON.stringify(value), { status, headers: headers(origin) });
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

function apiPath(pathname) {
  if (pathname.startsWith('/directory/api/')) return pathname.slice('/directory'.length);
  if (pathname.startsWith('/directory/')) return `/api/${pathname.slice('/directory/'.length)}`;
  return pathname;
}

const now = () => Math.floor(Date.now() / 1000);

async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function secret() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function base64(bytes) {
  let value = '';
  for (let index = 0; index < bytes.length; index += 32768) value += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return btoa(value);
}

function text(value, max, required = false) {
  const result = String(value || '').trim();
  if ((required && !result) || result.length > max) fail('Check the required fields and their character limits.');
  return result;
}

function website(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.port || !parsed.hostname.includes('.') || /^[\d.]+$/.test(parsed.hostname) || !/^[a-z0-9.-]+$/i.test(parsed.hostname) || parsed.hostname.endsWith('.local')) throw Error();
    return parsed.href;
  } catch {
    fail('Enter a public website URL beginning with https:// or http://.');
  }
}

function contact(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'mailto:' && /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(parsed.pathname) && !parsed.search) return parsed.href;
    return website(value);
  } catch {
    fail('Use a public contact page URL or mailto:name@example.com.');
  }
}

function email(value) {
  if (!value) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('Enter a valid contact email address.');
  return value;
}

function inferredWebsite(business) {
  const match = business.match(/https?:\/\/[^\s<>]+/);
  try { return match ? website(match[0]) : ''; } catch { return ''; }
}

function publicRow(row) {
  return {
    ...row,
    website_url: row.website_url ?? inferredWebsite(row.business),
    location: row.location || '',
    category: row.category || 'Organization',
    collaboration: row.collaboration || 'unspecified',
    collaboration_note: row.collaboration_note || '',
    contact_url: row.contact_url || '',
    verification_status: row.verification_status || 'submitted',
    updated_at: row.updated_at || row.created_at,
  };
}

function fields(form) {
  const category = text(form.get('category'), 50) || 'Organization';
  const collaboration = text(form.get('collaboration'), 20) || 'unspecified';
  if (!CATEGORIES.includes(category) || !['unspecified', 'open', 'closed'].includes(collaboration)) fail('Choose an available category and collaboration status.');
  return {
    name: text(form.get('name'), 100, true),
    founder: text(form.get('founder'), 100, true),
    business: text(form.get('business'), 500, true),
    website_url: website(text(form.get('website_url'), 300)),
    location: text(form.get('location'), 120),
    category,
    collaboration,
    collaboration_note: text(form.get('collaboration_note'), 300),
    contact_url: contact(text(form.get('contact_url'), 300)),
  };
}

function validImage(bytes, type) {
  if (type === 'image/png') return bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  if (type === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  return type === 'image/webp' && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}

async function imageData(file, required) {
  if (!file || !file.size) {
    if (required) fail('Upload your organisation logo.');
    return null;
  }
  if (typeof file.arrayBuffer !== 'function' || file.size > 2097152) fail('Use a PNG, JPG or WebP logo up to 2 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validImage(bytes, file.type)) fail('The logo is not a valid PNG, JPG or WebP image.');
  return `data:${file.type};base64,${base64(bytes)}`;
}

async function limited(request, env, action, limit = 30) {
  const ipHash = await hash(`${action}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  const timestamp = now();
  const result = await env.DB.batch([
    env.DB.prepare('INSERT INTO organization_rate_limits(ip_hash,created_at) VALUES(?,?)').bind(ipHash, timestamp),
    env.DB.prepare('SELECT COUNT(*) AS count FROM organization_rate_limits WHERE ip_hash=? AND created_at>?').bind(ipHash, timestamp - 3600),
    env.DB.prepare('DELETE FROM organization_rate_limits WHERE created_at<?').bind(timestamp - 86400),
  ]);
  if (Number(result[1].results[0]?.count) > limit) fail('Too many attempts. Please try again in one hour.', 429);
}

async function bodyJSON(request) {
  if (Number(request.headers.get('Content-Length') || 0) > 10000) fail('Request is too large.', 413);
  try { return await request.json(); } catch { fail('Invalid request body.'); }
}

function orgID(value) {
  if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/.test(value)) fail('Choose a valid organisation profile.');
  return value;
}

async function owned(request, env, id) {
  const value = request.headers.get('Authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(value)) fail('Enter the management key for this profile.', 401);
  const row = await env.DB.prepare('SELECT * FROM organization_details WHERE organization_id=? AND manage_hash=?').bind(id, await hash(value.slice(7))).first();
  if (!row) fail('The management key does not match this profile.', 401);
  return row;
}

async function readOne(env, id, includeWithdrawn = false) {
  const row = await env.DB.prepare(`${PUBLIC_SELECT} WHERE o.id=?${includeWithdrawn ? '' : ' AND COALESCE(d.published,1)=1'}`).bind(id).first();
  if (!row) fail('This profile is unavailable.', 404);
  return publicRow(row);
}

async function submitSourceSuggestion(request, env, origin) {
  await limited(request, env, 'source-desk', 8);
  const data = await bodyJSON(request);
  if (text(data.website, 300)) fail('Unable to submit this request.');
  if (data.consent !== true) fail('Confirm that you may submit this information.');
  const requestType = text(data.type, 20, true);
  if (!['addition', 'correction', 'removal'].includes(requestType)) fail('Choose a valid request type.');
  const subjectName = text(data.subject_name, 160, true);
  const subjectUrl = website(text(data.subject_url, 300));
  const sourceUrl = website(text(data.source_url, 500, true));
  const details = text(data.details, 1400, true);
  const contactEmail = email(text(data.contact_email, 254));
  const timestamp = now();
  await env.DB.prepare('INSERT INTO source_desk_submissions(id,request_type,subject_name,subject_url,source_url,details,contact_email,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), requestType, subjectName, subjectUrl, sourceUrl, details, contactEmail, 'received', timestamp, timestamp).run();
  return json({ ok: true, status: 'received' }, 201, origin);
}

async function requireSourceDeskAdmin(request, env) {
  await limited(request, env, 'source-desk-admin', 30);
  const expected = String(env.SOURCE_DESK_ADMIN_TOKEN || '').trim();
  const authorization = request.headers.get('Authorization') || '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!expected || provided.length !== expected.length) fail('Source Desk admin authorization is required.', 401);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  if (difference !== 0) fail('Source Desk admin authorization is required.', 401);
}

async function ensureSourceDeskReviewStorage(env) {
  if (sourceDeskReviewColumnsReady) return;
  for (const statement of [
    'ALTER TABLE source_desk_submissions ADD COLUMN review_note TEXT DEFAULT \'\' NOT NULL',
    'ALTER TABLE source_desk_submissions ADD COLUMN reviewed_at INTEGER',
    'CREATE TABLE IF NOT EXISTS source_desk_review_events (id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL, from_status TEXT NOT NULL, to_status TEXT NOT NULL, review_note TEXT DEFAULT \'\' NOT NULL, public_summary TEXT DEFAULT \'\' NOT NULL, publish_changelog INTEGER DEFAULT 0 NOT NULL, created_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS source_desk_public_updates (id TEXT PRIMARY KEY NOT NULL, submission_id TEXT NOT NULL UNIQUE, request_type TEXT NOT NULL, subject_name TEXT NOT NULL, subject_url TEXT DEFAULT \'\' NOT NULL, source_url TEXT NOT NULL, public_summary TEXT NOT NULL, published_at INTEGER NOT NULL)',
    'ALTER TABLE source_desk_submissions ADD COLUMN navigator_candidate_status TEXT DEFAULT \'none\' NOT NULL',
    'ALTER TABLE source_desk_submissions ADD COLUMN navigator_candidate_name TEXT DEFAULT \'\' NOT NULL',
    'ALTER TABLE source_desk_submissions ADD COLUMN navigator_candidate_founder TEXT DEFAULT \'\' NOT NULL',
    'ALTER TABLE source_desk_submissions ADD COLUMN navigator_candidate_description TEXT DEFAULT \'\' NOT NULL',
    'ALTER TABLE source_desk_submissions ADD COLUMN navigator_candidate_kind TEXT DEFAULT \'Organization\' NOT NULL',
    'ALTER TABLE source_desk_submissions ADD COLUMN navigator_candidate_logo_url TEXT DEFAULT \'\' NOT NULL',
    'ALTER TABLE source_desk_submissions ADD COLUMN navigator_candidate_updated_at INTEGER',
  ]) {
    try {
      await env.DB.prepare(statement).run();
    } catch (error) {
      if (!/duplicate column name|duplicate column/i.test(String(error?.message || error))) throw error;
    }
  }
  sourceDeskReviewColumnsReady = true;
}

async function sourceDeskQueue(request, env, origin) {
  await requireSourceDeskAdmin(request, env);
  await ensureSourceDeskReviewStorage(env);
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || '';
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);
  if (status && !REVIEW_STATUSES.includes(status)) fail('Choose a valid Source Desk status.');
  const select = 'SELECT s.id,s.request_type,s.subject_name,s.subject_url,s.source_url,s.details,s.contact_email,s.status,s.review_note,s.reviewed_at,s.created_at,s.updated_at,s.navigator_candidate_status,s.navigator_candidate_name,s.navigator_candidate_founder,s.navigator_candidate_description,s.navigator_candidate_kind,s.navigator_candidate_logo_url,s.navigator_candidate_updated_at,COALESCE(p.public_summary,\'\') AS public_summary,p.published_at FROM source_desk_submissions s LEFT JOIN source_desk_public_updates p ON p.submission_id=s.id';
  const result = status
    ? await env.DB.prepare(`${select} WHERE s.status=? ORDER BY s.created_at DESC LIMIT ?`).bind(status, limit).all()
    : await env.DB.prepare(`${select} ORDER BY s.created_at DESC LIMIT ?`).bind(limit).all();
  return json({ submissions: result.results || [] }, 200, origin);
}

async function sourceDeskEvents(request, env, origin, id) {
  await requireSourceDeskAdmin(request, env);
  await ensureSourceDeskReviewStorage(env);
  if (!/^[a-f0-9-]{36}$/.test(id)) fail('This Source Desk submission is unavailable.', 404);
  const result = await env.DB.prepare('SELECT id,submission_id,from_status,to_status,review_note,public_summary,publish_changelog,created_at FROM source_desk_review_events WHERE submission_id=? ORDER BY created_at DESC LIMIT 100').bind(id).all();
  return json({ events: result.results || [] }, 200, origin);
}

async function reviewSourceSuggestion(request, env, origin, id) {
  await requireSourceDeskAdmin(request, env);
  await ensureSourceDeskReviewStorage(env);
  if (!/^[a-f0-9-]{36}$/.test(id)) fail('This Source Desk submission is unavailable.', 404);
  const current = await env.DB.prepare('SELECT id,request_type,subject_name,subject_url,source_url,status,navigator_candidate_status,navigator_candidate_name,navigator_candidate_founder,navigator_candidate_description,navigator_candidate_kind,navigator_candidate_logo_url FROM source_desk_submissions WHERE id=?').bind(id).first();
  if (!current) fail('This Source Desk submission is unavailable.', 404);
  const published = await env.DB.prepare('SELECT public_summary FROM source_desk_public_updates WHERE submission_id=?').bind(id).first();
  const data = await bodyJSON(request);
  const status = text(data.status, 20, true);
  if (!REVIEW_STATUSES.includes(status)) fail('Choose a valid Source Desk status.');
  const reviewNote = text(data.review_note, 2000);
  const publicSummary = typeof data.public_summary === 'undefined' ? String(published?.public_summary || '') : text(data.public_summary, 500);
  const candidate = typeof data.navigator_candidate === 'undefined' ? {
    status: current.navigator_candidate_status || 'none',
    name: current.navigator_candidate_name || '',
    founder: current.navigator_candidate_founder || '',
    description: current.navigator_candidate_description || '',
    kind: current.navigator_candidate_kind || 'Organization',
    logo_url: current.navigator_candidate_logo_url || '',
  } : data.navigator_candidate || {};
  const candidateStatus = text(candidate.status, 20) || 'none';
  if (!NAVIGATOR_CANDIDATE_STATUSES.includes(candidateStatus)) fail('Choose a valid Navigator candidate status.');
  if (candidateStatus !== 'none' && !['accepted', 'resolved'].includes(status)) fail('Only accepted or resolved reviews can create a Navigator draft.');
  const candidateName = candidateStatus === 'none' ? '' : text(candidate.name, 160, true);
  const candidateFounder = candidateStatus === 'none' ? '' : text(candidate.founder, 160);
  const candidateDescription = candidateStatus === 'none' ? '' : text(candidate.description, 600, true);
  const candidateKind = candidateStatus === 'none' ? 'Organization' : text(candidate.kind, 50, true);
  if (candidateStatus !== 'none' && !CATEGORIES.includes(candidateKind)) fail('Choose a valid Navigator candidate category.');
  const candidateLogoURL = candidateStatus === 'none' ? '' : website(text(candidate.logo_url, 500));
  if (typeof data.publish_changelog !== 'undefined' && typeof data.publish_changelog !== 'boolean') fail('Choose whether to publish this decision.');
  let publishChangelog = typeof data.publish_changelog === 'boolean' ? data.publish_changelog : Boolean(published);
  if (!['accepted', 'resolved'].includes(status)) publishChangelog = false;
  if (publishChangelog && !publicSummary) fail('Add a public summary before publishing this decision.');
  const timestamp = now();
  await env.DB.batch([
    env.DB.prepare('UPDATE source_desk_submissions SET status=?,review_note=?,reviewed_at=?,updated_at=?,navigator_candidate_status=?,navigator_candidate_name=?,navigator_candidate_founder=?,navigator_candidate_description=?,navigator_candidate_kind=?,navigator_candidate_logo_url=?,navigator_candidate_updated_at=? WHERE id=?').bind(status, reviewNote, timestamp, timestamp, candidateStatus, candidateName, candidateFounder, candidateDescription, candidateKind, candidateLogoURL, candidateStatus === 'none' ? null : timestamp, id),
    env.DB.prepare('INSERT INTO source_desk_review_events(id,submission_id,from_status,to_status,review_note,public_summary,publish_changelog,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(), id, current.status, status, reviewNote, publicSummary, publishChangelog ? 1 : 0, timestamp),
  ]);
  if (publishChangelog) {
    await env.DB.prepare('INSERT INTO source_desk_public_updates(id,submission_id,request_type,subject_name,subject_url,source_url,public_summary,published_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(submission_id) DO UPDATE SET request_type=excluded.request_type,subject_name=excluded.subject_name,subject_url=excluded.subject_url,source_url=excluded.source_url,public_summary=excluded.public_summary,published_at=excluded.published_at').bind(crypto.randomUUID(), id, current.request_type, current.subject_name, current.subject_url, current.source_url, publicSummary, timestamp).run();
  } else if (published) {
    await env.DB.prepare('DELETE FROM source_desk_public_updates WHERE submission_id=?').bind(id).run();
  }
  return json({ ok: true, id, status, review_note: reviewNote, public_summary: publicSummary, published_at: publishChangelog ? timestamp : null, reviewed_at: timestamp }, 200, origin);
}

async function sourceUpdates(env, origin) {
  await ensureSourceDeskReviewStorage(env);
  const result = await env.DB.prepare('SELECT id,submission_id,request_type,subject_name,subject_url,source_url,public_summary,published_at FROM source_desk_public_updates ORDER BY published_at DESC LIMIT 30').all();
  return json({ updates: result.results || [] }, 200, origin);
}

async function health(env, origin) {
  try {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true, service: 'commons-api', database: 'ok', timestamp: now() }, 200, origin);
  } catch {
    return json({ ok: false, service: 'commons-api', database: 'error', timestamp: now() }, 503, origin);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const path = apiPath(url.pathname);
    if (!path.startsWith('/api/')) return new Response('Not found', { status: 404 });
    if (request.method === 'OPTIONS') return new Response(null, { status: ORIGINS.has(origin) ? 204 : 403, headers: headers(origin) });
    if (origin && !ORIGINS.has(origin)) return json({ error: 'This origin is not allowed.' }, 403, origin);
    try {
      if (path === '/api/health' && request.method === 'GET') return health(env, origin);
      if (path === '/api/source-updates' && request.method === 'GET') return await sourceUpdates(env, origin);
      if (path === '/api/organizations' && request.method === 'GET') {
        const result = await env.DB.prepare(`${PUBLIC_SELECT} WHERE COALESCE(d.published,1)=1 ORDER BY o.created_at DESC LIMIT 500`).all();
        return json({ organizations: (result.results || []).map(publicRow) }, 200, origin);
      }
      if (path.startsWith('/api/shortlists/') && request.method === 'GET') {
        const id = orgID(path.split('/').pop());
        const row = await env.DB.prepare('SELECT entry_ids,created_at FROM navigator_shortlists WHERE id=?').bind(id).first();
        if (!row) fail('This shortlist is unavailable.', 404);
        return json({ ids: JSON.parse(row.entry_ids), created_at: row.created_at }, 200, origin);
      }
      if (path === '/api/source-suggestions' && request.method === 'GET') return await sourceDeskQueue(request, env, origin);
      if (path.startsWith('/api/source-suggestions/') && path.endsWith('/events') && request.method === 'GET') return await sourceDeskEvents(request, env, origin, path.split('/').slice(-2)[0]);
      if (path.startsWith('/api/source-suggestions/') && request.method === 'PATCH') return await reviewSourceSuggestion(request, env, origin, path.split('/').pop());
      if (request.method !== 'POST') return json({ error: 'Not found' }, 404, origin);
      if (!ORIGINS.has(origin)) fail('Open this form from a Superintelligence SG website.', 403);
      if (path === '/api/source-suggestions') return submitSourceSuggestion(request, env, origin);
      if (path === '/api/shortlists') {
        await limited(request, env, 'shortlist', 120);
        const data = await bodyJSON(request);
        if (!Array.isArray(data.ids) || data.ids.length > 6 || data.ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id))) fail('Save up to 6 valid directory entries.');
        const id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO navigator_shortlists(id,entry_ids,created_at) VALUES(?,?,?)').bind(id, JSON.stringify([...new Set(data.ids)]), now()).run();
        return json({ id }, 201, origin);
      }
      if (path === '/api/organizations') {
        await limited(request, env, 'publish', 5);
        if (Number(request.headers.get('Content-Length') || 0) > 2200000) fail('The logo must be no larger than 2 MB.', 413);
        const form = await request.formData();
        if (text(form.get('website'), 300)) fail('Unable to submit this entry.');
        if (form.get('consent') !== 'on') fail('Confirm that you represent the organisation and may publish these details.');
        const fieldValues = fields(form);
        const logo = await imageData(form.get('logo'), true);
        const id = crypto.randomUUID();
        const key = secret();
        const timestamp = now();
        await env.DB.batch([
          env.DB.prepare('INSERT INTO organizations(id,name,founder,business,logo_key,created_at) VALUES(?,?,?,?,?,?)').bind(id, fieldValues.name, fieldValues.founder, fieldValues.business, logo, timestamp),
          env.DB.prepare('INSERT INTO organization_details(organization_id,website_url,location,category,collaboration,collaboration_note,contact_url,manage_hash,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id, fieldValues.website_url, fieldValues.location, fieldValues.category, fieldValues.collaboration, fieldValues.collaboration_note, fieldValues.contact_url, await hash(key), timestamp),
        ]);
        return json({ ok: true, organization: await readOne(env, id), management_key: key }, 201, origin);
      }
      if (path.startsWith('/api/manage/')) {
        await limited(request, env, 'manage');
        if (path === '/api/manage/update') {
          if (Number(request.headers.get('Content-Length') || 0) > 2200000) fail('The logo must be no larger than 2 MB.', 413);
          const form = await request.formData();
          const id = orgID(form.get('id'));
          const owner = await owned(request, env, id);
          const fieldValues = fields(form);
          const logo = await imageData(form.get('logo'), false);
          const old = await readOne(env, id, true);
          const sameDomain = owner.verified_domain && fieldValues.website_url && new URL(fieldValues.website_url).hostname === owner.verified_domain;
          await env.DB.batch([
            env.DB.prepare('UPDATE organizations SET name=?,founder=?,business=?,logo_key=? WHERE id=?').bind(fieldValues.name, fieldValues.founder, fieldValues.business, logo || old.logo_key, id),
            env.DB.prepare('UPDATE organization_details SET website_url=?,location=?,category=?,collaboration=?,collaboration_note=?,contact_url=?,updated_at=?,verification_status=?,verified_domain=?,verified_at=?,claim_hash=NULL,claim_challenge=NULL,claim_expires=NULL WHERE organization_id=?').bind(fieldValues.website_url, fieldValues.location, fieldValues.category, fieldValues.collaboration, fieldValues.collaboration_note, fieldValues.contact_url, now(), sameDomain ? 'claimed' : 'submitted', sameDomain ? owner.verified_domain : null, sameDomain ? owner.verified_at : null, id),
          ]);
          return json({ ok: true, organization: await readOne(env, id, true) }, 200, origin);
        }
        const data = await bodyJSON(request);
        const id = orgID(data.id);
        const owner = await owned(request, env, id);
        if (path === '/api/manage/read') return json({ organization: await readOne(env, id, true), published: owner.published === 1 }, 200, origin);
        if (path === '/api/manage/visibility') {
          if (typeof data.published !== 'boolean') fail('Choose a visibility setting.');
          await env.DB.prepare('UPDATE organization_details SET published=?,updated_at=? WHERE organization_id=?').bind(data.published ? 1 : 0, now(), id).run();
          return json({ ok: true, published: data.published }, 200, origin);
        }
        if (path === '/api/manage/rotate') {
          const key = secret();
          await env.DB.prepare('UPDATE organization_details SET manage_hash=? WHERE organization_id=?').bind(await hash(key), id).run();
          return json({ ok: true, management_key: key }, 200, origin);
        }
      }
      if (path === '/api/claim/start') {
        await limited(request, env, 'claim-start', 8);
        const data = await bodyJSON(request);
        const id = orgID(data.id);
        const row = await readOne(env, id, true);
        if (!row.website_url) fail('No website is recorded. Contact the editor to establish the website from a public source before claiming.', 409);
        const domain = new URL(row.website_url).hostname;
        const privateKey = secret();
        const challenge = `sg-commons=${secret()}`;
        const expires = now() + 86400;
        await env.DB.prepare('INSERT INTO organization_details(organization_id,website_url,claim_hash,claim_challenge,claim_expires) VALUES(?,?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET claim_hash=excluded.claim_hash,claim_challenge=excluded.claim_challenge,claim_expires=excluded.claim_expires').bind(id, row.website_url, await hash(privateKey), challenge, expires).run();
        return json({ domain, record_name: `_sg-commons.${domain}`, record_type: 'TXT', record_value: challenge, claim_key: privateKey, expires_at: expires }, 200, origin);
      }
      if (path === '/api/claim/verify') {
        await limited(request, env, 'claim-verify', 15);
        const data = await bodyJSON(request);
        const id = orgID(data.id);
        if (!/^[a-f0-9]{64}$/.test(data.claim_key || '')) fail('Enter your private claim key.', 401);
        const claimHash = await hash(data.claim_key);
        const details = await env.DB.prepare('SELECT * FROM organization_details WHERE organization_id=? AND claim_hash=? AND claim_expires>?').bind(id, claimHash, now()).first();
        if (!details) fail('This claim has expired or was replaced. Start a new claim.', 401);
        const domain = new URL(details.website_url).hostname;
        const dns = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(`_sg-commons.${domain}`)}&type=TXT`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) });
        if (!dns.ok) fail('DNS lookup is temporarily unavailable. Try again shortly.', 503);
        const answer = await dns.json();
        if (answer.Status !== 0 || !answer.Answer?.some(record => record.type === 16 && record.data.replace(/"\s*"/g, '').replace(/^"|"$/g, '') === details.claim_challenge)) fail('The matching TXT record is not visible yet. Check the record and allow time for DNS to update.', 409);
        const key = secret();
        const timestamp = now();
        const result = await env.DB.prepare("UPDATE organization_details SET manage_hash=?,verification_status='claimed',verified_domain=?,verified_at=?,updated_at=?,claim_hash=NULL,claim_challenge=NULL,claim_expires=NULL WHERE organization_id=? AND claim_hash=? AND claim_expires>?").bind(await hash(key), domain, timestamp, timestamp, id, claimHash, timestamp).run();
        if (result.meta?.changes !== 1) fail('This claim has already been completed or expired.', 409);
        return json({ ok: true, management_key: key, verified_domain: domain }, 200, origin);
      }
      return json({ error: 'Not found' }, 404, origin);
    } catch (error) {
      if (error.status) return json({ error: error.message }, error.status, origin);
      console.error('Commons request failed', path);
      return json({ error: 'The service is temporarily unavailable. Keep your details and retry. If you just published, check the directory before submitting again.' }, 503, origin);
    }
  },
};
