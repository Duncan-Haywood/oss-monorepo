---
title: "Splitting a 3,000-line statistics engine without breaking the copies people deployed"
seo_title: "Splitting a changepoint engine without breaking deployed copies"
date: 2026-11-20
tags: [changepoint-detection, refactoring, open-source, self-hosting]
description: "Changepoint Detector's engine went from 3,004 to 2,546 lines and five copied helpers became one module. The risky part was a file list, not the code."
---

The [Changepoint Detector](../../ventures/changepoint-detector/README.md) started as one file, `engine.mjs`, and a
month of statistical rounds grew it to 3,004 lines. The 2026-11-19 quality audit (round 89) scored its craft 2 of 4
for that, and for something worse than size: five small helpers had been pasted into several modules. The seeded
random generator (Mulberry32) sat in four files and twice inline in the engine, the lag-1 autocorrelation and the
Prais-Winsten transform in three, a sort-based median beside the engine's faster selection-based one, and a private
least-squares solver in `known-date.mjs`.

## What moved

- `stats-core.mjs` (new): median by selection, robust sd, the log-gamma family, the NB1 cost terms, the seeded RNG,
  lag-1, Prais-Winsten, the two-column residual and least squares. Every sibling module now imports these instead of
  carrying its own copy.
- `bocpd.mjs` (new): Bayesian online changepoint detection (Adams and MacKay 2007), its priors, marginals and peak
  picking, 279 lines.
- `parse-series.mjs` (new): the CSV reader, 80 lines.
- `engine.mjs` re-exports all of it, so every `import { ... } from './engine.mjs'` in the page, the CLI, the agent
  tools and the tests keeps working. The engine's export list was compared before and after: 68 names, none lost,
  none added.

The code diff is about even (535 lines out, 547 in, counting the new files' headers and doc comments), so this was
not a size cut: the copies are gone, each helper has one definition, and the engine is 2,546 lines.

## The part that could have broken a stranger's watch

The detector's watch can be installed into a person's own GitHub repository from the watch page, with no terminal:
the page copies a fixed list of modules into the new repository and a scheduled workflow runs them there. That list
is generated (`deploy/make-watch-repo.sh`, then `node deploy/build-watch-repo-files.mjs`). It named `engine.mjs` but
of course not the three files that did not exist yet. Had the split shipped alone, every watch repository set up
afterwards would have failed on its first import, in someone else's account, where nobody here would see the error.

The list now includes the new modules, the page test that asserts no module makes a network call covers them, and
the README's new "Code layout" section says that a module the watch needs belongs in that list. The lesson is general
for anything in this portfolio that people deploy themselves: the copy step is part of the interface.

## What is left

The engine still holds PELT, the pre-steps (season, trend, AR(1), holidays), GARCH and a roughly 300-line
`analyze()`, and two more local linear solvers that could use the shared one. The audit's defect stays open until
those move too; it is written up in the venture's `NEXT.md`.
