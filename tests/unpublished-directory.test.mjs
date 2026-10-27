import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../worker/index.js';

const root = new URL('..', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const entriesData = JSON.parse(await read('data/entries.json'));
const records = entriesData.records;
const withdrawn = records.filter(record => record.published === false);

class Element {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.className = '';
    this.hidden = false;
    this.value = '';
    this.id = '';
    this.listeners = new Map();
    this._text = '';
    const attrs = this.attrs;
    this.dataset = new Proxy({}, {
      set(target, key, value) {
        target[key] = value;
        const name = `data-${String(key).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
        attrs.set(name, String(value));
        return true;
      },
    });
  }

  get textContent() {
    return this.children.length ? this.children.map(child => child.textContent ?? '').join('') : this._text;
  }

  set textContent(value) {
    this._text = value == null ? '' : String(value);
    this.children = [];
  }

  append(...nodes) {
    for (const node of nodes) {
      if (node == null) continue;
      this.children.push(node);
      if (node instanceof Element) node.parentNode = this;
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  after(node) {
    const siblings = this.parentNode.children;
    siblings.splice(siblings.indexOf(this) + 1, 0, node);
    if (node instanceof Element) node.parentNode = this.parentNode;
  }

  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  addEventListener(type, fn) { this.listeners.set(type, [...(this.listeners.get(type) || []), fn]); }
  dispatchEvent(event) { for (const fn of this.listeners.get(event.type) || []) fn(event); }
  querySelector(selector) { return query(this, selector); }
  querySelectorAll(selector) { return queryAll(this, selector); }
  scrollIntoView() {}
}

function matches(element, selector) {
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  if (selector.startsWith('.')) return element.className.split(/\s+/).includes(selector.slice(1));
  if (selector.startsWith('[') && selector.endsWith(']')) return element.attrs.has(selector.slice(1, -1).split('=')[0]);
  return element.tagName === selector.toUpperCase();
}

function queryAll(root, selector) {
  const parts = selector.split(',').map(part => part.trim());
  const found = [];
  const walk = element => {
    for (const child of element.children || []) {
      if (!(child instanceof Element)) continue;
      if (parts.some(part => matches(child, part))) found.push(child);
      walk(child);
    }
  };
  walk(root);
  return found;
}

const query = (root, selector) => queryAll(root, selector)[0] || null;

function directoryDocument() {
  const body = new Element('body');
  const search = new Element('input');
  search.className = 'search';
  const sort = new Element('select');
  sort.className = 'sort';
  sort.value = 'latest';
  const status = new Element('p');
  status.attrs.set('data-status', '');
  const profile = new Element('article');
  profile.attrs.set('data-profile', '');
  const list = new Element('div');
  list.attrs.set('data-list', '');
  body.append(search, sort, status, profile, list);
  const document = {
    title: '',
    body,
    createElement: tag => new Element(tag),
    querySelector: selector => query(body, selector),
    querySelectorAll: selector => queryAll(body, selector),
  };
  return { document, search, status, list };
}

function headings(list) {
  return queryAll(list, 'h2').map(heading => heading.textContent);
}

test('published:false records stay in entries.json and stay out of rendered and generated output', async () => {
  assert.equal(withdrawn.length, 1);
  assert.equal(withdrawn[0].id, 'public-taiger');
  assert.equal(withdrawn[0].name, 'TAIGER');
  assert.equal(records.includes(withdrawn[0]), true);

  const realFetch = globalThis.fetch;
  const env = { DATA_BASE_URL: 'https://fixtures.test/repo' };
  globalThis.fetch = async input => {
    assert.match(String(input), /^https:\/\/fixtures\.test\/repo\/data\/entries\.json$/);
    return Response.json(entriesData);
  };
  try {
    for (const path of ['/api/v1/entries', '/v1/entries', '/api/v1/stats', '/api/v1/snapshot']) {
      const response = await worker.fetch(new Request(`https://worker.test${path}`), env);
      assert.equal(response.status, 200, path);
      const body = await response.json();
      const listed = body.entries || [];
      assert.equal(listed.some(entry => entry.id === 'public-taiger' || entry.published === false), false, `${path} includes a withdrawn record`);
      if (path.endsWith('/stats')) assert.equal(body.total, records.length - withdrawn.length);
      if (path.endsWith('/entries')) assert.equal(body.total, records.length - withdrawn.length);
    }
    const search = await (await worker.fetch(new Request('https://worker.test/api/v1/entries?q=taiger'), env)).json();
    assert.equal(search.total, 0);
  } finally {
    globalThis.fetch = realFetch;
  }

  for (const file of ['sitemap.xml', 'static/sitemap.xml', 'assets/product/source-radar.json', 'index.html', 'organizations.html', 'about.html', 'manage.html', 'static/index.html', 'static/organizations.html']) {
    assert.equal((await read(file)).includes('public-taiger'), false, `${file} embeds a withdrawn id`);
  }

  const page = directoryDocument();
  globalThis.document = page.document;
  globalThis.location = { search: '', hash: '', href: 'https://superintelligencesg.org/organizations.html', pathname: '/organizations.html' };
  let pending = 0;
  let release = () => {};
  const loaded = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async input => {
    const url = String(input);
    pending += 1;
    let body;
    if (url.endsWith('/api/v1/entries?origin=curated')) body = { entries: records.map(record => ({ ...record, origin: 'curated' })) };
    else if (url.endsWith('/api/organizations')) body = { organizations: [{ id: 'commons-visible', name: 'Visible Commons', founder: 'Ada', business: 'Public work', logo_key: 'https://example.org/logo.png', created_at: 1, updated_at: 1, verification_status: 'submitted', category: 'Organization' }] };
    else throw new Error(`Unexpected fetch ${url}`);
    pending -= 1;
    if (pending === 0) queueMicrotask(release);
    return Response.json(body);
  };
  await import('../assets/product/commons.js');
  await loaded;
  await new Promise(resolve => setTimeout(resolve, 0));

  const visible = records.filter(record => record.published !== false);
  assert.equal(headings(page.list).includes('TAIGER'), false);
  assert.equal(page.list.textContent.includes('TAIGER'), false);
  assert.equal(Number(page.status.textContent.split(' ')[0]), visible.length + 1);
  assert.match(page.status.textContent, new RegExp(` · 1 self-submitted · ${visible.length} Navigator references`));

  page.search.value = 'taiger';
  page.search.dispatchEvent({ type: 'input' });
  assert.equal(headings(page.list).includes('TAIGER'), false);
  assert.equal(Number(page.status.textContent.split(' ')[0]), 0);

  page.search.value = 'Visible Commons';
  page.search.dispatchEvent({ type: 'input' });
  assert.deepEqual(headings(page.list), ['Visible Commons']);
  assert.equal(Number(page.status.textContent.split(' ')[0]), 1);
});
