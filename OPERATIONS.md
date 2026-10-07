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
