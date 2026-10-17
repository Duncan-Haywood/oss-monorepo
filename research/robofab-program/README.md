# Can a digital twin catch bad robot programs before they run? Session-written pick-and-place programs checked at three twin fidelities

A stylised, simulation-only study for milestone 3 (`robofab-program`) of the `robofab` track. A SCARA pick-and-place cell is modelled kinematically at three checking fidelities (**L0** geometry, **L1** adds joint limits, joint speed, payload and cycle deadline, **L2** adds stochastic grasp and placement error, grip build-up time and slip). A held-out **REF** twin (hidden calibration offset, lower friction and grip force, a payload that falls with reach, a slower grip build-up) stands in for "what happens when the program really runs". The question: of the programs REF rejects, how many does each checking level reject first? All numbers are from `experiments/results.txt` and are fully deterministic (fixed seed, no training).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-program/

- **Session-written programs (8 programs, 4 tasks, a draft and a revision each).** The drafts were written by the Claude session that built the twin, which knew the twin's checks, so their failure rate is not a measure of how often an LLM errs. Three of four drafts fail REF. L2 flagged two (`wall`: arm lifted to 0.05 m under a 0.06 m wall; `move`: no wait after GRIP). `heavy` (WAIT 0.1 s, REF needs 0.15 s) passed L0 to L2 and fails REF. The `move` and `wall` revisions followed the L2 reports; the `heavy` revision (longer wait) was made after seeing REF's verdict, since L0 to L2 had passed it. All three then pass all four twins. `far` (a 0.25 kg cube carried to 0.515 m radius) passed L0 to L2 in both stages and fails REF on payload; nothing in L0 to L2 models that, so no revision was prompted.
- **Injected-bug mutants (162 single-edit variants of the three revised programs that pass REF; 69 fail REF, 93 pass).** Share of the 69 REF-failing mutants rejected: L0 38 (0.55), L1 46 (0.67), L2 60 (0.87). No level raised a false alarm (rejected a REF-passing mutant); 9 REF failures slipped through L2: three 3 mm place offsets and six WAIT values of 0.12 or 0.14 s (REF needs 0.15 s).
- **By bug type** (caught/REF-failing for L0, L1, L2): deleted step 15/16, 16/16, 16/16; grip wait 0/12, 0/12, 6/12; low lift 5/5 all; too fast 0/9, 7/9, 9/9; coordinate shift 18/27, 18/27, 24/27.
- **These rates depend on how I built REF.** Each level catches exactly what its checks model, and REF differs from L2 in a few chosen parameters. The sensitivity table in `results.txt` shows L2 misses between 3 (REF grip wait = L2's 0.10 s) and 12 (hidden offset doubled) of the 162, and 99 with REF grip wait 0.25 s (the revised programs then fail REF themselves, so that row is not comparable). Read the result as "unmodelled effects are missed, modelled ones are caught", not as a rate for real cells.

```bash
pip install numpy
cd research/robofab-program
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 10 tests, < 1 s
python3 experiments/run.py                                # a few seconds; writes experiments/results.{txt,json}
python3 experiments/drafts.py drafts                      # per-level verdicts for the drafts (or `revised`)
```
Produced with numpy 2.4.6, Python 3.11.

## Motivation

LLM-written robot code (Liang et al. 2023, *Code as Policies*) is cheap to produce and costly to run on hardware. A digital twin can reject a bad program first. This asks how much of the gap between "twin passes" and "real failure" each level of twin fidelity closes. It is the repository's sim-fidelity theme applied to program checking.

## Builds on

The workcell-twin direction of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning direction of CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>). No paper from either lab is reproduced; nothing here is affiliated with or endorsed by them.

Related work, cited for context, not reproduced or compared against: Liang et al. (2023), "Code as Policies: Language Model Programs for Embodied Control", ICRA, 9493-9500, <https://doi.org/10.1109/ICRA48891.2023.10160591>; Narang et al. (2022), "Factory: Fast Contact for Robotic Assembly", RSS, <https://doi.org/10.15607/RSS.2022.XVIII.035>. Both references were taken from `PROJECTS.md` (checked there 2026-10-12); this run had no web access to re-check them, so verify before citing.

## Method

- **Cell** (`src/robofab_program/twin.py`). Planar two-link arm (links 0.30 and 0.25 m, elbow positive) plus a vertical slide (0 to 0.15 m). One cube (3 cm), a goal, optionally a wall. Four tasks: `move` (0.2 kg), `wall` (0.2 kg, wall 0.06 m high between pick and place), `heavy` (0.5 kg, 6 s deadline), `far` (0.25 kg, goal at 0.515 m radius).
- **Programs** are text: `MOVE x y z T`, `GRIP`, `RELEASE`, `WAIT t`. Moves are straight lines with a minimum-jerk profile, sampled at 41 points. GRIP and RELEASE take 0.2 s.
- **L0**: reach, wall collision, grasp within 8 mm of the cube at height at most 2 cm, release height, goal within 5 mm. **L1**: adds joint limits, joint speed under 4 rad/s, payload (1 kg flat), deadline. **L2**: adds 200 Monte Carlo draws of calibration offset (1 mm) and repeatability (0.5 mm); the grasp must land within a 6 mm jaw clearance and the placement within 5 mm with probability at least 0.95; the grip needs 0.10 s to build up before moving; a slip test of the load against 2 mu F with mu 0.5 and F 20 N using the move's min-jerk peak acceleration. **REF**: as L2 plus a fixed 1.5 / -1.0 mm offset, repeatability 0.8 mm, mu 0.4, F 18 N, 0.15 s grip build-up, and payload 1 - 0.9 (r/0.55)^2 kg at radius r.
- **Mutants** (`mutate.py`): single-site edits of the revised programs: shifts of a pick or place coordinate (3, 7, 15, 100 mm), a lower lift, a move 4x or 2x faster or 2.5x slower, a deleted step, and different WAIT values (including sound ones, 0.16 and 0.25 s, as controls).
- **Which checks are in which level, and REF's values, were set by me before the mutant run and are not measurements of any real cell.**

## Results

See the bullets at the top and `experiments/results.txt`; short discussion in `paper/whitepaper.md`.

## Limitations

Stylised. Kinematic only (no joint dynamics, no contact, no vision); one cube; REF is another parameter set of the same model, not physics; bug types and magnitudes are my choice; three base programs. The drafts were written by an agent that knew the checks, and no language-model API was called, so this is not an LLM benchmark. No claim concerns a physical arm.

## Next steps

Replace REF with MuJoCo contact and joint dynamics (building on `research/robofab-insert`); have an API model write programs from task text and compare its draft failure rate with these; add recovery behaviours and a second object; measure real cell parameters before calling anything a gap.

## Owner steps

None for this milestone; nothing was built or ordered. Running a program on a real SCARA or low-cost arm would need a priced bill of materials with sourced, dated prices, which are not given here.

## Outside dependencies

`numpy` only. No language model or hardware was used; the programs were written by the session agent (one draft and at most one revision per task). Produced with AI assistance (Claude).

MIT.
