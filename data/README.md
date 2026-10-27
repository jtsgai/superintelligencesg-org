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
