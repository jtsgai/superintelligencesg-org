# SI Commons MCP connector

Copyright (c) 2026 JT M&C PTE. LTD. All rights reserved. See [COPYRIGHT](COPYRIGHT).

Read-only [Model Context Protocol](https://modelcontextprotocol.io) server for the public Superintelligence SG directory. It is a standalone Cloudflare Worker. The only upstream it calls is `https://api.superintelligencesg.org`. It has no database and it does not write directory data.

The Streamable HTTP endpoint is `POST /mcp` on:

- production: `https://si-commons-mcp.superintelligencesg.workers.dev/mcp`
- test: `https://si-commons-mcp-test.superintelligencesg.workers.dev/mcp` (for reviewers and testing only)

Both run on Cloudflare's `workers.dev` subdomain (`superintelligencesg`). No custom domain is used, and the `superintelligencesg.org` DNS (Namecheap) and website (GitHub Pages) are not involved.

This package is not deployed from the repository workflow. It was deployed manually on 28 October 2026.

## Tools

All five tools are read-only. None of them ask for a user account.

| Tool | What it returns | Upstream |
| --- | --- | --- |
| `search_sg_ai_orgs` | Organisation summaries (`id`, `name`, `kind`, `founder`, `description`, `url`, `source_url`, evidence status, `updated`) and `total` | `GET /v1/entries?type=organization` with `q`, `kind`, `lens`, `origin`, `sort`, `limit` |
| `get_org` | One full organisation record, including evidence history when the directory has it | `GET /v1/entries?type=organization`, then a local id match. The API has no `/v1/entries/{id}` route |
| `ecosystem_stats` | `total`, `by_type`, `by_kind` | `GET /v1/stats` |
| `recent_changes` | Latest change records with dates, evidence status, and source URLs | `GET /v1/changes?limit=` |
| `match_sg_ai_partners` | Organisations ranked against a need, with a short why taken from the record fields | `GET /v1/entries?type=organization`, then local ranking |

`q` is limited to 120 characters, the same cap the API applies. `limit` on these tools is 1–50 and defaults to 10. The API itself allows a limit up to 500; this connector does not.

Search text is matched by the API against name, founder, description, and kind. `sort` is `name` or `updated`. `origin` is `curated` or `commons`. A bad value produces the API's own 400 message (`Sort by name or updated.`, `Choose origin curated or commons.`, `Choose a valid record type.`, and so on) as an `invalid_argument` tool error.

Every tool result includes `as_of` and `source_url`. `as_of` is the record `updated` date (or the change date). `/v1/stats` does not include a date, so `ecosystem_stats` returns `as_of: null`.

Upstream HTTP 404, and `get_org` when the id is absent, return `not_found`. HTTP 5xx, a non-JSON body, a redirect, or a timeout (5 seconds) return `upstream_unavailable` with `retryable: true`.

`match_sg_ai_partners` scores name, kind, description, and founder only. Listings affiliated with the founder (JT M&C, Red Fun Planet, and their public hostnames) are labelled and receive no extra score. The disclosure text is on the result.

## Auth and limits

Callers send `Authorization: Bearer <key>`. There is no user login and no OAuth.

The Worker reads one secret for the environment it is running as:

- production (`ENVIRONMENT=production`): secret `MCP_API_KEY`
- test (`ENVIRONMENT=test`): secret `MCP_API_KEY_TEST`

A key from the other environment is rejected. If the secret for this environment is missing, the Worker returns HTTP 503 and does not serve tools.

The Worker allows 60 authenticated MCP requests per minute per environment, in memory, inside each isolate. That counter resets when the isolate restarts and is not shared across isolates. The test environment can set `RATE_LIMIT_PER_MINUTE` from 1 to 60; production always uses 60. HTTP 429 responses include `Retry-After`.

Public responses that do not contain search text are cached in memory for 5 minutes (`/v1/stats`, the full organisation list, and `/v1/changes?limit=`). URLs that contain `q`, `kind`, or `lens` are not cached. Nothing is written to disk.

Application logs are one JSON line per request with `ts`, `tool`, `status`, and `latency_ms`. They do not include the query, tool arguments, API key, or IP address. CORS preflight requests are not logged.

## Privacy

[PRIVACY.md](PRIVACY.md) is the draft privacy policy. It is not a substitute for publishing that text at a public URL before a Muse submission.

## Local test

From this directory, with Node.js 22 or newer:

```bash
npm ci
npm test
```

To exercise the Worker against the live public API:

```bash
cp .dev.vars.example .dev.vars
# .dev.vars contains MCP_API_KEY=local-dev-key
npx wrangler@4 dev --env=""
```

Wrangler serves `http://127.0.0.1:8787`. In another shell:

```bash
curl -sS http://127.0.0.1:8787/mcp \
  -H 'Authorization: Bearer local-dev-key' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"local","version":"0.0.1"}}}'

curl -sS http://127.0.0.1:8787/mcp \
  -H 'Authorization: Bearer local-dev-key' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_sg_ai_orgs","arguments":{"query":"governance","limit":5}}}'
```

The `Accept` header must include both `application/json` and `text/event-stream`. The Worker answers with a single JSON-RPC body (Streamable HTTP JSON response mode), not an SSE stream. `GET` and `DELETE` on `/mcp` return 405. This connector does not keep an MCP session.

For the test environment locally, copy `.dev.vars.test.example` to `.dev.vars.test` and run `npx wrangler@4 dev --env test`. That process expects `MCP_API_KEY_TEST`.

`GET /` returns `{ "service": "si-commons-mcp", "mcp": "/mcp", "read_only": true }` and does not require a key.

## Deploy

Deploy is a manual step for an operator who can publish Workers on the Cloudflare account (`superintelligencesg@gmail.com`). The deploy token needs only Account → Workers Scripts → Edit; no zone, route or DNS permission is needed. Do not put keys in git or in `wrangler.toml`.

```bash
cd mcp
npx wrangler@4 secret put MCP_API_KEY --env=""
npx wrangler@4 deploy --env=""

npx wrangler@4 secret put MCP_API_KEY_TEST --env test
npx wrangler@4 deploy --env test
```

`--env=""` selects the top-level production Worker. Wrangler warns if you deploy while `env.test` exists and no environment was named.

Set only `MCP_API_KEY` on the production Worker and only `MCP_API_KEY_TEST` on the test Worker. Give the test key and the test hostname to reviewers through the host's credential flow, not by email. `wrangler.toml` sets `workers_dev = true` for both Workers and defines no `routes` or `custom_domain`, so each Worker is served only at `https://<name>.superintelligencesg.workers.dev`. The `superintelligencesg.org` zone is not on Cloudflare (DNS is at Namecheap), so custom-domain routes cannot be used from this account. Moving to a custom subdomain later needs a DNS change and a separate approval.

After deploy, repeat the curl example against `https://si-commons-mcp.superintelligencesg.workers.dev/mcp` with the production key, and against the test URL with the test key. A request without a key must return 401.

## Layout

- `src/index.js` — HTTP auth, rate limit, host check, logging
- `src/server.js` — MCP server and Streamable HTTP transport (`@modelcontextprotocol/sdk` 1.32.2)
- `src/directory.js` — tool behaviour
- `src/si-api.js` — public API client
- `src/rank.js` — partner ranking
- `test/` — `node --test` suite

## Unresolved

- The API still has no `GET /v1/entries/{id}`. `get_org` filters the organisation list. A direct route would need a separate change to the existing API Worker.
- Deploys are manual; CI does not deploy this connector.
- Muse approval of a public-directory connector is not guaranteed. The partner-ranking tool is included so the connector is more than a list of links. Approval still depends on Meta's review.
- A no-auth connector is not confirmed as acceptable, so this server requires an API key.
- The Muse connector terms were not reviewed here.
- [PRIVACY.md](PRIVACY.md) is still a draft. The publication date is a placeholder, and the page is not yet on `superintelligencesg.org`.
- The 60-request limit is per isolate, not a single global counter.
- The in-memory cache does not store search text. The public API still sends `Cache-Control: max-age=300` on its own responses.
