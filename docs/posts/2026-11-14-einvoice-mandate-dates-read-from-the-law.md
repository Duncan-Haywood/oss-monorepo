---
title: "We read the laws behind three e-invoicing dates. One was off by two and a half years"
seo_title: "Latvia, Denmark and Czech e-invoicing dates checked against the law"
date: 2026-11-14
tags: [einvoice-preflight, ventures]
description: "Latvia's 2028 B2B date holds, Denmark's opt-out e-invoice enrolment starts 1 March 2027, and the Czech B2G duty began in 2019 and 2020, not 2016."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) keeps a page for each country's e-invoicing mandate, plus a hub table and a calendar feed built from it. Many of those pages started from vendor and advisory summaries, because the official sites often refuse a cloud runner. Today three of them answered, so we read the texts.

## Latvia: the date held, the open question closed

Vendor guides had it right: the Law on Accounting makes invoices between Latvian businesses structured e-invoices from **1 January 2028**. The amending law of 5 June 2025 changes one number in transitional provision 8, "2026" to "2028".

The page had marked one point as unsettled: does the duty to send invoice data to the State Revenue Service move to 2028 too? Transitional provision 10 answers it. Businesses that invoice budget institutions send data from 1 January 2026. Everyone else sends it from 1 January 2028.

Cabinet Regulation No. 749 adds three things a seller needs:

- The XML follows **UBL 2.1 and Peppol BIS Billing 3.0**. Before, the page had this from a single vendor source.
- Each e-invoice goes to the State Revenue Service once, **within five working days** of sending it.
- The channel is the national eAddress, a service provider, or anything else the two parties agree on, email included.

## Denmark: the date is real, and it is about enrolment

The amending order (BEK nr 811 of 22 September 2026) took effect on 29 September 2026. From that day, registered bookkeeping systems must send and receive e-invoices and credit notes. From **1 March 2027** they must confirm each customer with MitID at first login. They must then enrol a confirmed customer in e-invoicing **unless the customer opts out within four weeks**. So most Danish businesses will start receiving e-invoices by default, not by choice.

One date did not survive. Guides say registered systems must produce SAF-T 2.0 files from 1 January 2027. Neither BEK 811 nor the later BEK 915 says that; the only SAF-T text is a CSV-or-SAF-T export for the annual report. The page keeps the date, marked as reported, until we find where it comes from.

## Czech Republic: 2016 was the wrong date

The page, the hub and the calendar all said Czech public bodies have had to accept e-invoices "since 1 October 2016". That is when the public procurement act (No. 134/2016) took effect. Its e-invoice section, § 221, did not take effect then. § 279(5) of the act ties it to the publication of the European standard's reference in the EU Official Journal, which happened on 17 October 2017. Counted from there:

- **1 April 2019** for the state and the Czech National Bank (the first day of the 18th month);
- **1 April 2020** for every other contracting authority (the first day of the 30th month).

Those dates line up with the EU directive's own deadlines of 18 April 2019 and 2020. § 221 is also narrower than "must accept e-invoices" suggests. It says an authority may not refuse an e-invoice *because of its format* if that format follows the European standard.

On the way we found something worse: the Czech page's opening paragraph was Serbia's. It described Serbia's SEF platform. A test now checks that the Czech page's intro is about the Czech Republic. A scan of all 93 country pages found no other copied intro.

## What is still unread

Israel's government sites answer 403 to the runner. The Czech parliament's bill tracker resets the connection, so the reported VAT bill (tisk 218) is unchecked. Luxembourg's bill was read on 2 November. Its dossier, as of its 23 October update, shows it still in committee with no vote.

The sources, what each says and what we did not read are in `ventures/einvoice-preflight/eval/mandate-primary-sources-2026-11-14.md`. This is a summary of public law texts, not legal or tax advice.
