---
title: "Quality fix: our contract checker read an expense limit as a cap on indemnity"
seo_title: "Does my freelance contract cap liability and indemnity?"
date: 2026-11-27
tags: [quality-audit, freelance-contract-checker, freelancers, contracts]
description: "Our contract checker cleared an uncapped indemnity whenever 'limited to' appeared anywhere. Liability and indemnity caps are now read per sentence."
---

The [Freelance Contract Checker](../../ventures/freelance-contract-checker/)
reads a client agreement and flags the clauses that cost a freelancer money.
Two of its risk rules were looking at the whole contract when they should
have looked at one clause. The 2026-11-26 quality audit
([audit file](../../portfolio/quality/audits/2026-11-26-freelance-contract-checker.json),
defects 1 and 2) rated both high, because a user would sign with the
result in hand.

## What was wrong

**Indemnity.** The rule flagged an indemnity as uncapped unless "limited to",
"not exceed" or "capped" appeared *anywhere* in the text. So this contract
passed:

> Contractor shall indemnify and hold harmless Client from all claims arising
> from the work. Reimbursable expenses are limited to $200 per month.

The $200 limit is on expenses. The indemnity has no limit at all.

**Liability.** The "no limit on your liability" finding was suppressed if the
text contained "liab" or "consequential" anywhere. This sentence makes
things worse for the freelancer, and it switched the warning off:

> Contractor shall be liable for all damages, including consequential damages
> and lost profits.

## What changed

Both rules now read the contract one sentence at a time.

- An indemnity counts as capped only when the same sentence mentions the
  indemnity and puts a money limit on it ("not to exceed the fees paid",
  "limited to $10,000"). "Limited to third-party claims" narrows what is
  covered. It is not a cap, so the finding still shows. A general liability
  cap in another sentence does not clear it either: indemnities are often
  carved out of the liability cap, so what to ask for is a cap written into
  the indemnity clause itself.
- A liability limit is found when one sentence caps liability at an amount
  ("total liability shall not exceed the fees paid"), says a party is not
  liable for indirect or consequential damages, or waives or excludes them.
  "Shall be liable for ... consequential damages" no longer counts.

The same audit found three smaller rules with the same flaw, and they read
one sentence at a time now too:

- "Begin work upon payment of the deposit" no longer makes an "assigned upon
  creation" clause look payment-conditional (defect 3).
- A late-fee day count ("invoices that remain unpaid after 60 days accrue
  1.5%") is no longer read as the payment term on a net 15 contract
  (defect 6).
- "Contractor will make all revisions Client requests" is flagged as
  open-ended revisions (defect 7).

Net 0 now shows as "0 days", not "not found" (defect 12). The tool's
`llms.txt` no longer calls the findings "estimates from the numbers typed in"
(defect 13). Each case has a test in `calc.test.mjs`. We also broke the new
code on purpose twice, once by putting back the whole-document indemnity
check and once the "liab anywhere" check, and the tests failed both times.

## What is still not at the bar

The medium defects in the audit are still open: termination on notice with
no fee owed is not flagged, a non-compete without the word "compete" is
missed while "this Agreement contains no non-compete" is flagged, and the
work-for-hire finding does not explain that most freelance work is not a
work-for-hire category under 17 U.S.C. 101. It is a text checker using fixed
rules, not a legal reading. Have an attorney look at anything that matters.
A later quality round will re-audit the tool rather than this one raising
its own score.
