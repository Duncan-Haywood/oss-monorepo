---
title: "Checking Polish KSeF correction and advance invoices before you send them"
seo_title: "KSeF FA(3) correction invoice (KOR) and settlement (ROZ) validation"
date: 2026-11-06
tags: [einvoice-preflight, ksef, poland, e-invoicing]
description: "The open-source e-invoice checker's FA(3) schema gate now agrees with xmllint on correction and settlement invoices too, over 6,520 mutated files."
---

Poland's KSeF takes structured FA(3) XML, and most sample files online are plain sales invoices. Corrections (KOR), advance invoices and settlements (ROZ) use other parts of the schema: a block naming each corrected invoice, by KSeF number or for one issued outside KSeF, a partial-advance block, references to the advance invoices, and an attachment block.

Our checker reads the official schema into a table and checks a file against it before any arithmetic. Until now it had only been compared with `xmllint` on files without those blocks. We added a hand-built correction and a hand-built settlement (both valid on the real schema), then mutated all four seed files 6,520 times: an element deleted, duplicated, swapped, added, emptied, lengthened, given a euro sign, made text or negative, or a date cut short. The checker and `xmllint` agreed on every one.

A correction that loses its corrected-invoice block now draws `PL-014` (required element missing); a settlement whose advance block sits in the wrong place draws `PL-013` (out of sequence).

What this is not: the seeds are made up, since the official Ministry client templates hold no correction or settlement file, and KSeF's own business rules beyond the schema are not modelled. It is a preflight, not KSeF's verdict. Everything is MIT licensed in `ventures/einvoice-preflight`.
