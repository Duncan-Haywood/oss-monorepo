# chip-ppa-sky130mac: do the carry-save MAC rewrites of `chip-ppa-mac` survive mapping to real SKY130 cells?

Follow-up to `chip-ppa-mac` (track 3, `PROJECTS.md`), taking its "liberty-based mapping on SKY130" next step. It is a fidelity question like the repository's twin projects: how well does a cheap score (generic-gate count times depth) predict a higher-fidelity one (SKY130 HD cell area times ABC's delay estimate)? Produced with AI assistance (Claude). Preliminary and small: one 4&times;4 design, one tool version, one corner, ABC's own delay estimate, no placement or routing.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-ppa-sky130mac/

**Builds on.** `chip-ppa-mac`, `chip-ppa-script` and `chip-pnr` in this repository (same author, MIT): `designs/`, `proposals/` and `gens.py` are copied unchanged from `chip-ppa-mac`; the liberty-filtering function is adapted from `chip-pnr`; the ABC scripts follow `chip-ppa-mac` (the `resyn2`-style one is written from memory of the usual ABC alias, so it is one plausible script, not a verified copy). Tools: Yosys 0.33 and its integrated ABC (Brayton and Mishchenko, "ABC: An Academic Industrial-Strength Verification Tool", CAV 2010, LNCS 6174:24-40, <https://doi.org/10.1007/978-3-642-14295-6_5>, checked in `chip-abc-sweep`; the paper was not read here). The cell library is the SkyWater SKY130 HD `tt_025C_1v80` liberty file from OpenROAD-flow-scripts (Apache-2.0), fetched at a pinned commit and not vendored. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Question
`chip-ppa-mac` found that carry-save MAC forms beat `a*b+c` by up to 9% on generic-gate cells&times;depth, but only under some ABC scripts. Does that survive technology mapping to SKY130 cells, and does the generic metric rank candidates the way the cell-level metric does?

## Method
- The same 17 candidates as `chip-ppa-mac` (reference `a*b+c`; three proposer files and a seeded-fault file written by the session agent, not an API model; a 12-config sweep). Each is first checked against the reference by a Yosys miter and `sat -prove` over all 2<sup>16</sup> inputs; the seeded fault is rejected.
- Each valid candidate is mapped with `synth -noabc`, then `abc -liberty <SKY130 HD> -script ...` under four ABC scripts (`strash; map`, `dc2`, `dch`, `resyn2`-style; the Yosys default script of `chip-ppa-mac` has no liberty analogue and is dropped), then `topo; stime`. Cells marked dont_use by ORFS (lpflow, probe, fill, tap, decap, diode, conb) are removed from the liberty file first, as in `chip-pnr`.
- Metrics: area in &micro;m&sup2; from `stat -liberty` (it equals ABC's reported area; a test checks this), delay in ps from ABC's `stime` (a static estimate with no wire load, not a place-and-route timing result), and area&times;delay in &micro;m&sup2;&middot;ns. The generic metric is `chip-ppa-mac`'s cells&times;depth under the same script.
- Every mapped netlist is proved equal to the reference by a miter in which the liberty file is read as logic models (`read_liberty -ignore_miss_func -ignore_miss_dir`). A test confirms the check rejects a mapped faulty design.
- Agreement is measured by Spearman rank correlation, pooled over all 64 (candidate, script) pairs and within each script.
- The comparison is not equal-budget: the proposer has 3 valid files, the sweep is exhaustive over 12 configs.

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys iverilog   # Yosys 0.33 here
cd research/chip-ppa-sky130mac
sh fetch_pdk.sh pdk                                  # sparse git clone of ORFS at a pinned commit
python3 -m unittest discover -s tests                # about 10 s; the mapping tests skip without pdk/
python3 experiments/run.py                           # about 100 s; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`, Yosys 0.33)
17 candidates, 1 rejected by the RTL gate (the seeded fault), 64 candidate-script pairs mapped, 0 mapped netlists failed the equivalence check. Best area&times;delay (&micro;m&sup2;&middot;ns, lower is better):

| group | `strash; map` | `dc2` | `dch` | `resyn2` |
|---|---|---|---|---|
| reference `a*b+c` | 1723 | 1458 | 1485 | **1193** |
| proposer files (3 valid) | 1512 | 1349 | 1273 | 1268 |
| sweep (12 configs) | 1663 | 1349 | 1225 | 1325 |

- Same-script ratios, sweep-best / reference: 0.97, 0.93, 0.83, 1.11. Proposer-best / reference: 0.88, 0.93, 0.86, 1.06. So under three of four scripts a carry-save form is 3&ndash;17% better on this metric, and under `resyn2` it is 6&ndash;11% worse.
- **The overall best is the plain reference under `resyn2`** (711 &micro;m&sup2;, 1679 ps, 1193). Allowing the reference its best script, no rewrite beats it. This differs from `chip-ppa-mac`, where the best carry-save form edged the reference under its best script (0.93&times; there, generic gates).
- The generic metric's sweep-best / reference ratios reproduce `chip-ppa-mac`'s numbers for the shared scripts: 1.04, 1.06, 0.91, 0.94. At cell level they become 0.97, 0.93, 0.83, 1.11. The sign flips only for `resyn2` (generic 0.94, cells 1.11).
- Rank agreement: Spearman 0.20 pooled for cells&times;depth against area&times;delay. Components: generic cells against area 0.74 (fairly good), generic depth against delay 0.26 (weak). Within scripts: &minus;0.22, &minus;0.10, 0.11, 0.50 (`strash; map`, `dc2`, `dch`, `resyn2`). The candidate with the best generic score (`csa_first_and` under `dch`) has SKY130 area&times;delay 1317, 10% above the best mapped design.
- Many sweep variants map to identical numbers (the tool normalises chain and tree summation to the same adder structure), so the 12 sweep configs are fewer than 12 independent samples.

## Limitations
- One 4&times;4 design, one Yosys/ABC version, one corner (typical, 25&deg;C, 1.8 V), four scripts chosen by the author. Everything is deterministic, so there is no confidence interval; 17 candidates and 64 pairs give a noisy correlation.
- ABC's `stime` delay is load-independent and has no wire model, so the delay half of the metric is the weakest; the weak depth-to-delay correlation may partly reflect that estimate rather than real timing. Place-and-route numbers (`chip-pnr`'s flow) could differ again and were not run here.
- Yosys 0.33 has no `abc -dont_use`, so the filtered liberty file is a workaround.
- The proposer files were written by the session agent after seeing earlier projects' results; nothing here says how an API model would propose.
- Unsigned arithmetic only. Equivalence proofs show the same function, not timing or hazard behaviour.

## Next steps
Run `chip-pnr`'s OpenROAD flow on the best few candidates to see whether the cell-level ranking survives layout; use the SKY130 area&times;delay as the score in a proposer loop; an 8&times;8 MAC with a faster equivalence check; an `ANTHROPIC_API_KEY`-gated proposer (stubbed in tests).

## Owner steps
None required.

## Outside dependencies
Yosys 0.33 and Icarus Verilog (apt; Icarus is not used by this project's tests); the SKY130 HD liberty file from OpenROAD-flow-scripts at commit `e5cc6e799f5ddf36e6bdf2d8c5db73373b88f52c` (fetched, Apache-2.0, not vendored). Not made here: the cell library, the tools. No LLM API or paid service.
