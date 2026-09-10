# Chrome Web Store listing — copy for the dashboard

Paste-ready text for each field. Regenerate the images with `./docs/build.sh`
and the upload package with `./package.sh`.

---

## Store listing tab

**Name** (from the manifest, not editable in the dashboard)

```
Read Your Sheet
```

**Short description** (from the manifest, max 132 — currently 90)

```
Soft-blocks distracting sites when your Chrome Reading List grows faster than you read it.
```

**Category:** Productivity → Workflow & Planning
**Language:** English

**Detailed description**

```
You save things to read later. You do not read them. Then you open YouTube.

Read Your Sheet watches your Chrome Reading List, and when the pile is growing
faster than you are clearing it, the sites you have chosen stop opening —
until you catch up.

It is a nag, not a wall. When a blocked site is gated you get a screen with
your actual numbers, a short countdown, and a list of the things you saved and
never read. You can go through anyway. You just have to look at the pile first.

HOW IT DECIDES

Blocking is based on a ratio, not a fixed backlog size: by default it kicks in
once you have saved 3 more items than you have read over the last 7 days. A
fixed threshold punishes people who save a lot and lets a stagnant backlog
slide forever. Net growth tracks the thing that actually matters — the pile
getting bigger — and it clears itself the moment you catch up. There is also an
optional total-unread ceiling, off by default.

Everything is adjustable: which sites, the rolling window, how strict, how long
the countdown is, and how long a site stays open after you push past it.

IT DOES NOT TRAP YOUR SAVED LINKS

If five things in your Reading List are YouTube videos and YouTube is blocked,
you would never be able to clear them. So anything currently unread in your
Reading List always opens, even on a blocked site — the block screen lists
those links first. The exemption covers that one page, not the whole site, so
when the video ends and autoplay moves on, you are back at the block screen.

PRIVATE BY CONSTRUCTION

No account, no servers, no analytics, no network requests at all. Your Reading
List is read in the browser and stays there. Your settings sync between your
own computers through your Google account, the same way your bookmarks do.

Access is requested per site, one at a time, as you add them — the extension
cannot see any site you have not explicitly approved.

Open source: https://github.com/sandlex/readyoursheet

REQUIREMENTS

Chrome 120 or newer, on desktop. Uses Chrome's built-in Reading List, so
nothing to set up beyond choosing which sites to gate.
```

**Images** — all generated into `docs/store/`

| Field | File |
| --- | --- |
| Screenshot 1 | `docs/store/1-nag.png` (1280×800) |
| Screenshot 2 | `docs/store/2-settings.png` (1280×800) |
| Screenshot 3 | `docs/store/3-popup.png` (1280×800) |
| Small promo tile | `docs/store/promo-440x280.png` (440×280) |

---

## Privacy practices tab

**Single purpose** — must be narrow and concrete; vague answers get rejected

```
Blocks a user-chosen list of websites while their Chrome Reading List backlog
is growing faster than they are reading it, and shows their unread saved items
instead.
```

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `readingList` | The extension's core input. It counts how many items the user has saved versus read over a rolling window to decide whether to block, and lists their unread saved items on the block screen so they can open one instead. |
| `storage` | Stores the user's own settings (block list, thresholds, countdown length) and their local reading counters. `storage.sync` is used so settings follow the user between their own computers. No data leaves the browser. |
| `alarms` | Runs a periodic check that reconciles the Reading List against the last known state. This is required because reading usually happens on a phone, and the service worker is asleep when those changes sync in, so the counters would otherwise be wrong. |
| `webNavigation` | Detects when the user navigates to a site on their own block list so the tab can be redirected to the extension's block screen. Also needed for `onHistoryStateUpdated`, because blocked sites are single-page apps where clicking to the next video issues no new page request. |
| Host permissions (`*://*/*`, optional) | Declared as **optional** and never granted up front. Chrome prompts for one specific site at a time, only when the user adds that site to their block list, and the permission is removed when they remove the site. It is needed because `webNavigation` only reports navigations on hosts the extension has access to. The extension has no access to any site the user has not explicitly approved, and reads no page content on any site. |

**Data usage** — tick that the extension does **not** collect or transmit any
of the listed categories, and certify compliance. Nothing is sent anywhere.

**Privacy policy URL**

```
https://github.com/sandlex/readyoursheet/blob/main/PRIVACY.md
```

---

## Distribution tab

**Visibility:** Unlisted — installable by link, not listed or searchable.
**Regions:** all.

---

## Submission checklist

- [ ] `./test/run.sh` passes
- [ ] `./docs/build.sh` run, images current
- [ ] `./package.sh` run, zip in `dist/`
- [ ] Package contains no `key` — `package.sh` fails the build if it does
- [ ] Version bumped past the last published one
