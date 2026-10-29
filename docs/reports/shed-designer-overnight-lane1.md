# Shed designer overnight, lane 1: land + structural correctness

Session: https://claude.ai/code/session_01XpHqydjPUYuhxkkTPrf1fd, 2026-10-29, 04:20 to about 06:00 UTC.

## Landing PR #11268

The authoring session kept committing until 04:55 UTC and merged #11268 itself at 05:14. The 30-minute idle threshold never passed, so this lane did not take the branch over. Until the merge it audited read-only:

- tests on the branch;
- the Pages build and `check.mjs` on a local merge of `main` (1,319 products, no dead links);
- a prototype of the load-path and nailing checks below.

## What landed

| PR | What |
|---|---|
| #11307 | Four framing faults found by new load-path and nailing checks (see below), five new connection checks, and hand-calculation tests for the header, stud, floor joist and rafter rows. Post: `docs/posts/2026-10-29-four-framing-faults-the-shed-checks-missed.md`. |
| #11313 | Top-plate and cap-plate joints chosen together with short stock; the plate-offset check lowered to the IRC's 24" (R602.3.2). |
| #11315 | The rafter-tie heel joint is nailed for the thrust (wL²/8h) with the NDS yield-limit value of a 16d common, not a fixed three nails. Post: `docs/posts/2026-10-29-how-many-nails-hold-a-shed-rafter-tie.md`. |
| the PR carrying this report | Gable-wall headers carry the end rafter's strip of roof (about 47 lb/ft at 30 psf snow) as well as the 40 lb/ft of gable framing. The shown load roughly doubles (86 to 88 lb/ft); no preset changes from pass to fail (worst 0.147). |

The four faults fixed in #11307:

1. With an even number of skids, a ridge-beam gable post stood mid-span on a single 2x6 end joist: 1,403 lb on the 10x12, 1.38 times its allowable bending. Ridge-beam sheds now always get an odd number of skids.
2. Eave-wall headers and studs under a ridge board were checked with the ridge-beam roof load (half the rafter run), about 40% too little.
3. A spliced skid's joint fell between two blocks.
4. Siding joints had no wood behind them in two cases:
   - a window with one layout line inside it (46" unbacked);
   - a king stud pushed aside the 96" layout line on the default design (13" with 1/4" of wood).

## How the checks were cross-checked

Each NDS row in `checks.mjs` is now pinned in `checks.test.mjs` to a calculation written out in the test:

| Row | Basis |
|---|---|
| Ridge beam | existing test |
| Header | shear governs |
| Wall stud | NDS 3.9-3; D + 0.6W governs, 0.197 on the classic |
| Floor joist | bending |
| Rafter | bending |
| 16d nail | mode IV of the yield limit equations, 119.8 lb |

`structure.mjs` agreed with every one, so the faults were in what the checks fed it (tributary widths, missing load paths), not in the engine.

## Verification notes

Each PR was verified the same way before merging:
- `node --test` in the venture;
- `typecheck.mjs shed-designer`;
- green CI on the merged head.

`run_workflow_locally.py --for-changes` is no help in this container. Most steps stop at its 300 s per-workflow budget, and the Pages artifact steps need a `_site` that the skipped `uses:` steps would have built, so its failures said nothing about the change. CI is the check that counts.

## What is still open

- **Plate splice with a wide door and only 8 ft boards.** On the 12x16 left wall, a 72" door with `lengths: [8]` leaves no split with cap joints 24" from top joints. The only fix is to allow plate joints over a header, which framers do: the header carries the joint. The connection check flags it honestly.
- **Uplift and racking.** The rafter-to-plate ties and the wall sheathing are taken from product schedules, not checked.
- **Skid bending on blocks.** Skids span block to block; at up to about 33" clear this is small, but it is unchecked. Treated skids are usually Southern pine, and the engine has only SPF values; the next run would need SYP design values with wet-service factors.
- **Stale stated numbers.** The README's totals and `shed-plans-with-cut-list.html` ("144 pieces from 93 boards, $2,166.66") drift from `estimate()`. A test that renders those numbers from the model, or a build step that writes them, would stop it ("software for the routine").

## What the next run should do

1. Allow top-plate joints over headers in `jointSets`, with a check that the header spans the joint by at least a stud width each side. That closes the last plate-splice case.
2. Add SYP design values and a skid-on-blocks bending and bearing row.
3. Generate the README and landing-page totals from the model in a test.
