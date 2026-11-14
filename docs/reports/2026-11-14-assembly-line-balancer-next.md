---
kind: note
subjects: [assembly-line-balancer]
date: 2026-11-14
---
# assembly-line-balancer: state and next steps (agent note)

- Engine: `ventures/assembly-line-balancer/engine.mjs`. SALBP-1 by target counts from LB up, each a feasibility search: maximal loads, idle-budget pruning, LB2/LB3 per state, cyclic best-first over station levels, every placed-task set remembered, states expanded 8 loads at a time (a JS generator resumed after restoring `done`/`left`). Half the budget forwards, half on the reversed graph. SALBP-2 = binary search on c with the same test.
- What moved the benchmark (SALBP-1, 500 ms each): plain DFS + memo 217/269; + reach bound 218; full-expansion CBFS 209 (one root expansion on Barthold c=403 ate the whole budget); partial expansion + precedence-aware reach bound + positional-weight numbering 242. At 4 s: see `bench/salbp1.md`.
- Benchmark data are NOT in the repo (Scholl 1993 data set; licence unstated). Fetch the zip (URL in README), `node bench/scholl.mjs zip --type 1|2`. Results are time-limited, so a busy machine can shift a few rows; `page.test.mjs` ties the pages' numbers to the committed `bench/*.md`.
- Misses: Scholl (297 tasks) at the tight cycles, Barthol2 c=85/101, Wee-Mag c=45/46; Wee-Mag c=47 is open in the literature ([32, 33]).
- Next, in order of value: (1) zoning constraints (must/must-not share a station) and fixed-station tasks, which real lines need and fit the search as extra pruning; (2) SALBP-2 directly (BB&R for SALBP-2, Álvarez-Miranda, Pereira and Vilà 2024, Computers & Operations Research 166, doi 10.1016/j.cor.2024.106597) instead of binary search; (3) stronger per-state bounds (the paper's LB on remaining tasks with earliest stations) for the Scholl graph; (4) a Web Worker so long limits do not freeze the tab.
