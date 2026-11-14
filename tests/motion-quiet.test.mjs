// Static guard for the restrained Round-2 motion layer (Hover Lift, Ripple, clearProps).
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const ROOT_PAGES = ['index.html', 'organizations.html', 'about.html', 'ecosystem.html', 'manage.html'];

test('motion-lift.css uses translate only, gated on hover + no reduced-motion', async () => {
  const css = stripComments(await read('assets/product/motion-lift.css'));
  assert.doesNotMatch(css, /transform/, 'motion-lift.css must not declare transform');
  assert.match(css, /^\s*@media \(hover: hover\) and \(prefers-reduced-motion: no-preference\) \{[\s\S]*\}\s*$/);
  for (const sel of ['.guide-item:hover', '.principle:hover', '.org-card:hover', '.item:hover', '.cluster:hover']) assert.ok(css.includes(sel), sel);
  assert.match(css, /translate: 0 -3px/);
});

test('legacy transform hover is gone from motion-home.css', async () => {
  const css = stripComments(await read('assets/product/motion-home.css'));
  assert.doesNotMatch(css, /\.guide-item:hover\s*\{[^}]*transform/);
});

test('motion-home.js clears the transform family after every entrance tween', async () => {
  const js = await read('assets/product/motion-home.js');
  assert.match(js, /var CLEAR = "transform,translate,rotate,scale";/);
  assert.equal((js.match(/clearProps: CLEAR/g) || []).length, 3);
});

test('Ripple is decorative: passive click, never preventDefault, skips disabled + reduced motion', async () => {
  const js = await read('assets/product/si-ripple.js');
  assert.doesNotMatch(js.replace(/\/\/.*$/gm, ''), /preventDefault|stopPropagation/);
  assert.match(js, /\{ passive: true \}/);
  assert.match(js, /prefers-reduced-motion: reduce/);
  assert.match(js, /host\.disabled/);
  const css = await read('assets/product/si-ripple.css');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*display: none/);
});

test('data-si-ripple only on the two solid primary actions of the homepage', async () => {
  const html = await read('index.html');
  const hosts = html.match(/<[^>]*\bdata-si-ripple\b[^>]*>/g) || [];
  assert.deepEqual(hosts, [
    '<a class="button" href="#participate" data-si-ripple>',
    '<button class="button join-submit" type="submit" data-si-ripple>',
  ]);
  assert.ok(html.includes('<link rel="stylesheet" href="/assets/product/si-ripple.css">'));
  assert.ok(html.includes('<script src="/assets/product/si-ripple.js" defer></script>'));
  for (const page of ['organizations.html', 'about.html', 'ecosystem.html', 'manage.html', 'subscribe/index.html']) {
    assert.doesNotMatch(await read(page), /data-si-ripple/, page);
  }
});

test('Hover Lift is linked with root-absolute paths; si-motion is not linked on live pages', async () => {
  for (const page of ['index.html', 'organizations.html', 'about.html', 'ecosystem.html']) {
    assert.ok((await read(page)).includes('<link rel="stylesheet" href="/assets/product/motion-lift.css">'), page);
  }
  for (const page of ROOT_PAGES) assert.doesNotMatch(await read(page), /si-motion\.(css|js)/, page);
});

test('org/* profile pages carry no card motion', async () => {
  const dirs = await readdir(new URL('../org/', import.meta.url));
  assert.ok(dirs.length > 0);
  for (const dir of dirs) {
    const html = await read(`org/${dir}/index.html`);
    assert.doesNotMatch(html, /motion-lift|motion-ecosystem|si-cluster-motion|si-ripple/, dir);
  }
});

test('homepage pre-hide never reaches .product-actions rendered inside directory cards', async () => {
  const css = stripComments(await read('assets/product/motion-home.css'));
  const js = await read('assets/product/motion-home.js');
  const preHide = /([^{}]*)\{\s*visibility:\s*hidden;?\s*\}/.exec(css.slice(css.indexOf('.js-motion .hero-copy')));
  assert.ok(preHide, 'pre-hide rule found');
  const sels = preHide[1].split(',').map(s => s.trim()).filter(Boolean);
  const actions = sels.filter(s => s.includes('.product-actions'));
  assert.deepEqual(actions, ['.js-motion #participate > .shell > .product-actions']);
  assert.doesNotMatch(css, /#participate\s+\.product-actions/, 'descendant form would hide commons.js card actions');
  assert.doesNotMatch(css, /\.org-card|\.org-list|\[data-org-list\]/, 'directory cards are never pre-hidden');
  // GSAP targets the same direct-child group, so CSS and JS stay in step.
  assert.ok(js.includes('"#participate .join-intro, #participate > .shell > .product-actions"'));
  assert.doesNotMatch(js, /#participate \.product-actions/);
  // The static group is a direct child of #participate > .shell in index.html; card actions are created by commons.js.
  const html = await read('index.html');
  assert.match(html, /id="participate"><div class="shell"><div class="join-intro">[\s\S]*?<\/div><div class="product-actions">/);
  const commons = await read('assets/product/commons.js');
  assert.match(commons, /el\('div',undefined,'product-actions'\)/);
});

test('ecosystem opt-in parses the query with URLSearchParams (no regex)', async () => {
  const gen = await read('scripts/build-org-pages.mjs');
  const eco = await read('ecosystem.html');
  for (const src of [gen, eco]) {
    assert.match(src, /new URLSearchParams\(location\.search\)/);
    assert.match(src, /q\.get\("done"\)!=="1"&&q\.get\("motion"\)!=="done"/);
    assert.doesNotMatch(src, /\(done=1\|motion=done\)/);
  }
});
