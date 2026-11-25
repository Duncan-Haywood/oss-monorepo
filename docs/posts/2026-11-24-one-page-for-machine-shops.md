---
title: "One page for machine shops: quoting, CMMC and the free tools already here"
seo_title: "Software for CNC job shops: quoting, CMMC, ISO 9001"
date: 2026-11-24
tags: [manufacturing, machine-shops, cmmc, quoting, iso-9001]
description: "Eight free tools for CNC and fabrication shops were scattered across categories. One page now maps them, and two products in development, to four shop problems."
---

A CNC or fabrication job shop has a short list of problems that cost it money
every week. Two of the paid bets in this repository, an RFQ-to-quote tool
and a CMMC and ISO 9001 workspace, are aimed at the same shops, so they now
share one page: [Software for machine shops and engineering
firms](https://marisstella.app/industries/manufacturing/).

## Four problems

1. **RFQs pile up and quotes go out slowly.** Drawings, CAD and an email
   thread become a priced quote only after hours of the owner's or
   estimator's time.
2. **Pricing from your own rates.** A quote is only as good as the shop rate,
   setup hours, material and outside-process costs behind it.
3. **CMMC Level 1/2 self-assessment and the SPRS score.** Phase 1 took effect
   on 10 November 2025
   ([MeriTalk](https://meritalk.com/articles/dod-begins-rollout-of-cmmc-on-nov-10-heres-what-you-need-to-know/));
   Phase 2 was suspended on 13 July 2026, but the self-assessments remain
   required
   ([Wiley](https://www.wiley.law/alert-DOD-Pauses-CMMC-2-0-Implementation-A-Big-Deal-with-Little-Immediate-Impact)).
   Consultants charge about $3,000 to $25,000 to write the SSP and POA&M
   ([Secureframe](https://secureframe.com/hub/cmmc/certification-cost)).
4. **ISO 9001 and AS9100 documents**, kept somewhere nobody can find before
   the audit.

## What was already here

Searching the catalogue for machining, fabrication and quality turned up
eight free tools that do part of this work today, filed under different
categories: the [CNC machining quote calculator](../../ventures/cnc-machining-quote-calculator/),
the [shop rate calculator](../../ventures/shop-rate-calculator/),
[DXF nesting](../../ventures/dxf-nesting/), the laser cutting, powder
coating and mobile welding job pricers, the
[job shop scheduler](../../ventures/job-shop-scheduler/) and
[SPC control charts](../../ventures/spc-control-charts/). Each is now listed
under the problem it helps with. There was no CMMC tool at all, and nothing
that turns an RFQ into a quote; those two gaps are the products.

## What the page does not say

Both products are marked **in development (early access)**, with no price,
because neither is built yet. The CMMC workspace is described as a tool for
preparing your own self-assessment: not a certification, not a C3PAO, and
not endorsed by the Department of Defense. A test checks those lines are
still there and that no "certified" or "DoD-approved" phrasing has crept in.

Ten free tool pages already carry a one-line front door to it: a small note
that a separate product is being built for their visitors, while the tool
itself stays free. That makes the page reachable from the rest of the site
without a new menu item.

## Update, 25 November 2026: read the RFQ before you quote

Many quoting losses are not arithmetic. They are a line
nobody read: a first article report on lot one, domestic-melt material, an
approved-processor list for the anodize, a CUI marking on the drawing. The new
[RFQ review checklist](https://marisstella.app/machine-shop-guides/rfq-review.html)
takes the buyer's email or the RFQ terms, pasted in, and lists:

- each part number with its revision, quantities and annual usage, material
  and finish, and the tightest tolerance (millimetres converted; "tight" is
  the shop's own line, 0.001 in to start);
- the quote-due and delivery dates, and whether a drawing was mentioned;
- 13 FAR and DFARS clauses by number, each with its official title and one
  plain line on what it means for the shop: CUI and the 72-hour report
  (252.204-7012), the SPRS score (-7019, -7020), a CMMC level (-7021),
  specialty metals (252.225-7009), export control (-7048), a named quality
  standard (52.246-11), DPAS-rated orders (52.211-15) and others;
- CUI, ITAR/EAR, AS9102, certs, NADCAP and DPAS markers, and every spec named.

What it could not find becomes a numbered list of questions for the buyer,
copyable as one email, and the quantities carry over to the
[job-shop quote calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html)
as its breaks.

Two honest limits. It is pattern matching, not reading: it misses things
phrased in ways it doesn't expect, so every finding shows the text it came
from. And the clause titles are only as current as their source: they were
copied from GSA's published FAR and DFARS source files on 25 November 2026
(acquisition.gov itself was unreachable from the building session), compared
title by title (13 of 13 identical), and pinned by a test. Pasted text never
leaves the browser tab and is never saved, because an RFQ is often someone
else's confidential drawing.

This is the first step of the paid RFQ-to-quote assistant (bet #2): the
paid version reads the drawing and the model as well as the email, and
prices the quote from the shop's own rates.
