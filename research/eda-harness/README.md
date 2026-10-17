# eda-harness: an unattended, cached, logged design loop with pluggable proposers (first milestone of track 7)

Why it seemed worth doing: track 7 of `PROJECTS.md` asks for a chip-design loop that needs no LLM, so every later proposer comparison (`eda-proposers`, `eda-flowtune`, `eda-fidelity`) needs one shared harness that checks, scores, caches and logs candidates the same way. This is that harness, demonstrated on `chip-accel`'s MAC engine. Produced with AI assistance (Claude). Stylised and preliminary: one design family, generic-gate synthesis, no place and route.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-harness/

**Builds on.** `research/chip-accel` (generator, Icarus testbench, Yosys score script, imported rather than copied) and `research/chip-toolchain`. Tools: Yosys 0.33 and Icarus Verilog 12.0 (apt). No CU Boulder lab's work is built on and no affiliation is implied. The loop idea follows the open-flow aims in Ajayi et al., "Toward an Open-Source Digital Flow", DAC 2019, and the flow-tuning line of FlowTune/DRiLLS; none of those papers was read for this project and none is reproduced.

## Method
`src/eda_harness/harness.py`:
- `Problem`: generator + reference model + search space (here `p` = MAC lanes 1..8, `wb` = bit width 4..8, 40 designs).
- `Harness.evaluate(candidate)` runs stages: **generate** Verilog, **lint** (Icarus `-Wall` compile and Yosys `hierarchy -check; check -assert`), **rtl_sim** against the integer NumPy reference (bit exact and cycle exact, 24 vectors), **gate_equiv** (synthesise to generic gates, write the netlist back out, simulate it on the same vectors; this is *simulation-based* equivalence on 24 vectors, not a formal proof), **synth** (cells, flip-flops, depth). A failing stage stops the candidate and records `failed_stage`.
- Results are cached by SHA-256 of the Verilog plus the vector count and tool versions. Every evaluation, cache hit or not, is one JSON line with candidate, hash, tool versions, per-stage seconds and metrics.
- Proposers implement `propose(history) -> candidate`: `RandomProposer`, `GridProposer`. `pareto()` and `run_loop()` complete the loop. Place and route is not implemented (OpenROAD was not installed); the record notes whether it is.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog && pip install numpy matplotlib
cd research/eda-harness
PYTHONPATH=src:../chip-accel/src python -m unittest discover -s tests   # about 2 min
PYTHONPATH=src:../chip-accel/src python experiments/run.py              # about 7 min; rewrites eval_log.jsonl, results.txt, stage_time.png
```

## Results (from `experiments/results.txt`; log in `experiments/eval_log.jsonl`, 60 lines)
- All 40 grid designs passed every stage. The 20 random-search draws all hit the cache (the grid had already evaluated every point), which shows the cache works and nothing more: that random-versus-grid line is not a proposer comparison. Random search touched 19 of the 40 designs.
- Wall time over the 40 uncached evaluations (424 s total): gate_equiv 219 s (52%), synth 199 s (47%), lint 4.8 s, RTL simulation 1.4 s. Caveat: `gate_equiv` includes a second Yosys synthesis run to produce the netlist, so the two rungs share cost; the RTL simulation is nearly free next to synthesis here.
- Pareto front of (cells, cycles) over the grid: p = 1, 2, 4, 8 at wb = 4 (861 / 1098 / 1674 / 2800 cells; 110 / 56 / 29 / 20 cycles). Accuracy is not an objective here, so 4-bit designs dominate; these cell counts equal `chip-accel`'s for p = 1, 4, 8. Best cells×cycles 48546 (p = 4, wb = 4), as in `chip-accel`.
- Figure: `experiments/stage_time.png`.

## Limitations
- One design family and network; gate counts, not area; Yosys generic-gate flow only; versions recorded in each log line. Post-route numbers do not exist here, so nothing is said about silicon.
- Equivalence is checked by simulation on 24 vectors; a formal miter is the natural upgrade (see `chip-toolchain`).
- The tests mutate a design with a string replace; this catches one kind of bug and is not a verification study (that is `eda-verify`).

## Next steps
`eda-proposers` (annealing, GA, NSGA-II, TPE at equal budgets with hypervolume), a formal equivalence stage, an optional OpenROAD stage, and a cheaper gate-level stage that reuses the synthesis netlist.

## Outside dependencies
Yosys, Icarus Verilog (apt); NumPy, matplotlib (pip); `chip-accel` in this repository. All code original, MIT.
