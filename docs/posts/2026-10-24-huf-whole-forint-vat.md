---
title: "A Hungarian invoice that was right, flagged as wrong"
date: 2026-10-24
description: "E-invoice Preflight now accepts a HUF VAT total stated in whole forints, which Hungarian invoices use."
tags: [einvoice-preflight, hungary, validation]
---

einvoice-preflight's arithmetic check compared the stated VAT total to the computed tax rounded to cents. Hungarian VAT is stated in whole forints, so a correct HUF invoice was reported as INV-018. The check now also accepts a HUF tax total that is a whole number equal to the computed tax rounded half up to the unit. Other currencies are unchanged, and a HUF total that is off by a forint still fails. Two tests pin both directions. Still open: the rules on real ERP exports rather than the CEN examples.
