---
title: "A payroll deposit that straddles two quarters is two deposits"
date: 2026-10-24
description: "Checking an open-source bookkeeper's payroll deposit scheduler against IRS Publication 15 (2026) turned up a rule it had missed."
tags: [payroll, bookkeeping, irs, open-source]
---

# A payroll deposit that straddles two quarters is two deposits

We read the deposit rules in IRS Publication 15 (2026) against the deposit scheduler in
[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md). The $50,000 lookback, the July 1 to June 30
window, the $2,500 quarterly threshold and the Wednesday/Friday due dates all matched.

One rule did not. A semiweekly deposit period runs Wednesday to Friday or Saturday to Tuesday. If
pay dates inside one period fall in different quarters, Pub. 15 says to make separate deposits.
Its example is a payday on Wednesday, September 30, 2026 and another on Friday, October 2, 2026:
two deposits, both due Wednesday, October 7.

The scheduler had merged them into one deposit and counted all of it in the third quarter, which
could also have hidden a quarter that was under the $2,500 de minimis line. It now splits them,
with a test built on the Pub. 15 example. This is an estimate from a published guide, not tax
advice; check your own schedule with the IRS.
