# Superintelligence SG operations

## Source Desk review

1. Open `https://superintelligencesg.com/source-desk-admin.html`.
2. Enter the admin key from the local secure file and load the queue.
3. Check the primary public source before deciding a request.
4. Set the status and write a short private review note.
5. To publish a decision, use `accepted` or `resolved`, add a public summary, and enable the Changelog checkbox.
6. Confirm the result in the public Changelog. The Navigator reviewed-updates panel uses the same published record.

Requests remain private until the final publish step. Contact emails and private review notes are never sent to the public endpoints.

## Navigator candidate drafts

For an accepted or resolved addition, use the Navigator candidate fields in the same review card. `Save as draft` keeps the proposed record private. `Ready for manual merge` marks it for an editor to add to the curated `organizations.json` index after checking the logo, category, description and source. Saving a candidate never publishes it automatically.

## Key rotation

Rotate the Sites secret only when there is a reason to do so or after an authorised administrator change. Keep the current key available until the replacement is confirmed.

1. Generate a new random key locally.
2. Update the `SOURCE_DESK_ADMIN_TOKEN` secret on the Commons API Sites project.
3. Deploy a saved API version so the new environment revision is active.
4. Replace the local file `~/.config/superintelligence-sg/source-desk-admin-token.txt` and keep it mode `0600`.
5. Run `npm run check:production` and log in to the admin page once.
6. Retire the old key only after the authenticated queue check succeeds.

The key is intentionally not stored in GitHub, the website, or the iCloud website backup.

## D1 deployment note

The `drizzle/` files in this repository are schema history and maintenance reference. The live Sites runtime uses the existing D1 schema and compatibility initialization; do not replay historical `ALTER TABLE` files against the production database.

## Ongoing ecosystem maintenance

The goal is a source-transparent Singapore AI resource: `.com` Navigator, `.org` Commons and `.ai` Lab. Routine maintenance and evidence-supported editorial updates are authorised. Keep the existing Sites projects and D1 database.

### Cloud collection — daily 10:00, fallback 11:00 Asia/Singapore

GitHub Actions in `jtsgai/superintelligencesg-org` runs `.github/workflows/ecosystem-maintenance.yml` on a hosted Ubuntu runner, independently of the local computer. It reads the three public source repositories, checks the existing live pages/API and collects titles, short excerpts and hashes of cited public sources. It checks 20 Navigator links per run. It has only repository-content and Actions read permissions; no admin key, connected user apps, database writes, deployment credentials or X posting credentials are used.

Before a run, `scripts/prepare-cloud-run.mjs` downloads the newest available `ecosystem-maintenance-state` artifact from this workflow. It restores `watch-state.json`, the reference cursor and pending issues. Scheduled invocations skip collection if the restored report already passed all core checks after 10:00 on the current Singapore date. Thus 11:00 is a fallback when 10:00 failed or did not run. Manual dispatch deliberately runs another diagnostic check.

Each real run keeps `latest.json`, `latest.md` and `watch-state.json` as an artifact for seven days, and puts the readable report in the run summary. These artifacts contain only public monitoring data. Core-check failures fail the run; external redirects, blocked requests and incomplete source text remain review items. The first source snapshot is an unverified baseline. GitHub scheduling can be delayed and can disable schedules after 60 days without repository activity; monitor the workflow status. There is no new Cloudflare account or D1 migration in this step.

Local maintenance should download the newest cloud artifact to a temporary directory, confirm `execution.platform=github_actions`, its timestamp and same-day applicability, then copy the verified report/state to `Growth/operations/` for review. If the 10:00 cloud run is still pending, the local 10:00 check waits for the 11:00 fallback instead of immediately repeating collection. If no usable current-day cloud report exists at 11:00, use the existing local collector. Code fixes, editorial verification, publication, X drafting/sending and iCloud synchronization remain local until their cloud write access is explicitly implemented and verified.

### Daily local review — 10:00 Asia/Singapore

At 11:00, run a fallback check only if that Singapore date’s daily maintenance did not run or remains incomplete. Read `Growth/operations/daily-run-state.json` and the report before proceeding; record running/completed/failed state and the report path. If the daily run is already complete, end quietly without another check or post. Resume incomplete steps and verify X history before any retry. If both times are missed while the computer or app is unavailable, catch-up is not guaranteed.

For a local fallback, run `node scripts/maintain-ecosystem.mjs` from this `.org` repository. It checks core pages, public API response shapes, the private queue's unauthenticated 401, all external sources cited by existing Lab HTML notes, and a rotating batch of 20 public Navigator links. It saves the latest report and source snapshots under the sibling `Growth/operations/` directory. The first successful source snapshot is a baseline, not proof that claims have been verified.

Read `Growth/operations/latest.json` and `latest.md`. A source change, redirect, short response or bot challenge requires review. Failed requests retain the prior successful snapshot. Changed hashes remain pending until an editor checks the change; after checking a source, update its `watch-state.json` entry to the reviewed observed hash and clear the pending fields. Never publish from a hash comparison alone.

Confirm service failures with a second request before modifying code. Resolve reproducible, small defects in the existing authorised workflow. Keep unrelated edits. For code changes run focused checks; for page changes check the content, internal links and mobile layout. Use current Sites skills and exact pushed commits for deployment. Recheck affected public behaviour after deployment. If a repair fails, revert only that repair where safe, preserve evidence and request needed access.

### Weekly editorial update — Thursday 10:00 Asia/Singapore

Research original public sources from IMDA, MDDI, Smart Nation, AI Singapore, Singapore universities, A*STAR, CSA and AI Verify Foundation. Start with changed and inaccessible sources in the report, then inspect recent official announcements. Record publication dates, source URLs, access method and what is actually new. Search results can locate sources; cached text and blocked requests cannot establish current programme availability. Use an official mirror or browser where appropriate.

Publish a small coherent update only when it improves the existing material: update Signals across relevant sites, refresh one Field Note, link relevant Navigator records, or correct a confirmed public index error. Separate facts and editorial interpretation. Keep original publication dates and record substantive changes in version history. Synchronise article HTML, citation text and PDF. Avoid creating duplicate articles or entries simply to show activity. New public index entries require the same source and duplicate checks as the manual merge flow.

Preserve existing organization records, including Red Fun Planet and JT M&C, and user submissions. Do not mark organization ownership or consent on anyone's behalf. Source Desk requests remain in the review workflow. Recurring X publication from the official Superintelligence SG account is now authorised. After a substantive website update is confirmed live, publish one concise English post linking the updated page. Use a short thread only when needed. If there is no new update in a week, publish one useful source-supported research or resource introduction on Thursday. Keep email and LinkedIn as drafts unless separately authorised.

### Implementation and publication

Authoritative local roots: `/Users/apple/Website Studio/01_In Progress/Superintelligence SG/superintelligencesg.com`, `.org`, `.ai`. Read each site's `.openai/hosting.json` and current source before publishing. The `.org` Sites project owns the existing API/D1; retain its working runtime source. Keep `drizzle/` as local schema history; do not replay historical migrations on the existing D1 or copy them into the working Sites runtime.

Local GitHub source and Sites deployment source are separate. Commit and push the exact required files, save the matching Sites version, deploy, and verify success and affected behaviour. Do not commit `.DS_Store`, `node_modules/`, temporary reports or secrets. Keep known tracked static `dist` files consistent; never indiscriminately stage build output. Preserve current audiences. New direct Cloudflare work uses `superintelligencesg@gmail.com`; do not migrate accounts or data as part of routine maintenance.

After source changes, sync the entire Website Studio three-site source directory to `/Users/apple/Library/Mobile Documents/com~apple~CloudDocs/RFP Team/Jerry个人/Website Studio/01_In Progress/Superintelligence SG/`, excluding `.git/`, `.DS_Store`, `node_modules/`, `dist/` and keys. Check the sync exit code and changed files. Local checks are not proof of a live deployment.

### Records and notices

Save concise dated run records under `Growth/operations/runs/`: findings, verified sources, changes or no-change decision, Git commits, saved versions, deployment results and backup outcome. Keep unresolved items retrievable. Stay quiet when nothing meaningful changes; notify only on a useful published update, a failure, or needed user action. Account login, payment, schema migration, deleting organization data, personal consent and substantial positioning changes require user handling or specific authorisation. The Codex heartbeat reviews run on the user's local host. The GitHub collection workflow runs in the cloud; it does not supply unattended website editing or X publishing.

### X publication checks

Use the official `@SuperIntelSG` account only, verifying the active composer identity every time. Never use Red Fun Planet or a personal account. Inspect recent and scheduled posts before sending, preserve the existing scheduled posts, and avoid repeating a topic or link without new substance. Combine same-day changes into one post where possible. Keep the main post under 280 weighted characters, preferably in English for the Singapore audience, and link the live updated page.

Read back the posted text and save the actual permalink, date, topic and source/site link under `Growth/operations/`. If the send outcome is unknown, inspect the profile before retrying. A saved draft, a click or a scheduled task is not evidence that a post was published. Login, account switching requiring credentials, CAPTCHAs or a platform block require user handling; keep the verified draft and notify the user rather than using another account.
