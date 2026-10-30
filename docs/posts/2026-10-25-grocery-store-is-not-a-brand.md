---
title: "Plain-word payees: a bookkeeper that knew Safeway but not 'Grocery Store'"
date: 2026-10-25
description: "Another open-source finance app's import fixture exposed a gap in ai-bookkeeper's built-in keywords: generic payee words."
tags: [ai-bookkeeper, bookkeeping, evaluation]
---

[ai-bookkeeper](../../ventures/ai-bookkeeper/) filed `Safeway` and `Whole Foods` under
meals but left a payee that just says `Grocery Store` unsuggested, and the same for
`Mobile Phone Provider`. Nothing in HCB's card feed or bank2ynab's samples had
exposed it, because real descriptors carry brand names. The nine-line labelled
import fixture of the open-source Maybe app did (4 of 9 suggested before, 6 of 9
after two small rules). It is a weak sample, written by hand, and the 6 of 9 is
tuned on itself. `Pharmacy` and `Movie Theater` stay open on purpose: they are
personal spending, which a business chart has no account for. The README keeps the log.
