# selfrep-alufring: how thick must a printer rod be to keep carriage ringing small at a given acceleration?

Follow-up to `selfrep-alufreq` (track 1, `PROJECTS.md`), taking its "tie the target to an acceleration and ringing model" next step: instead of sweeping a bare frequency target, the rod diameter is derived from an acceleration and a ringing tolerance. Produced with AI assistance (Claude). Computed only; no rod was built or tested.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/selfrep-alufring/

**Builds on.** `selfrep-rodmodes` (one-mode stiffness and frequency), `selfrep-alufreq`, `selfrep-alurod`. It builds on none of the labs in `prompt.md`.

## Method
- The carriage is a one-mode oscillator on the simply supported rod (`selfrep-rodmodes`). An acceleration `a` loads it with force `M a`; static deflection is `delta = M a / k`.
- A step in acceleration leaves ringing of amplitude `delta` (worst case). If the force is ramped over time `t_r`, the residual amplitude is `delta * |sin(w t_r/2)/(w t_r/2)|` (exact for the undamped oscillator; a ramp of exactly one period cancels it). Ringing decays as `exp(-zeta w t)`.
- The smallest diameter meeting a ringing tolerance is found by scanning down from a thick rod to the first failure (the ramp factor is non-monotone, so this is the conservative choice).
- **Assumed, not measured:** carriage 0.3 kg, damping ratio 0.01, tolerance 50 µm, one mode, no belt/frame modes.

## Reproduce
```bash
cd research/selfrep-alufring
python3 -m unittest discover -s tests -v     # 6 tests, standard library only
python3 experiments/run.py                   # writes experiments/results.txt
python3 experiments/figure.py                # draws experiments/diameter_vs_accel.svg from results.txt
```

## Results (from `experiments/results.txt`)
- With abrupt acceleration steps and a 50 µm ringing tolerance, 3 m/s² needs 7.3 mm steel, 9.6 mm aluminium or 15.5 mm hardwood; 5 m/s² needs 8.3, 10.9 and 17.6 mm.
- Against the assumed 12 mm holder limit, aluminium handles about 7.6 m/s² at 12 mm and hardwood only 1.1 m/s²: hardwood rods only suit very gentle motion.
- Ramping the force over 20 ms cuts the diameter needed (aluminium at 5 m/s²: 10.9 mm to 8.9 mm). This is shaping that costs nothing to build, and is a cheaper lever than thicker stock.
- Ring-down to 10% of amplitude at 10 mm takes about 0.6 s (steel), 0.9 s (aluminium) and 2.3 s (hardwood), because the lower frequency decays more slowly in absolute time at equal damping ratio. Stylised: the damping ratio is an assumption and wood is likely to damp more than 0.01.

## Limitations
- Stylised throughout: a single mode, a linear force ramp, constant damping across materials (real wood and aluminium differ), and no bushing clearance, belt, frame or hotend modes, which usually limit a real printer first. The ringing tolerance is a guess about print quality, not derived from it.
- No closure or cost recomputation: this project sets the diameter spec only; use `selfrep-alufreq` / `selfrep-alurod` for the bookkeeping.

## Next steps
Feed these diameters into `selfrep-redesign`'s penalty-budget search with an aluminium option; replace the single ringing tolerance with a print-defect model.

## Owner steps
- Print a ringing-tower test on a printer and measure ringing with a phone accelerometer to replace the assumed damping ratio, carriage mass and tolerance.

## Outside dependencies (vitamins)
Python standard library plus the sibling `selfrep-rodmodes` and `selfrep-rodbeam` source trees (relative paths). Rod stock is imported, not made by the shop.
