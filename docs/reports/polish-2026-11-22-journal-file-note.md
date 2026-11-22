---
kind: polish
topics: [design, accessibility]
date: 2026-11-22
---
# Polish 2026-11-22: journal pages put the file picker first in the card

Picked item 3 of `polish-2026-11-21-bid-bars.md` ("Next family: `*-to-journal`"),
which is also item 2 of `polish-2026-11-21-eyebrow-names.md` (the card's own intro
note between the heading and the input). No open PR had `polish` in its title.

## What changed

1. **All 25 `ventures/*-to-journal` pages**: the first card's `p.note` (where the file
   comes from, which columns are read; 25 to 81 words, 4 to 8 lines at 390 px) moved from
   above the file picker to just below it, as `p.note.file-note#file-note`, and the picker
   got `aria-describedby="file-note"` so a screen reader reads the note on focus. No text
   was hidden or cut. The header lede already says where to download the file.
2. **11 pages** (buymeacoffee, distrokid, fiverr, kdp, ko-fi, payoneer, revolut, teachable,
   upwork, wise, youtube-adsense) ended the header disclaimer with
   "If your file is refused, the findings say which column was missing." That sentence is
   about the picker, so it moved to the end of the card note. The privacy, independence and
   "read from memory of public help documents" lines stay in the header, visible.
3. **Check**: `platform/pages/journal-file-note.test.mjs` (file label first after the card
   heading, note right after the input, `aria-describedby` set) on every journal page.
4. **Ratchet**: 17 journal keys deleted from `venture-fold-baseline.json`; lemonsqueezy
   updated 1,033 → 868 (330 pages left).

## Measured (`venture-fold.mjs`, Chromium; before = full build of main at db9557236,
after = `--only` preview of the 25)

| Screen | first field on screen | median field top |
|---|---:|---:|
| 360 wide | 3 → 23 of 25 | 932 → 751 px |
| 390×844 | 7 → 24 of 25 | 890 → 705 px |
| 1280 wide | 25 → 25 | 554 → 496 px |

First card on screen unchanged (25/25 at 390). `venture-fold.mjs --check` on the 25: passes.
Screenshots (390×844, 2x): `img/polish-journal-file-note-{before,after}-ko-fi-390.png`.
Tests: the 25 ventures' own suites pass (they assert the disclaimer and "read from memory"
text, which did not move out of the page); `node --test 'platform/pages/*.test.mjs'` see the PR.

## Still weakest, and what I would do next

1. **lemonsqueezy-payout-to-journal** stays at 868 px: its header carries a visible
   "Known gap" note (the documented Orders export is not read yet). That is an honesty
   note; leave it visible. Closing the gap in the tool itself removes the note.
2. **Same move, other families**: any tool whose first card opens with a note before a file
   picker. `*-csv-check` pages put the notes in the header instead (see
   `polish-2026-11-21-csv-check-fold.md` item 1). Rank the rest with
   `jq -r '.below|to_entries|sort_by(-.value)[:30][]|"\(.value) \(.key)"' platform/pages/venture-fold-baseline.json`.
3. Carried over: `--check` in CI (control plane, own PR;
   `polish-2026-11-21-venture-fold-baseline.md` item 2); 14 bid calculators
   (`polish-2026-11-21-bid-bars.md` item 1).
