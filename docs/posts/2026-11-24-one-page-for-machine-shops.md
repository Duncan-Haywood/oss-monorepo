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

## Update, 25 November 2026: revising a quote without losing the one you sent

A buyer rarely accepts the first quote as sent. They change a quantity break,
send a new drawing revision, or come back after the quote has expired. Many
small shops then edit the original in a spreadsheet or word processor, and the
price the customer actually saw is gone. When the PO arrives at the old price,
nobody can show what was quoted.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now handles this the way paper quoting systems always did:

- **A sent quote is never edited.** "Revise" opens Q-1001 Rev 2: the same
  quote number, with every line copied as sent. That includes the prices and
  the shop rates they were priced from. The estimator changes what the buyer
  asked for, and "Re-price" brings in today's rates only on request.
- **The original stays live until the revision goes out.** Sending Rev 2 marks
  Rev 1 "superseded" in the same database write. The exact PDF of Rev 1, with
  its SHA-256 fingerprint, is kept. The quote log counts the job once, so the
  win rate is not diluted by a revision.
- **The PDF says what it replaces.** The header reads "Quote Q-1001 Rev 2 ·
  Replaces Q-1001", and the file downloads as `Q-1001-R2.pdf`.
- **Won quotes are not revised.** A change after the PO is a new quote. A
  revision cannot go out once the quote it replaces has been marked won.
- **Expiry is automatic.** Each morning, sent quotes past their valid-until
  day are marked expired. A quote valid until the 25th is still good all of
  the 25th. An expired quote can still be revised when the buyer comes back.

This matters for more than tidiness. A quote is an offer, and a shop that
cannot show which revision a PO accepted is in a weak position if there is a
dispute. Keeping every sent revision unchanged, with a fingerprint, removes
that doubt. (This is a description of the software, not legal advice about
when an offer binds.)

## Update, 25 November 2026: your rate card from the spreadsheet you already have

A quote is only as good as the rates behind it (problem 2 above), and most
shops already keep those rates somewhere: a shop-rate sheet, a material price
list from the last supplier quote, a list of the anodizer's and heat treater's
charges. Typing that into new software one row at a time is the step where a
trial stalls.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now imports the rate card from that sheet. Choose the .xlsx or CSV, or paste
the rows from Excel or Google Sheets. The file is read in the browser and is
never uploaded. Only the rows you confirm are sent.

- **It reads the sheet as it is.** A title block above the table, extra
  columns such as "Notes", and headers like "Shop rate ($/hr)", "Setup
  (hrs)", "Price per lb", "Lot minimum", "In-house?" or "Lead time (weeks)"
  are all fine. Hours become minutes and weeks become days. A unit written in
  the cell ("1.5 hr", "2 weeks") wins over the column's.
- **It refuses to guess a price.** A scrap rate written as a bare `0.05`
  could mean 0.05% or 5%, so the import asks for the % sign. A column in $/kg
  or g/cm³, a material "Price" column that doesn't say per pound or per bar, a
  "Setup" column with no unit, and an amount like "call" are each named with
  their row and column. Nothing is saved until every row reads.
- **It updates rather than duplicates.** A name already on the card ("haas
  vf-2" matches "Haas VF-2") updates only the columns the sheet has, so a
  price-list refresh doesn't wipe the setup times entered by hand. New names
  are added, and the preview shows each row as new, "updates Hourly rate",
  "no change" or "un-retires".
- **Quotes already priced stay as priced.** Each quote line keeps the rates
  it was priced from until the estimator presses Re-price.

Building it turned up a real bug in the rate editor. Changing a machine's
hourly rate also reset its setup rate, setup minutes and roughing rate to
blank, and brought a retired machine back. A schema library fills in default
values even on a partial update, and that caused it. The bug is fixed and
pinned by a test.

**And back out again (later on 25 November).** The same panel now downloads
the card's current machines, materials or finishing services as a CSV, laid
out the way the import reads it, with "Pricing basis" and "Active" columns
and retired rates included. Hand it to whoever keeps the supplier prices,
change what moved, and import it back: the preview shows only the rows you
edited as "updates", and every other row as "no change". A blank cell leaves
that value as it is, so a cleared cell does not wipe a setup rate (clear it
in the editor instead). A rate named so that it starts with `=`, `+`, `-` or
`@` is written with a leading apostrophe, so Excel shows it as text instead
of running it as a formula, and the import removes the apostrophe again.

## Update, 25 November 2026: what one RFQ is, counted from the drawings

The proposed pricing for the RFQ-to-quote app says a plan includes a number of
RFQs a month: "one customer request, with any number of parts, up to 10
drawing pages. Bigger packages count once per 10 pages." Until today the app
counted every RFQ once, whatever its size. It now counts the way the pricing
says. Paid plans are still not on sale.

- **Pages come from the file, not a guess.** When a PDF is uploaded, the app
  reads the page count the file itself records. For newer PDFs that count sits
  in a compressed part of the file, and the app reads it there too. On 20 test
  files from Chromium, LibreOffice and poppler, plus encrypted ones, it matched
  poppler's `pdfinfo` every time. A photo of a drawing counts as one page. The
  email text and CAD models count nothing on their own.
- **An unreadable file counts as one page.** If the app cannot read a PDF's
  page count without guessing, for example because the file is broken, it
  counts one page. A reading error can make an RFQ count less, never more.
- **You see the count before you press the button.** The RFQ page shows each
  PDF's page count and what the next AI read will count: "23 drawing pages:
  the AI's first read counts as 3 RFQs of this month's allowance."
- **A revised drawing set counts only what it adds.** A 7-page RFQ that gains
  3 pages is still one RFQ. If it grows to 22 pages, the next read counts 2
  more, in the month it is read. Reading the same package again is free.
- **A package too big for what is left is refused, not cut short.** The
  message says how many RFQs it needs and how many are left, and a smaller RFQ
  can still be read. Entering parts by hand and quoting them is never blocked.

The reason for the rule is cost. The pricing model assumes about 3 drawing
pages per RFQ, and the AI's cost grows with the pages it reads. Counting per 10
pages lets a shop that sends 50-page packages pay for them, and a shop that
sends 2-page RFQs is not charged for them.

## Update, 25 November 2026: emailing the quote from the app

Until now the app produced the quote PDF, and the estimator downloaded it,
opened their mail program, attached it and wrote a note. That is a few
minutes per quote, and it leaves a gap: the app cannot tell which version
reached the buyer, or whether anything was sent at all.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now sends the quote itself, from the sent quote's page:

- **The attachment is the exact PDF that was marked sent.** Before attaching
  it, the app checks the stored file against the SHA-256 fingerprint
  recorded when the quote was frozen. If the two disagree, the email is
  refused. Nothing is re-rendered at send time, so the buyer gets the same
  document the shop's records hold.
- **Replies go to the estimator, not to a no-reply box.** The message comes
  from "Your Shop via Job Shop Quote" with the estimator's own address as
  Reply-To. The app requires that address to be confirmed first, so a
  buyer's answer always reaches someone at the shop.
- **The message is the estimator's.** It starts as the quote's cover note
  (an AI draft whose every number was checked against the priced quote, or
  the estimator's own text), and it is sent exactly as written, as plain
  text. A short footer names the attached file, the revision it replaces
  and the valid-until date.
- **Every send is on the quote.** Who sent it, to whom, when, and whether it
  went or failed. A failed send says that nothing reached the customer.
- **Limits against misuse.** Up to five recipients a message, five emails a
  quote a day and thirty a shop an hour. Only estimators can send, and
  only open quotes (not drafts, and not quotes already won, lost or
  replaced).

Mail goes out through Cloudflare Email Service once the app is deployed.
Until then, the page says plainly that nothing leaves the server, and the
PDF download still works.

## Update, 25 November 2026: which quotes you win, and at what price

Most shops already keep a won/lost column somewhere. What it rarely tells
them is *why* the rate is what it is: which customers send RFQs they never
award, which materials or machines they price out of, and whether the jobs
they lose were quoted at a higher markup than the jobs they win.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now has a **Win/loss** page, built only from the shop's own decided quotes:

- **Win rate by customer, material, machine and markup band**, over the last
  90 days, 12 months or all time. Win rate is won ÷ (won + lost); quotes
  that expired with no answer are shown but not counted, and customer-supplied
  material gets its own row.
- **Markup on won quotes next to markup on lost quotes.** Markup is read from
  the price the shop actually sent (markup plus any minimum-charge top-up,
  over cost, at the smallest quantity), never recomputed. If lost quotes
  average 38% and won quotes 22%, that is worth knowing before the next one.
- **"What price did we win at."** For every part that has been won or lost,
  the quotes it appeared on, newest first, with every quantity break's unit
  price and a link back to the quote. A repeat RFQ can be priced against
  what the same buyer accepted, and refused, last time.
- **Lost reasons tallied**, from the reason typed when a quote is marked lost.
- **Small samples are labelled.** Any row with fewer than five decided quotes
  says "few": two wins out of two is not a 100% win rate.

Nothing on the page is a forecast or a benchmark against other shops. It is
a count of the shop's own log, visible to its own members, and never shown
on a quote PDF or email.

## Update, 25 November 2026: routings you set up once per part family

Most of a job shop's quotes are variations on parts it has made before:
another bracket in 6061, another turned shaft, another plate that goes out
for anodizing. Each part number differs, but the routing behind it is
usually one the shop already knows. Two or three machine operations with
familiar setup times, then the same outside finish. Typing those operations
again for every line is slow, and a skipped deburr or a missing anodize lot
charge turns into a quote that loses money.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now keeps routing templates:

- **Save a line's operations as a routing.** That covers each machine, the
  op label, setup minutes, cycle minutes per part and the finishing steps,
  under a name like "6061 bracket, 2 ops", with an optional part family
  ("Brackets").
- **Apply it to the next part of the family.** *Use routing* replaces the
  line's operations and finishing. *Add after* appends them to what is
  already there, for a part with an extra step. The line's material, blank
  size, extras and quantity breaks stay as they were.
- **A routing holds minutes, not money.** The line is priced from today's
  rate card the moment the routing is applied, as with any edit. A machine
  retired since the routing was saved is flagged; an old rate is never
  carried over. That matters because shop rates change, and a template that
  froze last year's rate would underquote without anyone noticing.
- **Each shop's routings stay in that shop.** A routing can only name
  machines and finishing steps on that shop's own rate card. Viewers can
  see the routings; only estimators can save or delete them.

This is the first part of a larger item. Next comes editing a routing in
place, then offering a part's quote history on the RFQ screen before a
quote exists.

## Update, 25 November 2026: what changed between quote revisions

A buyer comes back with "can you do 100 instead of 50?" or "what if we drop
the anodize?", and the shop sends Rev 2. Until now the estimator had to open
both quotes side by side and compare them by eye before sending. A missed
change is a price nobody meant to quote.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now opens every revision with **"What changed from Q-1001"**:

- **Unit price at every quantity break, side by side.** Breaks that are new,
  dropped or repriced are marked, with the difference in dollars and percent.
  The first-break total is shown before and after.
- **Why the price moved.** Under each line it lists the operations that
  changed (by machine and operation label, with setup and cycle minutes), and
  any change to the material, blank size, part revision, finishing or extras
  such as material certs and crating. Lines added or dropped and changes to
  lead time or terms are listed too.
- **Stored prices, never recalculated.** Each side shows the price that
  revision actually stored, produced by the shop's own rate card at the time.
  A line that no longer prices says "not priced", never $0.

Building it turned up a real bug. Editing only a line's cost inputs through
the API cleared that line's part revision and description. The app's own
editor always sends every field, so users were not affected, but anything
calling the API directly was. It is fixed, and a test now covers it.

## Update, 25 November 2026: RFQs sent straight to the shop's inbox

Most RFQs arrive as email: a buyer's note, a PDF drawing or three, sometimes
a STEP model. Until now the estimator copied the text into the quoting app
and uploaded each attachment by hand. The RFQ-to-quote app (bet #2, still in
private development, not yet on sale) now gives each shop its own address.
Forward an RFQ to it, or give it to customers, and the message lands in the
shop's RFQ inbox with its drawings attached.

- **What comes across.** The subject, who sent it, the text of the email
  (an HTML-only email is turned into plain text), and the attachments the
  app can use: PDF drawings, text, images and CAD files (STEP, IGES, STL,
  DXF), up to ten files of 15 MB each. A forwarded message attached whole
  is opened too, so the customer's original note and drawings come along.
- **What doesn't, and says so.** A Word file, an oversized drawing or an
  Outlook `winmail.dat` is not stored, and the RFQ lists each one with the
  reason, so the estimator knows to ask for it again. Small logos in email
  signatures are dropped.
- **Nothing is read by AI until a person asks.** An emailed RFQ waits in the
  inbox until an estimator presses "Extract with AI", the same as a pasted
  one. Someone who finds the address can't use up the shop's monthly RFQ
  allowance, and a spoofed email is only an inbox item a person looks at.
- **One email, one RFQ.** If the mail system delivers the same message
  twice, the shop still gets one RFQ.
- **The address can be replaced.** An admin can replace the address at any
  time, and mail to the old one is then refused. They can also turn it off.
  Each shop accepts up to 50 emailed RFQs a day, so a flood of junk can't
  bury the real ones.

The address only starts working once the app is deployed and the receiving
domain is routed to it. Until then the RFQs page doesn't show the option at
all.

## Update, 25 November 2026: change a routing without starting over

Routing templates were save-and-apply only: to change a cycle time or add a
deburr step, an estimator deleted the routing and saved it again from a quote
line. The RFQ-to-quote app (bet #2, still in private development, not yet on
sale) now has a **Routings** page where a routing is edited in place.

- **Everything on one screen.** Rename it, retag its part family, change any
  operation's machine, label, setup or cycle minutes, add, remove or reorder
  operations, and tick its finishing steps.
- **Or update it from a quote.** When a line's operations have drifted from
  the routing it started from, *Update routing from this line* writes the
  line back into the routing. The button only appears when the two differ.
- **Old quotes don't move.** A quote that already used the routing keeps its
  own copy of the operations. An edit changes only the next line the routing
  is applied to, and that line is still priced from today's rate card.
- **Retired machines stay visible.** If a routing names a machine the shop
  has since retired or deleted, the editor shows it and flags it rather than
  quietly swapping in another machine. A deleted one must be replaced before
  the edit can be saved.
- **Two estimators can't overwrite each other.** If someone else saved the
  routing after you opened it, your save is refused with a message to reload,
  instead of silently undoing their change.
