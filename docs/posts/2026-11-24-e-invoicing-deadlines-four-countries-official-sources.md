---
title: "E-invoicing deadlines in Germany, France, Belgium and Poland, each from the government's own page"
seo_title: "E-invoicing deadlines DE, FR, BE, PL: official sources"
date: 2026-11-24
tags: [e-invoicing, xrechnung, factur-x, peppol, ksef, smb]
description: "Nine dates in four countries, each tied to a ministry page, and one we had framed wrong: Germany's last step is the end of a transition, not a new rule."
---

The site now has a page for small businesses and their accountants who have
to send structured e-invoices:
[industries/eu-e-invoicing/](https://marisstella.app/industries/eu-e-invoicing/).
It lists nine dates in four countries, and each row links the official page it
rests on, with the day we read it.

| Country | From | What changes |
|---|---|---|
| Germany | 1 Jan 2025 | every business must be able to receive an e-invoice |
| Germany | 1 Jan 2027 | prior-year turnover above €800,000: must issue |
| Germany | 1 Jan 2028 | everyone issues (the transition for smaller firms ends with 2027) |
| France | 1 Sep 2026 | everyone receives; large companies and ETI issue |
| France | 1 Sep 2027 | SMEs and micro-businesses issue |
| Belgium | 1 Jan 2026 | structured e-invoices between VAT-registered businesses |
| Poland | 1 Feb 2026 | KSeF for 2024 sales above PLN 200 million |
| Poland | 1 Apr 2026 | KSeF for everyone else, small sales excepted |
| Poland | 1 Jan 2027 | the smallest taxpayers join KSeF |

Sources: the [BMF FAQ](https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html),
[economie.gouv.fr](https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises),
[einvoice.belgium.be](https://einvoice.belgium.be/en/article/when-e-invoicing-mandatory)
and the Polish Ministry of Finance's
[KSeF site](https://ksef.podatki.gov.pl/informacje-ogolne-ksef-20/zakres-obowiazkowego-ksef/).

## What checking against the official pages changed

Our planning notes cited a KPMG summary for Germany: "issuing required above
€800k from 1 Jan 2027, everyone from 1 Jan 2028". The BMF's own FAQ frames it
differently. Issuing has been the rule since 2025, and paper or PDF is allowed
only through transition periods. The general one ends on 31 December 2026, and
the longer one for turnover up to €800,000 ends on 31 December 2027. The
dates are the same, but "the transition ends" is the more accurate way to put
it. A BMF letter of 15 October 2026 also adjusts some transition rules, so the
page tells readers to go through that letter with their adviser.

Poland's page needed a different correction. The Ministry still gives
1 January 2027 as the date sanctions start, while advisers report a bill to
defer them to 2028. The page gives both and says the bill is not law as far as
we know.

## How the sources were read

None of the four government hosts could be reached from the machine that
builds this site, so we did not read the pages themselves. Each row rests on a
search engine's excerpt of the official page, read on 24 November 2026, and the
page says exactly that. Anyone checking a date should open the linked page.

## Why the page exists

E-invoicing mandates are hard deadlines, and our free
[E-invoice Preflight](https://marisstella.app/einvoice-preflight/) checker
already tests XRechnung, ZUGFeRD, Factur-X, Peppol and KSeF FA(3) files in the
browser. What people still lack is an answer to "what do I change?". The
product we are building for that, E-invoice Fix & Explain, explains each failed
rule in plain German, French or English, gives you a corrected file and lists
every change it made. It also gives accountants one workspace for all their
clients. It is in development and not on sale. To be told when early access
opens, write to hello@marisstella.app.

## Update, 26 November: the page now reads like the rest of the site

Two days after it went up, the page still rendered in the browser's default
Times New Roman, with lines running the full width of the window (1,264 px
on a 1280 px screen, about 200 characters a line). The site's shared
stylesheet draws the header, the dark hero band and the footer, but leaves
the body font to each page, and this page set none. The manufacturing page
had the same gap. Both now use the site's sans-serif type, a column of
about 830 px and the same light and dark backgrounds as the construction page.

On a phone the deadline table was also cramped: three columns at 390 px left
"What changes" about 100 px wide, in a box you had to scroll sideways. Each
deadline now becomes a small card on a phone (country, then the date, then what
changes and its source), using the layout the blog's wide tables already use.
The page is 12,405 px tall on a phone, against 8,812 before. That is the cost
of readable lines in place of the scroll box.

The free checker's section now shows the checker itself: a screenshot of
E-invoice Preflight with its broken example checked, two arithmetic errors
found, each with the fix it suggests ("Set gross total to 238.00"). It is the
real tool on a local build of the site, not a mock-up.

This is not tax advice.
