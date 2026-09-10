# After the store item goes live

Ordered roughly by dependency. Item 1 is the one that needs a decision rather
than a keystroke.

---

## 1. Decide what happens to `key` in the manifest — don't just delete it

The instinct is to remove it now the store has assigned its own. That would be a
small regression, so it's worth a deliberate choice between three options:

| Option | Local unpacked ID | Consequence |
| --- | --- | --- |
| **Delete `key`** | derived from folder path | Different on every machine, so the dev build's `storage.sync` stops syncing — the exact bug we fixed by adding it |
| **Keep our key** *(recommended)* | stable `ifkne…` | Dev build is stable and **separate** from the published one, so experiments can't corrupt real settings |
| **Use the store's key** | same as published `hadmaj…` | Dev and published share an identity; unverified whether Chrome will load an unpacked copy whose ID matches an installed store extension |

`package.sh` already strips `key` from every upload, so keeping it costs nothing
and never reaches the store. Recommendation: **keep it**. A dev sandbox with its
own storage is a feature, not an accident.

## 2. Switch to the store build

- [ ] Install from the store on both laptops
- [ ] **Remove the unpacked copies** — otherwise two extensions gate every
      navigation independently, each with its own blocklist and counters
- [ ] Re-enter settings once on one machine. This is the final reset; the ID
      never changes again after this
- [ ] Confirm the other laptop picks the settings up — first real proof that
      sync works, since until now the two machines had different IDs

When developing later: disable the store version while the unpacked one is
loaded, or both will fire.

## 3. Update the repo Website field

- [ ] `gh repo edit --homepage https://chromewebstore.google.com/detail/hadmajghlhbpcopcakkcggdmaejnohlc`

Only once the listing actually renders — while pending it shows as unavailable.

## 4. Publishing GitHub Action

Prerequisites, in order:

- [ ] Google Cloud project → enable the Chrome Web Store API
- [ ] OAuth client (Desktop app) → client ID + secret
- [ ] **Set the OAuth consent screen to "In production"** — left in "Testing",
      refresh tokens expire after 7 days and the workflow silently rots
- [ ] One manual browser round-trip to mint the refresh token
- [ ] Repo secrets: client ID, client secret, refresh token
      (the extension ID is public, no secret needed)

Then the workflow itself:

- [ ] Bump version, build with `package.sh`, upload, publish
- [ ] Cut a GitHub Release with the changelog section as the body
- [ ] **Scheduled keepalive** — a refresh token unused for 6 months dies, and
      releases here will be infrequent enough to hit that

## 5. Decide the version scheme before the first automated release

Currently `0.1.0`. The plan was plain incrementing integers.

`"1"` is a valid manifest version and sorts above `0.1.0` (compared
component-wise, `1 > 0`), so switching works — but decide before wiring the
workflow, since the bump step depends on the format.

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
- **`CHANGELOG.md` doesn't exist yet** and the release workflow wants one.
