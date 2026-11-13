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
