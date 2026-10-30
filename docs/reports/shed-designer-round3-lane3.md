# Shed designer, round 3 lane 3: alternative roof structures

Session https://claude.ai/code/session_01XpHqye8GsoB7Tz4n576sEf, 2026-10-30.

## Landed

- **PR #11589: site-built trusses** (`roofType: 'truss'`, `truss.mjs`).
  - **Framing.** Top chords use the rafter size and the bottom chord the tie size. Gussets are 7/16" OSB on both faces.
    - The king post is automatic (`needsKingPost`): it goes in only when the bottom chord fails wall to wall.
    - Each corner of a gable-end pair gets a heel block.
    - The eave siding, lap siding and corner boards rise to the soffit, because a truss lifts the roof by the chord depth.
  - **Checks:**
    - top chord, NDS 3.9.2;
    - bottom chord, NDS 3.9.1, with IRC R301.5 attic loads;
    - gusset nails by the NDS 12.3.1 yield equations, OSB Fe 4,650 (Table 12.3.3B), Fyb from Table I1;
    - a truss connection check.
  - **Outputs:** a truss detail sheet, and a truss-aware section, roof plan, gable note, nailing schedule and cover. Also 3D, build steps ("Build the trusses", "Stand the trusses"), the estimate (gusset OSB shelf-packed, gusset nails, ties instead of connectors and hangers) and labour (4 minutes a gusset).
  - **Where it appears:** the UI select, "options made for you", the simplicity and budget moves (`ROOF_TYPES`), the design-search knobs, utilisation, design facts and render alt text.
  - **Fixes on the way:**
    - auto pitch searched from 3/12 under shingles;
    - wall studs at the buckling load reported Infinity.
  - **Post:** `docs/posts/2026-10-30-trusses-for-a-small-shed.md`.
- **This PR: attic storage** (`atticStorage`, trusses only).
  - Sizes the bottom chords for 20 psf, which forces king posts.
  - Decks the inside trusses where 12" of clear height fits, and leaves the end bays open.
  - Prices the deck in the floor's panel. Section drawing, build step, 3D and fuzz are covered.
  - **Post:** `docs/posts/2026-10-30-attic-storage-in-a-small-shed.md`.

## What the numbers say

Like for like (birdsmouth seats, same pitch, starting prices):

- A **ridge board with ties is the cheapest roof on every preset**, by $19 to $61 over trusses.
- Trusses against the 2-ply ridge beam:
  - cheaper on the 8x10 and the 8x12 classic;
  - about level on the 8x8;
  - $38 dearer on the default 8x12;
  - they pass on the 10x12 and 12x16, where the beam fails.
- Trusses add 1 to 4-1/2 labour hours, and about 4" to 5" of peak.
- Their wins are no long boards, building on the ground, and an attic you can deck.
- Attic decks pay only at 6/12 or steeper on an 8 ft width: 28 sq ft for $135, against 11 sq ft for $101 at 4/12.

## Not done, and why

- **Collar ties.** IRC R802.4.6 collar ties resist ridge separation under wind uplift, not thrust. Uplift isn't modelled here: r2 PR #11543 adds rafter-tie uplift checks. A code-exempt shed sized by analysis gets no benefit the tool could show, so adding them would be house habit, which the owner asked us to drop. Revisit once an uplift check exists.
- **Raised rafter ties / ceiling joists.** The ridge-board roof already has rafter ties at the plate, which act as ceiling joists. Raising them (IRC R802.5.2) needs a heel-joint factor and a rafter bending check at the tie. In an 8 ft wall shed it buys headroom nobody asked for. A possible later option.
- **Metal truss plates.** Not offered. We have no published allowable load we could cite for a plate sold at Home Depot or Lowe's. OSB gussets with NDS-checked nails stand in.
- **Gusset panel strength.** Tension and shear through the OSB are not checked. The README and truss.mjs say so.

## Open, for whoever is next

- `renders.test.mjs` fails on `main` (the size-page render manifest is stale), and so does fuzz seed 11 (lap-siding butt-joint stagger, on ridge-board designs too). Neither comes from this lane; both reproduce on a clean `main` worktree.
- The design search's `storageOf` counts the overhead triangle whether or not it is decked. Counting only a decked attic (and searching `atticStorage`) would make "most storage" honest.
- A truss heel-uplift check, once r2 #11543's uplift model lands, should cover truss heels too (the H2.5A tie).

## Next step

Add `atticStorage` as a design-search knob with storage counted from the deck. Then re-run the 100 sq ft search to see whether a steeper truss roof with a deck beats a bigger floor plan on storage per dollar.
