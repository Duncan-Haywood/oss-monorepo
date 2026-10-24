# eda-goldenfree: can RTL checks that need no golden model catch the bugs a design loop injects? (track 7)

Why it seemed worth doing: `eda-verify` named "properties that need no golden copy" as its next step, because a design loop that generates new RTL has no trusted reference for a design it has never seen. This project writes five such properties (latency, done pulse, output hold, start-glitch and reset-abort invariance) and scores them on the same 91 mutants of the `chip-accel` MAC engine. Produced with AI assistance (Claude). Preliminary: one design, one mutant set, one fixed property list, simulation only.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/eda-goldenfree/

**Builds on.** `research/eda-verify` (the mutants, their ground truth and the golden-based checks), `research/chip-accel` (generator and spec latency), `research/eda-harness`. No CU Boulder lab's work is built on and no affiliation is implied.

## Result
The golden-free properties kill **22 of the 66 killable mutants (0.33)**, none of the 16 mutants proved equivalent and none of the 9 undecided ones. They find only control-flow bugs that change latency or make the run hang. Every datapath bug (all 15 ROM mutants, 44 of 66 killable overall) passes every property, because a wrong number is still a well-timed, repeatable number. All 22 are also caught by `eda-verify`'s 16 directed vectors, so on this design the golden-free checks add nothing the golden-based ones do not already give. Their value is for designs with no reference: they bound what can be checked there, and 0.33 is that bound for these five properties.

## Method
- **Properties** (`src/eda_goldenfree/props.py`), checked in an Icarus Verilog testbench, using only the spec's 20-cycle latency (`gen.cycles(8)`) and the module's own behaviour:
  1. *latency*: `done` rises exactly 20 cycles after `start`. 2. *pulse*: `done` is a single-cycle pulse. 3. *hold*: `y` is stable for 3 cycles after `done`. 4. *glitch*: a second `start` with a different input at cycle 5 is ignored (same latency, same output as the plain run). 5. *abort*: a one-cycle reset at cycle 7 followed by a fresh start gives the same output as the plain run. *repeat*: the first 8 inputs run again at the end give the same outputs (state leakage).
- **Run**: 32 plain random vectors, the first 8 with a glitch, the first 8 with an abort, and the first 8 plain again in reverse order. The golden design violates nothing (`tests/`).
- **Ground truth** is `eda-verify`'s: killable = killed by formal or any simulation check; equivalent = induction proof; undecided otherwise. The mutants are re-enumerated by `eda_verify.mutate` (the ROM sample is seeded) and matched by id.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog && pip install numpy
cd research/eda-goldenfree/experiments
python run.py        # about 1.5 minutes, one core; writes mutants.jsonl and meta.json
python analyse.py    # writes results.txt
cd ../tests && python -m unittest test_props
```

## Results (`experiments/results.txt`, per-mutant log `experiments/mutants.jsonl`)
- Killed: 22/66 killable (by kind: operator 6/15, literal 15/33, deletion 1/3, ROM 0/15). Violations on equivalent mutants 0/16, on undecided 0/9.
- Latency, glitch and abort are violated by the same 22 mutants, so as built they are one signal, not three: every kill is a latency change or a hang. Pulse (8) and repeat (8) fire on subsets, hold on 6; none kills a mutant alone.
- Against golden-based checks: random-64 (any seed) kills 62 of the 66 and the 16 directed vectors 61. Golden-free only: 0 beyond directed-16; directed-16 only: 40; both: 21; neither: 5.
- Cost: 1.34 CPU-s per mutant for the property run (14.3 kills per CPU-minute, against 39 to 42 for the golden-based simulation in `eda-verify`).

## Limitations
- One design and one fixed set of five properties chosen by the author before running; properties that constrain datapath values without a reference (for example monotonicity of a trained network) were not tried and could catch some of the 44. Properties were simulated, not proved: a formal property check (SymbiYosys) was not available.
- The glitch and abort properties were written to probe control robustness, but the mutation operators here rarely touch that logic, so the study cannot show their value.
- Ground truth inherits `eda-verify`'s caveats (equivalence by Yosys induction; 9 undecided).

## Next steps
Add datapath properties that need no golden (for example output saturation bounds and cross-vector relations); try the properties on `chip-systolic`; run them as a formal check once SymbiYosys is available.

## Owner steps
None.

## Outside dependencies
Yosys 0.33 and Icarus Verilog 12.0 (apt). All code original, MIT.
