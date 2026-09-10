# Read Your Sheet — working notes

Chrome MV3 extension. Soft-blocks distracting sites while the Chrome Reading
List backlog is growing faster than it's being read. Personal tool, not a
product. See README.md for install and usage.

## Commands

```bash
./test/run.sh        # logic tests, exits non-zero on failure
./docs/build.sh      # regenerate README screenshots from staged data
./icons/build.sh     # re-rasterize icon PNGs after editing icons/icon.svg
./package.sh         # build dist/*.zip for Chrome Web Store upload
```

`package.sh` strips `key` from the packaged manifest — the store rejects a first
upload containing one — and refuses to produce a zip if dev files, a `.pem` or a
stray `key` leak in. Store listing copy is in `docs/store-listing.md`.

There is **no build step, no package.json, and no node on this machine.**
Headless Chrome is the only JS runtime available — that's what runs the tests
and rasterizes the icons. Don't reach for npm/vitest; extend `test/cases.js`.

To reload after editing: `chrome://extensions` → reload the extension's card.

**Reloading is per-context, and the asymmetry is a trap.** Extension pages
(popup, options, nag screen) and every module they import are read from disk
each time the page opens, so edits there are live immediately. The service
worker and `manifest.json` are not — they keep their loaded code until the
extension is reloaded, including after a `git pull`.

So a page and the worker can run **different versions of the same `lib/`
module**. That has already produced one hard-to-read bug: the options page was
new code writing settings to `storage.sync` while the worker was old code
reading `storage.local`, so unchecking Enabled saved correctly and changed
nothing, and `migrateSettings()` — which lives in the worker — hadn't run to
reconcile them either.

Rule of thumb: if observed behaviour and stored state disagree, suspect a stale
worker before suspecting the logic. Ask "did you reload the extension?" first.

To diagnose rather than guess, the service worker console has
`await rys.why(url)` — it returns the gate verdict plus the settings and local
state behind it. Note that the console on the `chrome://extensions` *page* is not
the worker's; the card's blue `service worker` link opens the right one.

## Design invariants

Deliberate decisions, not accidents. Check before changing:

- **Soft nag, never a hard block.** Delay + numbers + an offer to read something
  instead, then let the user through. Bypass is meant to be possible, just
  slightly expensive. Don't add uninstall-proofing or make escape harder unless
  asked.
- **Ratio, not a fixed threshold.** Blocks on net growth (saved − read over a
  rolling window). The unread ceiling exists but ships off by default.
- **Settings sync, everything else is local.** `chrome.storage.sync` holds only
  `settings`. The ledger, snapshot, snoozes, allowances and `pausedUntil` stay
  in `local` — they're per-machine facts, and the ledger would blow the 8 KB
  sync quota anyway. `migrateSettings()` handles the pre-sync layout.
  The principle is **configuration follows you, permission to slip doesn't**:
  syncing a snooze would let one countdown buy a bypass on a machine you aren't
  sitting at. Re-confirmed 2026-09-10 after it was mistaken for a sync bug — do
  not "fix" it by syncing snoozes or pause unless explicitly asked.
- **The ledger exists because the API has no history.** `chrome.readingList`
  exposes current state only, and most reading happens on a phone where this
  service worker is asleep. `reconcile()` diffs against a stored snapshot on
  events, on startup, and on a 5-minute alarm. It must stay idempotent.
- **Unread reading-list URLs are always allowed** on a blocked domain, scoped to
  the exact canonical URL and expiring in an hour. Without this you could never
  clear saved links on a blocked site.

## Gotchas that have already bitten

- **`manifest.json` must keep its `key` field.** It pins the extension ID.
  Without it an unpacked extension's ID comes from its load path, so every
  machine gets a different ID and therefore a different `chrome.storage.sync`
  bucket — sync silently does nothing. Removing or regenerating `key` changes
  the ID, which orphans all existing storage and requires removing and
  re-adding the unpacked extension.
- **Sync conflicts are last-writer-wins per key, and all settings share one
  key.** Simultaneous edits on two machines lose one side wholesale instead of
  merging. Splitting `settings` into one key per field would fix it.
- **Host permissions cannot sync and are per-profile.** A blocklist synced from
  another machine is inert until each site is granted there — and a site without
  permission is silently not blocked, because `webNavigation` never fires. The
  badge and the popup's Grant access button exist for exactly this.
- **Blocked sites are SPAs.** `onBeforeNavigate` alone misses clicking through to
  the next video; `onHistoryStateUpdated` is what catches it.
- **A blocked tab's URL becomes the nag screen**, so it can't retry the site by
  itself — reloading just re-renders the nag. `blocked.js` re-evaluates on load
  and on `visibilitychange` and releases the tab when the gate has gone. This is
  why the block decision lives in `lib/gate.js` rather than inline in `guard()`:
  the service worker and the nag screen must answer it identically.
- **Chrome can only add the *current tab* to the Reading List** (side panel, or
  right-click a tab). There is no "save this link" for an unopened URL. So you
  cannot save a blocked site's page while it's blocked — you never get a tab on
  it. The escape hatch is reached by links saved from mobile and synced, or
  saved before the gate closed. Test it that way; don't try to save while
  blocked.
- **Don't add "Save this for later" to the nag screen.** Saving the blocked URL
  would make it an unread entry, which the escape hatch then lets straight
  through — a one-click bypass cheaper than the countdown.
- **Reading List entries are keyed by exact URL**, query string included. Always
  compare via `canonicalize()` from `lib/url.js`. It strips `www.`/`m.`/`mobile.`
  hosts, because a link saved on a phone is `m.youtube.com` while the desktop
  lands on `www.youtube.com` — that mismatch silently broke the escape hatch
  once. Note that blocklist *grouping* is subdomain-tolerant while hatch
  *matching* is exact, so a link can be listed on the nag screen and still be
  blocked when clicked. That asymmetry is what makes the bug confusing.
- **The gate asks the Reading List live, not the snapshot.** The snapshot exists
  for the ledger and can lag a phone sync by a reconcile interval, which would
  block a link the nag screen is actively offering.
- **Don't screenshot an `.svg` with headless Chrome.** It renders at the root
  element's width/height then *crops* to `--window-size` rather than scaling.
  `icons/build.sh` goes through an HTML wrapper for this reason.

## Screenshots

`./docs/build.sh` captures them from the real UI with staged data, never from a
live profile — that would leak the actual Reading List into a public repo.

`docs/fixture.js` deliberately puts one blocked site in each row state (allowed
links / snoozed / plain gated / needs access) so the settings screenshot shows
all of them at once. Keep that property when editing it.

Two traps this script already works around, both of which produced silently
wrong images before:

- `scrollHeight` floors at the viewport height, so short pages measure far too
  tall. `docs/measure.js` measures the body box instead.
- `blocked.html` sizes its top padding in `vh`, so its height depends on the
  viewport it was measured in. `build.sh` measures twice to converge.
