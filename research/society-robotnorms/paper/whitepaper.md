# Robots as a committed minority: tipping a crowd's passing convention, and what it costs people

*Research track 17 (`society`), milestone 1. Produced with AI assistance (Claude). Stylised
simulation; no claim is made about real pedestrians or real robots.*

## Abstract

A fleet of robots that share one programmed behaviour acts, socially, as a committed minority.
We ask when such a fleet overturns a human convention, using the simplest one robots meet in
public: which side to pass on. Simulated people take the side most of their last *M* partners
used, with a 2% error rate; committed robots always take the other side. A mean-field map
predicts a tipping share that rises with memory, from 0.158 of the crowd at *M* = 5 to 0.302 at
*M* = 25 and toward 1/2 as memory grows. Agent simulations (200 agents, 20 seeds) agree within
0.02 and show a sharp switch. Below the tipping share, people do not switch and committed
robots raise their conflict rate up to fourteenfold over adaptive robots (0.27 against 0.020
head-on conflicts per meeting at a 20% robot share, *M* = 9), so the costliest fleet size is
just short of the threshold.

## 1. Introduction

Robots are entering shared public space in fleets: delivery robots on pavements, service robots
in hospitals and airports. Social navigation research asks how one robot should move among
people (Kruse et al. 2013; Mavrogiannis et al. 2023). A fleet raises a different question.
Its units share a policy and are not persuaded by the crowd, which is the defining property
of a committed minority in models of convention change (Xie et al. 2011; Baronchelli 2018).
Such minorities can overturn a majority convention once they pass a critical size. Centola et
al. (2018) found tipping points near 25% in an online experiment with people. Pedestrian side
preference is a real, culturally variable convention that interactions amplify (Moussaïd et
al. 2009). We study what a robot fleet's programmed passing side does to such a convention,
and what it costs people on the way.

## 2. Model

*Agents and meetings.* A population of *N* agents meets in random pairs, *N*/2 meetings per
round. In each meeting both agents choose L or R. Equal choices pass; unequal choices are a
head-on conflict.

*People* hold a sliding window of the sides used by their last *M* partners (odd *M*) and take
the window's majority, a sampled best response in the spirit of Young (1993). With probability
ε = 0.02 they choose at random. All windows start full of R.

*Robots* are a share ρ of the population. Committed robots always choose L and keep no memory.
Adaptive robots follow the human rule.

*Space.* In the well-mixed case a partner is uniform over the population. On the ring, a
partner sits within *k* = 2 sites, and robots are placed at random, evenly spaced, or in one
contiguous block.

*Mean field.* Let *x* be the share of people whose window majority is L. A random partner
chooses L with probability *q*(*x*) = ρ + (1 − ρ)(*x*(1 − ε) + ε/2). Treating window entries as
independent draws, the next share is *F*(*x*) = P(Bin(*M*, *q*(*x*)) ≥ (*M* + 1)/2). Starting
from *x* = 0, iteration converges to the lowest fixed point. The tipping share ρ<sub>c</sub>(*M*, ε)
is the least ρ at which that fixed point exceeds 1/2, found by bisection. As *M* → ∞, *F*
becomes a step at *q* = 1/2 and ρ<sub>c</sub> → 1/2 − O(ε). For *M* = 1 (copy the last partner)
every ρ > 0 tips the crowd.

*Measures.* The final share of people on L after 500 rounds; whether the run tipped (share ≥ 0.9
at some round); and conflicts per human meeting (each conflict counted once per person in it,
divided by the number of person-meetings).

## 3. Results

**Tipping share against memory.** Mean field with ε = 0.02 gives ρ<sub>c</sub> = 0.104, 0.158,
0.192, 0.217, 0.250, 0.272, 0.302, 0.321 and 0.335 for *M* = 3, 5, 7, 9, 13, 17, 25, 33 and 41.
Setting ε = 0 raises each by about 0.007, and ε = 0.05 lowers each by about 0.01.

**Simulation against mean field.** In the well-mixed simulation the least grid share (step
0.02) at which at least 10 of 20 runs tipped was 0.16, 0.22, 0.28 and 0.32 for *M* = 5, 9, 17
and 25, against mean-field 0.158, 0.217, 0.272 and 0.302. Below threshold, the mean share of
people who had switched was under 3% two grid points down in every series. The simulated
threshold sits slightly above the mean field at larger *M*. That fits a finite horizon (a
crowd just above ρ<sub>c</sub> tips slowly) and correlations between a person's window entries,
which the mean field ignores.

**Cost to people (*M* = 9).** With adaptive robots, conflicts stay at 0.020 per human meeting,
the floor set by ε (2·ε/2·(1 − ε/2) ≈ 0.0198). Committed robots below threshold add conflicts
roughly in proportion to their share: 0.039 at ρ = 0.02, 0.12 at 0.10, 0.19 at 0.16 and 0.27 at
0.20. The excess over ρ near threshold comes from people who waver, which creates
person-person conflicts as well. Once the crowd tips (ρ = 0.22) the run-average falls to 0.11
and then to 0.028–0.048 for ρ between 0.26 and 0.48; what remains above the floor is the
transition period inside the 500-round run.


## 4. Discussion

Under this rule, a robot fleet's passing side is all or nothing. Below a share set by how much
people remember, the fleet does not move the convention and imposes the largest conflict cost
of any policy considered. Above it, every simulated crowd flipped within the run. Fleet operators
rarely know the local share or people's effective memory, so the safe default is robots that
follow the local convention. The model does not decide whether a robot fleet *should* shift a
human norm. That is a question of consent. The cost measure is reported so that it can be part
of that decision.

That ρ<sub>c</sub>(13) = 0.25 matches the 25% of Centola et al. (2018) should not be read as
validation: their participants played a naming game with a different payoff and memory, and
our people are a rule, not data.

## 5. Limitations

One binary decision per meeting; no geometry, density, speed or lanes. Homogeneous memory.
Noiseless robots. Random matching or a 1D ring in place of real encounter networks. A finite
horizon, so "not tipped" means "not within 500 meetings per agent". One neighbourhood size on
the ring. All results concern simulated agents following the stated rule.

## 6. Reproducibility

`python3 -m unittest discover -s tests` (14 tests); `PYTHONPATH=src python3 experiments/run.py`
writes `experiments/results.txt`; `python3 experiments/figure.py` draws the figures from it.
Python standard library only, all runs seeded.

## AI assistance

The model, code, experiments and text were produced with AI assistance (Claude, as a coding
agent). Every number above was produced by the code in this directory.

## References

- Baronchelli, A. (2018). The emergence of consensus: a primer. *Royal Society Open Science* 5:172189. https://doi.org/10.1098/rsos.172189
- Centola, D., Becker, J., Brackbill, D., and Baronchelli, A. (2018). Experimental evidence for tipping points in social convention. *Science* 360(6393):1116–1119. https://doi.org/10.1126/science.aas8827
- Kruse, T., Pandey, A. K., Alami, R., and Kirsch, A. (2013). Human-aware robot navigation: a survey. *Robotics and Autonomous Systems* 61(12):1726–1743. https://doi.org/10.1016/j.robot.2013.05.007
- Mavrogiannis, C., Baldini, F., Wang, A., Zhao, D., Trautman, P., Steinfeld, A., and Oh, J. (2023). Core challenges of social robot navigation: a survey. *ACM Transactions on Human-Robot Interaction* 12. https://doi.org/10.1145/3583741
- Moussaïd, M., Helbing, D., Garnier, S., Johansson, A., Combe, M., and Theraulaz, G. (2009). Experimental study of the behavioural mechanisms underlying self-organization in human crowds. *Proceedings of the Royal Society B* 276(1668):2755–2762. https://doi.org/10.1098/rspb.2009.0405
- Shoham, Y., and Tennenholtz, M. (1997). On the emergence of social conventions: modeling, analysis, and simulations. *Artificial Intelligence* 94(1–2):139–166. https://doi.org/10.1016/S0004-3702(97)00028-3
- Xie, J., Sreenivasan, S., Korniss, G., Zhang, W., Lim, C., and Szymanski, B. K. (2011). Social consensus through the influence of committed minorities. *Physical Review E* 84:011130. https://doi.org/10.1103/PhysRevE.84.011130
- Young, H. P. (1993). The evolution of conventions. *Econometrica* 61(1):57–84. https://doi.org/10.2307/2951778
