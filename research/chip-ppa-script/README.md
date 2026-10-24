# chip-ppa-script: does a rewrite still beat the baseline once the ABC script is allowed to vary?

Follow-up to `chip-ppa-loop` and `chip-abc-sweep` (track 3, `PROJECTS.md`), taking the first next step of `chip-abc-sweep`: the `chip-ppa-loop` proposer files and parameter sweep are re-scored under all five ABC scripts, and every mapped netlist is now proved equivalent to the reference. Produced with AI assistance (Claude). Preliminary and small: two designs, one tool version, a generic-gate library.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-ppa-script/

**Builds on.** `chip-ppa-loop` and `chip-abc-sweep` in this repository (same author, MIT). The designs, the proposer files (`proposals/`, written by the session that wrote `chip-ppa-loop`) and the generators in `src/chip_ppa_script/gens.py` are copied from `chip-ppa-loop`; `flow.py` extends the one in `chip-abc-sweep`. Tools: Yosys and its integrated ABC (Brayton and Mishchenko, "ABC: An Academic Industrial-Strength Verification Tool", CAV 2010, LNCS 6174:24-40, <https://doi.org/10.1007/978-3-642-14295-6_5>; checked against Crossref on 2026-10-13 for `chip-abc-sweep`; the paper itself was not read). The `resyn2`-style script is written from memory of the usual ABC alias, so it is one plausible script, not a verified copy. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Question
`chip-ppa-loop` scored every rewrite under one ABC script, and `chip-abc-sweep` showed the script can move cells&times;depth about as much as the written structure. So a rewrite's gain over the reference may be partly or wholly a script effect. Compared fairly, does a proposer file or a sweep config still beat the *reference under its best script*?

## Method
- Candidates per design: the reference, the valid proposer files (adder 4 of 5, multiplier 3 of 4; each file that fails the RTL equivalence gate is dropped, as in `chip-ppa-loop`) and the sweep configs (16 adder, 8 multiplier).
- Each candidate is scored under the five scripts of `chip-abc-sweep` (`flow.SCRIPTS`): `synth -noabc`, then `abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX [-script s]`. Cells = cell count, depth = `ltp -noff`, figure of merit cells&times;depth (generic-gate numbers, not um&sup2; or timing). Absolute numbers differ slightly from `chip-ppa-loop` (which let `synth` run its own ABC first) and match `chip-abc-sweep`.
- **New check.** After mapping, the netlist is written with `write_verilog` and proved equal to the reference by a Yosys miter and `sat -prove` (all 2^32 adder or 2^12 multiplier inputs), so ABC's output is checked as well as the written RTL.
- Not an equal-budget comparison: the proposer has 4 or 3 valid files, the sweep is run exhaustively. Rows below are the best of each group.

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys iverilog   # Yosys 0.33 here
cd research/chip-ppa-script
python3 -m unittest discover -s tests
python3 experiments/run.py        # rewrites experiments/results.txt (about 1 min)
```

## Results (from `experiments/results.txt`, Yosys 0.33)
cells&times;depth, best of each group; lower is better.

add16 (105 candidate-script pairs scored here and 60 for mul6; 0 mapped netlists failed the check):

| group | yosys default | strash;map | dc2 | dch | resyn2 |
|---|---|---|---|---|---|
| reference `a + b` | 2542 | 1540 | 2542 | 1540 | 1620 |
| proposer files (4 valid) | 2090 | 1280 | 2156 | 1230 | 1386 |
| sweep, all 16 configs | 2090 | 1155 | 2112 | 1078 | 1470 |

mul6:

| group | yosys default | strash;map | dc2 | dch | resyn2 |
|---|---|---|---|---|---|
| reference `a * b` | 3740 | 3458 | 4002 | 3401 | 3363 |
| proposer files (3 valid) | 3850 | 3629 | 4117 | 3515 | 3580 |
| sweep, all 8 configs | 3850 | 3629 | 4117 | 3515 | 3580 |

- **Adder.** The best proposer file is 0.80&ndash;0.86&times; the reference under the same script, so the rewrite gain survives a change of script. But the reference under its own best script (`strash;map`, 1540) is already 0.61&times; its default-script score (2542): most of the headline gain over the default is a script effect, as `chip-abc-sweep` suggested. The overall best, 1078 (sweep config carry-select with 2-bit blocks under `dch`, 98 cells, depth 11), is 0.42&times; the reference under the default script and 0.70&times; the reference under its best script.
- **Multiplier.** No rewrite beats `a * b` under any script (ratios 1.03&ndash;1.06). The best overall is the reference under `resyn2` (3363), 0.90&times; its default score: for the multiplier the whole improvement comes from the script.
- Every candidate that passed the RTL gate also passed the netlist check under every script (0 failures), and the gate rejected the two seeded faults (`a2_carry_select_bug`, `m3_off_by_one`). This is evidence ABC 0.33 maps these designs correctly, not a general result.

## Limitations
- Two small designs, one Yosys/ABC version, five scripts picked by the author, deterministic runs. The proposer files were written by the benchmark's author (a session agent), not by an API model; this says nothing about how well a model proposes rewrites.
- The sweep is exhaustive while the proposer has 3&ndash;4 files, so the sweep winning is expected and is not a statement about models.
- Cells&times;depth is a proxy under a generic library with equal-cost gates; a script that wins here may lose on post-layout area, delay or power (see `chip-pnr` for a fidelity gap of that kind).
- The equivalence proofs show the netlists compute the same function; nothing here checks timing, hazards or a real library.

## Next steps
Liberty-based mapping on SKY130 (as in `chip-pnr`) to see whether the script ordering survives real cell areas; a sweep over ABC script parameters rather than five fixed scripts; an `ANTHROPIC_API_KEY`-gated proposer (stubbed in tests) with many samples, scored against the best-script reference as here; designs with more room (FIFOs, MACs).

## Outside dependencies
Yosys and Icarus Verilog (apt). No LLM API, OpenROAD or PDK. All code is original or copied from the author's earlier projects, MIT-licensed.
