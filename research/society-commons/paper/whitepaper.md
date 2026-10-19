# What does it cost robots to let people go first at a shared crossing? A queueing model checked against closed forms

*Research track 17 (`society`), milestone 4. Produced with AI assistance (Claude). Stylised
simulation; no claim is made about real people or real robots.*

## Abstract

People and robots arrive at random at a one-at-a-time crossing. A share `f` of the robots lets
every waiting person go first. At load 0.9 (people 40% of the load) deference cuts people's
mean wait from 4.60 to 0.71 time units and raises the robots' from 4.61 to 7.21. The load-weighted
waiting cost is the same for every `f` (4.14 to 4.15), as the conservation law requires, so deference
moves waiting between groups. It is cheaper than first come first served exactly when a person's wait
costs more than a robot's. A robot that defects within a deferential fleet waits 2.08 against 7.65.
With load 1.2 and patience 20, half the robots deferring gives everyone arriving a crossing, at a cost to
the robots of 10.5% of their crossings.

## 1. Question and background

Robots in shared spaces need a rule for who goes first. The simplest model is a single server
(M/G/1). Its mean waits are known for first come first served (Pollaczek–Khinchine) and
non-preemptive priority (Cobham 1954), the total is conserved by any work-conserving rule
(Kleinrock 1965), and the best strict priority follows the `c·μ` rule (Cox and Smith 1961).
That structure also makes a one-shot sequential social dilemma (Leibo et al. 2017) in which
deferring is individually costly.

## 2. Model

As in the README: Poisson arrivals, deterministic crossing, three queues (people, selfish robots,
deferential robots), deferential robots go only when no person waits, optional patience.

## 3. Results

See the README, sections A–F, and `experiments/results.txt` (12 seeds of 20,000 time units).
A validates the simulation to within 2.7% of the closed forms; B–C quantify the transfer and
confirm the conservation law; D finds the break-even at equal cost; E varies robot speed; F shows
the overload case with abandonment.

## 4. Limitations

One server, fixed crossing times, Poisson arrivals, a free cost ratio, no learning.

## References

- Cobham, A. (1954). Priority assignment in waiting line problems. *Operations Research*
  2(1):70–76.
- Cox, D. R. and Smith, W. L. (1961). *Queues*. Methuen, London.
- Kleinrock, L. (1965). A conservation law for a wide class of queueing disciplines. *Naval
  Research Logistics Quarterly* 12(2):181–192.
- Leibo, J. Z., Zambaldi, V., Lanctot, M., Marecki, J. and Graepel, T. (2017). Multi-agent
  reinforcement learning in sequential social dilemmas. *Proc. AAMAS*, 464–473.
