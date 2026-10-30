# Shed designer, round 3, lane 2: ready-design gallery

2026-10-30. Session: https://claude.ai/code/session_01XpHqyehoVoym5ZoQnhyYgb

## What landed (PR #11561)

- **`gallery.mjs`: ten sheds under 100 sq ft, none of them typed in by hand.** Two runs of lane 1's `searchDesigns`, 1,200 designs each.
  - **Run 1:** free to change every finish.
  - **Run 2:** fiber cement lap siding painted white, and shingles, fixed (`HOUSE_FIXED`). This is the owner's HardieBoard-house look.
  - **What a run keeps:** designs that pass every check with every member at 90% of capacity or less (`GALLERY_MAX_RATIO`), draw with no model warning, are 100 sq ft or under and peak at 13 ft or under (`GALLERY_RULES`, using designsearch's own default peak).
  - **The ten measures:** cheapest, most room per dollar, balanced (`picks()`), most storage, best looking, matching the house, cheapest lap-sided, a 10x10, a long one (14 ft or more) and a 48" mower door.
  - **How a card picks:** it takes the best kept design on its own measure, never a design an earlier card took, and preferably in a size no earlier card shows. When that rule pushes a card off the overall winner, its reason says "in a size the cards above do not show".
  - **Paint:** painted cards get a paint colour for variety. The generator checks that the colour does not change the price.
- **`make-gallery.mjs` writes `gallery-data.mjs`** (under a minute), so the page doesn't search on load. Each entry is `{ id, title, reason, design }`.
- **`gallery.test.mjs` (about 45 s):**
  - every stored card meets every rule;
  - the house cards keep their siding and roofing;
  - no two cards are the same shed, and the cards cover at least 8 sizes;
  - a fresh search still gives a valid gallery, and each reason is true of the search that picked it ("lowest price of the N", "most room per dollar", "in a size the cards above do not show").
  - **Drift:** a stored file that is merely behind the search is a test *diagnostic*, not a failure, so other lanes' price and engine changes don't turn their CI red. Run `node ventures/shed-designer/make-gallery.mjs` to bring it up to date.
- **One strip, not two.** r3b's `picker.mjs` (#11559) already had a strip with detail, compare and "Start from this design", and a `setEntries` hook for "a search's optimised designs".
  - `app.mjs` now mounts it with `entries: galleryEntries()`, and the presets stay in the New design menu.
  - The picker card gains a storage line (cu ft inside, clear wall).
  - `gallery-ui.mjs` adds the strip's previous and next buttons with an "n of m" count, the arrow keys on the focused strip, and swipe (scroll-snap). The count stays right while a smooth scroll is still moving and at the strip's end, where the last cards share the view.
- **Strip pictures:** each card's picture is drawn ahead (`galleryTargets` in `make-renders.mjs`), and `picker.mjs` now looks up any entry's stored picture by its exact design (`pictureFor`), not only a preset's.
- **Tests changed in other lanes' files:**
  - `picker.browser.test.mjs` now addresses the gallery ids (`cheapest`, `value`, `square`, `storage`) instead of preset ids.
  - Its "cheapest is marked best" check now reads the dollar amount. It used to concatenate every digit in the cell, so a "10x10" title broke it.
  - The "priced the way the page prices" test now starts from a gallery card instead of assuming the strip holds the page's default design.
  - The preset-pictures tests (`picker.browser.test.mjs`, `renders.test.mjs`) now check the gallery cards' drawn pictures. The presets keep all their pictures for the marketing page.
- **Browser tests** (`browser.test.mjs`) check, on desktop:
  - ten cards, each with a price, cu ft inside and clear wall;
  - the 3D thumbnails;
  - the arrows (including the last cards on a wide screen) and the arrow keys;
  - "Start from this design" opening a new tab.

  On a Pixel 7 they check that a card fills most of the strip, the strip scrolls sideways and the page does not.

## Follow-up (PR "match a house")

- Each card now names its siding and roof ("Siding: fiber cement lap · asphalt shingle roof"), so a metal-roofed card is plain at a glance (the parent's ask: the owner needs shingles and lap siding).
- A "Match a house: lap siding and asphalt shingles only" switch limits the strip to the six such cards (`matchesHouse` in `gallery-ui.mjs`), remembered per viewer in localStorage. Tested in `gallery.test.mjs` and `browser.test.mjs`.

## Findings (post: `docs/posts/2026-10-30-ten-sheds-under-100-square-feet.md`)

- **Peak limit:** with none, the roomiest designs are 16 ft gable spans with the ridge only 6 ft long, a 9/12 roof and a 15'8" peak (896 cu ft). With the 13 ft cap, the roomiest is a 7x14 holding 783 cu ft, peaking at 12'8".
- **Budget:** none of the 1,750 designs kept costs under the owner's $2,000. The cheapest is an 8x10 at $2,288.04: LP SmartSide panels, a metal roof, a gable door and no windows. With lap siding and shingles, the cheapest is $2,602.05. Siding plus fasteners and sealants come to about $720 of the cheaper one.
- **Earlier version:** before designsearch landed, the gallery ran the `simplify` cost search. Without a margin it left checks at 100%. Without a no-warnings rule, seven of ten designs used 2x4 rafters notched past a third of their depth, and two dropped their gable vents. Both limits carried over.
- **Two volume measures:** `designfacts.mjs` (the picker's card figures) and `designsearch.mjs` `storageOf` measure volume differently, for example 811 against 783 cu ft for the same 7x14. So the reasons name ranks, not figures the card would contradict. One shared measure would be better. The owners of those modules should agree it.

## Open, and the next step

1. **The gallery data is regenerated by hand.** When #11524 ("size pages built by the site build") lands, add `make-gallery.mjs` to its `GENERATED_PAGES` list so every deploy searches with that day's prices. Keep a committed copy, because the page imports it and tests run without a build.
2. **Pictures:** done in this PR. `make-renders.mjs` `galleryTargets()` draws each card's strip picture (WebP, about 6 KB, 10 in all; `renders/` is at 827 of its 900 KB). The picker uses any stored picture whose design matches exactly (`pictureFor`), so a customised or regenerated design falls back to a live drawing. After `make-gallery.mjs`, run `make-renders.mjs`, or `renders.test.mjs` reports the changed cards as stale. Drawing the detail's other three views too would need about 25 KB a card, which is over budget.
3. **Budget:** none of the gallery reaches $2,000. Fasteners priced by the box and siding over sheathing are the levers the search can't pull yet (lane 6, "where the money goes").
