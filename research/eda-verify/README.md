# eda-verify: how many injected RTL bugs do random, coverage-directed and formal checks catch? (milestone 6 of track 7)

Why it seemed worth doing: an unattended design loop (`eda-harness`) trusts its checks. This project asks what those checks actually catch, by injecting bugs (mutations) into a known-good generated design and scoring three automated checkers on how many they kill and at what CPU cost. Produced with AI assistance (Claude). Stylised and preliminary: one design (the `chip-accel` MAC engine at p = 8, 4-bit), 91 compilable mutants, one bound for the formal check.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-verify/

**Builds on.** `research/chip-accel` (generator, integer reference) and `research/eda-harness` (problem definition). The idea of measuring verification by mutation follows the standard mutation-testing literature; coverage-directed test generation follows Fine and Ziv, "Coverage Directed Test Generation for Functional Verification using Bayesian Networks", DAC 2003 (the idea only; no Bayesian network is used here, and that paper was not reproduced). No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- **Mutants** (`src/eda_verify/mutate.py`): source-level edits of the generated Verilog. Operator swaps (`+`/`-`, `*`/`+`, `>>>`/`>>`, `<`/`<=`, `>`/`>=`, `==`/`!=`), integer literal ±1, deletion of single non-blocking assignments, and +1 on a weight or bias ROM entry. 173 distinct mutants; all 87 non-ROM ones plus 15 randomly drawn ROM ones were sampled (102), of which 91 compile.
- **Checker 1, random vectors** (Icarus): uniform inputs, compared bit-exactly and cycle-exactly with the integer reference; a hang counts as a failure. 20 seeds × 64 vectors; the kill rate at budget n uses the first n vectors.
- **Checker 2, coverage-directed** (16 vectors, deterministic): from a pool of 4000 random and corner-biased inputs, greedily keep the vector that adds the most coverage points of the integer reference (per hidden neuron: ReLU-zero, saturation; per output: clipped high or low), then fill with extreme inputs. Coverage is measured on the reference model, not on RTL lines or toggles.
- **Checker 3, formal** (Yosys 0.33, no SymbiYosys or cocotb installed here): a miter of golden and mutant from the all-zero state with free inputs, bounded `sat -seq 22` (the design needs 20 cycles per inference), 150 s timeout. If that finds no counterexample, `equiv_make; equiv_simple; equiv_induct` tries a register-matched induction proof of equivalence for all time (240 s timeout).
- **Ground truth.** *Killable* = killed by any checker. *Equivalent* = induction proof succeeded (induction is sound; the mutants were not inspected one by one). *Undecided* = no simulation kill and no formal verdict; they are excluded from the kill-rate denominators and listed below.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog && pip install numpy matplotlib scikit-learn
cd research/eda-verify/experiments
python run.py        # about 1.5 hours on 4 cores; writes mutants.jsonl and meta.json
python analyse.py    # writes results.txt and kill_curve.png
cd ../tests && python -m unittest test_verify   # about 4 min (two formal runs)
```

## Results (`experiments/results.txt`, per-mutant log `experiments/mutants.jsonl`)
- 91 compilable mutants: 66 killable, 16 proved equivalent, 9 undecided. By kind (killable / equivalent / undecided): literal 33/8/7, operator 15/8/2, ROM 15/0/0, deletion 3/0/0.
- Kill rate over the 66 killable mutants: random 1 vector 0.76, 4 vectors 0.87, 16 vectors 0.95, 64 vectors 0.99; coverage-directed 16 vectors 0.97; formal (bounded, 22 cycles, with timeouts) 0.71. Random needs about 32 vectors to match what the 16 directed vectors reach, so the directed set helps modestly here, with one set and no confidence interval: treat it as suggestive only.
- No killable mutant escaped 64 random vectors in every seed, so this mutant set contains no random-resistant bug; that limits what the comparison can show.
- Formal missed 19 of the 66 killable mutants: they are all `undecided` for formal, i.e. the bounded SAT search timed out at 150 s without a counterexample or proof. Those 19 include 6 of the 15 ROM mutants. That is a statement about this solver and bound, not about formal methods in general.
- Cost: a 64-vector random run takes 1.1 CPU-s per mutant, the directed set 1.2 s, a formal kill 52 s on average and an equivalence proof 234 s. Killable mutants killed per CPU-minute: random 42, directed 39, formal 0.31. The induction proof is the only checker here that can certify "no bug of this kind", at about two hundred times the cost.
- Figure: `experiments/kill_curve.png`.

## Limitations
- One small design, one bound, one solver (Yosys' built-in SAT); SymbiYosys with a stronger solver (Boolector, Yices) and cocotb were not available and would likely change the formal numbers. Mutation operators are a simple fixed set, and mutants were not minimised; ROM mutants were sampled (15 of 86).
- The directed set uses coverage defined on the reference model, not on the RTL, and is a single deterministic draw.
- The 9 undecided mutants may be killable or equivalent. The 16 equivalents rely on Yosys' `equiv_induct`; no independent check was run.
- The equivalence proofs show the mutants equal the golden design as modelled by Yosys, not that the design is correct.

## Next steps
Run with SymbiYosys and a stronger solver; mutate the other design families (`chip-systolic`); add toggle or line coverage from Verilator; add properties (for example "done within 20 cycles") as a formal check that needs no golden copy; feed the cheapest effective check order (random, then directed, then formal on survivors) into `eda-harness`.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 and Icarus Verilog 12.0 (apt); NumPy, scikit-learn, matplotlib (pip); `chip-accel` and `eda-harness` in this repository. All code original, MIT.
