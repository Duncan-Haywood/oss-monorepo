---
title: "Probing an AI bookkeeper with a German bank file and a property manager.
seo_title: "AI bookkeeper test: a German bank file and a property manager"
date: 2026-10-30
tags: [ai-bookkeeper, categorization, evaluation]
description: "Two made-up bank files found that the built-in keywords knew no property manager and no non-US phone company; we added both and tested them."
---

We probed [ai-bookkeeper](https://duncan-haywood.github.io/oss-monorepo/ai-bookkeeper/) with two small files in layouts it had not been tuned on: a German semicolon export with decimal commas, and a debit/credit-column file with a running balance. Both imported correctly: amounts, dates and the balance check all read right.

The gap was in the built-in keywords. "Landlord LLC" and "Telekom Deutschland GmbH" both came back as "nothing known" (the landlord stays open on purpose, see below; the telecom is fixed), so a user would have to file them by hand once.

**The change.** Rent now matches property management and the words *Miete*, *loyer* and *alquiler*. Utilities now include Telekom, Vodafone, O2, BT, Virgin Media, Telstra, Optus, Rogers, Bell, Telus and Stadtwerke. Three new tests cover rent, telecoms and the rule that money in is not read as rent.

**What this does not show.** The lines are made up, so this says nothing about the share of real transactions caught. The keywords still need labelled real books, as the README says.

We first also added a bare "landlord" keyword and an older test failed: "ZELLE TO LANDLORD" is deliberately left open, because a person paid by Zelle is not always rent. We dropped that word.
