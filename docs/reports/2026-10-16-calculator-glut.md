# Why the portfolio filled up with calculators

**Date:** 2026-10-16. **Asked by:** the owner ("why did calculators get so
prioritized. let's study what happened there make a report and blog post then
fix the problem going forward"). **Method:** read-only study of `origin/main`
(unshallowed, 11,764 commits), the `ventures/` tree, the router, the scorer,
the session gate and the steering documents. All counts below come from the
tree or from git history on that date. Where something could not be measured,
it says so.

## The short version

- The portfolio holds **1,261 ventures**. 1,258 are `stage: prototype` and
  none has a reading from an outside user.
- **53% are calculators by name or description:**
  - 121 `*-bid-calculator`
  - 521 other `*-calculator`
  - 26 described as calculators
- Most of the rest are the same single-page shape under other suffixes:
  `-check` 150, `-checker` 59, `-analyzer` 55.
- **49% (619) share exactly the same 11-file layout**, and `usage.mjs` is
  identical in 927 of 1,222 once the slug is normalised.

No single bad decision caused this. Five reasonable-sounding rules, written
between 24 August and 6 September, each pointed the same way. Unattended
sessions with no memory kept taking the cheapest path that met all of them:
one more static calculator for one more niche. Prose warnings against it were
written three times. None of them reached the code that decides what a
session works on, so none of them changed anything.

## Timeline

New ventures per week, dated by the first commit that added each
`ventures/<slug>/VENTURE.yaml`:

| week (Mon) | new | `*-bid-calculator` | other `*-calculator` | calculator by description | other | calculator share |
|---|---|---|---|---|---|---|
| 07-27 | 2 | 0 | 0 | 0 | 2 | 0% |
| 08-17 | 9 | 0 | 0 | 0 | 9 | 0% |
| 08-24 | 172 | **102** | 24 | 16 | 30 | 83% |
| 08-31 | 12 | 3 | 3 | 4 | 2 | 83% |
| 09-07 | 86 | 4 | 25 | 4 | 53 | 38% |
| 09-14 | 49 | 4 | 21 | 2 | 22 | 55% |
| 09-21 | 65 | 2 | 34 | 0 | 29 | 55% |
| 09-28 | 351 | 1 | 137 | 0 | 213 | 39% |
| 10-05 | 341 | 5 | 183 | 0 | 153 | 55% |
| 10-12 (to 10-16) | 174 | 0 | 94 | 0 | 80 | 54% |
| **total** | **1,261** | **121** | **521** | **26** | **593** | **53%** |

There were two waves.

**Wave 1: bid calculators, 24–26 August.**
- 94 of the 121 bid calculators landed on one day, 2026-08-26.
- 99 of the 121 creating PRs came from Cursor branches named
  `cursor/autonomous-development-mandate-*` (55) and
  `cursor/product-first-development-mandate-*` (31).
- The first was `janitorial-bid-calculator` (PR #1034), from a Claude
  session.
- The Cursor briefs are not in the repository, so their wording is unknown.

**Wave 2: generic calculators, 28 September – 14 October.**
- Claude sessions created 42–77 ventures a day, 420 of them
  `*-calculator` slugs.

## Root causes, most important first

### 1. The playbook describes a trade bid calculator

`PRODUCT_PLAYBOOK.md` was written on 2026-08-24 (#868):
- Its first-choice product shape is a static page on GitHub Pages
  (lines 46–48).
- It points at "trades where the money is real and the software is
  spreadsheets" (line 31).
- Its strongest value sentence ends in "a job they can now bid on"
  (line 39).
- It asks that "one session should produce something usable" (line 174).

Every item in its definition of done can be met by a static calculator in one
session. Put those together and the ideal product is a bid calculator for a
trade. The 2026-10-15 drift audit (`prompts/drift/2026-10-15.md`, item 2)
reached the same conclusion independently.

### 2. Every run had to ship, and a new venture never collides with anyone

- #813 sent generic sessions to venture work.
- The session gate's BUILD branch said "pick a super-niche product … graduate
  it, and ship" (`session_gate.py`, the empty-pipeline branch).
- With 9–14 sessions running at once, a new directory is the only work that
  cannot conflict with a sibling.

The sessions said so themselves. PR #1034: "a new venture was also the
lowest-collision way to add user value". PR #1554: deploying was gated on the
owner, so "a complete, distinct bid tool for a paid trade niche" was the next
thing it could ship.

### 3. "New ventures first", from 2026-09-06, and repeated to every session

PRs #3465, #3482 and #3487 wrote "new ventures get first call" into
`portfolio/DIRECTION.md` and into every PROCEED verdict the session gate
printed. The same PRs warned against "the 176th niche calculator", and
`portfolio/pipeline/README.md` added an explicit warning about the
`<trade>-bid-calculator` archetype on 2026-09-07. Those warnings were prose.
The near-duplicate check (`duplicate_check.py`) compares one niche at a time,
and a boiler job is not a crown-molding job, so every new trade passed it.
About 1,060 ventures were created after the warnings.

### 4. Each venture's merit score was written by the session that built it

- The composite is a plain mean of six dimensions (`score_ventures.py`).
- Two of the six, `autonomous_ops` and `gross_margin`, are 10 for any static
  page.
- **85 of the 117 scored bid calculators carry the identical vector
  (1, 10, 7, 10, 5, 7)**, and 17 more score one point higher.
- Mean merit: bid calculators 6.62, everything else about 6.06. The gap comes
  from the scores the creating sessions gave themselves for time-to-revenue
  and distribution. Neither is a measurement.

### 5. The router sorted on that score and handed out a task nobody could do

- Every venture is an unmeasured, dispatchable prototype, so the only working
  sort key in `allocate.py` was merit. Ties fell through to the budget cap and
  then to alphabetical order.
- 537 ventures have no score row at all and sorted as 0.
- Result before this change: **bid calculators were 9.6% of the portfolio
  and held 63 of the top 100 queue slots.**
- 1,187 ventures had the same task: "Explore: test the untested hypothesis".
  Every one of those hypotheses needs evidence from customer contact, and with
  no visitor counter, no session could get it. So sessions either polished
  the top bid calculator (FAQ pages, red-team passes, "vs Jobber" pages) or
  started a fresh venture.

Shared investment made it worse. `proposal.mjs` is byte-identical in 119
ventures, `share.mjs` is in 112 bid calculators, and `vs-jobber.html` in 39.
That made the family the most finished one, which kept it on top.

## The "no new single-page calculators" rule

- Added in PR #7020 (2026-10-15T02:54Z) and softened to "a principle, not a
  ban" in PR #7266 (2026-10-16T03:16Z).
- **It did stop calculator creation:**
  - 36 hours before the rule: 78 new ventures, 64 of them calculators;
  - between the rule and the softening: 28 new ventures, none of them
    calculators.
- It changed nothing in the router, the scorer or the session gate, so
  sessions kept working on the queue's top picks. About 44 of 219 venture
  changes after the rule still went to calculators.
- **A new template family started straight away:** most of the 28 post-rule
  ventures are self-hostable SaaS clones named `*-keeper` and `*-radar`. They
  are different products, not clones of one, but they show the same pattern:
  without a structural check, the next cheap template takes over.

## What changed in this PR

1. **The router ranks families, not slugs** (`portfolio/router/allocate.py`).
   - Ventures that share a template suffix (`*-bid-calculator`,
     `*-fee-calculator`, `*-profit-calculator` and seven more kinds) form a
     family.
   - Within a priority tier, at most 3 members of a family of 5 or more keep
     their place; the rest move to the end of that tier. Dispatchability,
     measurement and stage still come first.
   - The top member of each large family gets one **Consolidate** task
     instead of its own: ship one product with a shared engine and the niches
     as data, keeping every old URL.
   - Measured on 2026-10-16: **bid calculators in the top 100 went from 63
     to 3**, and calculators of any kind from 84 to 32.

   | family | members |
   |---|---|
   | bid-calculator | 121 |
   | profit-calculator | 65 |
   | fee-calculator | 29 |
   | tax-calculator | 22 |
   | price-calculator | 19 |
   | rate-calculator | 17 |
   | cost-calculator | 16 |
   | margin-calculator | 14 |
   | payout-calculator | 6 |
   | roi-calculator | 5 |

2. **The session gate stopped saying "new ventures rank first".** With an
   empty pipeline it now points at distribution and measurement first, then
   the router's consolidation task. A genuinely new product, including a
   non-web open-source tool, is still welcome if it is not another copy of an
   existing family.
3. **`portfolio/DIRECTION.md`** marks both "new ventures first" sections
   superseded, with a link here.
4. **A visitor counter** (`platform/counter/`, in the same PR) makes
   "Explore: test the hypothesis" answerable for the first time once it is
   deployed.

## Not changed yet, and why

- **Merit penalties and dropping the two constant-10 dimensions**
  (`score_ventures.py`). This is worth doing, but it rescores 724 rows.
  It belongs in its own PR with the before and after ranking side by side.
- **Unscored ventures sorting as 0, and the red `score_ventures.py --check`**
  (537 missing rows). This needs a decision on what an honest default is.
  Sorting new ventures to the middle would lift the new `*-keeper` family
  wholesale.
- **A CI guard against a 25th venture with an identical file layout.** The
  family cap in the router removes the incentive to add one. A merge-blocking
  guard can follow if the pattern restarts under a new suffix.
- **The consolidation itself.** The router now assigns it, and the first
  session to pick it up does it. The obvious first target is one contractor
  bid tool with the 121 trades as data.

## Unknowns

- What the Cursor "mandate" briefs said.
- Why new score rows stopped around 1 October. No single commit explains it.
- Whether anyone uses any of these tools. Demand is unmeasured, not shown to
  be zero.
