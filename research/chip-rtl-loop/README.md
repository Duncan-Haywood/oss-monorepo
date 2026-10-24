# chip-rtl-loop: checker feedback for RTL generation, on nine small tasks

Second milestone of the LLM chip-design-loop track (`PROJECTS.md`, track 3). It builds the checking half of a generate-and-repair loop for Verilog: lint, compile, lockstep simulation against a golden model, and a formal equivalence proof for combinational tasks. It then runs one small experiment through it. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-rtl-loop/

**Builds on.** The task-plus-testbench style of VerilogEval (Liu et al., ICCAD 2023, <https://doi.org/10.1109/ICCAD57390.2023.10323812>) and RTLLM (Lu et al., ASP-DAC 2024, <https://doi.org/10.1109/ASP-DAC58780.2024.10473904>), and the conversational repair idea of Chip-Chat (Blocklove et al., MLCAD 2023; title and venue as listed in `PROJECTS.md`, no DOI given because the container could not reach a bibliographic service to confirm one). **This is not a reproduction of any of them**: the tasks, golden models and testbenches here are original, and no published benchmark data is used. Tools: Yosys, Icarus Verilog, Verilator (versions below). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- `tasks/<name>/`: `spec.md` (the only text the proposer sees), `ref.v` (golden model, not shown to the proposer), `meta.json` (ports). Five combinational tasks (`prio_enc`, `gray2bin`, `sat_add`, `popcount`, `asr`) and four sequential ones (`updown_ctr`, `edge_det`, `seq_1011`, `lfsr`).
- `src/chip_rtl_loop/check.py` runs four stages and stops at the first failure: (1) Verilator `-Wall` lint, failing only on errors; (2) Icarus compile; (3) a generated testbench driving the candidate and golden model with the same 4000 pseudo-random input vectors (sequential tasks: reset for the first 2 cycles and at random about 1 in 40 cycles), comparing outputs with `!==` before and after each clock edge; (4) for combinational tasks, a Yosys miter plus `sat -prove`, which covers all inputs. Sequential tasks get simulation only.
- `proposals/<task>/r<k>.v` are the proposals. **The proposer is the Claude session that wrote this project, not an API call and not a reproducible LLM benchmark.** Round 0 was written from `spec.md` alone. Round 1 was written after reading the checker's mismatch message for that task, and only for tasks that failed round 0. Each file is committed as written. Scoring is scripted.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog verilator     # Ubuntu 24.04 packages
cd research/chip-rtl-loop
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 4 tests, about 2 s
python3 experiments/run.py                                 # writes experiments/results.txt
```

## Results (from `experiments/results.txt`)
Tools: the Ubuntu 24.04 packages of Yosys, Icarus Verilog and Verilator (the same set as `chip-toolchain`; exact versions are recorded there).

| feedback rounds | tasks passing all stages |
|---|---|
| 0 | 6 / 9 |
| 1 | 9 / 9 |

- Round 0 failures, all at the simulation stage: `gray2bin` (wrote the Gray encoder `g ^ (g>>1)` for a decoder), `asr` (logical `>>` on a signed value, which zero-fills), `edge_det` (pulse as a combinational output instead of a flop). Each was fixed in one round after reading the mismatch trace. No round-0 candidate failed lint or compile.
- Lint warnings do not stop the loop and were not fed back: round-0 `popcount` has 16 `WIDTHEXPAND` warnings and round-1 `gray2bin` has `UNOPTFLAT` (the same vector-carry pattern noted in `chip-toolchain`).
- The tests check that every golden model passes its own task (rename only), and that a wrong combinational design, a wrong sequential design and a syntax error are stopped at sim, sim and lint.

## Limitations
- **One attempt per round, nine tasks, one proposer who also wrote the tasks.** The pass rates are anecdotes, not estimates, and say nothing about any other model. The tasks are textbook circuits that any proposer has likely seen; this is not a contamination-free test.
- The spec text for `edge_det` and `seq_1011` was written to pin down timing; a hidden ambiguity in a spec would show up as a failure that is the spec's fault. Round-0 failures here were all genuine logic mistakes, but that is a judgement.
- Random simulation of 4000 vectors can miss rare corner cases in sequential designs, and no formal check covers sequential tasks. A candidate marked PASS there is "not distinguished from the golden model by this stimulus".
- No no-feedback resampling baseline (several independent round-0 attempts) exists, so the data cannot separate "feedback helped" from "a second try helps".
- Lint and formal stages were never the deciding failure in this run, so their value to the loop is untested here.

## Next steps
Run the same harness with a model behind an `ANTHROPIC_API_KEY`-gated proposer (deterministic stub in tests) over many samples; add a sequential equivalence check (Yosys `equiv_induct` or SymbiYosys); add the independent-resampling baseline; then `chip-ppa-loop`.

## Outside dependencies
Yosys, Icarus Verilog, Verilator (apt). No LLM API, OpenROAD or PDK. All tasks, golden models and proposals are original and MIT-licensed.
