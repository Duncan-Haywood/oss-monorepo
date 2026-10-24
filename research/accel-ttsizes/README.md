# accel-ttsizes: does the real Tiny Tapeout tile-size table change which keyword-spotting model fits a tile? (yes at 70% utilisation; the rest holds)

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/accel-ttsizes/

Ninth step of track 8 (task-specific AI accelerators) in `PROJECTS.md`. `accel-ttfit` fitted a streaming keyword-spotting (KWS) engine into a Tiny Tapeout tile but used a tile area read from a search-result snippet (161 × 112 µm) and said it had **not** checked Tiny Tapeout's own table. This project fetches that table and re-asks the question over all 12 tile sizes, with the retrained accuracies of `accel-ttretrain` instead of the earlier assumed ones. It replaces an unsourced input with a sourced one, the kind of fix `research/CLAUDE.md` asks for, and measures how much the answer moves.

## Headline result
- **The real 1x1 tile is 161.00 × 111.52 = 17,955 µm²** (`tech/sky130A/tile_sizes.yaml` in TinyTapeout/tt-support-tools, fetched 2026-10-21). `accel-ttfit` assumed 18,032 µm², 0.43% too large. Taller tiles are not exact multiples: 1x2 is 2.02 × a 1x1.
- **The assumed tile changed one of three headline answers.** For one 1x1 tile, the most accurate model is unchanged at 100% utilisation (120 inputs, H = 32, 8-bit weights, 0.693) and at 50% (H = 16, 3-bit, 0.563). At 70% it flips: H = 16 with 8-bit weights is 12,597 µm² against a limit of 12,568 µm² (real) but 12,623 µm² (assumed), a 29 µm² miss, so the real answer is H = 16, 4-bit, 0.596 rather than 0.616. Anyone reading a result near the limit should treat it as unresolved: utilisation, not the tile area, is the larger unknown.
- **Beyond one tile, the best model is the largest one swept.** From 1x2 up (100% and 70% utilisation) and from 2x2 up (50%), H = 64 with 8-bit weights (24,222 µm²) fits, accuracy 0.737. No larger tile helps, because the model grid stops at H = 64. This is a limit of the sweep, not evidence that accuracy has saturated.
- Smallest tile for each model (table in `experiments/results.txt`): every model with H ≤ 16 and ≤ 4-bit weights fits a 1x1 at 70% utilisation; H = 64 needs a 1x2 at 100% and 70%, and a 2x2 at 50% (4.2 × the area of a 1x1).

## Method
- `data/tile_sizes.yaml` is the upstream file (Apache-2.0, fetched not edited; `fetch_tile_sizes.sh` re-fetches and diffs it). Each entry is a die-area box `"0 0 width height"`, read here as µm; the 1x1 entry matches the 161 × 112 µm of Tiny Tapeout's guide to within rounding.
- Areas: `accel-ttfit`'s SKY130 HD synthesis areas (`data/ttfit_results.json`, a copy with a test that it equals the original). The engine streams its weights in, so the area does not depend on the weight values.
- Accuracy: `accel-ttretrain`'s retrained models, mean test accuracy of 3 seeds through the tile's wrapping contract (`data/ttretrain_results.json`, a copy with a test). These replace `accel-ttfit`'s assumed accuracies, which that project's reproduction already showed to be off by up to 0.03 for 2-bit weights.
- For each tile and each utilisation (100, 70, 50%), the best-accuracy model whose synthesised area is at most tile area × utilisation.

## Reproduce
```bash
cd research/accel-ttsizes
sh fetch_tile_sizes.sh                      # optional; needs network; prints "unchanged"
python3 -m unittest discover -s tests       # 6 tests, stdlib only
python3 experiments/run.py                  # stdlib only; writes results.json and results.txt
```

## Limitations
- **Utilisation is assumed (100, 70, 50%).** Synthesis area is cell area before placement and routing; Tiny Tapeout's guidance on achievable utilisation was not read, so the real fit lies somewhere in that range. The 70% flip shows how little margin separates two models.
- Area is from Yosys synthesis only (no place and route, no clock tree, no I/O). The pin-limited streaming interface and the 2-bit to 8-bit weight formats come from `accel-ttfit`.
- The tile table is the current `main`; Tiny Tapeout may change it. Dimensions are taken to be µm without a unit statement in the file.
- Accuracy is on a substitute feature set and one hidden layer (see `accel-kws` and `accel-ttretrain`); a result on real Speech Commands is not claimed. Sweep stops at H = 64.
- Not checked: whether a given tile size is a valid order for a shuttle or its price (owner step, below).

## Next steps
Place and route one design (OpenLane 2) to measure real utilisation per tile; extend the model grid above H = 64 so larger tiles have something to fit.

## Owner steps
None. Nothing was bought, submitted to a shuttle or measured.

## Outside dependencies (vitamins)
Tiny Tapeout's tile-size table (fetched); `accel-ttfit`'s synthesis results and `accel-ttretrain`'s accuracies (copied). Produced with AI assistance.
