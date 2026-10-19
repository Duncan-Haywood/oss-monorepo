# A social-force corridor test of the robot-as-committed-minority result

*Research track 17 (`society`), milestone 2. Produced with AI assistance (Claude). Stylised
simulation; no claim is made about real pedestrians or real robots.*

## Abstract

A one-dimensional model (`society-robotnorms`) predicts that robots keeping one passing side tip a
crowd's convention at 16–32% of the crowd. We test that in a 30 m × 6 m social-force corridor
(Helbing and Molnár 1995) with a sideways push toward a preferred side (after Moussaïd et al. 2009).
People copy the majority side of their last 9 oncoming partners. Adaptive robots change nothing.
Committed robots slow people from 0.91 to 0.81 of desired speed at 5% of the crowd and to 0.39 at
30%, halve the lane separation (2.75 m to 1.43 m), and raise the share of people preferring their
side only gradually, to 0.54 at most, with no complete flip in 300 s. The sharp tipping of the
1D model does not carry over. Eight seeds per cell; one parameter set; results are for simulated walkers only.

## Method and results

See `README.md` (model, parameters, tables, figures) and `experiments/results.txt` (all numbers,
produced by `experiments/run.py`). The seeded replay in `experiments/plaza_replay.html` shows one run.

## Limitations

See `README.md`, "Limitations": one parameter set, short runs, heuristic pass detection, equal robot
and human speeds, and a force model prone to freezing in dense counter-flow.

## References

- Helbing, D. and Molnár, P. (1995). Social force model for pedestrian dynamics. *Physical Review E* 51(5):4282–4286.
- Moussaïd, M., Helbing, D., Garnier, S., Johansson, A., Combe, M. and Theraulaz, G. (2009). Experimental study of the behavioural mechanisms underlying self-organization in human crowds. *Proceedings of the Royal Society B* 276(1668):2755–2762.
- Young, H. P. (1993). The evolution of conventions. *Econometrica* 61(1):57–84.
- Xie, J., Sreenivasan, S., Korniss, G., Zhang, W., Lim, C. and Szymanski, B. K. (2011). Social consensus through the influence of committed minorities. *Physical Review E* 84:011130.
- Kruse, T., Pandey, A. K., Alami, R. and Kirsch, A. (2013). Human-aware robot navigation: a survey. *Robotics and Autonomous Systems* 61(12):1726–1743.
