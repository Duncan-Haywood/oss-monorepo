# chip-abc-order: does the order or naming of equivalent Verilog change what Yosys/ABC synthesises? (not for names or statement order; yes for the order of added operands, up to 1.43x, stylised)

Track 3 (LLM chip-design loops, `PROJECTS.md`). The earlier chip projects score "written structures" and treat the text as the only thing a proposer changes. This asks a prior question: if two Verilog texts are provably equivalent and differ only cosmetically, does the flow give the same netlist size? If not, a rewrite proposer's "win" can be noise from the text, and a sweep can pick up free gains. Chosen over another script-sweep variant because that chain (`chip-abc-sweep` to `chip-ppa-script` to `chip-logic-script`) had become micro-variants of one result. Produced with AI assistance (Claude). Preliminary and small: two designs, one tool version, a generic-gate library.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-abc-order/

**Builds on.** `chip-abc-sweep` (same author, MIT): its generators, flow wrapper, five-script setup and `add16`/`mul6` reference designs are copied unchanged. Yosys and its integrated ABC (Brayton and Mishchenko, CAV 2010, LNCS 6174:24-40, <https://doi.org/10.1007/978-3-642-14295-6_5>, as cited in `chip-abc-sweep`; not re-read here). No connection to the CU Boulder groups in `prompt.md` is claimed.

## Method
- Structures: `add16` as `plus`, `ripple`, carry-select `csel4` and ripple carry-select `cselrip4`; `mul6` configurations 0 and 3. Text produced by `gens.py`.
- Three equivalence-preserving rewrites (`src/chip_abc_order/variants.py`), 12 seeds each, and all three together: `shuffle` (random order of consecutive `assign` lines), `rename` (every internal wire gets a random name) and `permute` (random order of the operands of each `+` sum in an `assign` or initialised `wire`).
- Every variant is proved equivalent to the reference design with a Yosys miter and `sat -prove` before scoring (0 failures of 288 variant texts).
- Scores: `synth -flatten -noabc` then `abc` with `yosys_default`, `dch_map` and `resyn2_map` (scripts from `chip-abc-sweep`; the `resyn2` sequence there is written from memory, so treat it as resyn2-style). Metric: cells x topological depth (`ltp -noff`).

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys iverilog   # Yosys 0.33 here
cd research/chip-abc-order
python3 -m unittest discover -s tests
python3 experiments/run.py      # rewrites experiments/results.txt (about 6 min)
python3 experiments/figure.py
```

## Results (from `experiments/results.txt`)
864 scored variants; 72 differ from the text as generated; all 72 are `permute` or `all` on `csel4`. Cells x depth, `csel4`:

| script | as generated | `shuffle` / `rename` | `permute` (12 orders) |
|---|---|---|---|
| yosys_default | 2090 | 2090 / 2090 | 2090 to 2268 |
| dch_map | 1232 | 1232 / 1232 | 1024 to 1408 |
| resyn2_map | 1665 | 1665 / 1665 | 1220 to 1750 |

- Renaming wires and shuffling statements never changed any score, for any structure or script.
- Reordering added operands changed only `csel4`, the structure whose blocks are written as `a[i] + b[i] + 5'dc` chains. The spread (max/min) is up to 1.43x within one structure and script, as large as the 1.17x to 1.75x that `chip-abc-sweep` attributed to the choice of script.
- The best variant under `dch_map` (1024) beats the text `chip-abc-sweep` called the best adder (1232) by 17%, with no change in function. So that earlier best is one draw from a distribution the text order controls, not a floor.
- `plus`, `ripple`, `cselrip4` and both multipliers were unchanged by every rewrite.

## Limitations
- Two designs and six structures; one Yosys/ABC version (0.33). Only `csel4` reacts, so "operand order matters" is shown for one structure, not established in general.
- `shuffle` is a no-op on structures with a single `assign` or with declarations carrying their own initialisers (`plus`, `csel4`, `mul6`), so its zero effect there says nothing. It acts only on `ripple` and `cselrip4`. `permute` has no effect where a sum has no three-operand chain.
- 12 seeds: the quoted min and max are sample extremes, not the range.
- Generic-gate cells x depth is a proxy, not area or timing; no place and route.
- Not investigated: why operand order matters (suspected: how Yosys's `alumacc`/`macc` groups operands before ABC). That is a hypothesis.
- No LLM is involved; nothing here benchmarks one.

## Next steps
Find the Yosys pass that is order-sensitive (run the flow pass by pass on a `csel4` variant pair, as `chip-p32passes` did); enumerate all operand orders of one block rather than sampling; re-check on the SKY130 flow of `chip-pnr`; add order-permutation as a free baseline dimension to `chip-ppa-loop`'s proposer comparison.

## Outside dependencies
Yosys and Icarus Verilog (apt). No LLM API, OpenROAD or PDK. Generators and flow wrapper copied from `chip-abc-sweep` (MIT); the rest is original.
