# Fitting the stubborn-bloc walking-side model to a measured side preference

Short note; details, tables and limitations are in `../README.md`, every number in `../experiments/results.txt`.

**Question.** `society-blocs` swept the share of always-left people. If that share is fitted to the side preference measured by
Moussaïd et al. (2009, *Proc. R. Soc. B* 276:2755), how many committed robots tip the crowd?

**Method.** Read the left share of two head-on walkers from the bars of their Fig. 4 (0.175; the paper gives no numbers).
Solve, at each error rate ε, for the always-left share `sl` that makes a status-quo crowd show that left share in the mean-field
map of `society-blocs`, then compute the tipping robot share by bisection; check by agent simulation (N = 200, 12 seeds).

**Findings.** At memory 9 the tipping share is 0.075 to 0.096 over ε = 0.02 to 0.30 (unbiased crowd: 0.217) although `sl` falls
from 0.155 to 0.019 along that range. Memory 5 gives 0.033 to 0.053 and memory 17 0.133 to 0.149; 30% always-right people raise
the memory-9 value to 0.135. Simulation reproduces the left share (0.170 to 0.171) and tips 0 of 12 and 12 of 12 crowds at 0.04 below and above.

**Limitations.** Two walkers in a corridor are not a crowd; bar heights read from a figure; stylised binary well-mixed game.
Produced with AI assistance (Claude). No affiliation with the cited authors.
