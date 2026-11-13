---
title: "The whole-file Benford test passed a ledger with three planted problems"
seo_title: "Benford's law on an expense ledger: why the first-digit test misses"
date: 2026-11-13
tags: [benford-audit, forensic-accounting, statistics, auditing]
description: "A free Benford audit tool on a synthetic ledger with three planted problems: the first-digit test said close conformity; three narrower tests found all three."
---

Benford's law says that in many sets of financial amounts about 30% begin with a 1 and under 5% begin with a 9. Auditors use it as a first screen: invented figures tend not to follow it. We built a free tool that runs the full test suite from Mark Nigrini's *Benford's Law* (Wiley, 2012) on a CSV in the browser or from the command line: [Benford Audit](https://marisstella.app/benford-audit/).

To check it, we gave it a synthetic expense ledger built so we would know the right answer. It had 2,400 amounts drawn from a distribution that follows Benford's law exactly, spread over 40 vendors. Then we planted three problems:

- one vendor with 60 invoices between 4,500 and 4,999, just under a 5,000 approval limit;
- 25 copies of the same 1,250.00 reimbursement;
- one employee with 80 claims made up by hand, mostly starting with 5 to 8.

That is 165 bad rows out of 2,565.

## What the classic test said

The first-digit test on the whole file came back with a mean absolute deviation (MAD) of 0.0031. On Nigrini's scale that is **close conformity**, the best verdict there is. The first-two-digits test did a little better, at MAD 0.0019, "marginally acceptable". That is a hint, but it doesn't say where to look.

That isn't a bug. 165 rows, spread over several leading digits, are about 6% of the file. Benford's law describes the whole file, and 94% of this file is clean.

## What found them

Three narrower tests found all three problems:

**Just under a limit.** If amounts follow Benford's law, slightly more of them fall just below any round number than just above it. Within 10% either side of a limit, about 52.5% should be below. At 5,000 we found 84 below and 30 above, where 59.9 below was expected. The chance of that many or more is 2.9 in a million. At 10,000, where nothing was planted, it was 25 below and 37 above, and that limit wasn't flagged.

**Repeated amounts.** 1,250.00 was the most repeated amount, at 25 times. A plain count found it.

**Each vendor and employee on their own.** The tool ran the first-digit test on each of the 39 groups with 50 or more amounts. Two corrections matter here. First, a small group always looks worse on MAD, just from random noise. So the tool takes off the MAD that noise alone would give at that size, and ranks by what's left. Second, testing 39 groups means a few will look odd by luck. So the p-values are adjusted for running many tests at once, using the Benjamini-Hochberg method. After both corrections, exactly two groups were flagged: the vendor just under the limit and the employee who made up claims. None of the 37 honest vendors were flagged. Before the correction, four honest vendors had p-values under 0.05.

The last-two-digits test also flagged the file (chi-square 281.7 on 99 degrees of freedom), because it had too many amounts ending in .00 and .25.

## What it means for anyone running Benford tests

The headline first-digit chart, the one most free Benford tools stop at, is the weakest test here. It works for spotting a whole data set that was made up. It barely notices problems in a small part of a file. Tests aimed at a specific way of cheating did much better here: a limit, a repeated amount, one person's numbers. The tool puts every record caught by at least one test on a list you can download, with the reasons.

The ledger is synthetic and the planted problems are blunt on purpose, so this shows the tests work as designed. It says nothing about how often they catch real fraud. A real ledger will fail some tests for honest reasons, like fixed fees, price lists and monthly bills. The page checks for the most common of these (too few amounts, too narrow a range, data that isn't skewed) and says so.

The file never leaves your browser. The code, the tests and the command-line version are [on GitHub](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/benford-audit). There is also a page on [who it's for and when to use something else](https://marisstella.app/benford-audit/for-auditors.html). Next we plan to add Nigrini's second-order and relative-size-factor tests, and date-based tests for weekends and period ends.
