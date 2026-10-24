# Who yields at a door? A go-or-yield game between remembering people and fixed-rule robots

*Research track 17 (`society`). Produced with AI assistance (Claude). Stylised simulation; no claim is made about real people or real robots.*

## Abstract

People and robots meet at a door and each goes or yields. Costs: both go 3, one yields 1 (to the goer 0), both yield 1.
People respond (logit, beta 8) to the actions of their last 9 partners; robots go with fixed probability `g`. With
always-yielding robots the share of people who go rises from 0.388 (no robots) to 0.595 (50% robots), and the crowd's cost
falls from 1.064 to 0.968. With always-going robots at 50%, 0.113 of people go and the crowd's cost rises to 1.373.
Mean field and a 200-agent, 12-seed simulation agree within 0.003 on people's go share. In this parameter set yielding
is also individually best for a robot.

## 1. Background

Door passing is anti-coordination (Chicken/Hawk–Dove: Smith and Price 1973). People are modelled by logit quantal response
(McKelvey and Palfrey 1995) to a sample of recent partners (Young 1993). Whether deferring is individually costly is the
test for a sequential social dilemma (Leibo et al. 2017).

## 2. Model and method

As in the README. The mean-field go share `q` solves `q = (1 − r) E_Bin(m,q)[σ] + r g`; bisection on the strictly decreasing
difference gives the root. The simulation pairs agents at random each round, 400 rounds with 100 discarded.

## 3. Results

See `experiments/results.txt` and the README: sections A–E (agreement, yielding robots, going robots, individual incentives, sensitivity to memory and sharpness).

## 4. Limitations

Random mixing without geometry; fixed cost set with `w = d`; homogeneous people; non-learning robots; simulated people are not people.

## References

- Smith, J. M. and Price, G. R. (1973). The logic of animal conflict. *Nature* 246:15–18.
- McKelvey, R. D. and Palfrey, T. R. (1995). Quantal response equilibria for normal form games. *Games and Economic Behavior* 10:6–38.
- Young, H. P. (1993). The evolution of conventions. *Econometrica* 61(1):57–84.
- Leibo, J. Z. et al. (2017). Multi-agent reinforcement learning in sequential social dilemmas. AAMAS.
