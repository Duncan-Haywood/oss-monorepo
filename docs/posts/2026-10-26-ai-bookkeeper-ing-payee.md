---
title: "ING Germany exports lost the payee name"
date: 2026-10-26
description: "ai-bookkeeper's reader did not recognise ING Germany's payee column, so categorizer suggestions lost the best signal."
tags: [ai-bookkeeper, ing, csv-import, bookkeeping]
---

ING's German account export has a column called `Auftraggeber/Empfänger`, the person or shop on the other side of each payment. ai-bookkeeper's CSV reader did not recognise that name, so a line from "REWE Filialen Voll" reached the categorizer as just the reference text "REWE SAGT DANKE". The payee is the best signal for learning which account a line belongs to, so dropping it made suggestions worse for every ING customer.

I found it by pulling the sample exports out of three open-source German bank importers' test suites (beancount-ing, beancount-dkb, beancount-n26) and running them through the reader. The DKB and N26 layouts already read correctly. The ING one read every date and amount right and lost only the payee. It now leads the description, and a test with made-up rows pins it.
