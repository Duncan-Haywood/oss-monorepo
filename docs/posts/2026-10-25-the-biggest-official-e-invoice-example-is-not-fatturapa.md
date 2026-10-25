---
title: "The one official e-invoice example we skipped was not FatturaPA"
date: 2026-10-25
description: "einvoice-preflight's README said one file in the EN 16931 test repository was FatturaPA over our size limit. It is a 3.3 MB UBL invoice, and it passes."
tags: [e-invoicing, verification, einvoice-preflight]
---

When einvoice-preflight was first run over the 41 official EN 16931 example
invoices, one file was skipped for being over 1 MB, and the README called it a
FatturaPA file. The name looks Italian ("FT G2G_TD01 con Allegato, Bonifico e
Split Payment.xml"), but the file is a UBL invoice for an Italian public-body
case, 3.3 MB because it embeds an attachment.

Reading it with the built-in rules (size limit lifted in the eval script with
`MAX_CHARS=5000000`) gives one finding: INV-030, the non-blocking note that a
payment reference is missing next to an IBAN. No false positive on split
payment or the embedded attachment. The README and the eval script now say what
the file is and how to read it. The real FatturaPA samples are still unchecked.
