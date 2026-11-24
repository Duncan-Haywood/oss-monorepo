---
title: "Ninety-six e-invoicing guide titles, cut to fit a search result"
seo_title: "Cutting 100 e-invoicing page titles to fit a search result"
date: 2026-11-23
tags: [polish, seo, einvoice-preflight]
description: "E-invoice Preflight's country guides had titles of 70 to 130 characters, so search results cut off the date or the rule. All 105 pages now fit in 70."
---

[E-invoice Preflight](../../ventures/einvoice-preflight/) has a hand-written
guide for each of 95 countries. Each one gives the e-invoicing rules, the
dates and what a file check can catch before you send. They are its most
likely way in from search: someone types "Slovakia e-invoice mandate" or
"Philippines BIR EIS deadline" and needs a date.

The titles were written as full sentences. Bolivia's ran to 130 characters,
Pakistan's and Estonia's to 128. A desktop result shows about 60 to 70
characters before it cuts with "…". With ` | E-invoice Preflight` added to
every title, the part a searcher actually needed, the date or the rule,
was often what got cut:

> Estonia e-invoice rules: public buyers since 2019, buyer's choice from Ju…

`platform/ci/check_title_meta.py` counted 100 long titles on the venture's
105 pages.

## What changed

Every title now leads with the country and the query words people search
for ("e-invoicing", "mandate", the system's own name: KSeF, myDATA, eTIMS,
FEL). Then comes the one fact that matters most, usually the date. Every
fact is taken from the page's old title, so nothing new is claimed. The
brand suffix stays where it fits in 70 characters (Austria, Cyprus, Turkey,
UAE, UK) and is dropped where it would push out the fact. Some examples:

| before | after |
|---|---|
| Latvia e-invoice mandate: 1 January 2028 for B2B, public buyers already, and a free pre-send check \| E-invoice Preflight | Latvia e-invoicing mandate: B2B from 1 January 2028, B2G already |
| Philippines e-invoicing: the BIR EIS, the December 2026 deadline and what a file check covers \| E-invoice Preflight | Philippines BIR EIS e-invoicing: the December 2026 deadline |
| UK e-invoice mandate: April 2029, Peppol and a free pre-send check \| E-invoice Preflight | UK e-invoicing mandate: April 2029 and Peppol \| E-invoice Preflight |

The four generated pages (the deadline list, the "which deadline applies"
checker, and the SdI and BR-FR error-code references) got short titles in
their generators. The `<h1>` and the `og:title` share text keep the longer
wording, since there is room for it there.

## Measured

| | before | after |
|---|---|---|
| einvoice-preflight titles over 70 characters | 100 of 105 | 0 |
| longest title | 130 | 70 |
| all `ventures/` (`check_title_meta.py`) | 1,264 | 1,164 |

A new test, `title-length.test.mjs`, fails if a page in the venture goes
over 70 again, so the next country guide has to fit too. I can't measure a
change in ranking or clicks: the site has no search-console reading yet, so
usage is unmeasured, not zero.
