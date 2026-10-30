---
title: "What an open-source project's books taught a bookkeeper"
date: 2026-10-24
description: "ai-bookkeeper's built-in keywords suggested nothing for 1,052 sponsor contributions in the hledger project's public books. Two rules fixed that, and the..."
tags: [ai-bookkeeper, bookkeeping, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) is measured on real ledgers
where it can be. The third one is the hledger project's own Open Collective
books (`simonmichael/hledger_finance`). It has no licence file, so the eval
fetches it at run time and nothing is copied into the repository.

I hoped for a long tail of merchants. It has none. Of 1,113 transactions,
1,052 are sponsor contributions ("Monthly contribution from X (Bronze)") and
59 are bounty payments to contributors. Before this change the built-in
keywords suggested an account for **0 of the 1,052** income lines and 3 of the
59 bounties.

Two rules fix most of it: "contribution/donation/sponsorship from" is income
(4000) and "bounty" is contractor pay (6020). Now all 1,052 income lines and 52
of 59 bounties get the right account. The rest land on bank fees or software
because the title mentions a PayPal fee or the Claude API, or stay blank.

The caveat matters: I wrote the rules after reading this data, so the numbers
show the gap closed, not how well the rules generalise. A ledger with a long
merchant tail is still the open item. The eval is `eval/hledger-finance.mjs`.
