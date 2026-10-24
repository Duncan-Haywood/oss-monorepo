# chip-cse-style: does writing a carry-select adder's shared a+b sum by hand change what Yosys and ABC synthesise? (no: hand sharing equals what `opt_merge` already finds; a differently grouped sum is 17-22% smaller under ABC's optimising scripts; stylised)

Track 3 (LLM chip-design loops, `PROJECTS.md`). `chip-abc-orderpass` showed that the only thing separating the two netlists of a carry-select adder is whether `opt_merge` shares `a + b` between the `+ 0` and `+ 1` sums. A rewrite proposer (human or LLM) would more naturally write that sharing itself. This asks whether the common rewrites do the same thing as the flow. Chosen over another operand-order or seed variant because that chain (`chip-abc-order`, `chip-abc-orderpass`) had become micro-variants of one result; this tests the rewrites a proposer would actually make. Produced with AI assistance (Claude). Preliminary and small: one adder, one tool version, a generic-gate library, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/chip-cse-style/

**Builds on.** `chip-abc-order` and `chip-abc-orderpass` (same author, MIT): the flow wrapper (`src/chip_cse_style/flow.py`, scores and miter) is copied unchanged and the `gen` style is the text of `chip-abc-order`'s `csel4`. Yosys and its integrated ABC (Brayton and Mishchenko, CAV 2010, <https://doi.org/10.1007/978-3-642-14295-6_5>, as cited in `chip-abc-sweep`; not re-read here). No connection to the CU Boulder groups in `prompt.md` is claimed.

## Method
Six styles of the 16-bit adder (`src/chip_cse_style/gens.py`): `plus` (`s = a + b`), `gen` (carry-select, `x = a+b+0`, `y = a+b+1`), `explicit` (`p = a+b`, `x = p`, `y = p+1`), `inc` (`x = a+b`, `y = x+1`), `right` (`x = a+(b+0)`, `y = a+(b+1)`) and `cin` (ripple over 4-bit blocks, `a+b+carry`). Each is proved equivalent to `designs/add16.v` with a Yosys miter and `sat -prove` before scoring. Scores: `synth -flatten -noabc`, then `abc` with `yosys_default`, `dch_map` and `resyn2_map` (the last is resyn2-style, written from memory in `chip-abc-sweep`). Metric: cells x topological depth (`ltp -noff`).

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys iverilog   # Yosys 0.33 here
cd research/chip-cse-style
python3 -m unittest discover -s tests    # under a second
python3 experiments/run.py               # rewrites experiments/results.txt (seconds)
```

## Results (from `experiments/results.txt`; cells x depth, lower is better)

| style | yosys_default | dch_map | resyn2_map |
|---|---|---|---|
| `gen` | 2090 | 1232 | 1665 |
| `explicit` | 2090 | 1232 | 1665 |
| `inc` | 2090 | 1232 | 1665 |
| `right` | 2268 | **1024** | **1300** |
| `cin` | 2387 | 2136 | 2225 |
| `plus` | 2542 | 1540 | 1620 |

- **Hand-written sharing is a no-op.** `explicit` and `inc` give the same cells, depth and score as `gen` under all three scripts: the flow already shared `a + b` there, so a proposer's "factor out the common sum" rewrite earns nothing.
- **Regrouping beats sharing under the optimising scripts.** `right` (the constant attached to `b` first) defeats `opt_merge`'s sharing, as in `chip-abc-orderpass`, and scores 17% (`dch_map`) and 22% (`resyn2_map`) lower than `gen`, but 9% higher under `yosys_default`. The sign again depends on the ABC script.
- **Against plain `a + b`**: `gen`, `explicit`, `inc` and `right` beat it under `yosys_default` and `dch_map`; under `resyn2_map` only `right` does (1300 against 1620, while the shared text, 1665, is slightly larger). `cin` is the worst of the carry-select family everywhere here (depth 24 to 31) and loses to `plus` under `dch_map` and `resyn2_map`.
- These are scores under a generic-gate library, not post-layout area; `chip-pnr` is the project that asks how far such numbers sit from SKY130.

## Limitations
- One 16-bit adder, six styles, one Yosys/ABC version, generic gates. Nothing here says the same holds for multipliers or other blocks.
- The metric (cells x depth) is a proxy; the ordering of styles may change with a real cell library.
- Styles were chosen by the author, not sampled from a model; "what an LLM would write" is untested.

## Next steps
Run the same styles through the SKY130 flow of `chip-pnr`; ask whether an LLM proposer asked to "reduce area" picks `explicit`/`inc` (no gain) or something like `right`; add these styles as free baseline candidates to `chip-ppa-loop`'s proposer comparison.

## Outside dependencies
Yosys and Icarus Verilog (apt). No LLM API, OpenROAD or PDK.
