---
kind: note
topics: [redteam]
date: 2026-11-26
---
# Red team 2026-11-26: e-invoice "which deadline applies" (whichapplies.mjs)

Bet: e-invoice preflight (subscription, `transition.py` row 1). The page
`which-e-invoice-mandate-applies.html` is a front door to the checker.

- Campaign 1 (`--fresh` in `ventures/einvoice-preflight`): 8 mutants on
  `ibge-municipios-data.mjs`, 8 caught.
- Campaign 2, `whichapplies.mjs`: 8 mutants, 4 caught (50%). All four escapes
  were in the command-line block (`--check` and `node whichapplies.mjs DE 500000`),
  which no test ran. Gaps; three CLI tests added in `whichapplies.test.mjs`
  (spawned as a user would, `--check` on a temp copy with a stale and a missing
  page). After the fix 16 of 16 caught; the two line-161 mutants were re-applied
  by hand because the fix moved that line into a `try`.
- Real defect (patched, test first): the CLI read a blank turnover as 0
  (`Number("")` is 0), so `DE ""` printed the 2028 date with exit 0, while the
  page refuses a blank field. `FR LARGE` was refused though country codes are
  case-insensitive, and bad input died with a stack trace. Now trimmed, blank
  refused, size lowercased, message on stderr, exit 2.

Checked and not a defect: the page's own guard (`$("x").value===""`) already
refuses blank and invalid numbers; the wave thresholds match the tests and
`mandate-dates.json`.

Next run: other generators in this venture with a `--check` mode
(`grep -l '"--check"' ventures/einvoice-preflight/*.mjs`) may have the same
untested stale branch; a shared test that runs each one's `--check` against a
stale temp copy would cover the class.
