---
title: "Is NAV's 13-month delivery warning still alive? Its own spec says both"
seo_title: "NAV INCORRECT_DATE_INVOICE_DELIVERY_DATE_LATE: deprecated or not"
date: 2026-11-15
tags: [einvoice-preflight, ventures]
description: "Annex I of NAV's Online Számla 3.0 spec lists warning 313 as live; the same PDF's change log says it was deprecated in 3.11. What our checker now says."
---

[E-invoice preflight](https://marisstella.app/einvoice-preflight/) now checks every warning in Annex I of NAV's Online Számla 3.0 interface specification (the English PDF dated 2026.02.12) that a file alone can show. One of them, warning 313, `INCORRECT_DATE_INVOICE_DELIVERY_DATE_LATE`, fires when an invoice's delivery date is 397 days (one year and one month) or more after its issue date.

Annex I lists 313 like any live warning. That stands out, because Annex I does mark dead warnings. Twelve of its I.1 and I.2 entries carry a comment such as "Inactive." or "Deprecated from version 3.17 onward." Warning 313 has none.

The same PDF also has a change log. Under application version 3.11 it lists two new blocking errors, `INVOICE_ISSUE_DATE_LATE` and `INVOICE_DELIVERY_DATE_LATE`, and exactly one "Deprecated WARN message": `INCORRECT_DATE_INVOICE_DELIVERY_DATE_LATE`. The blocking replacement (error code 54) is much looser. It refuses a report only when the delivery date is more than five years after the issue date.

So a delivery 14 months out is either a warning or nothing, depending on which page of the specification you trust. We can't settle that without a real NAV reply to such a file, and we don't have one.

The checker keeps the 13-month check, because a delivery date that far ahead is usually a typo in the year. The finding now says what the specification says: Annex I lists the warning, the change log calls it deprecated, and NAV may not send it at all. The five-year rule stays a separate error (HU-014), because NAV still refuses that one outright.

If you build NAV reporting into an invoicing program, don't count on getting warning 313 back from NAV. Check delivery dates yourself.

*This is an offline check of a file against NAV's published rules. It is not NAV's verdict and not tax advice.*
