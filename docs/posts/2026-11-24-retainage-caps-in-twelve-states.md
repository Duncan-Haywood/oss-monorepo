---
title: "Retainage caps on public work in twelve states, and a free SOV calculator"
seo_title: "Public retainage caps by state: CA, TX, FL, NY and 8 more"
date: 2026-11-24
tags: [construction, subcontractors, retainage, pay-applications, lien-waivers]
description: "Statutory caps on retainage for public construction in 12 large states, each linked to the official statute, plus a free continuation-sheet calculator."
---

Retainage is the 5 or 10 percent of every progress payment an owner holds
back until a job is done, and the general contractor usually holds the same
back from its subs. For a specialty subcontractor that is often the whole
margin on the job, sitting in someone else's account for months.

The new [pay app guides](https://marisstella.app/pay-app-guides/) add a free
schedule-of-values calculator and four guides. The retainage guide's table
reads each state's own statute, and it says something worth knowing before
you sign a subcontract on public work.

**Five percent is the usual ceiling now.** Of the twelve states in the table,
seven cap public retainage at 5% of each payment: California (Public
Contract Code §7201), Florida (§255.078), New York (General Municipal Law
§106-b), North Carolina (G.S. 143-134.1), Virginia (§2.2-4333), Washington
(RCW 60.28.011) and Massachusetts (c.30 §39G). Texas allows 10% on contracts
under $5 million and 5% above. Pennsylvania, Illinois and Arizona start at
10% and step down at 50% complete; Michigan stops withholding new retainage
at 50% complete.

**The cap often flows down.** California and Texas say outright that the
prime may not hold more from a sub than the owner holds from the prime, and
New York applies the same 5% rule from contractor to subcontractor. A 10%
retainage clause in a subcontract on a 5% public job is worth asking about.

**Some details are moving.** Florida used to allow 10% until a job was half
done; the current text says 5%. North Carolina's small-project exemption
reads $150,000 in the statute text we found, while a 2025 session bill (H1123)
changes the threshold. The guide says so rather than picking one.

## "Reduced at 50%" can mean two different numbers

*Added 2026-11-25.* A clause that drops retainage from 10% to 5% once the
job is half done can be read two ways, and they bill differently.

Take a $100,000 subcontract with $70,000 completed:

- **The reduced rate on everything billed.** 5% of $70,000 is $3,500 held.
  The application releases part of what earlier ones held.
- **The reduced rate only on work completed after the halfway point.** The
  first $50,000 stays at 10% ($5,000) and the $20,000 after it is held at
  5% ($1,000): $6,000 held. Nothing already held comes back early. A
  statute that stops withholding *new* retainage at 50%, as Michigan's does
  in the table, is this reading with 0% after the point: $5,000 stays held
  however far the job goes.

That $2,500 gap is on one application for one sub. If your sheet uses one
reading and the owner's reviewer uses the other, the application gets sent
back. The contract decides which applies, and the
[pay application generator](https://marisstella.app/pay-application-generator/)
now does both. Under "The reduced rate applies to", choose everything billed
or only work completed after that point. In the second mode, each line's
share of the amount past the point is in proportion to its work billed. With
no stored materials and no per-line rates, that makes the total exact. The
generator shows the split in a note, uses it to estimate previous
certificates, and carries the mode into next month's application. The Excel
download writes the split as live formulas: the reduced rate and the
completion point are cells on the continuation sheet, so changing a number
in Excel still gives the right retainage. LibreOffice recalculated the
workbook from its formulas alone and matched the page to the cent, on a
case with stored materials and a line with its own rate.

One limit: the tool assumes the reduction began exactly at the completion
point. If the owner applied it from the next application instead, enter the
previous certificates from your last application, and the payment due will
be exact again.

How the table was made: each row links the legislature's own published
statute, read on 2026-11-24. This session's network could not load those
pages directly, so the text came from search results limited to the official
legislature domains. Ohio, Georgia and New Jersey were left out because
their current text could not be confirmed. Check the linked statute before
relying on a row; it is a summary, not legal advice.

The other three guides cover [how to fill out a pay application line by
line](https://marisstella.app/pay-app-guides/how-to-fill-out-a-pay-application.html),
[conditional vs unconditional lien
waivers](https://marisstella.app/pay-app-guides/conditional-vs-unconditional-lien-waivers.html)
(California's four statutory forms and Florida's §713.20), and [how change
orders flow into the schedule of
values](https://marisstella.app/pay-app-guides/change-orders-schedule-of-values.html).
The calculator runs in the browser and uploads nothing.

Hosted pay-app billing for subcontractors, covering the SOV, retainage,
change orders and waivers across every job, is in development with early
access; each guide links to it. Nothing is for sale yet.
