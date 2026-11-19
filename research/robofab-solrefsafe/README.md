# Is MuJoCo's `refsafe` clamp what breaks a moving grasp at a coarse timestep? Switching it off (stylised)

A follow-up to `research/robofab-solreftimestep` (track `robofab`; the first item of its "Next steps": test with `refsafe` disabled). That project read MuJoCo's documentation as saying the effective contact time constant is max(`solref`, 2 x timestep) and did not test it. Here the same jaw test (cover part, 400 and 800 m/s^2) is run over `solref` 0.5, 0.3, 0.2, 0.1 ms x timestep 0.4, 0.2, 0.1, 0.05 ms with the `refsafe` flag enabled and disabled (64 cells). I do not simulate an arm, only a prescribed constant upward acceleration of the jaws. All numbers are from `experiments/results.txt`.

**Live page:** https://marisstella.app/research/robofab-solrefsafe/

- **Switching `refsafe` off does not rescue the coarse-timestep cells; it changes which cells hold.** 11 of 32 cells hold with `refsafe` on and 10 of 32 with it off. The two settings disagree in 7 cells: 3 hold only with it off and 4 hold only with it on.
- **Where it matters, the clamp helps more than it hurts.** With `refsafe` off, 184 of the force-search runs ended with MuJoCo's bad-acceleration warning (an unstable solver; counted as "not held"; the count was 10 before the search scanned a force grid, 2026-11-19), all in the 10 starred cells where `solref` is below twice the timestep (for example `solref` 0.2 ms with a 0.2 ms timestep, or 0.1 ms with 0.1 ms). In 4 of the cells with `solref` below twice the timestep (400 m/s^2: 0.2/0.2, 0.1/0.2, 0.1/0.1 ms; 800 m/s^2: 0.1/0.1 ms; `solref`/timestep) the `refsafe`-on run holds at 1.01 to 1.02 times the bound because the effective constant is raised to twice the timestep.
- **The clamp does cost some cells.** At 800 m/s^2, `solref` 0.3 ms with a 0.2 ms timestep holds with `refsafe` off (1.04) and fails with it on, where the effective constant becomes 0.4 ms.
- **Hold/slip is not monotone in force in one cell, which an earlier version mis-reported.** `solref` 0.5 ms with a 0.4 ms step and `refsafe` off holds from 1.06 times (400 m/s^2) and 1.05 times (800 m/s^2) the analytic bound, but slips again in pockets around 18 N and 24 to 33 N. Until 2026-11-19 a plain bisection on 0 to 60 N probed 30 N first, landed in a pocket and reported 13.26 and 6.71 times, which this README called unphysical; that was the search, not the physics (quality audit, `portfolio/quality/audits/2026-11-19-robofab-solrefsafe.json`). The search now scans 24 forces upward before bisecting; a pocket narrower than 2.5 N can still be missed. A grasp force that holds can slip at a higher force here, so do not trust this cell's margin.
- **The non-monotone timestep behaviour from `robofab-solreftimestep` survives with the clamp off:** at 800 m/s^2 and `solref` 0.1 ms, a 0.05 ms step holds and a 0.1 ms step fails with an unstable solver. So the clamp does not explain it; the cause remains open (the carrier-motion and no-slip candidates there are untested).
- **Practical consequence in this set-up:** keep `refsafe` on (the default) unless a specific `solref` is needed below twice the timestep; even then an unstable solver can appear. Only 7 of the 32 grid cells hold in both settings, all with `solref` at most 0.3 ms and timestep at most 0.2 ms. One part, one friction value: do not extend this to other parts.

```bash
pip install mujoco numpy
cd research/robofab-solrefsafe
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, about 1 s
python3 experiments/run.py                                # about 25 s; writes experiments/results.{txt,json}
```
Produced with MuJoCo 3.16.0 and Python 3.11 / 3.13.

## Motivation

`robofab-solreftimestep` attributed part of the coarse-timestep failures to the `refsafe` clamp from documentation alone. This tests the claim and decides whether a workcell twin should leave the flag on.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>), `research/robofab-solreftimestep`, `research/robofab-solrefmap` and `research/robofab-graspfast` (model and simulation copied so the project is self-contained). No paper from the group is reproduced; nothing here is affiliated with or endorsed by them. Simulator: Todorov, Erez and Tassa (2012), MuJoCo, IROS. Self-replication context: Zykov et al. (2005). `paper/refs.bib` is copied from `robofab-solrefmap` and was not independently re-verified here.

## Method

As in `robofab-solrefmap`: a free-body part held between two force-driven pad bodies under a gravity-compensated carrier that follows a prescribed upward constant acceleration for 0.05 s after 0.1 s of settling. Held if the part moves < 2 mm relative to the carrier. Minimum force: scan 2.5, 5, ..., 60 N upward for the first force that holds, then bisect between it and the grid point below (tolerance 2%); 'none' means no grid force holds (`first_hold` in `sim.py`). Elliptic cones, 10 no-slip iterations, density 1240 kg/m^3 (assumed), mu = 0.5, cover part, first grasp option. The ratio is the minimum holding force over m(g+a)/(2 mu).

## Results

See the bullets above and `experiments/results.txt` (4 `solref` x 4 timesteps x 2 accelerations x `refsafe` on/off).

## Limitations

- One part (cover), upward acceleration only, constant for 0.05 s; no sideways load, no arm, no vibration. Rigid box pads, assumed density, one friction value, a 2 mm slip criterion.
- An unstable run (MuJoCo's bad-acceleration warning) is counted as not held, so a cell marked "none" is not always a slip. The non-monotone timestep behaviour is unexplained and might be an artefact of this test harness rather than of MuJoCo's contact model.
- Only MuJoCo 3.16.0, default `solimp`, `solref` damping ratio 1. Single deterministic runs; no seeds are involved.
- Simulation only; no claim about a real gripper.

## Next steps

Vary `solimp`; find the cause of the non-monotone timestep behaviour (try a smooth carrier profile or substepping the prescribed motion); repeat on the other six parts.

## Owner steps

None; nothing was built or ordered. A physical test would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

The `mujoco` and `numpy` packages (pip); no language model, key or hardware. Produced with AI assistance (Claude).

MIT.
