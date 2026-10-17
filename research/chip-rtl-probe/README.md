# chip-rtl-probe: what do lint, random simulation and a formal equivalence proof each catch in small RTL designs?

Companion to the track-3 milestone `chip-rtl-loop` (`research/chip-rtl-loop`, landed by a parallel run with its own, different task suite and checker; this project was built independently and overlaps it in purpose). It builds the loop harness (a proposer writes Verilog; lint, random-vector simulation and a Yosys equivalence proof score it; the failure text goes back) and a 12-task suite of small modules. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-rtl-probe/

**Builds on.** The task-and-testbench style of VerilogEval (Liu et al., ICCAD 2023, <https://doi.org/10.1109/ICCAD57390.2023.10323812>) and RTLLM (Lu et al., ASP-DAC 2024, <https://doi.org/10.1109/ASP-DAC58780.2024.10473904>), and the human-in-the-loop RTL conversations of Chip-Chat (Blocklove et al., MLCAD 2023). No task, testbench or number from those works is used or reproduced; all tasks, references and testbenches here are original and MIT-licensed. Tools: Yosys, Icarus Verilog, Verilator. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## What was and was not measured
- **No LLM benchmark.** The build environment has no model API key. The proposer that wrote the attempts is the session agent (Claude), **one attempt per task, written before the checker was run**. That is 12 attempts, not a benchmark, and says nothing about other models.
- Result: all 12 attempts passed all three stages at round 0 (the sibling `chip-rtl-loop` had 3 of 9 round-0 failures with different tasks and the same kind of session-agent proposer, so this suite being easy for the proposer is a property of these tasks, not of the proposer), so **the feedback loop never had a failure to react to**, and "pass rate against feedback rounds" is flat (12/12 at round 0). The suite is too easy for the session agent. Harder tasks are the first next step.
- Because of that, the measured parts are about the *checker*: what each stage catches (single-point mutants of the 12 designs) and how a no-LLM repair baseline does.
- `loop.py` also contains an `Anthropic` proposer (needs `ANTHROPIC_API_KEY` and `CHIP_RTL_MODEL`). **It has never been run**; the deterministic `Replay` proposer is what the tests and results use.

## Method
- `tasks/<name>/`: `spec.md` (module name, ports, behaviour), `ref.v` (reference `<name>_ref`), `tb.v` (4000 random vectors or cycles, candidate vs reference). Eight combinational tasks (`sat_add8`, `popcount8`, `gray2bin8`, `prio_enc8`, `absdiff8`, `rotl8`, `crc8`, `divmod10`) and four sequential (`updown4`, `edge_det`, `rr_arb4`, `fifo4`).
- `src/chip_rtl_loop/check.py`, three stages, first failure stops: **lint** (Icarus compile, then Verilator `--lint-only` with `-Wno-WIDTH -Wno-UNOPTFLAT`); **sim** (Icarus); **formal** (Yosys miter against the reference; SAT proof over all inputs for combinational tasks; for sequential tasks a *bounded* proof from the all-zero state over 10 cycles, as 20 cycles did not finish for `fifo4` within a minute).
- `mutate.py`: single-point edits (operator swaps, `!` deletion, constant ±1). `loop.py`: the loop and proposers (`Replay`, `RandomMutation`, `Anthropic`).
- **Post-hoc change, disclosed.** The first checker used Verilator's default warnings including the `WIDTH` family and `UNOPTFLAT`. Under it, 3 of the 12 round-0 attempts failed at lint (`gray2bin8`: `UNOPTFLAT`; `popcount8` and `divmod10`: `WIDTHEXPAND`) and, more tellingly, 5 of the 12 *reference* designs failed it too. A pass criterion the reference cannot meet is not usable, so those classes were switched off. The 3 lint-only failures were therefore not exercised as feedback rounds. `chip-toolchain` documents the same `UNOPTFLAT` false positive.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog verilator     # Ubuntu 24.04 packages
cd research/chip-rtl-probe
python3 -m unittest discover -s tests -v              # 9 tests, about 1 s
python3 experiments/run.py                            # about 3 min; output in experiments/results.txt
```

## Results (all from `experiments/results.txt`; Yosys 0.33, Icarus 12.0, Verilator 5.020)
1. **Session attempts:** 12/12 pass lint, simulation and formal at round 0.
2. **Mutation probe** (414 single-point mutants of the 12 round-0 designs; a mutant counts under the first stage that rejects it): lint 56, simulation 303, formal-only 30, survived all three 25. So **30 of 389 rejected mutants (7.7%) passed lint and 4000 random vectors and were caught only by the equivalence proof**: the case for the formal stage. The 25 survivors pass everything; for `sat_add8` (2) and `fifo4` (3) I inspected them and all five only change a declared width or range (equivalent mutants). The other 20 (mostly `crc8` 9 and `divmod10` 11) were not inspected, so some may be equivalent and some may be differences the sequential 10-cycle bound or the checker cannot see.
3. **Random-mutation repair baseline** (no LLM, feedback ignored, one random single-point mutation of the broken design per round; one sim- or formal-failing mutant per task, 3 seeds, 36 runs per budget): repaired 11/36 within 4 proposals, 22/36 within 16. This is a weak toy baseline: a single-edit bug has a single-edit repair, so the odds are roughly budget ÷ number of mutation sites, which is small for these tiny modules. It is not comparable to an LLM result and is here only to give a floor at an equal checker budget.

## Limitations
- One proposer, one attempt per task, tasks it solved immediately: no evidence yet on how feedback rounds help.
- The formal stage for sequential tasks is a 10-cycle bounded proof from reset-like state; deeper bugs (for example FIFO behaviour after more than 10 cycles) can pass it. Random simulation covers 4000 cycles but has no proof.
- Reference and testbench share an author with the attempts, so a misreading of a spec could be copied into both. Specs are short; this was not independently reviewed.
- Mutants are syntactic single edits, not a model of how LLMs err. Mutation survivors are not all equivalent.
- Lint is a project-defined subset of Verilator warnings.

## Next steps
Harder tasks (so a round-0 failure occurs), an actual LLM proposer run with the API key set by the owner, a feedback-text ablation (stage name only vs full counterexample), then `chip-ppa-loop`. Merge the two checkers' task suites if the owner wants one project.

## Outside dependencies
Yosys, Icarus Verilog, Verilator (apt). An LLM API is optional and not used for any reported number. No benchmark data is vendored.
