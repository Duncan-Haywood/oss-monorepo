# chip-abc-sweep: how much does the ABC synthesis script matter next to the written RTL structure?

Follow-up to `chip-ppa-loop` (track 3, `PROJECTS.md`), taking its "sweep over the ABC script itself" next step. Five ABC scripts are applied to five written adder structures and eight multiplier structures, each proved equivalent to its reference. Produced with AI assistance (Claude). Preliminary and small: two designs, one tool version, a generic-gate library.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-abc-sweep/

**Builds on.** `chip-ppa-loop` and `chip-toolchain` in this repository (same author, MIT; the generators in `src/chip_abc_sweep/gens.py` are copied unchanged from `chip-ppa-loop`). Tools: Yosys and its integrated ABC (Brayton and Mishchenko, "ABC: An Academic Industrial-Strength Verification Tool", CAV 2010, LNCS 6174:24-40, <https://doi.org/10.1007/978-3-642-14295-6_5>; authors, title, venue, year and pages checked against Crossref on 2026-10-13; the paper itself was not read). The script names (`dc2`, `dch`, `resyn2`) are ABC commands; the `resyn2` sequence is written out in `src/chip_abc_sweep/flow.py` from memory of the usual ABC alias, so treat it as one plausible resyn2-style script, not a verified copy. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Question
`chip-ppa-loop` found that ABC's restructuring erased most differences between hand-written topologies. Is that a property of the topologies or of the one default script? If the script moves the score as much as the structure does, a "rewrite proposer" must be compared across scripts, or it measures the script.

## Method
- Designs: `designs/add16.v` (16-bit add, 17-bit result) and `designs/mul6.v` (6x6 unsigned). Structures: adders `plus`, `ripple`, carry-select with 4-bit blocks (`csel4`, blocks use `+`), and carry-select with ripple blocks of 4 and 2 bits; multipliers: all 8 configurations of `gens.mul6_config_space()`. Every structure is proved equivalent to its reference by a Yosys miter and `sat -prove` before scoring (all pass).
- Flow: `synth -flatten -noabc`, then `abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX [-script s.abc]`. Area is the cell count, depth is `ltp -noff`; both are generic-gate numbers, not um^2 or timing. Figure of merit is cells x depth.
- Scripts (`flow.SCRIPTS`): Yosys's default; `strash; map`; `strash; dc2; map`; `strash; dch; map`; and `resyn2` followed by `map`.
- Note: this flow runs `synth -noabc` so that only the scripted ABC pass maps the logic. The `yosys_default` column therefore differs slightly from `chip-ppa-loop` (for example mul6 `a*b` is 175 cells here against 170 there, where `synth` ran its own ABC pass first). Do not compare absolute numbers across the two projects.

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys iverilog   # Yosys 0.33 here
cd research/chip-abc-sweep
python3 -m unittest discover -s tests
python3 experiments/run.py        # rewrites experiments/results.txt (about 20 s)
```

## Results (from `experiments/results.txt`)
add16, cells/depth (product):

| structure | yosys default | strash;map | dc2 | dch | resyn2 |
|---|---|---|---|---|---|
| plus | 82/31 (2542) | 110/14 (1540) | 82/31 (2542) | 110/14 (1540) | 108/15 (1620) |
| ripple | 77/31 (2387) | same | same | same | same |
| csel4 | 95/22 (2090) | 125/12 (1500) | 98/22 (2156) | 112/11 (1232) | 111/15 (1665) |
| cselrip4 | 77/31 (2387) | 79/28 (2212) | 77/31 (2387) | 77/31 (2387) | 77/31 (2387) |
| cselrip2 | 77/31 (2387) | 82/24 (1968) | 77/31 (2387) | 77/31 (2387) | 77/31 (2387) |

- The best add16 product is 1232 (`csel4` under `dch`), 0.48x the default-script `plus` (2542) and 0.59x the default-script best structure (2090). The script moves the same structure by up to 1.75x (`csel4`) and 1.65x (`plus`); structures move a fixed script by 1.18x to 1.94x.
- Two scripts (`dc2` and the default) leave the plain `+` at depth 31, a ripple-like depth; the `map`-based scripts give depth 11 to 15 at 110-125 cells. This is the area-for-depth trade, not a free gain.
- `ripple` is identical under every script (77 cells, depth 31): ABC does not find a faster carry structure from it. `cselrip` improves only under `strash;map`.
- mul6: all eight structures give identical results under each script (spread 1.00 to 1.01), so the written structure again made no difference. The script mattered: product 3515 (`dch`) to 4117 (`dc2`), 1.17x.
- Summary (median over structures): add16 spread 1.47x across structures and 1.21x across scripts; mul6 1.00x and 1.17x. For multipliers the script dominates; for adders both matter and the ordering depends on the statistic chosen.

## Limitations
- Two small designs, one Yosys/ABC version (0.33), five scripts picked by the author, deterministic runs (no seeds). The conclusions are about these cases only.
- Cells x depth is a proxy: the generic library has equal-cost gates, and depth is topological. A script that wins here may lose on post-layout area, delay or power (see `chip-pnr` for a fidelity gap of that kind).
- The equivalence proofs cover the written RTL, not the mapped netlist; the mapped netlist is trusted to ABC.
- No LLM is involved, and nothing here is a benchmark of one.

## Next steps
Re-run the `chip-ppa-loop` proposer-versus-sweep comparison under each script, so a rewrite has to beat the best script and not just the default; add the netlist-level equivalence check; try a liberty-based mapping (SKY130, as in `chip-pnr`).

## Outside dependencies
Yosys and Icarus Verilog (apt). No LLM API, OpenROAD or PDK. All code except the copied generators is original; both are MIT-licensed.
