# Read Your Sh*t — working notes

Chrome MV3 extension. Soft-blocks distracting sites while the Chrome Reading
List backlog is growing faster than it's being read. Personal tool, not a
product. See README.md for install and usage.

## Commands

```bash
./test/run.sh        # logic tests, exits non-zero on failure
./docs/build.sh      # regenerate README screenshots from staged data
./icons/build.sh     # re-rasterize icon PNGs after editing icons/icon.svg
```

There is **no build step, no package.json, and no node on this machine.**
Headless Chrome is the only JS runtime available — that's what runs the tests
and rasterizes the icons. Don't reach for npm/vitest; extend `test/cases.js`.

To reload after editing: `chrome://extensions` → reload the extension's card.

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
- **The ledger exists because the API has no history.** `chrome.readingList`
  exposes current state only, and most reading happens on a phone where this
  service worker is asleep. `reconcile()` diffs against a stored snapshot on
  events, on startup, and on a 5-minute alarm. It must stay idempotent.
- **Unread reading-list URLs are always allowed** on a blocked domain, scoped to
  the exact canonical URL and expiring in an hour. Without this you could never
  clear saved links on a blocked site.

## Gotchas that have already bitten

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
- **Reading List entries are keyed by exact URL**, query string included. Always
  compare via `canonicalize()` from `lib/url.js`.
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
