# chip-repair-baseline: a no-model repair baseline for RTL checkers, on ten small Verilog tasks

A companion to [`research/chip-rtl-loop`](../chip-rtl-loop) (the repository's second chip-track milestone, written by a parallel run that merged first; this project shares no code with it). It supplies what the loop needs for a fair comparison (`PROJECTS.md`: every proposer is compared with a baseline that uses no LLM): ten tasks with references and testbenches, a four-stage checker (compile, lint, simulation, SAT miter), a random-mutation hill-climbing repair baseline, and an optional model proposer. **Preliminary and small.** The only proposer actually run besides the baseline was the session agent (Claude), and it passed every task on its first attempt, so feedback rounds were not exercised. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-repair-baseline/

**Builds on.** The LLM-for-RTL benchmarks VerilogEval (Liu, Pinckney, Khailany and Ren, ICCAD 2023, <https://doi.org/10.1109/ICCAD57390.2023.10323812>) and RTLLM (Lu, Liu, Zhang and Xie, ASP-DAC 2024, <https://doi.org/10.1109/ASP-DAC58780.2024.10473904>) for the idea of scoring generated RTL by simulation against a reference, and Chip-Chat (Blocklove, Garg, Karri and Pearce, MLCAD 2023, <https://doi.org/10.1109/MLCAD58807.2023.10299874>) for conversational repair with tool feedback. No task, text or testbench is taken from them: all ten tasks, references and testbenches are written for this project, and the numbers here are not comparable with theirs. It uses the same open tools as `chip-toolchain` but separate code. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- `tasks/<name>/`: `spec.md`, `golden.v` (reference module `<name>_ref`) and `tb.v` (prints `RESULT fail=N total=M`). Eight combinational tasks (popcount, Gray-to-binary, priority encoder, absolute difference, leading-zero count, signed saturating add, two-digit BCD add, 8-bit divide with a divide-by-zero rule) and two sequential ones (a saturating up/down counter, a four-way round-robin arbiter). Testbenches are exhaustive for combinational tasks (256 to 65,536 vectors; 20,000 for BCD, the specified domain) and 4,000 seeded pseudo-random cycles for sequential ones.
- `src/chip_repair_baseline/check.py`: for a candidate module it runs, in order, (1) Icarus Verilog compile, (2) Verilator `--lint-only -Wall` (errors fail, warnings are counted and reported), (3) simulation against the reference, (4) for combinational tasks a Yosys miter plus `sat -prove`. The first failing stage and a one-line feedback string come back. `bcd_add2` skips stage 4: its spec leaves non-BCD digits undefined, so an unconstrained miter would reject correct designs.
- `src/chip_repair_baseline/mutate.py`: the **no-model baseline**. Random single-token mutations (swap an operator within its family, add or subtract 1 from a literal), hill climbing on the number of mismatching vectors, equal-score moves accepted, seeded.
- `src/chip_repair_baseline/llm.py`: `llm_proposer` calls the Anthropic Messages API when `ANTHROPIC_API_KEY` is set (model from `CHIP_LLM_MODEL`); without a key the deterministic stub returns nothing. **It was never run here (no key in the container); treat it as untested.**
- `attempts/<task>/round1.v`: the session agent's first attempt for each task, written from the spec alone before the checker was run on it.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog verilator
cd research/chip-repair-baseline
python3 -m unittest discover -s tests -v     # 7 tests, about 5 s
python3 experiments/run_session.py           # session attempts -> experiments/session_results.txt
python3 experiments/run_repair.py            # baseline repair, about 9 min on 4 cores -> repair_results.txt
```

## Results (`experiments/*.txt`)
Tools: the Ubuntu 24.04 packages for Yosys, Icarus Verilog and Verilator, as in `chip-toolchain`.

**Session agent, first attempt (one attempt per task, n = 10).** All ten pass all applicable stages: 10/10 at round 1, with 1 to 9 Verilator style warnings each (reported, not failures). Zero feedback rounds were needed, so this run says nothing about how pass rate grows with rounds. The tasks are too easy for that, and ten tasks cannot rank proposers. The result is also not a model benchmark: it is one session, one attempt, and the tasks were chosen by the same agent.

**Baseline repair.** For each task, the agent's passing design received k = 1, 2, 3 random token mutations (kept only if the checker rejected the result), then the baseline hill climb ran with a budget of 60 checker evaluations, two seeds per task (20 cases per k):

| faults injected | repaired within 60 evaluations | first rejected by |
|---|---|---|
| 1 | 9 / 20 | simulation 18, lint 2 |
| 2 | 4 / 20 | simulation 16, compile 4 |
| 3 | 4 / 20 | simulation 19, lint 1 |

"Repaired" means the checker accepts the result, which need not be the original source. Repair rates differ by task (zero of six on the priority encoder, round-robin arbiter, signed saturating add and saturating counter; four of six on `clz8` and `div8`). The hill climb accepts equal-score moves and can stall in a local optimum, as one unit-test attempt on `gray2bin8` showed (not repaired in 400 evaluations from a one-fault start). Stage 4 (formal) never rejected anything that simulation had accepted, because the combinational testbenches are exhaustive; the miter is a cross-check here, and would matter only for wider datapaths where exhaustive simulation is out of reach.

## Limitations
- Ten tiny tasks, one proposer actually run, one attempt each. The feedback loop (rounds against pass rate) is built but unmeasured. The planned comparison of an LLM proposer with the baseline needs an API key or more harder tasks.
- Baseline mutants are random token edits, unlike the mistakes a language model makes; the repair rates describe this checker and search, not LLMs.
- Simulation timeouts count as simulation failures. Style warnings do not affect pass/fail.
- Everything is simulation; no synthesis result or physical design is claimed.

## Next steps
Run `llm_proposer` with a key at several feedback depths, add tasks hard enough that first attempts fail, and extend to `chip-ppa-loop`.

## Outside dependencies
Yosys, Icarus Verilog, Verilator (apt). The optional Anthropic API is not needed for any result above. All tasks, references and testbenches are original and MIT-licensed.
