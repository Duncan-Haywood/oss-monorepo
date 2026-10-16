# chip-scriptsearch: searching ABC pass sequences for a SKY130-mapped MAC, random search vs hill climbing vs session-written proposals at equal budget

Follow-up to `chip-ppa-sky130mac` in the LLM chip-design-loop track (`PROJECTS.md`, track 3), taking its "use the SKY130 area&times;delay as the score in a proposer loop" next step. It is a small, stylised study of a search landscape, not a benchmark of language models. Produced with AI assistance (Claude). This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Builds on.** `research/chip-ppa-sky130mac` (its flow module, reference design `mac4.v` and carry-save candidate `p0_csa.v`, imported by relative path, not copied), itself built on `chip-ppa-mac` and `chip-pnr`. Tools: Yosys 0.33 with its bundled ABC, the SKY130 HD liberty file from OpenROAD-flow-scripts (Apache-2.0, fetched by `fetch_pdk.sh` at a pinned commit, not vendored). ABC: Brayton and Mishchenko (2010), "ABC: An Academic Industrial-Strength Verification Tool", CAV, LNCS 6174, 24&ndash;40, <https://doi.org/10.1007/978-3-642-14295-6_5>. Hill climbing and random search are textbook methods; no paper's result is reproduced.

## Question
In `chip-ppa-sky130mac` the ABC script was one of four hand-picked choices. If the script is instead a sequence of up to three optimisation passes, how rugged is the landscape of SKY130 area&times;delay over that space, and at a budget of 10 to 40 evaluations (of 800 points) do a hill climber or a proposer that knows the earlier results beat random search?

## Method
- **Space.** Design &isin; {reference `a*b+c`, carry-save `p0_csa`} (both proved equal to the reference in `chip-ppa-sky130mac`) &times; a sequence of 0 to 3 passes from {`balance`, `rewrite`, `rewrite -z`, `refactor`, `refactor -z`, `dc2`, `dch`}, run as `strash; <passes>; map` onto the SKY130 HD cells. 800 points.
- **Score.** Area (&micro;m&sup2;, from `stat -liberty`) &times; delay (ns, ABC's `stime`, a static estimate with no wire load and no placement) as in `chip-ppa-sky130mac`. Lower is better.
- **Ground truth.** Every point is evaluated once (`experiments/table.json`, deterministic), so the true optimum of this space is known. 108 of the 800 points make ABC abort (the pattern is `dch` followed by `rewrite` or `refactor`, whose network ABC cannot process); they score infinity but still cost one evaluation when a method draws them.
- **Methods at equal budget** (budget = distinct points evaluated; budgets 10, 20, 40; 200 seeds each, replayed from the table, which gives the same numbers as re-running the flow): *random search* (length uniform on 0..3, passes uniform), and *first-improvement hill climbing* (one edit per step: swap the design, or insert, delete or replace a pass; fresh random start after 8 failed edits).
- **Session-written proposals.** I wrote 40 sequences (`proposals_session.json`) once, from the four hand-picked scripts' results in `chip-ppa-sky130mac` alone, and committed them before any search was run. This is one attempt by the session agent, not a model-API run and not a reproducible LLM benchmark. Eight of them have length 4 and lie outside the table; they were scored through the flow. There is no live-API proposer in this project.
- The best designs found are re-mapped and proved equivalent to the reference `a*b+c` by a Yosys miter and `sat -prove` over all 2<sup>16</sup> inputs.

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys iverilog   # Yosys 0.33 here
cd research/chip-scriptsearch
sh fetch_pdk.sh pdk                       # sparse clone of ORFS at a pinned commit
python3 -m unittest discover -s tests     # about 3 s; the flow test skips without pdk/
python3 experiments/run.py                # about 2 min on 4 cores; rewrites experiments/results.txt
```
`experiments/table.json` is committed; delete it to recompute the table from the flow.

## Results (from `experiments/results.txt`, Yosys 0.33)
- **Optimum.** 1062.2 &micro;m&sup2;&middot;ns at carry-save with `rewrite -z; rewrite -z; dch`. That is 11% below the best number in `chip-ppa-sky130mac` (1193, the reference under its `resyn2`-style script), and the carry-save design now wins. Its netlist, the next four best table points and the best session proposal are proved equivalent to the reference. The no-pass script (`strash; map`) gives 1723 on the reference; the median finite point is 1396.
- **The landscape is needle-like.** Only 0.1% of the 800 points are within 1% of the optimum and 0.7% within 5%.
- **Random search and hill climbing are close.** Median best-found / optimum (200 seeds):

| budget | random | hill climbing |
|---|---|---|
| 10 | 1.135 | 1.135 |
| 20 | 1.117 | 1.095 |
| 40 | 1.095 | 1.088 |

 The share of seeds that find the optimum at budget 40 is 2.5% (random) and 3.0% (hill climbing); at budget 20 it is 0.5% and 3.5%. With 200 seeds each these shares are a handful of runs, so the difference between the methods is within noise at budgets 10 and 40 and only suggestive at 20.
- **Session-written proposals.** After 20 proposals the best is 1.088 &times; optimum, and it stays there to 40 (1155.7, carry-save `rewrite; refactor; balance`). That is the same as the median of both searches at budget 40, so knowing the earlier four-script results helped about as much as hill climbing, and did not find the optimum, which uses `rewrite -z` twice then `dch`. One attempt, so no variance estimate.

## Limitations
- One 4&times;4 design pair, one cell library, one ABC version. The optimum is the optimum of this 800-point space, not of ABC scripts in general. Sequences of length 4 or more, other passes (`resub`, `if`, `&` commands) and parameters were not tried.
- ABC's delay is a static estimate without wires; `chip-pnr` shows such numbers are not post-layout numbers. This is a simulated-flow result, not a claim about a fabricated chip.
- The 200 seeds share one 800-point table, so they are not independent samples of the landscape; the method comparison is about this landscape only. Budgets of 10 to 40 evaluations are 1% to 5% of the space.
- Session proposals are a single, partly informed attempt. Random search draws sequence length uniformly, which weights short sequences more than their share of the space; a different draw would change the random baseline.
- Failed ABC runs (108 points) were treated as costly failures. A method that avoided `dch` followed by `rewrite` by rule would do better; none was given that rule.

## Next steps
Add placement: run `chip-pnr`'s OpenROAD flow on the best few sequences to see whether the ranking survives layout. Extend to length 4 or 5 with a proposer that is told ABC's failure pattern. Wire an `ANTHROPIC_API_KEY`-gated proposer behind the same interface and compare it with the baselines here at equal budget.

## Owner steps
None required. A model-API proposer needs an API key and is the owner's call.

## Outside dependencies (vitamins)
Yosys 0.33 and its ABC (apt), Icarus Verilog (apt, installed but unused here), the SKY130 HD liberty file (ORFS, fetched), and the sibling `chip-ppa-sky130mac` source tree. Everything else is the Python standard library.

## Figure

`experiments/search.svg` is drawn by `experiments/figure.py`, which parses the committed `results.txt` (no retyped numbers) and is the figure on the project's home page.
