# Research log: marine-fleet

## 2026-11-05 · Milestone 7: equal-cost fleet against one large boat (hypotheses written before the sweep)
- H1: with no fixed payload cost a fleet beats the single boat on completion time in at least 90% of cases. H2: a payload cost share of 0.3 or more removes the fleet advantage in most cases. H3: swap time and base distance matter little.
- Outcome: H1 held (2,178 of 2,187 affordable cases, never slower). H2 failed in part: at 0.3 the budget still buys 2 boats and they win (99%); the break is at 0.5, where no fleet is affordable, which is arithmetic (p + (1-p)(m/M)^beta <= 1/2 needs p < 1/2). H3 held (swap 0.5 to 6 h).
- Unexpected: total energy ratio of 0.2 to 0.4, because a boat's power at a given speed grows with mass while swath does not.
- Limits: swath independent of boat size, no sea-state limit; these favour the fleet.
