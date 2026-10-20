# chip-ppa-mac: does fusing the accumulate into the partial-product tree beat multiply-then-add once the ABC script varies?

Follow-up to `chip-ppa-script` (track 3, `PROJECTS.md`), taking its "designs with more room (FIFOs, MACs)" next step: a 4&times;4 unsigned multiply-accumulate instead of an adder or a multiplier. Produced with AI assistance (Claude). Preliminary and small: one tiny design, one tool version, a generic-gate library.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-ppa-mac/

**Builds on.** `chip-ppa-script`, `chip-abc-sweep` and `chip-ppa-loop` in this repository (same author, MIT): `src/chip_ppa_mac/flow.py` is copied unchanged from `chip-ppa-script`, and `experiments/run.py` is adapted from its runner. Tools: Yosys and its integrated ABC (Brayton and Mishchenko, "ABC: An Academic Industrial-Strength Verification Tool", CAV 2010, LNCS 6174:24-40, <https://doi.org/10.1007/978-3-642-14295-6_5>; checked against Crossref on 2026-10-13 for `chip-abc-sweep`; the paper itself was not read). The `resyn2`-style script is written from memory of the usual ABC alias, so it is one plausible script, not a verified copy. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Question
A MAC computes `y = a*b + c`. A tool that sees `a*b + c` can treat `c` as one more row of the partial-product sum, or it can build the multiplier and add `c` after. Does a written rewrite that fuses `c` into the tree (flat sum, balanced tree, carry-save compression) beat the reference, once the reference is also given its best ABC script?

## Method
- Reference `designs/mac4.v`: `assign y = a * b + c;` (a, b 4 bits, c 8 bits, y 9 bits).
- Candidates: the reference; four proposer files in `proposals/mac4/` (written by the session agent, not an API model: carry-save, flat sum, balanced tree, and a seeded fault that truncates `c`); and a 12-config sweep from `src/chip_ppa_mac/gens.py` (summation chain/tree/carry-save &times; `c` first/last &times; mux/and partial products). Each is first checked against the reference by a Yosys miter and `sat -prove` over all 2<sup>16</sup> inputs.
- Each valid candidate is scored under the five ABC scripts of `chip-ppa-script` (`synth -noabc`, then `abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX` with the script). Cells = cell count, depth = `ltp -noff`, figure of merit cells&times;depth (generic-gate numbers, not um&sup2; or timing).
- After mapping, the netlist is written with `write_verilog` and proved equal to the reference by the same miter.
- The comparison is not equal-budget: the proposer has 3 valid files, the sweep is exhaustive over 12 configs.
- A first attempt used a 6&times;6 MAC (30 input bits); the SAT proof of the mapped reference did not finish in 60 s, so the design was shrunk to 4&times;4 (16 bits). Nothing from the 6&times;6 attempt is reported.

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys iverilog   # Yosys 0.33 here
cd research/chip-ppa-mac
python3 -m unittest discover -s tests
python3 experiments/run.py        # rewrites experiments/results.txt (about 30 s)
```

## Results (from `experiments/results.txt`, Yosys 0.33)
17 candidates, 1 rejected by the RTL gate (the seeded fault), 80 candidate-script pairs scored, 0 mapped netlists failed the equivalence check. Best cells&times;depth per group; lower is better.

| group | yosys default | strash;map | dc2 | dch | resyn2 |
|---|---|---|---|---|---|
| reference `a*b+c` | 1919 | 1972 | 1995 | 1938 | 1908 |
| proposer files (3 valid) | 2033 | 2057 | 2200 | 1936 | 1872 |
| sweep (12 configs) | 2033 | 2057 | 2124 | 1770 | 1800 |

- Proposer-best / reference under the same script: 1.06, 1.04, 1.10, 1.00, 0.98. Sweep-best / reference: 1.06, 1.04, 1.06, 0.91, 0.94.
- Under the default script, and under `strash;map` and `dc2`, every fused form is slightly worse than the plain reference. The flat-sum, balanced-tree and all chain/tree sweep variants map to identical numbers (the tool normalises them to the same adder structure).
- Only the carry-save forms win, and only under `dch` and the `resyn2`-style script. The overall best is `csa_first_and` under `dch` (118 cells, depth 15, 1770): 0.92&times; the reference under the default script and 0.93&times; the reference under its own best script (`resyn2`, 1908).
- The reference's own script spread is small here (1908&ndash;1995, about 5%), much less than the adder's in `chip-ppa-script`.

## Limitations
- One 4&times;4 design, one Yosys/ABC version, five scripts chosen by the author, deterministic runs. The 7&ndash;9% gains are on a figure of merit from a generic-gate library with equal-cost gates; a different library, size or metric could reverse them, and no confidence interval exists because nothing is random.
- The proposer files were written by the session agent after seeing the results of earlier projects; this says nothing about how well an API model proposes rewrites.
- The sweep is exhaustive while the proposer has 3 files, so the sweep winning is expected.
- Equivalence proofs show the netlists compute the same function; nothing checks timing, hazards or a real cell library.
- Unsigned arithmetic only; signed or Booth-encoded MACs are untested.

## Next steps
Scale to 6&times;6 or 8&times;8 using a faster equivalence check (SymbiYosys or `equiv_induct`, or simulation plus structural checks); a liberty-based mapping on SKY130 as in `chip-pnr` to see whether the carry-save advantage survives real cells; an `ANTHROPIC_API_KEY`-gated proposer (stubbed in tests); FIFOs.

## Outside dependencies
Yosys and Icarus Verilog (apt). No LLM API, OpenROAD or PDK. All code is original or copied from `chip-ppa-script`, MIT-licensed.
