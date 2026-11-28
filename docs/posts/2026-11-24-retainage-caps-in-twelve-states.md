---
title: "Retainage caps on public work in twenty-four states, and a free SOV calculator"
seo_title: "Public retainage caps by state: CA, TX, FL, NY, OH and 19 more"
date: 2026-11-24
tags: [construction, subcontractors, retainage, pay-applications, lien-waivers, pay-app-guides, for-customers]
description: "Statutory caps on retainage for public construction in 24 states, each linked to the official statute, plus a free continuation-sheet calculator."
---

Retainage is the 5 or 10 percent of every progress payment an owner holds
back until a job is done, and the general contractor usually holds the same
back from its subs. For a specialty subcontractor that is often the whole
margin on the job, sitting in someone else's account for months.

The new [pay app guides](https://marisstella.app/pay-app-guides/) add a free
schedule-of-values calculator and four guides. The retainage guide's table
reads each state's own statute, and it says something worth knowing before
you sign a subcontract on public work.

**Five percent is the usual ceiling now.** Of the first sixteen states in the table,
ten cap public retainage at 5% of each payment: California (Public
Contract Code §7201), Florida (§255.078), New York (General Municipal Law
§106-b), North Carolina (G.S. 143-134.1), Virginia (§2.2-4333), Washington
(RCW 60.28.011), Massachusetts (c.30 §39G), Minnesota (§15.72), Oregon
(ORS 279C.570) and Utah (§13-8-5), which also caps the total at 5% of the
contract price. Nevada holds 5% until the job is half done and may stop
after that (NRS 338.515). Texas allows 10% on contracts
under $5 million and 5% above. Pennsylvania, Illinois and Arizona start at
10% and step down at 50% complete; Michigan stops withholding new retainage
at 50% complete.

**The cap often flows down.** California and Texas say outright that the
prime may not hold more from a sub than the owner holds from the prime, and
New York applies the same 5% rule from contractor to subcontractor. Utah
goes furthest: its 5% cap covers private nonresidential jobs as well as
public ones, applies between subs, and a lower owner rate flows down.
Minnesota makes the prime cut subs' retainage whenever the agency cuts its
own, and pay it out within 10 days of receiving it. A 10%
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
statute. The first twelve were read on 2026-11-24 through search results
limited to the official legislature domains, because the pages themselves
would not load. On 2026-11-25 they did: nine of the twelve rows matched the
statute text as written, and California, Pennsylvania and Illinois still
refuse automated loads, so the page says which rows rest on which reading.
Minnesota, Nevada, Oregon and Utah were added the same day from the statute
pages directly. Georgia and New Jersey are still left out because their
current text could not be confirmed. Check the linked statute before
relying on a row; it is a summary, not legal advice.

## Seven more states, and Ohio's rule changed in 2025

*Added 2026-11-28.* The table now has 23 states. The seven new rows were each
read from the statute page on the legislature's own site, and the text read
is kept beside the guide in
[sources/retainage-caps.txt](https://marisstella.app/pay-app-guides/sources/retainage-caps.txt):

- **Iowa holds the least: 3%.** Iowa Code §573.12 lets a public owner keep no
  more than 3% of each monthly payment, and the prime no more than the lesser
  of 3% and the subcontract's rate from a sub. The figure is in the 2026 Iowa
  Code, whose history note lists an amendment to those paragraphs by 2025
  Acts, chapter 29; check a subcontract form older than that against it.
- **Five at 5%:** Delaware (29 Del. C. §6962(d)(5), state agencies' large
  public works contracts, with 60% of what is held releasable on completion),
  Idaho (Idaho Code §54-1926(3), which caps prime-to-sub retainage at 5% too
  and makes the prime pay it within 30 days after the subcontract is done),
  Maine (5 M.R.S. §1746, held until the State accepts the project), Missouri
  (RSMo §8.960, formerly 34.057; up to 10% on contracts too small to need a
  bond, $50,000 or less) and Kansas (K.S.A. 16-1904, 5% unless a higher rate
  up to 10% is needed to ensure performance; roads and bridges are outside
  the act, and its rights cannot be waived by contract).
- **Ohio splits labor and materials.** Ohio Rev. Code §153.12 pays labor at no
  less than 96% of the approved estimate, and §153.14 pays for materials
  delivered but not yet installed at 92% of invoice. No subcontract may be
  paid at a lower rate than the contractor.

**Ohio subs: the 50% rule is gone.** Until 30 September 2025, §153.13 said
that once a contract was half complete "no further funds shall be retained"
and what had been held went into escrow. House Bill 96 rewrote the section:
the current text keeps the release dates (retainage and its interest on the
substantially completed portion within 30 days, the rest within 30 days of
final completion) and drops the 50% stop and the escrow. An estimator or a
contract template written before then may still promise the old rule. Both
versions are on codes.ohio.gov and quoted in the sources file.

**Alabama, added later on 2026-11-28.** Ala. Code §39-2-12(c) lets a public
owner hold no more than 5% of the work done and materials stored, and once
the job is 50% complete "no further retainage shall be withheld"; what was
held stays until final completion and acceptance, unless the contract allows
an escrow account or deposited securities instead. Alabama Department of
Transportation highway, bridge and road contracts carry no retainage at all.
That makes 24 states.

Some states set when retainage is paid without capping the rate. Vermont's
9 V.S.A. §4005 is one: retainage is paid within 30 days after final
acceptance and passed down within 7 days, but no percentage is set, so it is
not in the table.

The other three guides cover [how to fill out a pay application line by
line](https://marisstella.app/pay-app-guides/how-to-fill-out-a-pay-application.html),
[conditional vs unconditional lien
waivers](https://marisstella.app/pay-app-guides/conditional-vs-unconditional-lien-waivers.html)
(California's four statutory forms and Florida's §713.20), and [how change
orders flow into the schedule of
values](https://marisstella.app/pay-app-guides/change-orders-schedule-of-values.html).
The calculator runs in the browser and uploads nothing.

PayApps, our hosted pay-app billing for subcontractors, is open: the
schedule of values, retainage (per line, with its own rate where the
subcontract sets one) and change orders are free on one active job, with no
card ([start free](https://marisstella.app/industries/construction/)). Lien waivers across every job are on the paid
plans, which are not on sale yet.
