# accel-policy: does a small control network need an accelerator at the control-rate deadline? (stylised, preliminary, mostly negative on the policy)

Fourth milestone of track 8 (task-specific AI accelerators) in `PROJECTS.md`: an accelerator for a small control network inside an arm loop, where the constraint is a deadline at the control rate, compared with a microcontroller whose cycles are estimated. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-policy/

**Why it seemed worth asking.** The earlier `accel-*` projects measured energy and cycles but never tied them to a closed-loop requirement. A control network has a hard deadline (inference must finish within the control period), and a late result is a delayed torque. I wanted to know at which control rates the hardware choice starts to matter, and whether it matters before the network itself fails.

**Builds on.** `research/accel-dataflow` (the P-lane output-stationary cycle formula at batch 1, `ceil(O/P)*I` per layer plus 3 overhead cycles), `research/accel-kws` (MLP quantisation approach) and `research/robofab-armaccel` (the two-link vertical-plane arm with its assumed masses and 5 N m torque limit, re-implemented here in NumPy). Policy learning follows behaviour cloning with DAgger (Ross, Gordon and Bagnell, 2011, "A Reduction of Imitation Learning and Structured Prediction to No-Regret Online Learning", AISTATS); the teacher is textbook computed-torque control. Not re-verified in this run: the DAgger citation details were written from memory. No paper's numbers are reproduced and no CU Boulder group's work is built on or implied.

## Method
- **Plant and teacher** (`src/accel_policy/arm.py`): two-link rod arm (0.12 m links, 0.12 kg each, 0.1 kg wrist load, 5 N m torque limit, all assumed). Teacher: computed-torque PD with saturation (Kp 900, Kd 60). Tasks: random min-jerk moves of 0.25 to 0.6 s between random joint configurations. `rollout` integrates event by event, so a latency of microseconds is exact: the controller reads the state every `Ts`, and its torque is applied `latency` seconds later (the old torque is held until then).
- **Policy**: MLP, 8 inputs (tracking errors and reference state), 2 outputs (torque / limit), ReLU, trained with NumPy Adam on 14.7k teacher samples plus two DAgger rounds (about 40k learner-visited states relabelled by the teacher). Post-training symmetric per-tensor quantisation to 8- or 4-bit weights, 8-bit activations, integer inference (`policy.py`).
- **Hardware latency** (`hw.py`, **all constants assumed**): accelerator = P lanes (1, 4, 16) at 25 or 50 MHz, cycles from the `accel-dataflow` formula. Microcontroller = a compiled C loop at an assumed 6 cycles per int8 MAC on a Cortex-M0+-class core at 48 MHz and 2.5 cycles per MAC on a Cortex-M4-class core at 168 MHz, plus 4 cycles per output and 40 per layer. These MCU figures were written from memory of typical parts, **not checked against datasheets or measured**, and a tuned SIMD kernel would be faster.
- **Experiment** (`experiments/run.py`): for six networks, closed-loop RMS joint error (rad) over 12 held-out moves at control periods 0.05, 0.1, 0.25, 1 and 5 ms, with each platform's modelled latency where it meets the deadline (latency <= Ts).

## Reproduce
```bash
cd research/accel-policy
python3 -m unittest discover -s tests -v          # 6 tests, ~1 s (numpy)
python3 experiments/run.py                         # tens of minutes on one CPU core; writes results.json, results.txt
python3 experiments/run.py --report                # rebuild results.txt from results.json
python3 experiments/figure.py                      # needs matplotlib; writes experiments/latency.png
```
Tests check inverse/forward dynamics round trip, energy conservation of the plant, that the teacher tracks, that integer inference is close to float, the cycle formulas, and that added latency does not reduce error.

## Results (all from `experiments/results.txt`; one seed, 12 test moves)
- **The teacher is insensitive to latency here.** One control period of delay raises its RMS error from 0.00019 to 0.00039 rad at Ts = 1 ms and from 0.00062 to 0.00207 rad at 5 ms, still far below a degree. Microsecond inference latencies change it by a negligible amount, so the plant is slow compared with every platform's latency.
- **The learned policies are the weak link (negative result).** Zero-latency closed-loop RMS error at Ts = 1 ms for the int8 networks is 0.06 rad (hidden 32, 320 MACs), 0.12 (hidden 16), 0.29 (32+32), 0.38 (16+16), 0.69 (hidden 8) and 1.05 (64+64), against 0.0002 for the teacher: at least 300 times worse. Float versions are better (0.010 to 0.025 rad for the one- and two-layer small nets, 0.15 for 64+64), so the loss from 8-bit per-tensor quantisation is large, and 4-bit weights diverged for four of six networks. The big network (64+64) was not the best one, so size did not buy accuracy under this training budget. I did not tune training, so this says more about this recipe than about MLP policies in general.
- **Platform differences are not visible in tracking error.** For a given network and control period the int8 error varies by about 10 to 25% across platforms whose latencies differ by 10 to 100 times (hidden 32 at 1 ms: 0.059 to 0.072), and nets that diverge do so on some platforms and not others (for example hidden 8 at 5 ms: 0.77 rad with one lane at 25 MHz, diverged at 50 MHz). That scatter reflects sensitivity of a poor policy to tiny timing changes, so I draw no conclusion about which platform tracks better.
- **The deadline is where hardware matters (model only).** Latency in microseconds (assumed constants): the 1,344-MAC network (32+32) takes 176 on the M0+-class core, 22 on the M4-class core, and 54, 27, 14, 7.2, 4.8 and 2.4 on accelerators of 1, 4 and 16 lanes (25 and 50 MHz entries as in `results.txt`). The 4,736-MAC network takes 605 us on the M0+-class core (so it cannot run at Ts <= 0.25 ms), 74 us on the M4-class core and 7 to 190 us on the accelerators. Every platform meets Ts = 1 ms for every network. Against the M4-class core, a single-lane accelerator at 25 MHz is slower (3.4 against 1.9 us for the 80-MAC network), while 16 lanes at 50 MHz is 4.8 times faster for that network and about 10 times faster for the 4,736-MAC one (7.2 against 74.3 us): the gain comes from lanes, not from the accelerator as such, and the M4-class clock is assumed 3 to 7 times higher.
- **Summary.** For this stylised arm, a network of up to a few thousand MACs fits the deadline on a Cortex-M4-class core at control rates up to 10 kHz, and an accelerator is only needed above that, or for larger networks, or to save energy (not modelled here). Policy accuracy, not hardware speed, set the quality of control.

## Limitations
- Stylised everywhere: a planar two-link arm with assumed parameters, an ideal teacher with full state and no sensor noise, torque applied exactly, no motor dynamics, one seed, 12 test moves, no confidence intervals. Differences under about 25% should not be read.
- The hardware numbers are assumed, not measured or datasheet-checked, and cover latency only. There is no energy, area or RTL for this project; the accelerator cycle count is the `accel-dataflow` model's own and was not simulated in RTL for P > 1.
- The policies are poor, so the "closed-loop cost of latency" for a good policy is not answered. Inputs are tracking errors with high sensitivity, and I used per-tensor quantisation, which is crude; per-channel scales, quantisation-aware training or a residual-over-feedforward policy are untried.
- Simulated results are not claims about physical arms, microcontrollers or accelerators.

## Next steps
Train a residual policy (network outputs a correction to the feedforward torque) with quantisation-aware training, so that the closed-loop error is within a small multiple of the teacher's; then re-run the deadline comparison on a plant with a faster mode (flexible joint) where latency matters; measure a real MCU kernel's cycles (owner step); add energy per inference from `accel-kws`'s constants; then `accel-sparse`.

## Owner steps
None required. Optionally, measure cycles per MAC of an int8 kernel on a real Cortex-M0+/M4 board to replace the assumed constants (a development board costs tens of dollars; no price was checked in this run).

## Outside dependencies (vitamins)
Python, NumPy (and matplotlib for the figure). The arm masses, control gains, torque limit and the hardware latency constants are assumed, not taken from a source.
