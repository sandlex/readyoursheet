# Changelog

Notable changes per release. The release workflow moves whatever is under
**Unreleased** into a new version heading and uses it as the GitHub Release
body, so it refuses to run if that section is empty.

## [Unreleased]

## [0.1.0] — 2026-09-17

First published release.

- Soft-blocks a user-defined list of sites while the Chrome Reading List
  backlog grows faster than it is read
- Blocks on net growth over a rolling window rather than a fixed backlog size,
  with an optional total-unread ceiling that ships off
- Nag screen showing the current numbers, a countdown, and unread saved items
  from the blocked domain
- Escape hatch: anything currently unread in the Reading List opens even on a
  blocked site, scoped to that exact URL for an hour
- Settings sync between machines through the signed-in Google account; snoozes,
  pause and per-URL allowances stay per-machine by design
- Per-site host permissions requested as sites are added, never up front
