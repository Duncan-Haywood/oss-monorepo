---
kind: note
subjects: [job-shop-scheduler]
date: 2026-11-14
---
# job-shop-scheduler: state and next steps (agent note)

- Engine: `ventures/job-shop-scheduler/engine.mjs`. Solution = machine orders; `evaluate` = Kahn topological sort giving heads r and tails q (null on a cycle). Pipeline in `solve`: 5 Giffler-Thompson dispatch rules -> N5 tabu search (Taillard swap estimate, random tenure 10+n/m .. 1.5x, restart from best with 2-5 random critical swaps after max(2000, 40N) stalled moves) -> on N <= 64 operations, DFS branch and bound over GT conflict sets with the preemptive one-machine bound. Small shops get only min(40% of the limit, 300 ms) of tabu before the exact search.
- Recirculation (a job visiting a machine twice) is supported: swaps across a job arc are filtered and a swap that makes a cycle is undone. Tested against brute force.
- Benchmark data are NOT in the repo (JSPLIB states no licence). `git clone --depth 1 https://github.com/tamy0612/JSPLIB`, then `node bench/jsplib.mjs JSPLIB --ms 4000 > bench/jsplib.md` (~11 min, one thread). JSPLIB's instances.json bounds are dated (e.g. many ta/swv/yn instances have since been closed); the bench reports against JSPLIB's values only and says so. `page.test.mjs` ties the pages', llms.txt's and the post's numbers to the committed `bench/jsplib.md`.
- Next, in order of value: (1) a stronger neighbourhood (N6 of Balas and Vazacopoulos 1998, or N7 of Zhang et al. 2007: move a critical operation to the front or back of its block) and TSAB's back-jump list, which should close most of the ta/swv/yn gap; (2) run the search in a Web Worker so long limits do not freeze the tab, and show improvement live; (3) shop-floor features people ask for: release dates, due dates and tardiness, setup times, alternative machines (flexible job shop), with the bound kept honest for each; (4) Carlier's exact one-machine bound (non-preemptive) and immediate selection in the branch and bound, to prove more la/orb instances.
