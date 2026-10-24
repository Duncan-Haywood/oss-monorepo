# accel-ttbig: how big a keyword-spotting model fits a real Tiny Tapeout tile once the hidden layer goes past 64 units? (area grows about 250 µm² per unit; H = 128 needs a 2x2 tile)

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/accel-ttbig/

Tenth step of track 8 (task-specific AI accelerators) in `PROJECTS.md`. The "Next steps" of [`accel-ttsizes`](../accel-ttsizes) asked to extend the model grid above H = 64, because from a 1x2 tile up its answer was just "the largest model swept". This project synthesises [`accel-ttfit`](../accel-ttfit)'s streaming keyword-spotting (KWS) engine at H = 96, 128, 192 and 256 and finds which of Tiny Tapeout's real tile sizes holds each.

## Headline result
- **Area is close to linear in H: about 250 µm² per hidden unit** (120 inputs, 4-bit weights: 21,417 µm² at H = 64, 37,511 at 128, 69,659 at 256). H = 128 is 36,411 (2-bit) to 40,747 µm² (8-bit); H = 256 is 68,606 to 72,897 µm².
- **Smallest tile (120 inputs, 20-bit accumulator):** H = 96 needs a 1x2 (36,347 µm²) at 100% utilisation and a 2x2 (75,603 µm²) at 70% and 50%. H = 128 needs a 2x2 at every utilisation (8-bit weights need a 3x2 at 50%). H = 256 needs a 2x2, 3x2 or 4x2 at 100, 70 and 50%.
- **The accuracy gain is small for the area.** The best model for a 1x2 tile (H = 64, 8-bit) is 0.737 (`accel-ttretrain`); H = 128 with 4-bit weights, which `accel-kws` trained, reaches 0.752, so **+0.015 for a tile 2.08 × the area** (36,347 → 75,603 µm²). A 3-bit H = 128 model is 0.749 and also fits a 2x2; a 2-bit one is 0.691.
- **A 20-bit accumulator is not safe at H = 256.** On random models the RTL matched the integer reference in every case where the reference stays inside the accumulator. One case does not: H = 256, 120 inputs, 8-bit weights overflows 20 bits (the reference assertion trips), while the 24-bit build passes. A 24-bit accumulator costs +0.1 to +2.1% area (table in `experiments/results.txt`). Whether trained models overflow was **not** checked above H = 64 (below: no dataset).
- Time is the other cost: one H = 128 inference is 17,047 cycles (120 inputs), 341 µs at an **assumed** 50 MHz, against 5,335 cycles at H = 64 in `accel-ttfit` (its figure is for 70 inputs; the 120-input H = 64 count is 8,535).

## Method
- `experiments/synth.py` runs `accel-ttfit`'s `kws_tt.v` through its Yosys flow (`synth -flatten`, `dfflibmap`, `abc` on the SKY130 HD typical-corner liberty from OpenROAD-flow-scripts at the commit pinned in `accel-pdkprice/fetch_pdk.sh`) for 70 and 120 inputs, H in {96, 128, 192, 256}, weights of 2, 3, 4 and 8 bits and accumulators of 20 and 24 bits: 64 points. For each it simulates 3 random inputs in Icarus Verilog and compares class and cycle count with the integer reference; a model whose reference overflows the accumulator is recorded as unchecked (`rtl_exact: null`), not as passing.
- `experiments/analyze.py` joins these areas with the H ≤ 64 areas (`data/ttfit_results.json`), the 12 real tile sizes (`data/tile_sizes.yaml`, from `accel-ttsizes`) and the accuracies: `accel-ttretrain`'s for H ≤ 64, `accel-kws`'s test accuracy (mean of 3 seeds, `data/kws_h128.json`) for H = 128. Tests check each copy equals its source.
- Utilisation 100, 70 and 50% as in `accel-ttsizes`.

## Reproduce
```bash
sudo apt-get install -y iverilog yosys python3-numpy
sh ../accel-pdkprice/fetch_pdk.sh ../accel-ttfit/pdk      # needs network; pdk/ is gitignored
python3 experiments/synth.py                              # about 2 min on 4 cores; writes synth.json
python3 experiments/analyze.py                            # stdlib only; writes results.json, results.txt
python3 -m unittest discover -s tests                     # 5 tests
```

## Limitations
- **No accuracy for H = 96, 192, 256**, and none retrained for H = 128: the Hugging Face dataset mirror `accel-kws` used was unreachable (HTTP 403) from this container. The H = 128 numbers are `accel-kws`'s, trained with a 24-bit accumulator contract; `accel-ttretrain` showed the 20-bit contract changed nothing for H ≤ 64 but that is untested at 128. Whether H = 128 trained models fit the 16-bit bias and 20-bit accumulator is **not checked**.
- Random-weight RTL checks, not trained ones. Area is synthesis-only; utilisation is assumed (100, 70, 50%); the 50 MHz clock is assumed and timing was not checked. Synthesis area is not strictly monotone in width or bits (ABC): a few 8-bit points differ by a fraction of a percent between the 20- and 24-bit builds in the wrong direction.
- Tiny Tapeout's table may change, and nothing here says a 2x2 tile can be bought or what it costs.

## Next steps
Retrain H = 96 to 256 where the dataset can be fetched and check the bias and accumulator headroom (a wider accumulator may be required); place and route one geometry in OpenROAD to replace the utilisation assumption (needs a source build of OpenROAD, about 1.5 h per `chip-pnr`).

## Owner steps
None. Nothing was bought or submitted to a shuttle.

## Outside dependencies (vitamins)
Tiny Tapeout's tile table (copied from `accel-ttsizes`), `accel-ttfit`'s engine and flow, `accel-ttretrain` and `accel-kws` accuracies (copied), Yosys 0.33, Icarus Verilog 12, SKY130 HD liberty (fetched). Produced with AI assistance.
