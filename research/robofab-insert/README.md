# Does an insertion policy tuned in one simulator survive a better one? Peg-in-hole across MuJoCo fidelity levels, with and without domain randomisation

A planar peg (10 mm wide, 40 mm tall, 0.2 kg) is held by a compliant position-servo "gripper" and pushed into a chamfered hole with 0.2 to 0.6 mm clearance per side in [MuJoCo](https://doi.org/10.1109/IROS.2012.6386109). A five-parameter search policy (descent speed, push-force limit, lateral wiggle amplitude and frequency, tilt feedback) is tuned by the cross-entropy method (CEM) under one of four training conditions (simulator **L0**, **L1**, **L2**, or **DR**, domain randomisation over the simulator's own parameters) and then tested on all three levels plus a held-out **T** level that matches none of them. All numbers below come from `experiments/results.txt` (5 training seeds per cell, 200 fixed test scenarios per cell, so each cell mean rests on 1,000 test episodes and a single policy's rate has a binomial standard error of about 0.03).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/robofab-insert/

- **Policies tuned in the simpler simulators lose a lot when the simulator improves.** CEM-tuned on L0 (frictionless, soft contacts, tilt locked): 0.91 held-out success on L0, 0.97 on L1, **0.53 on L2**, **0.26 on T**. A straight push with no search succeeds on 0.38, 0.37, 0.18 and 0.21 of the same scenarios.
- **Domain randomisation helped on the held-out level, but no more than training on L2 did.** On T, CEM mean success is 0.26 (train L0), 0.28 (L1), 0.46 (L2) and 0.43 (DR). The seed ranges overlap heavily (L2: 0.39 to 0.61; DR: 0.34 to 0.55; L0: 0.17 to 0.33), so with 5 seeds this study cannot rank DR against L2. It does separate both from L0 and L1 training, though only mildly (ranges still touch). DR cost a little on the easy levels (L0: 0.82 against 0.91 for L0-trained).
- **No policy solves T.** The best seed reaches 0.61 on T. The highest-friction level jams the peg, and the five-parameter policy family has no recovery behaviour. This is a limit of the policy family, not evidence about real insertion.
- **CEM against random search at equal budget** (4,608 training episodes each): CEM is higher on L0 and L1 tests (e.g. 0.91 against 0.78 on L0 when trained on L0) and roughly equal on T (DR-trained: 0.43 and 0.43). Several tuned parameters sit at the edge of their allowed range (across the 20 CEM runs the wiggle amplitude is 1.6 to 2.0 mm against a 2.0 mm cap, and the push-force limit reaches its 2 mm lead cap in some runs), so a wider range could change the ordering.
- A detail: random search with seed 0 returned the identical parameter vector on L1 and L2. Candidates and training scenario seeds depend only on the seed, and the same candidate happened to win under both simulators; the test evaluation is separate.

```bash
pip install mujoco numpy
cd research/robofab-insert
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 6 tests, < 1 s
PYTHONPATH=src python3 experiments/run.py                 # ~13 min on 4 cores; writes experiments/results.{txt,json}
```
Results were produced with mujoco 3.15.0, Python 3.11, numpy 2.5.3.

## Motivation

Learned or tuned insertion policies are usually developed in a fast simulator and then moved to a better one or to hardware. Which fidelity differences break them, and does randomising the simulator help? This is milestone 2 (`robofab-insert`) of the `robofab` track and an instance of the repository's sim-fidelity theme, here sim to sim only.

## Builds on

The workcell-twin and sim-to-real manipulation directions of the HIRO Group (Alessandro Roncone, <https://hiro-group.ronc.one/>) and the task-and-motion-planning directions of CAIRO Lab (Bradley Hayes, <https://cairo-lab.com/>). No paper from either lab is reproduced, and nothing here is affiliated with or endorsed by them.

Related work, cited for context and not reproduced: Narang et al. (2022), "Factory: Fast Contact for Robotic Assembly", RSS, <https://doi.org/10.15607/RSS.2022.XVIII.035>; Tang et al. (2023), "IndustReal: Transferring Contact-Rich Assembly Tasks from Simulation to Reality", RSS, <https://doi.org/10.15607/RSS.2023.XIX.039>; Tobin et al. (2017), "Domain randomization for transferring deep neural networks from simulation to the real world", IROS, <https://doi.org/10.1109/IROS.2017.8202133>; Rubinstein (1999), the cross-entropy method, *Methodol. Comput. Appl. Probab.* 1:127-190, <https://doi.org/10.1023/A:1010091220143>; Todorov, Erez and Tassa (2012), MuJoCo, IROS, 5026-5033, <https://doi.org/10.1109/IROS.2012.6386109>. Narang et al., Tang et al., Todorov et al. were taken from `PROJECTS.md` (checked there on 2026-10-12); Tobin et al. and Rubinstein were added from memory and this run had no web access to verify them, so check both before citing. This project is a toy two-dimensional task and does not reproduce or compare against any of these.

## Method

- **Task** (`src/robofab_insert/env.py`). Peg with three joints (x, z, tilt) driven by position actuators; two walls with 1.5 mm 45-degree lead-ins on the lips; success when the peg tip is 15 mm below the mouth with its centre inside the hole walls, within 4 s. Per-episode randomisation: clearance 0.2 to 0.6 mm, start offset up to 3 mm, start tilt up to 4 degrees, and hole-position estimate error with 1 mm standard deviation.
- **Fidelity levels.** L0: no friction, soft contacts, 4 ms step, tilt locked. L1: friction 0.3, tilt free. L2: friction 0.5, 1 ms step, stiffer contacts. T (held-out): friction 0.8, 2 ms step, different gripper stiffness and damping. The settings are choices for this study, not measurements of any real part or gripper.
- **DR.** Each training episode draws friction, time step, contact stiffness, gripper stiffness, damping and whether tilt is free from fixed ranges (`randomise_fidelity`).
- **Policy and training** (`train.py`). Task-specific five-parameter search policy, not a neural network. CEM: population 24, 12 iterations, 16 episodes per candidate, top quarter as elites. Fitness is success plus 0.1 times normalised depth. Random search uses the same budget.
- **Evaluation.** Each trained policy runs on 200 fixed test scenarios at each of the four fidelity levels (same scenarios for every policy).

## Results

See the bullets at the top and `experiments/results.txt`. The short discussion is in `paper/whitepaper.md`.

## Limitations

Stylised and simulation-only. Planar, one peg shape, a hand-built five-parameter policy rather than learning from observations, and fidelity levels that differ only in parameters of the same MuJoCo model (so T is "different parameters", not "different physics" and nothing like a real gripper). Five seeds and wide seed ranges: the DR against L2 comparison is unresolved. Parameter bounds bind. No claim here concerns a physical arm; real insertion adds sensing noise, calibration error and unmodelled contact.

## Next steps

Add recovery behaviours to the policy family, widen the parameter bounds, add a spatial (3-D) peg, move to a neural policy with observations, and calibrate T against measured contact data before claiming anything about hardware (milestone 6 owner step).

## Owner steps

None for this milestone: nothing was fabricated or ordered. A hardware test on a low-cost arm would need a bill of materials with sourced, dated prices; none are given because none were verified.

## Outside dependencies

`mujoco` (Apache-2.0, pip) and `numpy`. The study could not check anything against hardware. Produced with AI assistance (Claude).

MIT.
