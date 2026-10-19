# Which conclusions about robots in a corridor survive a more humanlike simulated crowd?

*Research track 17 (`society`), milestone 6. Produced with AI assistance (Claude). Stylised
simulation; no claim is made about real pedestrians or real robots.*

## Abstract

`society-plaza` simulated committed and adaptive robots among social-force pedestrians. We rerun it
with four crowds of simulated people (heterogeneous speeds and sideways-push weights, a 0.4 s
reaction delay, 30% stubborn people, and all three), 10 seeds per cell. Adaptive robots stay free
and committed robots never flip the crowd (at most 0.58 prefer their side up to 50% robots) in every
crowd. The size of the committed robots' slowdown (loss of 0.17 to 0.49 of desired speed at 30%) and
the personal-space cost (0.03 to 0.36 of agent time) depend strongly on the crowd, and reaction delay
alone gives 0.087 intrusion time with no robots. Perturbations are hand-chosen, not fitted to data.

## Method and results

See `README.md` (crowds, tables, figures) and `experiments/results.txt` (all numbers, produced by
`experiments/run.py`).

## Limitations

See `README.md`, "Limitations".

## References

- Helbing, D. and Molnár, P. (1995). Social force model for pedestrian dynamics. *Physical Review E* 51(5):4282–4286.
- Moussaïd, M., Helbing, D., Garnier, S., Johansson, A., Combe, M. and Theraulaz, G. (2009). Experimental study of the behavioural mechanisms underlying self-organization in human crowds. *Proceedings of the Royal Society B* 276(1668):2755–2762.
