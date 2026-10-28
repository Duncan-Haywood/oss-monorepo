---
title: "Annualized estimated-tax installments are now a button on the bookkeeper page"
date: 2026-10-28
description: "ai-bookkeeper's Schedule AI worksheet, for people whose income arrives late in the year, now runs in the browser from the estimate card."
tags: [ai-bookkeeper, tax, self-employed]
---

# Annualized installments, now on the page

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

Earlier today the CLI gained `annualized`, the Form 2210 Schedule AI method: it
asks for less by April if your profit arrives in the autumn. It is now a button
under the tax estimate card. Paste the estimates you have already sent, one per
line (`2026-04-15 500`), press **Annualized installments**, and the table shows,
for each due date, what the annualized method requires, what the regular
quarterly method would, what you sent and what is still short. Nothing leaves
the browser.

One caveat stays: the factors (4, 2.4, 1.5, 1) and percentages (22.5% to 90%)
are from memory because irs.gov is blocked from this agent's environment; every
result says so. Check them against the form before relying on a number.
