# Does designing the body together with the controller beat a fixed off-the-shelf arm at the same cost?

Pure Python, no dependencies. Companion to track 9's milestone 2 (body-and-controller co-design; another run's `osrobot-morph` took that slug at the same time, so this project is named for what it searches: joint count, link lengths and mount). Track 9, open-source purpose-built robots. It is a small, stylised version of the body-and-policy co-design idea of Ha (2019) and RoboGrammar (Zhao et al. 2020): search link lengths, joint count and mount position of a planar vertical-plane arm, with its inverse-kinematics controller tuned in the same loop, against a fixed three-link body at the same cost budget. It does **not** use MuJoCo (the controller is a kinematic damped-least-squares solver with a static torque check, not a simulated dynamics rollout) and it does not reproduce either paper. **Every cost, mass, torque and limit is an assumption written into `model.py`; none is a quoted value of a real product.**

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/osrobot-bodysearch/

## Results (all from `experiments/results.txt`, seeds fixed)

Cost budget 192 (assumed: 40 per joint + 120 per metre of link; the fixed body is three 0.2 m links). Each search gets 300 evaluations on 16 training targets, and is scored on 60 held-out targets. 10 seeds.

| Task | Fixed body, controller tuned | Fixed links, mount also tuned | Co-design, random search | Co-design, (1+4) evolution |
|---|---|---|---|---|
| `shelf`: reach a low tray and a shelf with the tool pointing down | 0.260 | 0.495 | **0.947** (min 0.85) | 0.875 (min 0.50) |
| `far`: a long low reach, position only | 1.000 | 0.993 | 1.000 | 0.975 |

(The untuned fixed body scores 0.267 and 1.000 on the same targets. Success needs position within 3 mm, tool within 15 degrees of down on `shelf`, joint limits of 150 degrees and a static gravity-torque limit of 4 N m.)

- **Where the body matters, co-design wins by a lot.** On `shelf` the fixed body's controller tuning alone changes nothing (0.267 to 0.260): the failures are geometric (reach and torque), not controller failures. Letting the search move only the mount raises success to 0.495, and searching the links, joint count and mount reaches 0.947 with random search. Most of the gain on this task is therefore from the body, with the mount alone worth about half of it.
- **Where the off-the-shelf body already fits, co-design buys nothing.** On `far` the fixed body already succeeds on every target; the co-designed bodies match it (random search) or do slightly worse (evolution, 0.975, with two seeds choosing two joints at mean cost 176; the cause was not investigated).
- **The search method is not settled.** Random search beat the (1+4) evolution strategy on `shelf` at this budget (0.947 against 0.875, with one evolution seed at 0.50). With 10 seeds and a stylised score this is a weak signal; the strategy was not tuned.
- Joint count: all 10 random-search designs and 8 of 10 evolution designs used three joints on `shelf` (evolution chose four in 2 seeds). Three is the minimum that can set position and tool angle in a plane, so this is expected, not a finding about joint count.

```bash
cd research/osrobot-bodysearch
PYTHONPATH=src python3 -m unittest discover -s tests -v   # 9 tests, under 1 s
PYTHONPATH=src python3 experiments/run.py > experiments/results.txt   # about 3 minutes
python3 experiments/figure.py                               # redraws experiments/success.svg from results.txt
```

## Motivation

Track 9 starts from a job and lets it decide the body. Milestone 1 compared body types; this one asks how much more a body tuned to a task's workspace is worth than a standard one at the same spend, and whether the answer depends on the task. The finding is conditional: it matters a great deal for a task that does not fit the standard body, and nothing for one that does.

## Builds on

Ha, D. (2019), "Reinforcement learning for improving agent design", *Artificial Life* 25(4). Zhao, A. et al. (2020), "RoboGrammar: graph grammar for terrain-optimized robot design", *ACM Transactions on Graphics* 39(6). Both are cited as the idea this stylised study follows; no code, data or result is taken from them, and the study is not a reproduction. Damped least-squares inverse kinematics is textbook (Wampler 1986; Nakamura and Hanafusa 1986). Nothing here is affiliated with or endorsed by any lab. It connects to the track's group-tagged themes only loosely (manipulator design for lab or assistive work); no specific lab's work is built on.

## Method

`src/osrobot_bodysearch/model.py`. A design is link lengths (2 to 4 links, each 0.05 to 0.45 m), a mount offset (within 0.3 m) and controller settings (damping and step gain). The controller solves each target by damped least-squares IK from a fixed home pose with a 40-iteration cap; the tool-angle error is weighted at 0.15 m per radian. A target succeeds if it converges, joints stay within 150 degrees, and static gravity torque at every joint is within 4 N m (links at 1 kg/m, 0.3 kg payload). The score is 100 x success minus 0.05 x mean iterations; designs above the cost budget are infeasible, and the search repairs candidates by scaling links down. The searches are: controller only on the fixed body, controller and mount on fixed links, uniform random search over everything, and a (1+4) evolution strategy with mutations of lengths, mount, controller and joint count. Equal budget is equal number of evaluations (300). Held-out targets (seed 900) are never seen by the search.

## Limitations

Stylised and preliminary. Kinematics and static torque only: no dynamics, no collisions with the tray or shelf, no link stiffness, backlash or calibration, no payload variation, and no cycle-time from motion planning (iterations stand in for controller effort). The task boxes were chosen by me and the `shelf` task is built to need an orientation constraint, which a three-link arm can meet; the result that the fixed body fails there partly reflects my choice of its mount at the origin and its 0.2 m link lengths, which a real user could change. The budget equals the fixed body's cost, so the fixed body is exactly on budget. Costs are assumed; ratios between joint and link cost change what is feasible. Ten seeds, one fixed set of searches, no confidence intervals. Nothing is a claim about a physical robot.

## Next steps

Replace the kinematic score with a MuJoCo rollout and a learned or optimised trajectory controller (the full version of the milestone). Add a joint-type choice (prismatic axes) so the gantry of `osrobot-specialise` is in the search space. Source real servo and link prices (owner step). Tune the evolution strategy before comparing it with random search.

## Owner steps

None for this model. A physical version would need dated prices and a risk assessment before any hardware test; none were checked here.

## Outside dependencies

None (standard library only). Produced with AI assistance (Claude). No language-model proposer was used.

MIT.
