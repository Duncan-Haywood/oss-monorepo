---
title: "QuickBooks has no retainage field: how subcontractors track it anyway"
seo_title: "How to track retainage in QuickBooks Online (step by step)"
date: 2026-11-25
tags: [construction, subcontractors, retainage, retainage-release, retainage-tracking, punch-list, closeout, quickbooks, pay-applications, pay-app-guides, for-customers]
description: "QuickBooks Online cannot hold back retainage on an invoice. The Retainage Receivable account and item, the release invoice, and the report that hides it."
---

A subcontractor billing $40,000 of work at 10% retainage expects to be paid
$36,000 this month and $4,000 at the end of the job. QuickBooks Online can
send the $36,000 invoice, but it has no retainage field: nothing on the
invoice holds the $4,000 back, works out the percentage, or reminds anyone
it is owed. Our [new guide](https://marisstella.app/pay-app-guides/retainage-in-quickbooks.html)
sets up the workaround that answers on Intuit's own community forum keep
giving, and works one $150,000 subcontract through it.

**The setup is two things.** A *Retainage Receivable* account (type Other
Current Assets, detail type Retainage, which Intuit's guide to detail types
describes as the one for customers who hold back part of a contract until
the project is finished), and a *Retainage* item whose income account is
that asset account. Each pay app gets a negative Retainage line for the
holdback. On accrual books, the full value of the work goes to income, the
payment due to accounts receivable, and the holdback waits in the asset
account. When the money is released, a new invoice with a positive
Retainage line moves it into receivables without booking the income twice.

**Where it goes wrong.**

- *The A/R aging report leaves retainage out*, because it sits in an asset
  account. Over three pay apps on the example job, $15,000 is owed and appears on no
  aging report. You have to run the account itself, or Transaction Detail
  by Account filtered to it, and remember to bill the release.
- *Cash-basis books.* Users on Intuit's forum report that the asset-account
  item makes a cash-basis profit and loss show income before retainage is
  paid, and the suggested fixes disagree. The guide says so and sends you
  to your accountant rather than picking one.
- *Retainage you hold on your own subs* is a liability, Retainage Payable,
  and should never share the receivable account.

The page also has a small calculator: type the period's billing, the
retainage rate (or a held amount when stored materials run at another
rate) and any release, and it prints the invoice lines and total to type
into QuickBooks. It runs in the browser, uploads nothing, and is tested
against the worked example.

**Fixed the same day.** The guide tells you to type the retainage line into
QuickBooks as a negative number, so it is natural to type the held amount
into the calculator as "-4000" too. Until a red-team pass on 2026-11-25,
the calculator turned that into a *positive* $4,000 Retainage line: on
$40,000 billed it printed a $44,000 invoice that charged the retainage
instead of holding it back. It now refuses a negative held amount and says
the sign is added for you. The same pass found that the pay-app guides'
worksheet read items numbered "CO1" or "C.O. 3" (and the pay application
generator read "C.O. 3") as base-contract work rather than change orders,
which overstated the original contract sum; both now recognise those
numberings, and each fix has a test.

How the guide was made: Intuit's help and community pages were read on
2026-11-25 through search results, because this session could not load
quickbooks.intuit.com directly. Every step links the Intuit page it came
from. Most are community answers, some several years old, so check menu
labels against your own screen. Not affiliated with Intuit; not accounting
advice.

## Then getting it released

Tracking the $15,000 is half the job; the other half is getting it paid
after the crews have left. A second guide,
[how to get your retainage released](https://marisstella.app/pay-app-guides/retainage-release.html),
lists what general contractors and owners usually ask for before they
release it (punch list sign-off, a final pay application at 100%, a final
conditional lien waiver, lower-tier waivers, consent of surety on bonded
jobs, warranties, O&M manuals and as-builts) and why each one holds up the
money. Its calculator takes the date the release clock started and the
number of days from your subcontract or statute, and writes a dated request
letter. Closeout items you have not ticked go into the letter as "still
open, delivered by [date]", so the GC's answer has to name what is actually
missing. On the page's example, $15,000 held, 60 days from 1 June, asked
for on 15 September, the release was due on 31 July and is 46 days late.
The page does not restate any state's release rule; it links the
[retainage caps table](https://marisstella.app/pay-app-guides/retainage-explained.html#state-table),
where each row links the statute. The letter is a starting point, not a
legal notice.

## The punch list in front of the release

The first item on that closeout list is usually the one that drags. Near
the end of a job the GC walks it and emails a list (a missing cover plate
in room 104, touch-up paint at a door frame, a panel to label), and the
sub's foreman fixes items over a week or two in whatever order the crew
gets to them. The GC has to come back and accept each one, and only
accepts what they know is done. Your retainage waits until they have.

On 2026-11-26 the pay-app suite we are building got a punch list for each
job. You paste the GC's list in, one item per line: the leading numbers
are dropped and the room or area before " - " or ": " becomes the
location. Nothing else is guessed. Each item then goes from open (or
overdue, once the due date you typed has passed) to fixed, then to
accepted. An item that is another trade's work, or was built as drawn, is
marked "not ours" with the reason and stays out of the count until it is
settled. One button writes the email that asks the GC's project manager
for a back-check of every fixed item and says how many are still open,
so the GC can walk them all in one visit. The list prints as a PDF to
carry on the walk (all items, or only what is left), with a column for
the GC's initials, and downloads as CSV. Once every item that is yours is
accepted, the job page says so, next to the reminder that many
subcontracts also want the closeout documents above before they release
retainage.

What it does not do: it does not decide that your subcontract's closeout
terms are met, and marking an item accepted in the app is your record,
not the GC's sign-off. The PDF says both. The rules (status, overdue days,
dates in order, the paste reader) are covered by unit tests, and every
route has a test that another company's job answers "not found".

Each document on the checklist now also keeps its files: the PDF as sent,
photos of attic stock delivered, and the GC's receipt when it comes back.
One close-out binder PDF puts a transmittal listing every document and its
dates in front of the required documents' files, with the GC's receipts
left out. What a subcontract usually asks for at close-out, and how to
deliver it as one package, is in
[close-out documents: what a subcontractor sends to get retainage released](2026-11-26-subcontractor-closeout-documents-and-retainage.md).

## The closeout documents beside it

The punch list is half of what the release waits on; the warranty letter,
the O&M manuals, the as-builts, attic stock with a signed receipt, the
final inspection and the final waiver are the other half, and they tend to
live in an email thread nobody can find in March. Later on 2026-11-26 the
same job page got a closeout checklist. One button adds that standard
list, with consent of surety added only when you tick that the job is
bonded; it skips any kind the job already has, so pressing it twice, or
after you typed your own "two-year warranty per Exhibit D", adds nothing
twice. Anything else the subcontract or the spec's closeout section asks
for is typed in, with where the requirement comes from. Each document
goes from "to send" (or overdue, once the due date you typed has passed)
to sent, then to accepted; one the job does not need is marked "not
required" with the reason, and stays on the list but out of the count.

The page then reads three things together: the checklist, the punch list,
and the retainage on the latest pay application you sent, including
whether that application bills the whole contract. It lists, in plain
words, what still stands between the job and its retainage: "the latest
pay application sent (#6) does not bill the whole contract yet", "2 punch
list items are not accepted yet (1 to fix, 1 awaiting the GC's
back-check)", "1 closeout document is still to send (1 overdue)". When
the list is empty it drafts the email to the GC's project manager: the
amount held on that application, the punch list accepted, each document
with the dates you entered, and the ones marked not required with their
reasons.

The email says what was delivered. It does not say the subcontract's
conditions are met, because the app only knows what you entered; your
subcontract may ask for more (a final application, lower-tier waivers),
and the job page says to check it. The status rules, the readiness list
and the email are covered by unit tests, and every route has a test that
another company's job answers "not found".

## Then every job at once

One job's retainage is easy to remember. Six jobs across three GCs, some
finished in June and some still framing, is where money gets lost, and
the A/R aging report is no help because none of it was invoiced. The
[retainage tracker](https://marisstella.app/pay-app-guides/retainage-tracker.html)
takes one row per job, pasted from a spreadsheet or opened as a CSV: the
retainage held and released to date, the completion date, the release days
from that subcontract, and the date the release was billed. It ages the
outstanding retainage from each job's own due date, not from the invoice
date, prices the wait at your own cost of money if you give one, totals it
by GC, and writes a chase list in the order worth calling.

On its example of six jobs, $200,250 of retainage is outstanding. $63,200
of it is overdue on two jobs, the worst 88 days past its release date,
costing about $1,070 at 8% a year. The most useful line is the one an
aging report cannot produce: two finished jobs holding $39,050 whose
release nobody has billed yet. One GC holds 60% of the total, which the
page flags as a cash-flow risk in itself.

The page only uses the release days you type. It does not decide whether a
closeout condition, a final waiver or a pay-when-paid clause has been met,
and it does not supply a statute's deadline; those are in the guides it
links. The arithmetic (outstanding, due dates, days overdue, simple-interest
carrying cost, bucket and GC totals) is checked against hand sums in its
tests.

This is the gap the pay-app suite we are building is meant to close:
retainage worked out per line on every pay application, a running balance
per job, a reminder when it is due for release, the punch list and closeout
documents that gate it, and a QuickBooks sync. It
is in development with early access at
[marisstella.app/industries/construction](https://marisstella.app/industries/construction/).
Nothing is for sale yet.
