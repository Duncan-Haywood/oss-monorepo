---
title: "One page for machine shops: quoting, CMMC and the free tools already here"
seo_title: "Software for CNC job shops: quoting, CMMC, ISO 9001"
date: 2026-11-24
tags: [manufacturing, machine-shops, cmmc, quoting, iso-9001, for-customers]
description: "Quoting software (Job Shop Quote) and a CMMC workspace, both free to start, and free tools for CNC shops, mapped to four shop problems."
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

## Update, 25 November: every free page answers its question first

The free machine-shop pages
([machine-shop-guides](https://marisstella.app/machine-shop-guides/))
are the front door to both products above, and none of their 15 pages had a
"Common questions" section. A shop owner who types "what is the minimum SPRS
score for CMMC" or "when is a first article inspection required" was landing
on a calculator that answered it somewhere halfway down, if at all.

Each page now ends with three plain answers to the questions it is actually
about (four on the index), with matching `FAQPage` structured data so search
and AI answers can quote them. Every answer restates what the page already
says and sources: the 88-of-110 Conditional floor and the six requirements
that can never sit on a POA&M (32 CFR 170.21), the 72-hour DIBNet clock and
the 90 days of images that start at the report, not at discovery (DFARS
252.204-7012), why a 5-off costs more per part than a 100-off, and why the
quote-vs-actual factor is a median. Nothing new was claimed to fill a slot.

The questions live in one file, `faq.mjs`, which writes both the visible
section and the JSON-LD; the venture's tests fail if a page has no FAQ or
the two copies differ.

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
- **A heads-up the day before** (added later on 25 November). Each morning,
  every estimator gets one email listing their own sent quotes that expire
  today or tomorrow: the customer and contact, the total and a link to each.
  That leaves a day to call the buyer or send a revision with a new date,
  instead of finding out after the quote has lapsed. The email goes only to
  the person who wrote the quote, never twice for the same quote, and each
  estimator can turn it off under the quote log.

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

**Later the same day: the shop's signature and a copy for the estimator.**
Two things an estimator used to get from their own mail program:

- **A signature block.** An admin types the shop's signature once on the
  rate card page (name, address, phone, certifications such as AS9100), and
  it goes under the estimator's message on every quote email. The send form
  shows it as it will appear.
- **"Send me a copy."** On by default. After the customer's email goes
  through, the estimator gets the same message and PDF at their own address,
  headed with who the original went to, so the quote sits in their own
  mailbox next to the buyer's reply. It is a separate message, not a Cc: the
  buyer sees no extra address, and if the copy fails the quote has still
  been sent, and the history on the quote says so.

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

Later the same day the page gained three things shop owners ask for next:

- **Win rate month by month.** One bar per calendar month of the decision
  date, oldest first, with months that had no decisions shown as empty rather
  than skipped, so a quiet August reads as a gap and not as a missing row.
- **By estimator.** Each quote counts under the person who wrote it (the same
  person who gets the day-before expiry reminder). Useful for spotting who
  quotes the jobs that come back, not for ranking people on five quotes:
  small rows still say "few".
- **Download CSV.** One row per decided quote in the chosen period: quote
  number, customer, estimator, won/lost/expired, date, quoted total, awarded
  amount, markup on cost, lost reason and part numbers. It opens in Excel or
  Google Sheets as numbers, ready for a pivot table, and a customer name that
  starts with "=" is written as text so the sheet never runs it as a formula.

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

**Later the same day: an email when one arrives.** An RFQ sitting unseen in
the inbox is a quote that goes out late. Each person in the shop can now tick
"Email me when an RFQ arrives" on the RFQs page, for themselves only. When a
new RFQ comes in, each of them gets a short notice: the subject, who the email
says it is from, how many drawings were stored, and a link straight to it.

- **A notice, not a copy.** The notice never carries the email's text or its
  attachments, so the shop's address can't be used to pass a stranger's
  message on under the app's name. The subject and sender came from outside,
  so web addresses in them are broken up (`example[.]com`) and can't be
  clicked. The only link in the notice goes to the RFQ in the app.
- **Only the people who asked.** It is off until each person turns it on,
  someone who has left the shop is never emailed, and a message the mail
  system delivers twice sends one notice, not two.
- **It never costs you the RFQ.** If the notice can't be sent, the RFQ is
  still in the inbox.

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

## Update, 25 November 2026: the customer sees what changed, and nothing more

The "what changed" view above was for the estimator. Buyers ask the same
question when Rev 2 lands in their inbox: what is different from the quote I
already have? The RFQ-to-quote app (bet #2, still in private development,
not yet on sale) can now answer it on the PDF itself.

- **One checkbox per revision.** Ticking "Print 'Changes from Q-1001' on the
  customer PDF" adds a short section to the quote, such as
  "BRK-1001 Rev B, qty 50: $19.00 to $17.50 each", "qty 100: added at $15.00
  each" or "Lead time: 3 weeks ARO to 2 weeks ARO". It is off by default, and
  the estimator sees the exact lines before sending.
- **Customer-safe by construction.** The section is built only from what the
  PDF already prints: part numbers and revisions, descriptions, quantity
  breaks with unit prices, and lead time. Machines, setup and cycle minutes,
  material and blank sizes, finishing and extras are the shop's cost basis
  and never reach it. A change to those alone prints nothing; the new price
  speaks for itself. A test checks that none of them appear in the PDF.
- **Frozen with the quote.** The sent PDF, section included, is the one
  stored with its checksum, so the customer and the shop keep the same
  document.
- **Compare with any revision.** Once a quote has reached Rev 3, a picker on
  the quote page compares it with Rev 1 or any other earlier revision, not
  only the last one.

- **The same lines in the email** (added later on 25 November). When Rev 2
  goes out by email from the app, the message repeats the PDF's "Changes from
  Q-1001" lines under the estimator's note, so the buyer sees what moved
  before opening the attachment. They are the same lines, taken from the
  same two frozen revisions. A revision sent without the checkbox gets none.
  The send form shows them first, and a long list stops at 20 lines and
  points to the PDF for the rest.

The day-before expiry email mentioned earlier was added the same day.

## Update, 25 November 2026: what we promise about your drawings

A shop's RFQs carry its customers' drawings, and often their prices too. Before
the RFQ-to-quote app (bet #2, still in private development, not yet on sale)
lets strangers sign up, it now has written terms, a privacy policy, a refund
policy and an acceptable use policy. Each new user reads and accepts them once,
before they set up a shop. They are drafts until a lawyer has reviewed them,
and each page says so. Here is what they commit to, in plain terms:

- **Your rates set the price.** Every price comes from the shop's own rate card
  and the estimator's inputs. The AI's reading of an RFQ is a suggestion, and a
  part goes onto a quote only after someone in the shop confirms it.
- **The AI sees only what a step needs.** To read an RFQ, the AI model gets the
  RFQ's text and the text read from its drawings, and only when an estimator
  presses the button. To draft a cover note it gets what the customer will see
  on the quote: never the shop's rates, costs or markups. The policy names
  every company that handles the data (hosting, the AI model, the payment
  processor), and the shop's data is not used to train AI models.
- **No export-controlled data.** The app is not built for ITAR, EAR or CUI
  technical data, and the terms ask shops not to upload it. Defense work
  belongs in a system built for it.
- **Thirty days to change your mind.** A paid plan can be refunded in full
  within 30 days of the first payment, and the free plan needs no card.

The documents are public, so a shop owner can read them before creating an
account.

## Update, 25 November 2026: a heads-up before the month's RFQs run out

Each plan of the RFQ-to-quote app (bet #2, still in private development, not
yet on sale) includes a number of RFQs a month for the AI to read. Until now a
shop found out it had used them only when the next read was refused. Now the
shop's owners and admins get an email when the month's count reaches 80% of
the plan's allowance (32 of the free plan's 40), and one more when it reaches
100%:

- **Once each, per month.** However many estimators read RFQs at the same
  moment, each email goes out once.
- **Only the people who can change the plan.** Owners and admins, not every
  estimator.
- **What still works.** Past the allowance, every RFQ, quote and PDF stays,
  and parts can still be entered by hand, priced and sent; only the AI's read
  of a new RFQ waits until the first of next month.
- **No sales pitch while there is nothing to buy.** The email names the next
  plan's allowance and price only once paid plans are on sale; until then it
  says they are not on sale yet.

## Update, 25 November 2026: repeat parts start from the quote you won

Most of a job shop's RFQs are parts it has made before. The estimator still
retypes the material, setups, cycle times and finishing from an old quote or
a spreadsheet, and hopes the rates have not moved since.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now uses the shop's own quote log for this:

- **On the RFQ, before there is a quote.** Each part shows "Quoted before:
  3 earlier quotes, 1 won", with the quote number, customer, date, PO or lost
  reason, the unit price at each quantity, and a flag when the revision
  differs from the one on this RFQ.
- **Pre-fill repeat parts (a shop setting, off unless an admin turns it on).**
  A new quote's line for a part the shop has won before, with the same part
  number and revision, starts from the last won quote's material,
  operations and finishing. It keeps this RFQ's quantities.
- **Today's rates, never the old price.** The pre-filled line is priced from
  the rate card as it is now, so a raised machine rate or a new material
  price shows up in the quote. The old unit prices are shown to the estimator
  for reference only.
- **It says where it came from.** The line reads "Pre-filled from Q-1001 for
  <customer>, won <date>", with a link, so the estimator checks it before
  sending. A part whose revision changed, or that had none last time and has
  one now, is not pre-filled: a new revision can mean a changed drawing.

Everything stays inside the shop's own account: no other shop's quotes are
read, and nothing here estimates a price the shop has not set.

Later the same day, pre-fill reached lines added by hand. Plenty of repeat work
arrives as a phone call or a two-line email, not an RFQ. When the estimator
clicks *Add line* and types a part number the shop has won before, the line
now fills in the same way: the last won quote's material, operations and
finishing, this line's quantities, today's rates, and the same "Pre-filled
from" note. It fills only a line that is still empty, and only once, so it
never writes over anything the estimator has typed. A line cleared on purpose
stays empty.

## Update, 25 November 2026: quoting from a phone on the shop floor

Estimators in small shops are often the owner or the lead machinist, and the
RFQ gets read on a phone between setups. The quote page of the RFQ-to-quote
app (bet #2, still in private development, not yet on sale) was 509 pixels
wide on a 390-pixel phone once a line had prices, so the whole page slid
sideways under a thumb. Now:

- **Nothing on the page slides sideways.** The price breakdown (quantity,
  material, setup, run, finishing, extras, markup, unit price, total) scrolls
  inside its own box, with the quantity column pinned so each row still
  reads as "100 pieces: ...", and a hint to swipe for unit price and total.
- **Operations fit a thumb.** Each machine operation (machine, op name, setup
  minutes, cycle minutes per piece) stacks two fields to a row with a
  labelled Remove button, instead of five fields squeezed into one line.
- **The RFQ and team pages too.** Every signed-in page was checked at 390
  pixels wide; the RFQ page (460) and the team page (406) also overflowed and
  now fit.

The cause was a browser default: a form section (`<fieldset>`) never gets
narrower than its widest content, so one nine-column table stretched the
whole page. A check that signs up, builds a priced quote and measures all
eleven pages at phone width now runs against the offline demo, so the next
change that breaks this is caught before it ships.

## Update, 25 November 2026: which routing fits this part, from your own history

Routing templates save an estimator from re-entering setups and cycle
times, but only once they find the right one. A shop with forty routings
("6061 bracket", "turned shaft", "weldment prep") still has to remember which
fits a new part.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now suggests up to three routings above each quote line's picker:

- **From what the shop has done, not a guess.** A routing is suggested when
  earlier lines in the same shop used its operations, counting more when they
  were in the same material and more again when the quote was won. It also
  counts words from the line's description that appear in the routing's
  name or part family, or in the descriptions of the parts it was used on. A
  routing with none of this behind it is not suggested.
- **It shows its reasons.** Each suggestion reads like "Used on 3 earlier
  lines in Aluminum 6061-T6 plate (2 won); its name matches "bracket"", so the
  estimator can see why it came up and ignore it when it doesn't fit.
- **Small edits still count.** A line that used a routing and then had a
  cycle time tuned, or had the routing added after other operations, still
  counts as using it: the match is on machines and operation labels, in
  order.
- **The estimator still decides.** Clicking a suggestion selects it in the
  picker. Nothing changes until *Use routing* is pressed, and the line is
  then priced from today's rate card like any other edit.

As before, only the shop's own routings and quotes are read.

## Update, 25 November 2026: the page now shows the tools working

Until today the [manufacturing page](https://marisstella.app/industries/manufacturing/)
was all text: 4,585 px of headings and lists on a phone, with no picture of
anything a shop could use. It now shows two of the free tools with their own
worked examples loaded, captured from the real pages rather than drawn for
the occasion:

- **Under the opening paragraph**, a sheet from the free
  [DXF nesting](https://marisstella.app/dxf-nesting/) tool: 72 parts (base
  plates, gussets, flanges, washers, brackets) on one 2500 × 1250 mm sheet,
  small parts placed in the gaps, every pair checked at least 5 mm apart.
- **In the job-shop quoting card**, the free
  [CNC machining quote calculator](https://marisstella.app/cnc-machining-quote-calculator/)
  on a 25-part lot: cost per part, break-even, price at the target margin,
  and the checks it raises before the quote goes out (here, that setup is
  40% of each part's cost at this lot size).

Each picture links to its tool. The page grew to 5,181 px on a phone and
still scrolls only up and down. The quoting product itself is still in
development; the still in its card is the free calculator, and the caption
says so.

## Update, 26 November 2026: quotes in your own currency

Until today the RFQ-to-quote app (bet #2, still in private development, not
yet on sale) printed every price with a US dollar sign. A shop in Ontario,
Birmingham or Stuttgart could not send its customers a quote at all. Now:

- **One currency per shop, picked on the rate card.** The list is US, Canadian,
  Australian and New Zealand dollars, the Mexican peso, the pound, the euro,
  the Swiss franc, the Swedish, Norwegian and Danish kroner and the Polish
  zloty. Each of them has two decimal places, which is how the app stores
  amounts.
- **Every amount follows it.** That covers the rate card's labels ("€/hour",
  "CA$/lb"), the price breakdown on each quote line, the quote PDF, the cover
  note facts, the "what changed" lines on a revision and the quote-expiry
  email. A shop that picks a currency gets "Prices in EUR" (or CAD, GBP...) on
  every quote, so the customer never has to guess which dollar is meant.
- **It labels amounts; it does not convert them.** Switching from USD to CAD
  turns $95.00 an hour into CA$95.00 an hour. No exchange rate is applied.
  A PDF that was already sent stays exactly as it was sent.
- **The cover-note check covers every currency.** The AI-written note that
  goes with a quote may not state a price. It used to catch only "$", and
  now it refuses "€45", "45 EUR", "CHF 450" and "450 kronor" as well, so a
  price can only reach the customer through the PDF.

A shop that never picks a currency sees no change. Its quotes print in US
dollars as before, with no currency line. Next, the rate-card spreadsheet
import will read "€85.00" and "CA$85" cells. Today it accepts "$" and "USD"
only.

## Update, 26 November 2026: the ISO 9001 checklist is checked against the standard's contents

The CMMC workspace has an ISO 9001 tab: one row per requirement clause, using
the same evidence files as your CMMC requirements, so a training record
attached once shows up under both. Until today the tab carried a warning:
the clause list had not been checked against a copy of the standard. The
session that wrote it could not reach iso.org.

Now it has been checked. We compared every row with the contents page of
ISO 9001:2015, fifth edition (2015-09-15), as printed in the publisher's
licensed preview.

- **All 47 clause numbers are real.** Every row is a clause the contents
  page lists, in the same order.
- **42 headings match word for word.** The other five are the subclauses
  the standard calls only "General" (7.1.1, 7.5.1, 8.4.1, 9.1.1 and 10.1).
  The tab shows them as "Resources: general" and so on, so a row still
  makes sense when you filter or export.
- **Some subclauses share one row.** 5.1.1 and 5.1.2, the 8.3 design
  subclauses and the three parts of management review (9.3.1 to 9.3.3)
  each sit in their parent's row, because a small shop keeps one set of
  records for them. A build-to-print shop usually excludes 8.3, with a
  reason, and the tab asks for that reason.
- **A test keeps it that way.** The headings now sit in a test. If anyone
  renames, renumbers or reorders a row so it no longer matches the
  contents page, the build fails.

What it still is not: the requirement text is ISO's copyright, so it is
not in the app. Keep your own copy of the standard. The notes on what to
gather for each clause are our wording, not ISO's. The tab is for your own
check before a registrar's audit. Only an accredited certification body
certifies. AS9100D's aerospace additions come next, once we have a source
we can cite.

## Update, 26 November 2026: the customer accepts the quote with one click

The quote goes out, and then the shop waits. The buyer replies "we'll take
50, PO to follow". Days later a PO arrives, and an estimator types it into
the quote log by hand. If nobody types it in, the win/loss report never
learns about the win. Quoting portals in this market let the buyer accept
online for that reason.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now does the same:

- **A link in the quote email.** A box on the email form, on by default, adds
  "Accept or decline this quote online" with a link under the message. An
  estimator who sends from their own mail program can copy a link from the
  quote page instead.
- **No account for the buyer.** The link opens the quote as it was sent:
  the parts, the quoted quantities and prices, the lead time, the notes and
  terms, and the exact PDF, checked against the fingerprint recorded when
  the quote was frozen. It never shows the shop's rates, costs or markups.
- **Pick a quoted quantity, add a PO, accept.** For each part the buyer picks
  one of the quoted quantity breaks, or "not ordering this part". They can
  only pick a quantity the shop quoted. Any other quantity is a new quote,
  and the page says to reply for one. Accepting marks the quote won at the
  total of the breaks chosen, with the PO number.
- **Or decline, with a reason.** The quote is marked lost with "Declined
  online" and the buyer's reason, so the win/loss report shows lead time or
  price losses in the buyer's own words.
- **The estimator hears at once.** Whoever made or emailed the quote gets an
  email with the parts, quantities, total and PO. The quote page shows the
  answer, plus when each link was last opened.
- **One answer, then the link is done.** A quote takes one answer only.
  After its valid-until date, or once a newer revision replaces it, the
  link shows that and takes no answer. The shop can turn a quote's links
  off at any time, and they stop working immediately.

What it does not do: it is not a signed contract. The page tells the buyer
the shop will confirm the order, and it tells the shop to check the PO
before starting work, because anyone holding the link could have typed it.
The link only records what the buyer said. Next, if shops ask: a signature
line on acceptance, and a reminder for a buyer who opened the quote but has
not answered.

## Update, 26 November 2026: from the won quote to a traveler for the floor

When a quote is won, the job goes to the floor. Someone retypes the part,
the quantity, the material and the operation list onto a traveler (the
router sheet that goes with the parts from machine to machine), often from
the same estimate that priced the job. Shop ERPs print one from a work
order. The quoting app stopped at "won", so that retyping was still a hand
step.

The RFQ-to-quote app (bet #2, still in private development, not yet on sale)
now prints the traveler from the won quote:

- **One sheet per part.** Customer, quote number, PO and due date. The
  quantity ordered, and the parts to start once the line's expected fallout
  is added, using the same rule the price used. At 4% fallout, 50 good parts
  means 53 started.
- **Material and stock.** The material, the stock description from the rate
  card, the blank size, and how many bars or sheets to pull when the estimate
  says how many parts come from one piece. There is also a box for the heat or
  lot number.
- **Operations in order.** Numbered 10, 20, 30 in the estimate's order, each
  with its work center, setup, cycle time per part and run time for the parts
  started. Finishing comes next, with outside services marked, then final
  inspection. Each step has a sign-off line.
- **No prices.** Rates, costs and markup never appear on the floor's copy.
- **The quantity the customer chose.** If the buyer accepted online, each part
  prints at the quantity break they picked, and a part they did not order is
  left off. The estimator can type another quantity from the PO. A part quoted
  at several quantities, with no online acceptance, waits for the PO quantity
  rather than having one guessed.

What it does not do: the times are the estimate's, not a time standard, and
the sheet says so. A cycle time the estimate never had prints as "not set",
with no total. A machine or finish since removed from the rate card is
printed as removed, not silently dropped. Next, if shops ask: a saved job
with its own number and status, and a barcode on each operation so time on
the floor can be checked against the quote.

## Update, 27 November 2026: the quote as a free Excel template

A lot of shops quote in a spreadsheet, and many search for one before they
search for software. So the [machining quote
template](https://marisstella.app/machine-shop-guides/machining-quote-template.html)
is now a free `.xlsx` with two sheets. The quote worksheet holds your setup,
programming and machine rates, markup, scrap allowance, the part, optional
calibration factors, up to six other operations and six quantity breaks. The
customer quote sheet holds what the buyer sees: price each, extended price,
part number and revision, validity date, lead time and terms. None of the
cost lines go on it.

Its formulas match the browser
[quote calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html)
exactly. The test fills both with the same invented numbers, recalculates the
workbook in LibreOffice and compares every line at every break with the
calculator's code. The price each on the quote is rounded up to the cent the
same way, so the template and the calculator never quote different prices
for the same inputs. The file ships with no rates, prices or markup: only the
quantity breaks (1, 5, 10, 25, 50, 100) are filled in. A "before you send
it" row lists what a buyer would send back, such as a missing revision,
validity or lead time, or a larger lot that costs less in total than the
smaller one before it.

The template is built by code with no spreadsheet library
(`ventures/machine-shop-guides/quote-template.mjs`), and
`node quote-template.mjs --check` fails if the committed file is stale. A
spreadsheet is fine for a few quotes a week. It gets slow when you have to
look up the last revision you quoted, follow up on open quotes, or turn an
emailed drawing into the inputs. That is the work the RFQ-to-quote product in
development is for.

## Update, 27 November 2026: a rate for each machine, not one for the shop

Every quote tool here asks for a machine rate and none of them worked one
out. The new [machine hour rate
calculator](https://marisstella.app/machine-shop-guides/machine-hour-rate.html)
does, per machine, from the shop's own numbers: ownership (a yearly lease,
or straight-line depreciation plus the cost of money on the average
investment), floor space at the building's cost per square foot,
maintenance, and the shop's overhead shared by billable hours, all divided
by scheduled hours times utilization; then power (kW times average load
times price), tooling per spindle hour and, for an attended hour, the
operator's loaded wage divided by the machines one person runs and by
utilization.

A hand-checked case from its tests: a machine bought for $100,000, sold
for $20,000 after 8 years, money at 6%, 150 sq ft at $12, $4,000 of
maintenance and 2,000 billable hours out of 4,000 carries $19,400 a year,
$9.70 an hour. Add $1.50 of power and $5 of tooling and the machine hour is
$16.20; an operator at $40 an hour running two of them at 50% utilization
adds $40 more. At 60% utilization the same machine and operator cost
$47.92; at 40%, $68.63. That spread, from one number most shops guess, is
why the page shows each machine's rate at 10 points either side.

Two things it will not do: ship a figure of its own (every field starts
empty, and the example is labelled invented) or say what the market pays
for an hour. The rate links straight into the [job-shop quote
calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html)
(`?machineRate=`), and the paid quoting app keeps the same rate per
machine on its rate card.

## Update, 27 November 2026: the quote calculator answers before you press anything

The free [CNC machining quote calculator](https://marisstella.app/cnc-machining-quote-calculator/)
opens with a real job already filled in (a turned part from 12 ft bar, 50 off, quoted at $38 each),
but until today it showed nothing until you pressed "Cost this job", and on a phone that
button sits about 3,700 pixels below the headline. Now the page works the job out as it
loads and again as you change any field, and a strip pinned to the bottom of the screen
while you scroll the form shows the three numbers a quote turns on: cost per part ($16.17
for the example), the price at your target margin ($24.88) and the margin at the price you
were about to quote (57.4%). The full breakdown and the lot-size curve are still below the
form. Working it out as you type is not counted as a use; only the button is.

The same day the [laser cutting and engraving
price calculator](https://marisstella.app/laser-cutting-engraving-job-price-calculator/) and
the [powder coating job price
calculator](https://marisstella.app/powder-coating-job-price-calculator/) got the same
treatment. Both open with a made-up job filled in and used to hide the answer behind
"Price this job". Now the laser page shows, as it loads, $4.35 a piece and $261.09 for 60
birch-ply coasters, earning $278.01 per laser hour; the powder coating page shows $17.62 a
piece, $5.04 per square foot and $705.00 for 40 parts. Change the order to 200 and the strip
moves to $3.89 and $16.76 a piece. A half-typed materials line shows what is wrong in the
strip instead of an old price.

## Update, 27 November 2026: one fallout figure for the whole shop

To ship 100 good parts when about 3% of a run usually ends up as scrap, a
shop starts 104. Every scrapped part has already used its cycle time, its
material and its per-part finishing, so those costs go on the 104 parts
started, not the 100 shipped. The free [pricing
guide](https://marisstella.app/machine-shop-guides/how-to-price-a-machined-part.html)
gives the rule: start q / (1 − fallout), rounded up. The RFQ-to-quote app
(bet #2, not yet on sale) has priced a fallout figure typed on each quote
line since 26 November. The estimator still had to type it on every line,
though, and a line left blank was priced as if no part would ever be
scrapped.

The shop settings now have a **Default fallout %**. Every new quote line
starts with it, whether it comes from an RFQ or is added by hand, and the
estimator can change it on any line (0 means none). A line copied from a won
quote for the same part keeps that quote's figure, because the part's own
history beats a shop average. The settings spreadsheet carries the figure
too: a row labelled "Default fallout", "Fallout %" or "Reject rate" imports
it. A row labelled "Yield" is refused with a note ("a 97% yield is 3%
fallout"): a yield is the share of good parts, the opposite of a fallout,
so the sheet has to say which one it means. "Scrap" on its own is refused as well, because in a
shop it can mean scrapped parts or the saw kerf and facing on every blank,
and those are entered in different places.

What it does not do: it does not learn the figure from the shop's own jobs.
The figure is whatever the shop types, and the free guide says to take it
from your history on similar parts, not from a rule of thumb.

## Update, 27 November 2026: Job Shop Quote is open, free to start

Every update above calls the RFQ-to-quote app "not yet on sale". It now has
a name and an address: **Job Shop Quote**, at
[jobshop-quote.marisstella.app](https://jobshop-quote.marisstella.app/sign-up?from=docs/posts/machine-shops).
A shop can sign up today on the free **Early access** plan: 40 RFQs a month
and 3 users, no card. That is enough to put a month of real RFQs through it:
the rate card from your spreadsheet, routings per part family, quote PDFs and
revisions, the quote email and the customer's one-click acceptance, the
traveler, and the won/lost report. The
[manufacturing page](https://marisstella.app/industries/manufacturing/) now
links there instead of to the early-access form.

What is not switched on yet, so you know before you sign up:

- **"Extract with AI" is off.** You enter the part details on the quote
  form yourself, with the drawings beside them. The AI reading of an RFQ comes
  on once its spending cap is set.
- **RFQs by email are off.** Each shop's own inbound address waits on the
  email routing being set up; upload the drawings instead.
- **The paid plans are not on sale.** Nothing asks for a card.

Later the same day the CMMC and ISO 9001 workspace opened too: **CMMC
Workspace**, at
[cmmc.marisstella.app](https://cmmc.marisstella.app/signup?from=docs/posts/machine-shops),
free on Level 1 (the 15 FAR 52.204-21 safeguards, their evidence and the SSP,
one user, no card). Level 2, with the SPRS score and the POA&M, is a paid
plan that is not on sale yet, and "Draft with AI" is off there too. What the
free plan holds is in the
[CMMC Level 1 checklist post](https://marisstella.app/writing/cmmc-level-1-self-assessment-checklist/).

## Update, 27 November 2026: how many small shops sell to DoD directly

Federal award data says few do: 432 small businesses held a DoD prime
contract coded "Machine Shops" (NAICS 332710) in fiscal year 2025, against
about 14,600 machine shops under 20 employees. The rest of defense machining,
and with it most CMMC, reaches shops through a prime's flow-down. The counts,
the buyers and the limits are in
[432 small machine shops sold to DoD directly last year](https://marisstella.app/writing/how-many-machine-shops-sell-to-dod-directly/).

## Update, 27 November 2026: two pricing guides on the Job Shop Quote site

The second problem above, pricing from your own rates, now has two guides on
the product's own site. Each has a worked example whose figures are computed
in code and checked in a test:

- [How to work out a machine shop hourly rate](https://marisstella.app/jobshop/machine-shop-hourly-rate):
  machine ownership, overhead, operator burden and billable hours.
- [How to quote a CNC machining job](https://marisstella.app/jobshop/how-to-quote-cnc-machining):
  material from the blank, setup, cycle time, an outside finish with its lot
  minimum, fallout and markup, for a made-up aluminum bracket at 1, 10 and 100
  parts. The same $278.67 of setup is 47% of the price of one part and 4% at a
  hundred, so the price each falls from $587.26 to $71.65. One price at every
  quantity gives away money on the small orders or loses the large ones.

The quoting guide's figures come from the same arithmetic Job Shop Quote
prices with. A test in the app runs its own costing engine on the same
bracket and fails if any quantity break differs by a cent. All the figures
are made up, and the guide says so.

## Update, 27 November 2026: what the cyber clauses on a defense PO ask

A defense purchase order often ends with a block of clause numbers: FAR
52.204-21 and DFARS 252.204-7008, -7012, -7019, -7020, -7021, -7024 and
-7025. They read as one blur, but they ask different things at different
times. [DFARS cybersecurity clauses
explained](https://marisstella.app/cmmc/dfars-cybersecurity-clauses) takes
each one in turn. It says whether the item is a provision (about your offer)
or a clause (about the work), what it asks a small shop to do, and whether
you have to pass it on to your heat treater, plater or overflow shop.

Things the clause texts make plain that the lists hide:

- 7019 is about getting the award: a NIST SP 800-171 score in SPRS no more
  than 3 years old. 7020 is about the work: the government may assess you,
  and you may not award a sub that needs 800-171 unless it has a Basic
  Assessment from the last 3 years.
- 7024 is not a cyber clause at all. It says SPRS risk ratings for item,
  price, quality and delivery feed into the evaluation.
- 7021 sets the clocks for CMMC. A Final Level 1 status lasts 1 year, a
  Final Level 2 status 3 years and a Conditional one 180 days, each with a
  yearly affirmation. Under DFARS 204.7504, until 9 November 2028 it goes
  into contracts where the program office sets a level. From 10 November
  2028 it goes into every contract where FCI or CUI will sit on your systems.

Every quotation on the page is checked word for word against the clause
text saved from the eCFR on 27 November 2026, and a test fails if one stops
matching. The plain readings are ours, and the page says so. It ends on the
free Level 1 plan of the CMMC workspace, which keeps the 15 FAR 52.204-21
requirements, their evidence and the next affirmation date in one place.

## Update, 28 November 2026: a quote template, and what stays off the quote

[Machine shop quote template](https://marisstella.app/jobshop/machine-shop-quote-template)
lists what a CNC or fabrication quote needs and why each field is there: the
quote number and revision a purchase order can name, a valid-until date, the
customer's own RFQ number, the drawing revision on every line, a price at
every quantity asked for, and a lead time counted from the order. It also
says what to leave off: your rates, times and markup, which invite a buyer to
negotiate each one.

The terms are listed as nine decisions (validity, payment, drawing revision,
overruns, inspection paperwork, shipping, customer-supplied material,
cancellation and export-controlled drawings), not as wording to copy. The
filled-in example quotes the bracket from the machining guide at its prices,
which a test checks against the app's costing engine. The CSV download holds
plain values and no formulas, and a test fails if any cell would start like
one.

## Update, 28 November 2026: how to quote a welded fabrication

Fabrication shops quote weldments, not only machined or laser-cut parts, so
the Job Shop Quote site now has a third pricing guide: [how to quote welding
and fabrication jobs](https://marisstella.app/jobshop/how-to-quote-welding).
It works from the drawing's cut list and weld symbols: arc minutes from the
weld length and travel speed, welder minutes from the operator factor (the
share of the welder's time with the arc lit), fit-up and the fixture, and the
filler wire from the fillet's cross-section. The worked example is a made-up
square-tube cart frame at 1, 10 and 50 pieces. Two things it shows:

- **The operator factor matters more than anything else on the sheet.** The
  frame's 64 in of fillet is 6.4 arc minutes. At the example's 35% factor the
  welder spends 18.29 minutes, so the weld costs $28.96 a frame at the
  example's rate instead of the $10.13 the arc time alone suggests.
- **Wire and gas are small.** They come to $1.69 a frame. A price built from
  pounds of wire misses most of the cost.

Job Shop Quote does not read weld symbols; the estimator types the times in,
and the app prices the tube by the foot, each station at its own rate, the
consumables as an extra and the powder coat with its lot minimum. A test in
the app prices the same frame with its costing engine and fails if any
quantity break differs by a cent. All the figures are made up, and the guide
says so.

## Update, 28 November 2026: a CMMC self-assessment spreadsheet that keeps the score

Many small shops start a NIST SP 800-171 self-assessment in Excel, so the
CMMC site now gives one away: a [free CMMC Level 2 self-assessment
spreadsheet](https://marisstella.app/cmmc/cmmc-self-assessment-spreadsheet).
It has all 110 requirements word for word, each with its points and its
POA&M rule. Mark a status on each row and the Score sheet gives the SPRS
score, how many open items must be closed first, and whether the result
supports a Final or a Conditional Level 2 (Self) status. A blank row counts
as not met, so the score only goes up as you check requirements. Counting
the rule across the 110 rows shows three things:

- **Most of the points can't wait for a POA&M.** 57 requirements, all worth
  5 or 3 points, must be met before a conditional status. Only 46 of the 51
  one-point requirements, plus 3.13.11 when the encryption is in place but
  not FIPS-validated, may sit on a POA&M. The other five one-pointers
  (3.1.20, 3.1.22 and 3.10.3 to 3.10.5) never may.
- **The 88 floor caps the POA&M at about 22 items.** Every open one-point
  item costs a point, so a shop with nothing else open can leave at most 22
  of them for the 180-day close-out.
- **One requirement decides whether you get a score at all.** 3.12.4, the
  system security plan, has no points, but without it there is no score.
  The sheet says so instead of showing a number.

The sheet uses the same rules as the free SPRS calculator. A test
recalculates it in LibreOffice for seven filled-in cases and fails if a
score, a status or a family's points lost differs from the calculator. The
columns are the ones the workspace's Import from a spreadsheet reads (CMMC
ID, Status, Owner, Implementation statement and Notes), and a second test
reads the workbook with the app's own importer. Recording Level 2 in the
workspace needs the Level 2 plan, which is not on sale yet. The page says
so, and says that the free Level 1 plan can read all 110 in the meantime.

## Update, 28 November 2026: estimating the cycle time itself

The pricing guides all start from operation times the estimator already has.
A new guide covers where those minutes come from: [how to estimate CNC
machining time](https://marisstella.app/jobshop/how-to-estimate-cnc-machining-time).
It goes from surface speed and chip load to rpm and feed, from width and
depth of cut to a removal rate, and from the volume removed to the roughing
minutes. Then it times the holes: a fixed time per hole, the depth at the
drill feed, and the peck retracts on holes deeper than three diameters. The
worked example is a made-up 6061 manifold block with six tapped holes and two
through holes. Two things it shows:

- **Roughing is the largest line but not the whole cycle.** It is 3.0 of the
  block's 9.36 minutes. Tool changes and loading add another 2.25 minutes a
  part, and no feeds-and-speeds formula shows them.
- **Most of the drilling time is not drilling.** Positioning and the 18 peck
  retracts are 61% of the 1.61 drilling minutes.

When an RFQ comes with a STEP model, Job Shop Quote measures the part's volume
and holes and suggests the roughing, drilling and tapping operations from the
shop's own rate card. A test runs the example through those suggestions and
fails if any minute differs. The app does not work out speeds and feeds,
finishing passes, tool changes or loading time; the estimator types those
in. All the figures are made up, and the guide says so.

## Update, 28 November 2026: quoting the work you send out

Heat treat, anodize, plating and black oxide are the part of a quote whose
price someone else sets. A new guide covers them: [how to quote outside
processing](https://marisstella.app/jobshop/how-to-quote-outside-processing).
It turns a per-pound heat-treat price into a per-part charge from the
finished weight, takes the larger of per-part × parts sent and the vendor's
lot minimum, counts the spares sent for fallout, adds freight and the
certificate, and marks the outside work up. The worked example is a made-up
4140 clamp block, hardened by one vendor and black oxided by another, at 5,
50 and 250 pieces. It is priced twice: properly, and the common shortcut of
multiplying each vendor's per-part price by the quantity. Three things the
comparison shows:

- **At 5 pieces the shortcut quotes less than half the job.** The vendors
  would bill $10.74 and $7.20 by the part; their minimums are $175 and $85.
  With freight and the certificate, outside costs are 51% of the cost, and
  the multiplied quote is $391.45 against $810.50.
- **The minimums still bind at 50.** 52 parts sent is below both break-even
  counts (71 for the black oxide, 98 for the heat treat), so the outside
  charge is the same as at 5. The shortfall is $281.50, about $5.63 a part,
  easy to miss in a $2,371 quote.
- **At 250 the per-part prices are right,** and what is still missing is the
  $115 of freight and certificate and the markup: $252.50.

Job Shop Quote holds each finish as a rate-card entry with a per-part charge
and a lot minimum, marked up at its own outside-service rate, with freight
and certificates as extras on the line. It does not price a finish by the
pound or by area; the estimator types the per-part figure. A test prices the
block both ways with the app's costing engine and fails if any quantity
break differs by a cent. All the figures are made up, and the guide says so.

## Update, 28 November 2026: markup, margin and where the profit sits

A new guide, [machine shop markup and
margin](https://marisstella.app/jobshop/machine-shop-markup), takes the same
made-up anodized bracket and asks where its profit comes from. Three things
it shows:

- **The markup line looks thin because the profit is in the rate.** The mill
  bills $123.85 an hour, the hourly-rate guide's $99.08 cost at a 20% margin,
  so labor carries no markup. The quote's markup line is 4.7% of its costs at
  one part and 2.4% at a hundred, but the margin over the shop's full cost is
  17.6% to 18.7%.
- **The same margin can be written two ways.** The mill at $99.08 with a 25%
  labor markup prices the job within a cent of the $123.85 rate with none.
  Doing both is one 15% markup on everything: $57.90 more on the one-off and
  $879.00 more on the hundred, the margin charged twice on labor.
- **Outside work at cost hurts most on small orders.** Passing the material
  and the anodize through at cost drops the one-off's margin to 13.8%, because
  the vendor's $150 lot charge is 26% of its price.

Job Shop Quote keeps a separate labor, material and outside-service markup
and a line minimum on the rate card. A test runs all four policies through
the app's costing engine and fails if any quantity break differs by a cent.
All the figures are made up, and the guide says so.

## Update, 28 November 2026: what the material line should cost

Another guide covers the first line of every machining quote: [how to
calculate material cost for a machining
quote](https://marisstella.app/jobshop/machining-material-cost). It sizes the
blank from the part's envelope, weighs it, and prices a made-up 6061 bracket
the four ways a shop can buy the stock: plate by the hundredweight, flat bar
by the foot used, flat bar in whole 12 ft bars, and a precut blank. At 1, 10
and 100 parts with 3% expected fallout, three things stand out:

- **At one part the supplier minimum is the price.** Two plate blanks come to
  $10.31 by weight; the made-up $40.00 minimum is what gets billed.
- **Whole bars are dear on small orders.** Two blanks from a whole bar cost
  $177.60 against $11.53 for the length used. Which is right depends on
  whether the rest of the bar has another job.
- **At 100 parts, plate is cheapest at $536.12**, against $599.65 by the foot,
  $710.40 in four whole bars and $1,404.00 in precut blanks (which save saw
  time the material line does not show).

Job Shop Quote prices a rate-card material any of those ways, and a test in
the app prices the same bracket through its costing engine and fails if any
charge differs by a cent. All the prices are made up, and the guide says so.

## Update, 28 November 2026: what to check on an RFQ before you price it

The arithmetic is rarely what makes a quote lose money. More often it is a
drawing at the wrong revision, a finish callout nobody read, a first-article
report the buyer expected for free, or a defense clause on the PO. The new
[RFQ review checklist for machine
shops](https://marisstella.app/jobshop/rfq-review-checklist) lists 21 checks
in five groups: the documents, the part, quantity and timing, quality and
paperwork, and the commercial terms and restrictions. Each check comes with
the question to ask and what goes wrong when it is skipped. There is a free
CSV to fill in for each RFQ, with plain values and no formulas.

ISO 9001:2015 and AS9100D both call this step "review of the requirements for
products and services" (clause 8.2.3). The page names the clause and says
plainly that the list on its own does not meet either standard. The rows on
export control and defense flowdowns tell you to ask someone qualified.

For 11 of the checks, the page says what Job Shop Quote does today. Examples:
"Quoted before: N, M won" on the RFQ review, the rule reader matching each
drawing to its part number, and STEP holes pre-filling the drilling. A test
fails if the page drops a check or the CSV gets a cell a spreadsheet would run
as a formula.

## Update, 28 November 2026: the won quote into QuickBooks without retyping it

Once a quote is won, somebody types it into QuickBooks again as an invoice:
the customer, each part, the quantity, the price, the PO. Job Shop Quote has a
one-click send to a connected QuickBooks Online company, but that needs
Intuit's keys on our server and is not switched on yet. So a won quote's
QuickBooks card now also has **Download invoice CSV**: the same invoice as a
file for QuickBooks Online's own invoice import (Settings, Import data,
Invoices). It works today, with no connection.

The file has one row per part. Each row has the quantity it was quoted at and
that quantity's stored unit price and amount. If the customer accepted online,
the file uses the quantity they accepted. A part quoted at several quantities
with no pick is refused by name, never priced between breaks. The invoice
number is the quote's (Q1001, or Q1001-R2 for a revision), and "Your PO ...
Per our quote ..." goes on the invoice as its message. The due date comes from
"Net N" in your quote terms, or 30 days, and you can change it before
downloading. No costs, rates or markups go in the file.

Three QuickBooks limits worth knowing before you try it, all from Intuit's help
pages. Turn on custom transaction numbers, or QuickBooks replaces Q1001 with
its own number. Tick "add new customers" for a customer new to your books.
And a company that has set up sales tax cannot import invoices this way at
all. The new page, [QuickBooks invoices from
quotes](https://marisstella.app/jobshop/quickbooks-invoices-from-quotes),
lists what it does and does not do.

## Update, 28 November 2026: setting quantity breaks from your own costs

A new guide, [how to set quantity price breaks on machined
parts](https://marisstella.app/jobshop/quantity-price-breaks), takes the same
made-up anodized bracket the CNC quoting guide uses and prices it at eight
quantities, from 1 to 500. Eight is the most one quote line in Job Shop Quote
can carry. The table splits each price into what a part pays for setup, run
time, material and the anodizer's charge. The guide then reads off what a
shop needs in order to set its breaks:

- **Fallout rounds up to whole parts.** With 3% expected scrap, one bracket
  means starting two, so the one-off pays run time on both.
- **Each minimum ends at its own quantity.** The $150 anodize lot charge
  covers every order under 41 parts, so a break at 40 still pays all of it,
  and a break at 50 spreads it.
- **The price stops falling.** At 100 parts the price each is within 5% of
  the long-run floor ($68.26), and at 500 within 0.9%. A lower price at volume
  has to come from the process, not from the break.
- **Orders between breaks need a written rule.** A PO for 40 against breaks
  at 25 and 50 is $3,309.20 at the lower break's price and $3,063.20 priced on
  its own. At the upper break's price, which is what a buyer will ask for, it
  is $2,977.60.
- **Releases are lots.** 500 parts in five releases of 100 cost $1,380 more
  than one run of 500.

A test prices every break and the in-between order with the app's own costing
engine and fails if any cent differs. All the figures are made up, and the
guide says so.

## Update, 28 November 2026: what a rush job should cost

When a customer needs parts in days rather than weeks, many shops add a flat
expedite percentage to the normal price. The new guide, [how to price a rush
job in a machine shop](https://marisstella.app/jobshop/how-to-price-a-rush-job),
costs the rush line by line instead. It reuses the made-up anodized bracket
from the CNC guide and quotes it twice. In the rush version the machining runs
at an overtime rate, the job already on the mill is torn down and set up again
later, the plate comes same-day, and the anodizer charges its expedite price
and lot minimum. All the figures are made up, and the guide says so. At 1, 10
and 100 parts:

- **The rush adds 72.2%, 45.6% and 21.2%.** The bumped setup, the delivery
  and the higher anodize minimum are charged once per order, so they weigh
  most on small lots. The overtime premium grows with the hours, so on a
  large lot it is most of the extra cost.
- **A flat 25% is wrong both ways.** It is $277.44 short at one part and
  $233.97 short at ten. At 100 it charges $269.25 more than the rush costs.

Job Shop Quote has no rush switch. You put the overtime rate on the rate card
as a second machine and add the bumped job as a setup-only operation. The
expedite goes in as its own finishing operation and the delivery as an extra.
A test in the app prices both versions through its costing engine and fails
if any figure differs by a cent.

## Update, 28 November 2026: pricing the first article report

The RFQ checklist warns that a first-article report is often unpriced. The
new guide, [how to quote first article inspection
(AS9102)](https://marisstella.app/jobshop/how-to-quote-first-article-inspection),
puts a number on it. It explains what the three AS9102 forms record. It
separates the report from the first-piece check a setup already includes. It
lists the changes that make a new or partial first article due, and says how
to word the quote so nobody argues about it later.

The worked example takes the anodized bracket from the CNC guide and adds 195
minutes of ballooning, measuring and paperwork at a made-up $95 inspection
rate, plus a $25 vendor certificate. On one part, the full first article adds
$337.50 to a $587.26 price, 36% of the total. At 10 parts it adds $33.75 a
part, and at 100 it adds $3.38. A partial first article after a revision adds
$118.75. A test in Job Shop Quote prices all three versions through the app's
costing engine, with inspection as setup-only operations on a second machine,
and fails if any figure differs by a cent. The times and rates are made up,
and the page says so.

## Update, 28 November 2026: an internal audit checklist for all 47 ISO 9001 clauses

A shop working toward ISO 9001, or keeping it, has to run internal audits
(clause 9.2), and the registrar reads those records first. The new free
[ISO 9001 internal audit checklist](https://marisstella.app/machine-shop-guides/iso-9001-internal-audit-checklist.html)
lists the 47 requirement clauses, 4.1 to 10.3, by number and heading only
(the standard's text is ISO's copyright, so audit against your own copy), each
with a line on the records a small shop usually keeps for it. Pick a section,
single clauses, or press "Plan" to split every clause evenly across one to
twelve audits for the year, leaving out 8.3 design if you build to print.

For each clause you record a result (conforms; a major or minor
nonconformity, an observation or an opportunity for improvement; not
applicable), the evidence you saw and the finding. The page then lists what
would make the record incomplete: a clause in scope with no result, a
nonconformity with no objective evidence, "not applicable" with no reason,
and an auditor whose name also appears among the owners or the people
interviewed, so they would be auditing their own work. Each nonconformity has
a link that opens the
[corrective action report](https://marisstella.app/machine-shop-guides/corrective-action-report.html)
with the clause, the date and the finding already filled in. The finding
travels in the part of the link after `#`, which browsers never send to a
server. You get the audit as a Markdown report, a CSV, or a blank checklist to
print and take round the shop. Nothing is uploaded or saved.

The clauses and the "look for" lines come straight from CMMC Workspace's own
clause library, and a test fails if the two drift apart. The grades are the
four the workspace's Audits tab records. That tab keeps the whole programme:
an owner per clause, audits planned and done, and a flag for any clause not
audited in 12 months. It is part of the Level 2 + Quality plan, which is not
on sale yet.

## Update, 28 November 2026: each audit in the workspace downloads as its report

The free checklist above gives one audit as a Markdown report. The
workspace's Audits tab now does the same for every audit it holds, with the
follow-up the free page cannot see: open an audit and press "Download audit
report".

The report is built from what the tab already records. It gives the status
and dates, the auditor (a member or someone from outside), the ISO 9001
clauses in scope by number and heading, and the audit's summary. Every finding
follows, majors first, with what the auditor saw. Under each one is the
corrective action it opened, with its reference, its stage (find the cause,
take the action, check it worked, closed), its due or closed date and its
owner. A nonconformity with no action yet says so in bold. An "Independence"
line names any clause in scope that the auditor owns on the ISO 9001
checklist, because that means they audited their own work. A "Still open"
list repeats the tab's own checks for that one audit: an overdue action, a
missed effectiveness check, a nonconformity with no corrective action. It
ends with blank sign-off lines for the auditor and for management.

Clause 9.2 asks a shop to keep a record of each audit's results, and this is
that record, written from the data, not retyped. As with the checklist, no
ISO text is quoted. Text you typed is quoted line by line, so a summary that
starts with "#" or "---" stays as text and does not turn into a heading or
end the section. The report is a record-keeping aid. It is not a
certification body's audit result. Every member can download it, viewers
included. Recording audits needs the Level 2 + Quality plan, which is not on
sale yet.
