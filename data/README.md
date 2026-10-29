# Shared data layer (Phase A)

Curated, Git-reviewed records served by the Commons API at `/api/v1/*`.

| File | Contents | Seeded from |
|---|---|---|
| `entries.json` | 100 Navigator references | `superintelligencesg-com/assets/product/organizations.json` (moved, no new facts) |
| `changes.json` | Change Brief entries | `superintelligencesg-com/changelog.html` |
| `signals.json` | Signals | Signals block on `superintelligencesg-com/index.html` |

Source Radar stays in `assets/product/source-radar.json` (written by the maintenance workflow) and is served at `/api/v1/radar`.

Every record carries `source_url`, `evidence.status`, `checked_at`, `conclusion` and `action`.

- `evidence.status: "needs_review"` means the record was moved from an existing page and has not had an individual source check. Its `checked_at`, `conclusion` and `action` stay `null` until a reviewer fills them in. Don't generate them.
- Any other status requires an https `source_url` and a `checked_at` date.
- The API adds a presentation-only `review_label: "Needs review"` to needs_review records. It never affects order or inclusion.

Run `node scripts/validate-data.mjs` (it is part of `npm test`). It checks the schemas in `schema/`, the source_url rule, and the no-ranking lint ("top", "best", "#1", "leading", "AI ecosystem").

Entries support `type`: `organization`, `event`, `funding`, `gov_initiative`, or
`person`. Omitted types default to `organization` in API responses. Every new
non-organization record requires an HTTP/HTTPS `source_url` and a real calendar
`checked_at` date (`YYYY-MM-DD`), including records marked `needs_review`.
Legacy organization provenance rules remain in place.

Person records contain `id`, `type`, `name`, `public_role`, `organisation`,
`source_url`, and `checked_at`; optional metadata is `kind`, `updated`, and
`lenses`. Contact fields, free-form descriptions, and other properties are
rejected. Editors must use public-role information from the cited source and
must not put private information into any permitted field.

New types use Git-reviewed `data/entries.json` storage. The shared pure
`validateRecord` export in `worker/index.js` guards data validation, seeding,
bundling, and Worker ingestion (including edge-cache reads). Invalid ingested
records produce HTTP 400 JSON rather than silently falling back. Organization
form endpoints remain organization-only and reject submitted non-organization
types rather than dropping their type/provenance. Organization submissions store
an optional `source_url` on `organization_details`. At least one of `source_url`
and `website_url` is required; `source_url` is preferred, and `website_url` is
the source only when `source_url` is empty. Existing rows are not backfilled.

`GET /api/v1/entries?type=event` filters by type, combined with the existing
filters, sorting, and limit. `/v1/entries` is an alias. Unknown or empty `type`
values return HTTP 400. The response remains `{version, sort, count, total, entries}`.

`GET /api/v1/stats` (also `/v1/stats`) returns
`{version, total, by_type, by_kind}` for all available curated and published
Commons entries, independent of query filters. All types appear, including zero
counts; entries without a kind count under `Unspecified`. Commons retains its
existing 500-profile read cap, so these are counts of the API dataset.

Non-feed API reads retain the own-domain CORS allowlist and
`Cache-Control: public, max-age=300, stale-while-revalidate=86400` for v1. Bogus
origins return HTTP 400. The existing public JSON Feed CORS exception remains.

`source_url` and `updated` are the canonical source and updated-at fields for
entries (`date` for changes and signals). Do not add a parallel `updated_at`;
the `evidence.*` copies only mirror them at review time.

`node scripts/check-sources.mjs` (read-only; `--md --out <file>` for a report,
`--strict` to fail on a missing source) lists records whose source is missing,
still `needs_review`, homepage-only or stale. After editing `entries.json`, run
`node scripts/build-org-pages.mjs` to regenerate `org/<slug>/index.html` and
`ecosystem.html`; `npm test` fails if they are out of date.
