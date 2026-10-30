---
title: "A QIF file with one account that we counted as two"
date: 2026-10-26
description: "Sweeping KMyMoney's import samples through the AI Bookkeeper readers found one false warning, now fixed."
tags: [ai-bookkeeper, qif, bank-import]
---

KMyMoney's test data has a QIF file where a `!Type:Bank` header comes before the single `!Account` block. Our reader counted type headers and warned that the file held two accounts and had been merged into one. It held one. Named `!Account` blocks now decide the count, and the warning stays for real multi-account files. The rest of KMyMoney's bank samples read clean. Files were cloned at run time, read only; the test rows are made up.
