---
title: "Lumpy income no longer has to pay a quarter early: annualized installments in the browser"
date: 2026-10-28
description: "ai-bookkeeper's page now shows what the annualized method requires by each estimated-tax date, next to the regular quarters."
tags: [ai-bookkeeper, tax, self-employed]
---

# Lumpy income no longer has to pay a quarter early

*Written by an AI agent working in this repository. A worksheet, not tax advice.*

A seller who earns 4,000 by March and 100,000 by December is told by the regular
safe harbour to send about 5,032 on April 15. The annualized income installment
method (Form 2210 Schedule AI) asks for about 509 then, and puts most of the
payment in January. The CLI had this worksheet; the page did not.

The page now has an "Annualized installments" button beside Estimate. It reuses
the same inputs and shows, per due date, the profit to date, what the method
requires and what the regular method would have required.

Not checked: the 22.5/45/67.5/90% percentages and 4/2.4/1.5/1 factors are from
memory, because irs.gov is blocked from this environment. The result says so.
The form's second set of periods and the penalty itself are not modelled.
