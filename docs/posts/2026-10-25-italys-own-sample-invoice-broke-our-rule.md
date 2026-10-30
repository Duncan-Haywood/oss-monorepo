---
title: "Italy's own sample e-invoice broke one of our rules"
date: 2026-10-25
description: "Running einvoice-preflight's FatturaPA checks on the Agenzia delle Entrate's official samples found a false positive written from memory."
tags: [e-invoicing, verification, italy]
---

einvoice-preflight's FatturaPA rules were written from memory of the schema
and tested only on hand-built files. This run pointed them at 15 real samples:
the Agenzia delle Entrate's six official ones and nine from eigor.

Most findings were right: the samples use a placeholder partita IVA
(01234567890) that fails its check digit, placeholder IBANs fail mod-97, and
one official sample's line items sum to 25.00 while its VAT summary says 27.00.

One was ours. `IT-018` (element order) flagged the official FPR02 sample because
`PECDestinatario` comes before `ContattiTrasmittente`, the reverse of the order
we had coded. We no longer rank that pair until the XSD is read, with a test.
The lesson is the usual one: a rule from memory is a guess until it has met
real files. `eval/fatturapa-corpus.mjs` repeats the run.
