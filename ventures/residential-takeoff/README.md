# Residential Takeoff: framing, sheathing and roof material lists from a house plan (paid edition)

Bet #6 in [`portfolio/monetization/bets.md`](../../portfolio/monetization/bets.md). A remodeler,
framer or small builder types or draws a house (walls, doors, windows, an outline roof), or reads one
from an IFC or DXF file, and gets every stud, header, plate splice and cut, the cheapest mix of board
lengths to buy, wall and roof sheathing, siding, and **one supplier material list** to hand a
lumberyard. It runs in the browser; nothing is uploaded. **Quantities come from the plan the user
typed; nothing here is a structural or code check.**

**Source visible, all rights reserved** ([LICENSE](LICENSE)). Publishing this directory grants no
licence to use, host or resell it. The MIT baseline it grew from stays MIT as published (below), and
the buildingSMART test models keep CC BY 4.0
([`apps/wall-framing-takeoff/fixtures/BSI-LICENSE.md`](apps/wall-framing-takeoff/fixtures/BSI-LICENSE.md)).

## Two editions

| Edition | Where | Licence | What |
| --- | --- | --- | --- |
| Free | [`ventures/wall-framing-takeoff`](../wall-framing-takeoff/), live at https://marisstella.app/wall-framing-takeoff/ | MIT | layout, order, cut list, drawings, PDF, CSV, every calculator page; frozen 2026-11-24 for lead-magnet upkeep only |
| Paid | this directory, `apps/wall-framing-takeoff` | all rights reserved (changes after the MIT import) | the free edition plus the supplier material list, outline and hip roofs (`roofoutline.mjs`, `hiproof.mjs`, `hipframe.mjs`), roof DXF and roof plans, outline sheathing, the branded bid package, and the dark paid path |

The paid edition started as a copy of the free one at oss-monorepo commit `c0b3321c4` on 2026-11-24
(`apps/wall-framing-takeoff/PROVENANCE.md`); that copy stays available under MIT at that commit.

## Why someone would use it

A remodeler or framer orders lumber today from an allowance ("one stud per foot plus 10%") or pays
for takeoff: Togal.AI $249.99–299.99 a month, Handoff from $149 a month, Buildxact about $199 a month,
roof reports about $13–38 each (sources and dates in `bets.md`, bet #6). This one counts members from a
laid-out wall instead of estimating them, reports how close its board order is to the cheapest possible
(an LP lower bound), and sells one house at a time: a $29 **Job report** (the material list and the bid
package), with the subscription kept for the contractor suite ([`docs/PRICING.md`](apps/wall-framing-takeoff/docs/PRICING.md)).

## Status

- **Not served and not on sale.** Nothing under `apps/` is published by the catalogue build (it serves a
  venture's root `index.html` only). Every checkout link in `apps/wall-framing-takeoff/checkout.mjs` is
  empty, so the paid path is dark and every feature is open (`plans.mjs`).
- **Before the first sale** (`apps/wall-framing-takeoff/docs/STEP4_NOTES.md`): pick the hosting for the
  paid page, move the checkout from the licence-key design (written for a static page against Lemon
  Squeezy) to the owner's merchant of record, Paddle (`prompts/goals.md`, "Payments"), and read one real
  export end to end.
- The roadmap is [`apps/wall-framing-takeoff/ROADMAP.md`](apps/wall-framing-takeoff/ROADMAP.md);
  `python3 platform/ci/roadmap_claim.py wall-framing-takeoff` claims from it here.

## Run it

Node 20 or later, no install step:

```
cd ventures/residential-takeoff/apps/wall-framing-takeoff
node --test '*.test.mjs'            # the engine, pages and paid-path tests
python3 -m http.server 8000         # then open http://localhost:8000/
node cli.mjs --help                 # the command-line tool
```

`ifc-engine/` is the Rust source of `ifc-engine.wasm` (`ifc-engine/README.md`); the built `.wasm` is
committed, so the page and tests need no Rust toolchain.

## Where the work happens

Moved from `private-monorepo/apps/wall-framing-takeoff` on 2026-11-27 (task
`move-wall-framing-takeoff-public` in [`portfolio/work/tasks.yaml`](../../portfolio/work/tasks.yaml);
audit in [`docs/reports/2026-11-27-move-wall-framing-takeoff-public.md`](../../docs/reports/2026-11-27-move-wall-framing-takeoff-public.md)).
Build here from now on. Until the private copy is removed, refresh this one from a newer private
commit with `./sync-from-private.sh /path/to/private-monorepo`, which audits first and stops on a block
finding.

## Disclaimer

Estimates from the figures you enter, for planning and ordering only. Not engineering, structural,
code-compliance or professional advice: header sizes, spans, spacing and connections are your inputs or
your engineer's. Check every quantity before you order or build.
