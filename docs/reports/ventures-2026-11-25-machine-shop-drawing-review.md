---
kind: milestone
date: 2026-11-25
---
# Machine shop guides (bets #2/#4 front door): drawing review

**What landed.** `ventures/machine-shop-guides/drawing-review.html` and `drawing.mjs`: drop a part
drawing PDF, read its text layer in the browser, get the title block, revision table, general
tolerance block, numbered notes (tagged by cost), callouts in the views, markings, and questions for
the buyer. It hands the callouts and general tolerances to `first-article-inspection.html`
(`?g1..g4,ga` query, list in `#chars=`; the FAI page now reads both). This is the "drawing in" step
of bet #2's wedge ("email or drawing in, priced quote out").

**Choices to keep.**

- The PDF reader is the shared vendored one (`pdf-parser.mjs`, `inflate-browser.mjs`,
  `pdf-parser-sync.test.mjs` byte-identical in six ventures now; `pdf-text.mjs` copied from
  pdf-plan-takeoff). The sync test's SIBLINGS list and `ventures/dupehound/guards/oss-monorepo.txt`
  were updated in all copies.
- Each title-block value must pass a per-field shape check (`VALID` in `drawing.mjs`), so a label
  over a date or another label gives "not found", never a wrong value.
- ISO 2768 is reported, not applied: the size-range tables were not re-read from the standard.
- `sample-drawing.mjs` writes an invented drawing as a real PDF with two built-in traps (title block
  rev C vs revision table D; notes skip 4). Tests run it through the same reader a visitor's file goes
  through and round-trip the hand-over through `checkFai`.

**Why this and not bet #1 this run.** `private-monorepo` could not be cloned (the session's permission
classifier refused it), every official-source host was blocked by the proxy (ecfr.gov, dol.gov,
acquisition.gov), and bet #1's public front door already has 25 pages. A source-free algorithmic
step for bet #2 was the most useful thing reachable.

**Next.** Text pieces split across runs (a stacked `+.002` over `-.000`) are not joined, so those
callouts are missed; joining stacked tolerance text by position would raise recall. Real CAD exports
(SolidWorks, Fusion) should be tried as fixtures when a session can get permissively licensed samples.

**Watch out: transition.json.** The vendored PDF reader takes machine-shop-guides over
`portfolio/monetization/transition.py`'s 5,000-source-line threshold. Regenerating
`transition.json` (it had already drifted on main, so `test_transition.py` fails) would then
reclassify this front door as "proprietary", and `platform/pages/front-doors.test.mjs` ("a paid
product is never a front door to itself") fails. This PR left `transition.json` as it was on main.
The fix belongs in `transition.py`: exclude vendored files (those covered by a `*-sync.test.mjs`)
from the line count, or keep listed front doors as front doors. Then regenerate.
