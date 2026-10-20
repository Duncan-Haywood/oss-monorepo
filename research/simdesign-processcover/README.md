# simdesign-processcover: which share of a bracket family can each shop process make, and does that choose the next machine?

Sixth project of the simulation-first design track (`PROJECTS.md`, track 5), following the last "next step" of [`simdesign-dfm`](../simdesign-dfm): score which parts each added process can make, and feed that into [`selfrep-nextmachine`](../selfrep-nextmachine)'s machine choice. Produced with AI assistance (Claude). Everything here is stylised: the rule values and material properties are the **assumed** round numbers of `simdesign-dfm`, the part family is a random sample, and machine prices are the **assumed placeholders** of `selfrep-nextmachine`. Simulated result only; no part was made.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-processcover/

**Builds on.** `research/simdesign-dfm` (geometric rules for FDM, CNC routing, laser cutting and sand casting, re-implemented here in vectorised NumPy, not imported, so the project stays self-contained; values copied from its `dfm.py`), `research/selfrep-nextmachine` (its `exhaustive` and `greedy` functions are imported unchanged), and the cantilever model of `simdesign-bracket` (80 mm arm, 4 mm tip limit). The cantilever-beam formulas are textbook Euler–Bernoulli beam theory. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- A *part* is a feature triple (arm width `w`, inner fillet `r`, depth `b`; mm), optionally with a tip load `F` (N) on an 80 mm arm. Features are sampled: `w` and `b` log-uniform over the `simdesign-dfm` bounds (`w` 2–25, `b` 1–30), `r` uniform 0–15, `F` log-uniform 1–1000 N. Two shifted families (`small`: lower half of the log range of `w` and `b`; `large`: upper half) test sensitivity.
- A process *covers* a part when every geometric rule holds (minimum wall, slenderness `w/b ≤ 8`, tool or process minimum fillet, depth limit, web rules, casting even-section rule and draft on the narrowest section; stock thickness must lie within 10% of a listed stock, an assumption that differs from `simdesign-dfm`, which searches over the stock list). With a load, also: bending stress `6FL/(bw²)` at most the material's working stress, and tip deflection `FL³/(3EI)` at most 4 mm. The beam check ignores the fillet stress concentration, which `simdesign-bracket` and `simdesign-dfm` found to matter, so it flatters every process.
- *Coverage* of a shop is the share of sampled parts that some process in the shop covers. The printer (FDM) is always present. Machine choice reuses `selfrep-nextmachine`'s exhaustive and greedy rules with coverage as the value and prices CNC router 800, laser cutter 600, casting setup 300 (assumed).
- 20 000 parts per sample; coverage tables are means over 5 seeds with ranges; the machine choice is run on seed 0 only.

## Reproduce
```bash
pip install -e research/simdesign-processcover pytest
cd research/simdesign-processcover
python -m pytest -q tests          # 10 tests
python experiments/run.py          # writes experiments/results.txt (a few seconds)
```

## Results (from `experiments/results.txt`)
- **Geometry alone gives a degenerate answer (negative result for this objective).** FDM covers 89.3% of the sampled family and the other three processes' rule sets are, in this model, stricter than FDM's: they cover 20–39% alone and **no part that FDM cannot make** (seed 0; 0.000 in `results.txt`). Every machine has zero marginal coverage, so greedy and exhaustive choose no machine at any budget. The 10.7% no process covers fails the shared guards (seed 0: 72% of them have `w/b > 8`, 50% a depth under 1.2 mm; the two overlap). Under these assumed rules, geometry is not a reason to add a machine; the processes differ in what the material can carry, which is the point of the next bullets.
- **With a tip-load requirement the processes separate** (family `log`, F 1–1000 N). Alone, FDM covers 30.0% (range over seeds 29.6–30.5%), casting 21.8%, laser 17.8%, CNC 16.0%. Adding one machine to FDM gives 35.5% (casting), 36.8% (laser), 34.7% (CNC); all three give 40.9%. 58.5% of parts are covered by nothing, mostly high loads on thin arms. Parts only one process covers: FDM 8.2%, laser 2.8%, casting 2.8%, CNC 0.6%.
- **Machine choice changes with the budget, and greedy is sometimes beaten.** On `log` with load: budget 300 buys the casting setup (36.0%); budgets 600–800 the laser cutter (37.4%, exhaustive) while greedy takes the casting setup (36.0%); from 900 both reach casting + laser (40.9%); only at 1700 does the CNC router join (41.5%). On `large` with load, exhaustive prefers the router alone at 800 (77.7% vs greedy's casting 76.0%) and casting + router at 1100–1400 (81.1% vs greedy's casting + laser 80.5%). The gaps are 1–2 coverage points, from one sample (seed 0) and three machines, so the evidence is thin; they show that the myopic rule can miss a better pair, as `selfrep-nextmachine` found on synthetic instances.
- **The ranking depends on the part family.** On the `small` family with load, laser (alone 11.5%) beats casting (9.8%) and CNC is nearly useless (1.3%, its 6.35 mm tool and web rule exclude small features); on `large`, casting (58.1%) leads and CNC (40.8%) beats laser (28.0%). So "which machine next" depends on the sizes of the parts the shop wants, not only on its prices.

## Limitations
- **All inputs are assumed**: rule values, working stresses, moduli, the 10% stock tolerance, the load range and the log-uniform feature distributions. A real shop's parts are not random triples. The coverage numbers move with these choices and are not estimates of any real shop.
- The part family is a single bracket shape; "coverage" is the share of a sample, not of products. Material availability, finish, tolerance, cost per part and time are not modelled, and coverage is a yes/no that treats a 20 g plastic bracket and a heavy steel one alike (mass is the subject of `simdesign-dfm`).
- The beam check is closed form and omits stress concentrations, buckling, fatigue, bolts and porosity; the load coverage is optimistic for every process, and differently so (the fillet matters for casting and CNC).
- FDM's geometric rules are the loosest by construction (they equal the shared guards), so the geometry-only null result partly restates that modelling choice.
- Machine choice is shown for one seed and three machines; greedy-vs-exhaustive gaps of 1–2 points are not tested for significance.
- Simulated results only; nothing was checked against a real print, cut or casting.

## Next steps
Weight parts by mass or value so a cheap plastic part does not count as much as a metal one; draw parts from the real part lists of `selfrep-closure` instead of random features; give each machine its own bill of materials (the `selfrep-nextmachine` next step) so machines are themselves covered parts; replace assumed rules with a named shop's capability sheet.

## Owner steps
None needed (modelling only). Machine prices are placeholders: replace them with dated quotes before using the machine choice.

## Outside dependencies (vitamins)
Open-source Python packages only (NumPy; pytest for tests). The rule values, material properties and machine prices are assumptions that real shop data would replace; the machines themselves are not modelled.
