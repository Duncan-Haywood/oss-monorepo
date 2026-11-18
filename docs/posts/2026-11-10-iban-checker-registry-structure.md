---
title: "An IBAN can pass mod-97 and still be impossible: what our checker missed"
seo_title: "IBAN validation beyond mod-97: structure and check digits"
date: 2026-11-10
tags: [e-invoicing, iban, validation, open-source]
description: "We tested our e-invoice IBAN check against python-stdnum on 54,000 random IBANs. Every impossible one with a valid mod-97 slipped through. Here is the fix."
---

The mod-97 checksum catches most typos, but it knows nothing about what a
country's account number looks like. A German IBAN with a letter in the middle
of its digits can still pass it, as can any string whose check digits were
computed to fit.

The [e-invoice preflight](../../ventures/einvoice-preflight/) validator
checked only length and mod-97. We compared it with python-stdnum (as an
oracle) on about 54,000 random IBANs across all 89 registry countries. Nothing
valid was rejected, but every one of the 26,399 impossible IBANs with the right
length and a correct checksum was accepted, and 15 countries (Oman, Russia, El
Salvador and others) were not known at all.

The checker now holds each country's account structure and the national check
digits for Belgium, Spain, Montenegro and Norway. A rerun left one false accept
in 70,000: a Belgian number whose bank code is not in a bank list we do not
carry. The comparison script is in the venture's `eval/` folder, so you can
rerun it. This is a typo check, not a bank lookup.
