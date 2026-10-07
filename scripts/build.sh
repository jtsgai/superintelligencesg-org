#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$project_root/dist/server" "$project_root/dist/.openai"
node --input-type=module - "$project_root" <<'NODE'
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const root=process.argv[2];
const logo=(await readFile(path.join(root,'assets/logo-org.svg'))).toString('base64');
let worker=await readFile(path.join(root,'worker/index.js'),'utf8');
for(const [token,file] of Object.entries({SITE_HTML:'index.html',ORGANIZATIONS_HTML:'organizations.html',ABOUT_HTML:'about.html',MANAGE_HTML:'manage.html'})){
 const html=(await readFile(path.join(root,'dist-source',file),'utf8')).replaceAll('__ORG_LOGO__',logo);
 worker=worker.replace('"__'+token+'__"',JSON.stringify(html));
}
const assets={};
for(const [file,type] of [['assets/logo-org.svg','image/svg+xml'],['assets/product/commons.js','text/javascript; charset=utf-8'],['assets/product/commons.css','text/css; charset=utf-8'],['assets/product/si-motion.js','text/javascript; charset=utf-8'],['assets/product/si-motion.css','text/css; charset=utf-8'],['assets/product/si-mobile-nav.css','text/css; charset=utf-8'],['robots.txt','text/plain'],['sitemap.xml','application/xml']])assets['/'+file]={body:await readFile(path.join(root,file),'utf8'),type};
worker=worker.replace('"__ASSETS__"',JSON.stringify(assets));
await writeFile(path.join(root,'dist/server/index.js'),worker);
await copyFile(path.join(root,'.openai/hosting.json'),path.join(root,'dist/.openai/hosting.json'));
NODE
