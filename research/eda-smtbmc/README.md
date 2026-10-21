# eda-smtbmc: can an SMT bounded model check (z3) settle the 10 RTL mutants that Yosys' SAT and induction left undecided?

Why it seemed worth doing: `eda-biasdraw` ended with "give the 9 timeouts a stronger formal check (SymbiYosys with Boolector, or a bounded-depth unrolled proof)". SymbiYosys, Boolector and Yices were not installable here, but `yosys-smtbmc` ships with Yosys and drives z3 from apt. This project asks whether that route decides anything the built-in `sat -seq` could not. Produced with AI assistance (Claude). **Negative result:** z3 decides none of the 10 targets at the depth a full inference needs (24 cycles), and the sweep shows why. One design (the `chip-accel` MAC engine, p = 8, 4-bit), one solver.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-smtbmc/

**Builds on.** `research/eda-biasdraw` and `research/eda-deepdraw` (the targets), `research/eda-verify` (mutants, miter setup, the Yosys SAT/induction baseline). The 10 targets are the `eda-deepdraw` survivors with formal verdict "undecided": `del@122:delete` (known truncation, killable) and 9 others (six `lit@123:0+1` mutants of identical text id, `op@135:<-><=`, `op@137:<-><=`, `lit@137:4+1`). No lab's work is built on and no affiliation is implied.

## Method
- Same golden/mutant pair and miter as `eda-verify` (`proc; flatten; memory_map; opt; miter -equiv -make_assert`), undefined register inits set to 0 (as `sat -set-init-zero` did), exported with `write_smt2`.
- `yosys-smtbmc -s z3 -t D` with Yosys 0.33 and z3 from apt. `pass` means no assertion violation within D steps; `timeout` means no verdict. Induction (`-i`) was to follow a pass at depth 24.
- **A.** D = 24 (one inference is 20 cycles), 900 s limit, all 10 targets, 4 in parallel.
- **B.** Depth sweep D = 2, 4, 6, 8, 10, 12, ... with a 240 s limit on `del@122` and one `lit@123` target.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog z3 && pip install numpy scikit-learn
cd research/eda-smtbmc
python experiments/smtrun.py 24 900   # about 45 min on 4 cores; writes smt.jsonl
python experiments/sweep.py           # about 10 min; writes sweep.jsonl
python experiments/analyse.py         # stdlib only; writes results.txt
python -m unittest discover -s tests
```

## Results (`experiments/results.txt`, logs `experiments/smt.jsonl`, `experiments/sweep.jsonl`)
- **A.** All 10 targets time out at depth 24 after 900 s: 0 pass, 0 counterexamples, so induction was never attempted.
- **B.** Both swept targets pass to depth 10 in about 3 s (0.1 s at depth 2, 0.9 s at 8) and time out at depth 12 with no verdict after 240 s. Cost grows by a factor of ~4 per two steps up to depth 10, then jumps past 70x. One inference needs 20 cycles, so this route stops at about half of it.
- The sweep includes `del@122`, which simulation shows is killable (truncated output). z3 does not find it by depth 10 either: "no counterexample to depth 10" says nothing about the full 20-cycle behaviour, so these passes must not be read as equivalence.
- So the undecided set stays undecided. This route is not stronger than `sat -seq 22` at the depth that matters; it adds a data point on where the cost wall sits (depth 10 to 12).

## Limitations
- Only z3 was tried. Yices and Boolector (the usual faster BMC solvers) are not installable in this environment, so the result does not say SMT-BMC cannot work, only that z3 on this unrolled netlist does not.
- Time limits are 900 s (A) and 240 s (B); a longer limit could change a timeout to a verdict. The sweep stops at the first timeout, so it does not show growth beyond depth 12.
- Two targets swept, not ten; the other eight are only measured at depth 24.
- The miter is the flattened bit-blasted netlist after `memory_map`; a word-level encoding of the multiplier and ROM could be far cheaper and was not tried.

## Next steps
Try the word-level route: keep the ROM and multiplier as SMT arrays and bit-vector multiplies (skip `memory_map` and bit-blasting, export with `write_smt2` without `-wires` flattening), or constrain the inputs to a small set after the reset to shorten the unrolling. Or install Yices/Boolector in an environment that has them.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 (apt), z3 (apt), Icarus Verilog 12.0 (apt, via `eda-verify`); NumPy and scikit-learn via `eda-verify`, `chip-accel` and `eda-harness` in this repository. All code original, MIT.
