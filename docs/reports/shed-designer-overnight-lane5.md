# Shed Designer overnight, lane 5: adversarial QA and robustness

2026-10-29. Session https://claude.ai/code/session_01XpHqyd3twBvmmRdYbigYAJ.

## What landed

- **PR #11312**: `ventures/shed-designer/fuzz.test.mjs`, a seeded property test, plus the bugs it found.
  - It sweeps random designs: size, pitch, wall height, overhang, spacings, foundation, roof, snow and wind, and doors and windows anywhere, including off the wall.
  - It also sweeps junk saved state and links: every design and opening field replaced by null, NaN, strings, arrays, and junk prices.
  - Invariants: nothing throws; no NaN or negative lengths, quantities or prices; integrity holds; every structural check runs; SVG and R12 DXF are well formed; instructions contain no NaN or undefined; normalize is stable through a save; a longer or wider shed never costs less.
  - Baseline on the PR #11268 head: 135 of 1,000 designs broke a rule. Junk state threw about 400 times in 3,000 tries and priced 145 designs at NaN.
  - Fixed and pinned:
    - rafters and ties inside the gable wall;
    - eave blocks inverted into the cap plate;
    - false integrity clashes on four-point parallelograms;
    - a ridge below the ties or plates now gets a warning;
    - openings left out of the framing were still bought, caulked and flashed;
    - a cleared price became a $0 board;
    - junk header, null opening, and NaN or duplicate ids;
    - raw UTF-8 in the DXF;
    - one shared `axisStart`.
  - Post: `docs/posts/2026-10-29-breaking-the-shed-designer-on-purpose.md`.
- **PR #11317**: the connection check called a connector seat a birdsmouth. The fuzz invariants now require every connection check to pass.

## Checked and found sound

- Real page in headless Chromium:
  - nine kinds of corrupted localStorage and broken `#d=` link (bad JSON, wrong types, junk base64, a JSON array, null) load with no page error;
  - a random monkey test of every form control (3 seeds x 120 actions) gave no errors and no NaN on the page.
- Structural checks are monotone in snow, wind, span and spacing. A deeper member never raises its ratio. The one apparent exception, floor joists getting less loaded on a wider shed, is because a skid is added.
- Options, simplify and budget searches don't throw on extreme designs. Budget takes about 3 s on a 40 x 20 ft shed.

## Open, for the next run

- **Plate splices.** A 91" door on a 15'6" wall with 12 ft boards leaves a forced 6-1/2" cap stub. It meets the IRC's 24", but a builder might rather buy a 16 ft board. Lane 1's joint search (PR #11313) could offer that as a note.
- **Site-built door.** It accepts a 12"-tall leaf. The Z brace then comes out at about 1 degree, because the rails take the whole height. A minimum leaf size, or a warning, would help.
- **Form fields.** `app.mjs` reads `Number(field.value)`, so a cleared wall-height field means 0, which normalize clamps to 60". It works, but a blank field should probably keep the last value.
- **Siding-driven price dip.** On the 8x8 preset, walls 108" to 114" cost about $30 less, because the siding switches from one tall panel to two rows of 4x8. It is correct, but surprising, and could be explained in the UI.
- **Fuzz cost.** At the default N (150) the fuzz test takes about 7 s of the suite. `FUZZ_N=2000 FUZZ_SEED=<n>` gives a wide sweep. A nightly wide sweep would be software doing the routine part, but it needs a workflow, so it is the owner's call.
