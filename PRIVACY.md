# Privacy Policy — Read Your Sheet

_Last updated: 10 September 2026_

**Read Your Sheet collects nothing, sends nothing, and has no servers.**

## What the extension reads

To do its job it needs two things, both from your own browser:

- **Your Chrome Reading List** — the titles, URLs and read/unread state of your
  saved items. It counts how many you have saved and read recently, and lists
  unread items on the block screen so you can open one.
- **Navigations on sites you have added to your block list** — and only those.
  Access to each site is requested individually when you add it, and Chrome
  will not report navigations on any site you have not approved.

## Where that information goes

Nowhere. It is used in the browser, in the moment, and stored only in the
browser's own extension storage:

- **`chrome.storage.local`** holds your counters, per-site snooze timers and
  temporary allowances. This never leaves the device.
- **`chrome.storage.sync`** holds your settings — the block list, thresholds,
  delay and snooze length — so they follow you between your own computers.
  Chrome replicates this through your Google account, the same way it syncs
  your bookmarks. It is never sent to the extension's author or to anyone else.

There is no analytics, no telemetry, no crash reporting, no advertising, no
tracking, and no third-party code of any kind. The extension makes no network
requests whatsoever — you can verify this in DevTools, or read the source.

## Your data is yours

Removing the extension deletes everything it stored. Your Reading List is
Chrome's, not the extension's, and is untouched by removal.

## Source code

The full source is public at
<https://github.com/sandlex/readyoursheet>.

## Contact

Questions or concerns: open an issue at
<https://github.com/sandlex/readyoursheet/issues>.
