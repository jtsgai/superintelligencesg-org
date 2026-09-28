#!/usr/bin/env bash
set -euo pipefail
project_root=$(cd "$(dirname "$0")/.." && pwd)
dist_root="$project_root/dist"
rm -rf "$dist_root"
mkdir -p "$dist_root/server" "$dist_root/.openai"
node --input-type=module - "$project_root" <<'NODE'
import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
const root = process.argv[2];
const hero = (await readFile(path.join(root, "assets/org-hero-v2.jpg"))).toString("base64");
const logo = (await readFile(path.join(root, "assets/logo-org.svg"))).toString("base64");
const html = (await readFile(path.join(root, "dist-source/index.html"), "utf8")).replace("__HERO_IMAGE__", hero).replace("__ORG_LOGO__", logo);
const organizationsHtml = (await readFile(path.join(root, "dist-source/organizations.html"), "utf8")).replace("__ORG_LOGO__", logo);
const aboutHtml = (await readFile(path.join(root, "dist-source/about.html"), "utf8")).replace("__ORG_LOGO__", logo);
const worker = await readFile(path.join(root, "worker/index.js"), "utf8");
if (!worker.includes('"__SITE_HTML__"')) throw new Error("Worker HTML placeholder is missing.");
if (!worker.includes('"__ORGANIZATIONS_HTML__"')) throw new Error("Organizations HTML placeholder is missing.");
if (!worker.includes('"__ABOUT_HTML__"')) throw new Error("About HTML placeholder is missing.");
await writeFile(path.join(root, "dist/server/index.js"), worker.replace('"__SITE_HTML__"', JSON.stringify(html)).replace('"__ORGANIZATIONS_HTML__"', JSON.stringify(organizationsHtml)).replace('"__ABOUT_HTML__"', JSON.stringify(aboutHtml)));
await copyFile(path.join(root, ".openai/hosting.json"), path.join(root, "dist/.openai/hosting.json"));
NODE
echo "Built $dist_root"
