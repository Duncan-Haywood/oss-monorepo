# eda-equivxfer: does "the mutant synthesises to the golden netlist" predict formal equivalence on a second design family? (follow-up to `eda-conefeat`, track 7)

Why it seemed worth doing: `eda-equivpredict`, `eda-equivinterval` and `eda-conefeat` all stop at one design (the `chip-accel` MAC engine), and each lists "repeat on `chip-systolic`" as the open step: a source-line predictor cannot transfer, and the netlist features of `eda-conefeat` were scored only on the design that produced them. This project mutates a second design, runs the same simulation and formal checks on it, and scores the one design-independent netlist rule on both. Produced with AI assistance (Claude). **Stylised and preliminary:** two designs, 27 and 32 simulation survivors, and on the new design 20 of 32 formal runs hit their timeouts.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-equivxfer/

**Builds on.** `research/eda-verify` (mutation operators, `checks.formal`, and the committed MAC log), `research/chip-systolic` (the second design family: a 2 × 4 output-stationary systolic array, 4-bit), `research/eda-conefeat` (netlist-feature idea on the MAC survivors). No CU Boulder lab's work is built on and no affiliation is implied.

## Method
- **Rule.** A mutant is predicted equivalent when `synth -flatten; abc -g <generic gates>` gives exactly the golden design's cell count per cell type (`src/eda_equivxfer/netlist.py`). It needs no formal run, no line numbers and no training.
- **Family A (MAC, p = 8)**: the 27 survivors of 16 directed vectors in `eda-verify`'s log, with its formal verdicts (150 s SAT, 240 s induction). Only the signature is new.
- **Family B (systolic, 2 × 4)**: 231 mutants enumerated by `eda-verify`'s operators, 160 sampled (all 145 non-ROM, 15 ROM), 143 compile, 32 survive 32 random batches of 2 vectors (bit-exact outputs and cycle count against the integer model). Formal: `checks.formal` with a 43-cycle bound and **shorter** timeouts than family A (60 s SAT, 120 s induction), so more verdicts are "undecided" here than a longer budget would give.
- **Truth** is the formal verdict: *equivalent* (induction proof), *killed* (counterexample) or *undecided* (timeout).

## Reproduce
```bash
sudo apt-get install -y yosys iverilog && pip install numpy
cd research/eda-equivxfer
python experiments/run.py        # about 45 min on 4 cores; writes systolic.jsonl, mac_sig.jsonl, meta.json
python experiments/analyse.py    # seconds; writes experiments/results.txt
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`; Yosys 0.33, Icarus Verilog 12.0)
- **Matching signature** is rare and right every time it occurs: 1 of 27 survivors on the MAC (equivalent) and 2 of 32 on the systolic array (both equivalent). That is 3 of 3, but the rule finds only 3 of the 28 proved equivalents (16 + 12), so it skips about 3% of the formal CPU (224 of 7,414 s on the MAC, 163 of 5,246 s on the systolic array) and the signature runs cost 147 and 253 s.
- **Equivalent mutants usually change the netlist.** Their change in total cell count spans −75 to +117 on the MAC and −5 to +131 on the systolic array; 4 of 28 are exactly 0, and 3 of the 28 have an identical signature. Resynthesis does not canonicalise, so "same netlist" is a sufficient but almost never present signal.
- **A zero change is not evidence of equivalence.** Of the undecided survivors, 7 of 9 on the MAC and 8 of 20 on the systolic array change the cell count by exactly 0 (13 of 20 by at most 2), as many as the equivalents do (4 of 28), so the cell-count change does not separate equivalent from undecided on either design. This repeats `eda-conefeat`'s MAC finding on a design the idea was not fit on.
- **Formal rarely kills survivors** here: 2 kills on the MAC, 0 on the systolic array. On the systolic array the 20 undecided verdicts are timeouts at 60 s and 120 s, not evidence of non-equivalence.

## Limitations
- Two designs from one family of generators and one mutation operator set. Survivors cluster: at least eight of the 32 systolic survivors share one mutated source line.
- Family B's labels depend on short timeouts; with longer budgets some undecided would become equivalent or killed, so recall of the rule could only fall or stay low, but precision (3 of 3) is on a tiny count and carries no interval.
- Signature equality is checked on Yosys 0.33's generic-gate script; another script or version may give different counts.
- The mutation sample is not the whole mutation space (15 of 86 ROM sites each).

## Next steps
A canonical form that survives resynthesis (structural hashing of the AIG after `abc`, or `eda-conehash`'s cone hashes) is the natural stronger rule to try on both designs; longer formal budgets, or SymbiYosys with a stronger solver, would sharpen the systolic labels.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 and Icarus Verilog 12.0 (apt), NumPy (pip); `chip-systolic`, `chip-accel`, `eda-verify`, `eda-harness` in this repository. All code original, MIT.
