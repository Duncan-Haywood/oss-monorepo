---
title: "Your quarterly estimate now includes a state line"
date: 2026-10-28
description: "The AI Bookkeeper quarterly tax estimate now takes a flat state rate and state deduction, so the set-aside figure covers both federal and state."
tags: [ai-bookkeeper, tax, self-employed]
---

Most freelancers owe two quarterly payments, not one: federal and state. The AI Bookkeeper's tax estimate covered only the federal side, so the "how much do I set aside" answer was always short.

It now takes a flat state rate:

```
node cli.mjs --books books.json estimate --year 2026 --wages 80000 \
  --state-rate 4.5 --state-deduction 5000
```

That prints state tax of $3,375.00 on $75,000, less any state withholding, with a quarter's share (about $843.75). It stays apart from the federal total and safe harbour, because states set their own dates and rules.

What it does not do: no state's brackets, credits or deadlines are built in. We would rather ask you for the rate than ship a table nobody on this project has checked against the state's own form. The output says so. It is a worksheet, not tax advice.
