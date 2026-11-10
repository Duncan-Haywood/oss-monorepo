---
title: "How well does a learning bookkeeper do on real labelled books? 20,005 expenses from five fiscal hosts"
seo_title: "Transaction categorization accuracy on 20,005 real labelled expenses"
description: "ai-bookkeeper scored against categories five Open Collective fiscal hosts chose: 63-87% right from expense memos, 43-65% from payee names alone."
tags: [bookkeeping, categorization, open-source, machine-learning]
date: 2026-11-10
---

The ai-bookkeeper suggests an account for every bank line: your rules first, then what you filed for that payee before, then a naive Bayes classifier over the words, then built-in keywords. Until today every accuracy figure for it came from a synthetic year, a handful of real card exports or a nonprofit's archived ledger. What it lacked was books where someone other than the keyword author had chosen the answer.

Open Collective publishes those. Its fiscal hosts pay expenses for thousands of open-source projects and community groups, and each paid expense carries the accounting category the host's finance team assigned. The public API serves them without a key. I read 20,005 paid expenses from five hosts (opensource, foundation, raft, pact_collective and metagov), mapped each host's categories to the product's chart of accounts, and replayed them month by month, the way a person imports a statement: every line suggested from what was filed in earlier months, then filed with the host's answer.

| host | lines scored | always the commonest category | learning loop, memo text | payee name only |
|---|---|---|---|---|
| opensource | 8,386 | 47.5% | 87.4% | 65.5% |
| foundation | 6,749 | 29.3% | 62.9% | 43.4% |
| raft | 1,581 | 18.8% | 73.1% | 60.0% |
| pact_collective | 2,063 | 62.8% | 73.9% | 58.0% |
| metagov | 1,226 | 57.2% | 74.7% | 64.4% |

Three things stood out.

**The words on the line matter more than the model.** With the memo the person typed ("Web hosting", "Maintenance and Development - March"), the loop is right on 63-87% of lines. With only the payee's name, which is roughly what a bank line gives you, it drops to 43-65%, and a payee it has never seen is right only 9-17% of the time. If a receipt or an invoice says what a purchase was for, carry that text into the books.

**Hosts disagree, and memory adapts.** pact_collective files groceries bought for its programmes as supplies; the keywords say meals and are wrong there more often than right. The payee memory picks up the host's own convention within a few months, which is the point of learning from corrections rather than shipping one fixed rulebook.

**Keywords for memo words help a first import.** The keywords alone knew vendor names but not the words people type. I added rules for phrases such as "web hosting", "legal services", "maintenance and development", "printing", "supplies" and "groceries", written from two hosts' misses only. On the three hosts no rule was written from, keywords alone went from 9-16% to 16-26% right of all lines. Ambiguous words ("gas", a bare "maintenance") stay unsuggested on purpose, and a big-box store stays blank even when the line says "supplies".

Lines the loop posted without review (payee memory at 0.85 confidence or more) were wrong 1.1% to 2.7% of the time.

Caveats: these are reimbursement and invoice records, not bank statements; the mapping from each host's categories to the chart is mine; some categories with no counterpart (grants, donations, "Administrative") were left out rather than forced. The records are fetched at run time and never copied into the repository, and since payees include private people only totals are published.

Code: `ventures/ai-bookkeeper/eval/opencollective-labelled.mjs` (`--host <slug>`). The tool itself is at [marisstella.app/ai-bookkeeper](https://marisstella.app/ai-bookkeeper/).
