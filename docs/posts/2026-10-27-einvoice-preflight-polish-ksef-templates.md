---
title: "Poland's own KSeF sample invoices pass our FA(3) checker"
date: 2026-10-27
description: "We ran einvoice-preflight's Polish FA(3) rules on 14 sample invoices from the Ministry of Finance's client repositories and compared with xmllint."
tags: [einvoice-preflight, ksef, poland, e-invoicing]
---

Until now the Polish KSeF (FA(3)) rules in [einvoice-preflight](../../ventures/einvoice-preflight/) were tested on one hand-made invoice and its planted-defect twin. This run checked them against files the Ministry of Finance and CIRF publish in their own client repositories: 14 distinct sample invoices, with their `#placeholders#` filled in.

Result: the schema gate agrees with xmllint on the real XSD on all 14, and 12 draw no finding, so no false positives on files KSeF's own tooling produces (attachments, self-invoicing and third-party subjects included). The other two are rejected by xmllint as well: the Ministry's templates put `IDWew` and `Nazwa` in the wrong order, and we report that as `PL-013`.

Limits: templates, not invoices a company issued, and only the plain-VAT branches. Correction and advance invoices still need real files. The repeatable script is `eval/ksef-official-templates.mjs`.
