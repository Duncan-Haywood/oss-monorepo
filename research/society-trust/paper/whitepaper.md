# Can a robot fleet's reputation survive one bad incident? Trust, gossip and avoidance in a stylised model

*Research track 17 (`society`), milestone 3. Produced with AI assistance (Claude). Stylised
simulation; no claim is made about real people or real robots.*

## Abstract

Simulated people hold a trust level in a robot fleet, updated by their own encounters and by
pairwise gossip in which bad news may travel further than good. After a 50-round incident at
error rate 0.8, mean trust recovers to within 0.05 of baseline in all 20 crowds in every
configuration where people keep meeting robots, however strong the negativity bias (to 4×).
When people avoid robots below a trust threshold, the first-hand evidence that would repair
trust disappears, and recovery becomes a cliff: at a 0.30 threshold, 20/20, 18/20 and 0/20
crowds recover under neutral, 2× and 4× negativity (final mean trust 0.947, 0.871, 0.282).
Robots whose failures come with an explanation (a failure costing 0.3× the trust) recover in
every case. All results are properties of the stated rules.

## 1. Question and background

Trust in human-robot interaction depends most on robot performance and failures (Hancock et
al. 2011). A fleet of identical robots is judged collectively when people do not tell units
apart, so the question is whether one unit's incident can sink the fleet. Local averaging
models of convention spread (Young 1993; Centola et al. 2018) motivate a gossip step on a
continuous trust level.

## 2. Model

As in the README: trust `t` per person; reliance with probability `t` when `t ≥ θ`; success
`t ← t + η(1−t)`, failure `t ← t − η w t` (`η = 0.1`, `w = 1` or `0.3`); random-pair gossip with
rate `g` for good news and `βg` for bad; a 50-round incident at error `e_bad`. Without gossip
or avoidance the fixed point is `(1−e)/((1−e)+e w)`.

## 3. Results

See the README, sections A–G, and `experiments/results.txt` (N = 100, 800 rounds, 20 seeds).
The central contrast is between B (no avoidance: every incident recovered) and F–G
(avoidance: a cliff in the threshold, moved down by negativity and removed by explanations).

## 4. Limitations

One shared reputation, one number per person, homogeneous people, hard-threshold avoidance,
no fitted parameters. The update sizes and the explanation discount are modelling choices.

## References

- Centola, D., Becker, J., Brackbill, D. and Baronchelli, A. (2018). Experimental evidence for
  tipping points in social convention. *Science* 360(6393):1116–1119.
- Hancock, P. A., Billings, D. R., Schaefer, K. E., Chen, J. Y. C., de Visser, E. J. and
  Parasuraman, R. (2011). A meta-analysis of factors affecting trust in human-robot
  interaction. *Human Factors* 53(5):517–527.
- Young, H. P. (1993). The evolution of conventions. *Econometrica* 61(1):57–84.
