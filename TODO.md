# After the store item goes live

Ordered roughly by dependency. Item 1 is the one that needs a decision rather
than a keystroke.

---

## 1. `key` in the manifest — decided 2026-09-17: keep it

Kept. The local unpacked build has a stable `ifkne…` ID, separate from the
published `hadmaj…`, so dev experiments cannot corrupt real settings.
`package.sh` strips it from every upload, so it never reaches the store.

## 2. Switch to the store build

- [x] Install from the store on both laptops — done 2026-09-17
- [ ] **Remove the unpacked copies** — otherwise two extensions gate every
      navigation independently, each with its own blocklist and counters
- [ ] Re-enter settings once on one machine. This is the final reset; the ID
      never changes again after this
- [ ] Confirm the other laptop picks the settings up — first real proof that
      sync works, since until now the two machines had different IDs

When developing later: disable the store version while the unpacked one is
loaded, or both will fire.

## 3. Update the repo Website field — done 2026-09-17

- [x] Repo Website set to the listing
- [x] README now leads with the store install; running from source moved into a
      collapsed section for development

## 4. Publishing GitHub Action

Prerequisites, in order:

- [x] Google Cloud project → enable the Chrome Web Store API
- [x] Service account created, JSON key downloaded, email authorised under
      **Account** in the dev console — done 2026-10-01
- [x] Switched from OAuth refresh tokens to the service account, so nothing
      expires and the keepalive workflow is gone
- [ ] Add the two repo secrets: `CWS_SERVICE_ACCOUNT_KEY` (the whole JSON) and
      `CWS_PUBLISHER_ID` (dev console → Account)

Then the workflow itself:

- [x] Written — `.github/workflows/release.yml`, manual dispatch with a
      patch/minor/major choice. Bumps, tests, packages, uploads, publishes,
      then commits, tags and cuts a GitHub Release
- [ ] Add the four repo secrets, then do one real run to prove it end to end

## 5. Version scheme — decided 2026-09-17: semver

Staying on `MAJOR.MINOR.PATCH`. The release workflow takes a `patch`/`minor`/
`major` choice and bumps accordingly.

---

# Not blocked on the store

## Verify the escape hatch for real

Still never exercised end to end outside tests:

- [ ] Save a YouTube video from the phone, confirm it syncs to desktop
- [ ] With the gate closed, open `youtube.com` and check the video is listed
      under "You saved 1 from youtube.com"
- [ ] Click it — should play
- [ ] Let autoplay roll to the next video — **that** should be caught

The `m.youtube.com` vs `www.youtube.com` fix is only covered by tests so far.

## Known limitations worth revisiting

- **Sync conflicts are last-writer-wins per key, and every setting shares one
  `settings` key.** Editing the delay on one laptop and the blocklist on the
  other within the same window loses one side wholesale. Splitting into one key
  per field would fix it. Only matters if it actually bites.
- **Nothing verifies a "read" is a read.** Marking an item read without reading
  it clears the backlog just as well. A real fix means tracking whether the URL
  was open and focused for a while. Deliberately not built — see the soft-nag
  invariant in CLAUDE.md.

