# Fair cost sharing calculator: Shapley value, nucleolus and core

**Live:** https://marisstella.app/cost-sharing-calculator/

Who should pay what for something a group shares? Neighbours on a private
road, towns sharing a water plant, friends sharing a ride, firms buying
together: together it costs less than each going alone, and the argument is
over how to split the saving. This tool answers in the terms of cooperative
game theory, on your numbers, in the browser:

- **How should we split the cost of a shared private road or driveway?**
  Give each household's distance along it; each stretch is split among those
  who use it (the Shapley value of the road, Littlechild & Owen 1973), next
  to proportional-to-distance and equal splits.
- **What is each member's fair share by the Shapley value, and by the
  nucleolus?** Price each group of members (A+B, A+C, ...); groups you leave
  out are priced as the cheapest way to split them.
- **Would any subgroup be better off going alone?** Every split is checked
  against the core, and the subgroup it overcharges most is named.
- **How do you divide an estate that cannot pay every claim?** The Talmud
  rule (the nucleolus of the claims game, Aumann & Maschler 1985), random
  arrival (O'Neill 1982), proportional, constrained equal awards and losses.

Nothing is uploaded. Arithmetic on the numbers you give, not legal, tax or
financial advice: a road agreement, deed, contract, statute or court may
require a different split.

## Methods

| Method | Paper | What it does |
| --- | --- | --- |
| Shapley value | Shapley 1953 | Each member's extra cost, averaged over every order the group could form in; exact over all subgroups (up to 14 members) |
| Nucleolus, least core | Schmeidler 1969; Maschler, Peleg & Shapley 1979 | Lexicographically minimises the largest overcharge of any subgroup; sequential LPs solved through their duals by a two-phase simplex written here (up to 10 members) |
| SCRB, ENSC | Young, Okada & Hashimoto 1982 | Separable cost plus a share of the non-separable rest (in proportion to remaining stand-alone cost, or equally) |
| Road (airport game) | Littlechild & Owen 1973 | Closed-form Shapley value: each stretch split equally among those who reach it, any size; core check over the nearest-k groups |
| Claims | Aumann & Maschler 1985; O'Neill 1982 | Talmud rule (= nucleolus), random arrival (= Shapley value), proportional, CEA, CEL |

Each paper's DOI was checked against Crossref on 2026-11-17. The engine's
`PAPERS` constant lists what was implemented from each and every deviation.

## Use it

- **Browser:** the live page, or open `index.html` from a checkout (served
  over http, since it loads ES modules).
- **CLI:** `node cli.mjs groups.csv`, `node cli.mjs road.csv --mode road --total 18000`,
  `node cli.mjs claims.csv --mode claims --estate 200`; `--csv` or `--json` for
  machine output, `--help` for the rest.
- **Agents:** `node platform/agents/tools.mjs call cost-sharing-calculator analyze --input '{"mode":"road","csv":"a,100\nb,300","total":1200}'`.
- **JavaScript:** `analyze({mode, csv, game, total, estate, unit})`, or the
  pieces: `shapley(c, n)`, `nucleolus(c, n)`, `coreCheck(c, n, x)`,
  `airportShapley(needs)`, `talmud(claims, E)`, where `c` is an array of
  costs indexed by bitmask.

## Examples

- `data/talmud-ketubot-claims.csv` (**real**, public domain): Mishnah Ketubot
  10:4, three wives' claims of 100, 200 and 300 zuz. With estates of 100,
  200 and 300 the tool's Talmud rule and its independently computed
  nucleolus both give the Mishnah's divisions: 33⅓ each; 50, 75, 75; 50,
  100, 150.
- `data/shared-road.csv` and `data/three-towns-water.csv`: made-up numbers
  to show the road mode and the coalition table, labelled as such on the
  page. Sources: `data/SOURCE.md`.

## Verification

- **Independent reference:** `eval/make_reference.py` (Python 3.13, scipy
  1.18.1) builds 40 random games of 3 to 7 members (subadditive, arbitrary
  and airport games), computes the Shapley value by averaging over every
  permutation and the nucleolus with scipy's HiGHS solver, finding fixed
  coalitions by solving one LP per tight coalition (the engine reads them
  from dual weights instead). `engine.test.mjs` matches all 40: Shapley to
  within 5e-12, nucleolus and least core to within 5e-13.
- **Published results:** the Mishnah's three divisions (Aumann & Maschler
  1985) via both the Talmud rule and the LP nucleolus; the glove game's
  Shapley value (2/3, 1/6, 1/6) and nucleolus (1, 0, 0); a textbook LP
  (optimum 36 at (2, 6), duals 0, 3/2, 1); SCRB and ENSC worked by hand.
- **Properties:** Littlechild & Owen's closed form equals enumeration;
  Shapley efficiency, symmetry, null player and additivity; nucleolus
  efficiency, individual rationality, core membership when the core is not
  empty, and invariance to relabelling; random arrival equals a brute force
  over the 24 arrival orders; the road mode's prefix core check agrees with
  full enumeration.
- **Speed:** the nucleolus of a 10-member game (1,022 subgroups) takes 10 to
  50 ms. The first version solved the primal LP and took 7 to 60 s; the dual
  has 11 rows instead of 1,022.
- Run: `node --test engine.test.mjs cli.test.mjs page.test.mjs usage.test.mjs`.

## Limits

- Coalition table: up to 14 members; nucleolus and its full core check: up to
  10. The road mode has no size limit for the Shapley value and checks the
  core through its structure.
- The nucleolus is taken over imputations (no member pays more than going
  alone). If the whole group costs more than its members apart, it is
  undefined and the page says so.
- These are definitions of fairness, not the law. Private road agreements,
  HOA covenants, partnership agreements and insolvency law set their own
  rules.

## Disclaimer

No warranty. Provided free and as-is. Not legal, tax, or financial advice.
Not affiliated with the authors of the cited papers. Usage is counted only
in the visitor's own browser (`analysis_run`, `example_loaded`,
`report_downloaded`), never with their data, and off under Do Not Track or
the page's opt-out.

FSL-1.1-MIT licence (`LICENSE`).
