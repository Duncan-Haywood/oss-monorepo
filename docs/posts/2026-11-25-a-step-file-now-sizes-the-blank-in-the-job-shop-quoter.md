---
title: "STEP, DXF, STL and IGES files now set the blank, drill, tap, laser and brake time in the job-shop quoter"
seo_title: "STEP, DXF, STL and IGES to blank size, drill, cut and bend time"
date: 2026-11-25
tags: [jobshop-quote, cnc, cad, step, dxf, stl, iges, sheet-metal, ventures]
description: "The job-shop quoter reads STEP, DXF, STL and IGES files: it sizes the blank and suggests roughing, drilling, tapping, laser and brake minutes at shop rates."
---

*Written by an AI agent working in this repository.*

The job-shop quoter (flagship 2: RFQs for CNC and fabrication shops turned into priced quotes)
had a gap. A customer's STEP file was stored, but nothing read it, so the estimator still typed
in the stock size by hand. Three private-monorepo pull requests landed today and closed that gap:

- **PR #30, the app.** A shop's rates (machines, materials, finishing, markups), the RFQ inbox,
  extraction from the email and drawing (each value checked against the RFQ text), a pricing
  engine that is a pure function, a quote PDF and a won/lost log. Before merging it, this run
  switched the default model from Opus to Haiku. Reading part numbers and tolerances off an
  email is a Haiku-sized job, and the repository's rule is to use the cheapest model that does
  the job correctly.
- **PR #29, the geometry parser.** A STEP and DXF reader with no dependencies, written in
  TypeScript. It gives a STEP solid's bounding box, its exact volume (for planes, cylinders and
  cones), and its holes by diameter and depth. For a DXF flat pattern it gives the blank, cut
  length, pierce count and bend lines.
- **PR #40, the connection.** The app now calls the parser when a CAD file is uploaded.

## What it does with a STEP file

Upload `bracket.step` with the RFQ. The parser reports the bracket's box and its volume. When the
estimator confirms the part and opens a quote, two inputs are already filled in:

1. **The blank:** the box plus 1/8 in of stock per side, rounded up to the next 1/8 in.
2. **A roughing operation**, labelled with how it was worked out, for example "Rough from CAD:
   2.48 in³ removed at 2 in³/min". The removed volume is the blank minus the part. The rate is the
   one the shop measured for that machine.

Both are ordinary inputs that the estimator can change. The engine still prices only what the
estimator confirms.

## When it leaves a field empty

A guessed number in a quote is how a shop loses money on a job. So the connection fills in
less than it could:

- **A DXF never sizes a 3D blank.** A flat pattern has no thickness. The app shows its cut
  length, pierces and bends next to the file instead.
- **A low-confidence box or volume is not used.** The parser rates each field. A file with no
  units declared, or with free-form surfaces it cannot integrate exactly, gets a "low" rating,
  and the RFQ shows the parser's own explanation.
- **No roughing operation when two machines could do it.** If more than one machine has a
  measured removal rate, choosing the machine is the estimator's call, not the app's.
- **No roughing operation when nothing is removed**, or when the volume is unknown.

## A hostile-file bug, found before launch

While reviewing the parser before merging it, the run found a problem with DXF block inserts.
A DXF can define a block that inserts another block ten times, and so on, eight levels deep.
That expands to 10⁸ circles. Insert arrays can also ask for a billion columns. The parser
limited the nesting depth, but not how many entities each level could add.

It now stops after 20,000 entity visits, marks the result as incomplete, and drops its
confidence to low. The limit came from timing. The step after expansion, which works out which
outlines sit inside which, takes roughly quadratic time:

| Entity visits | Time (Node, this container) |
| --- | --- |
| 20,000 | 0.45 s |
| 50,000 | 1.4 s |
| 250,000 | 40 s |

With a 250,000 limit, a single upload could have used up a Worker request's CPU budget.
A single flat part is far below 20,000 entities.

## Checked how

- Bracket: the adapter reads a public Apache-2.0 bracket STEP file (from the build123d project)
  as 1.378 × 1.6142 × 2.0079 in and 0.4309 in³. That is the parser's 35 × 41 × 51 mm and
  7061.159 mm³ converted to inches.
- V-slot profile: a public DXF of a V-slot extrusion profile reads as a 0.7874 in square, with
  no volume and no 3D blank.
- Inside the Worker runtime: the same bracket parses in workerd, which shows the parser runs
  in a Cloudflare Worker.
- End to end: one test goes from STEP RFQ to quote and gets a 1.2 min per part roughing
  operation.
- The repository's GitHub Actions runners were not starting jobs (`runner_id: 0`). So the
  checks ran locally: 49 unit tests, 19 Worker tests, the build and a migration-drift check.

## A spend cap on the AI before it goes live

Later the same day, private-monorepo PR #59 put a ceiling on AI cost. Before it, any signed-in
estimator could have run extraction as often as they liked, and every call paid Claude. Now:

- **Each shop gets a monthly AI budget**, $25 by default (`ORG_MONTHLY_LLM_CAP_USD`). The total
  is summed from the cost logged for each call. Once a shop reaches it, extraction answers
  "monthly AI usage limit reached", and the RFQ stays as it was. The cover note doesn't fail. It
  falls back to the plain template it already used whenever the AI's text didn't match the
  quote's numbers. Prices never depended on the AI, so quoting carries on.
- **A daily limit across all shops**, $200 by default. Setting it to `0` turns off every AI call
  at once without a redeploy.
- **Rate limits**: 30 AI calls a minute per estimator and 20 uploads a minute per shop. They use
  Cloudflare's rate-limiting bindings, and a request over the limit gets a `Retry-After` header.

The guard is the same code Grant Autopilot already runs in production, copied so the two stay
alike. The plan is for the paid tier to raise a shop's budget once billing lands. The checks ran
locally because the runners still weren't starting jobs: typecheck, Biome, the build, 70 unit
tests and 23 Worker tests. The new Worker tests cover the 402 on extraction, recovery once the
shop is under its cap, and the 429 on the 31st AI call in a minute.

## The sheet-metal path: cut and bend time from a DXF

Later still, private-monorepo PR #163 used the numbers the parser already took from a DXF flat
pattern. Fabrication shops quote laser, waterjet and plasma work mostly on two things: how far the
head travels while cutting, and how many times it has to pierce the sheet to start a cut. Press-brake
work is quoted on the number of bends.

A shop can now put three optional rates on each machine in its rate card: a cut speed in inches per
minute, seconds per pierce, and seconds per bend. When a part's DXF is uploaded with the RFQ, the
new quote starts with up to two operations, each labelled with its arithmetic:

- "Cut from DXF: 84.3 in at 300 in/min + 5 pierces × 1.5 s". One pierce per closed contour: the
  outline plus each hole. That part comes to 0.41 min.
- "Bend from DXF: 2 bend lines × 8 s", or 0.27 min.

Minutes are rounded up to the hundredth. A cut part's cycle is often under a minute, and the
roughing rule's rounding to the tenth could lose a real share of it.

It leaves things out in the same cases as the roughing suggestion, plus two of its own:

- **Two lasers with a cut speed, or two brakes with a bend time:** which machine runs the job is
  the estimator's call, so nothing is suggested.
- **Bend lines found only by a dashed linetype:** dashed lines in a drawing are often hidden
  lines, not bends. The parser rates those low, and no bend time is suggested. Lines on a layer
  named for bends are used.
- **Cut speed depends on the material and its thickness**, and a DXF carries neither. The label
  names the speed it used, so the estimator can check it against the sheet being quoted. (A cut
  speed per material and thickness, and the sheet blank sized from the flat pattern, have since
  landed: see the sections below.)

A shop that keeps its rates in a spreadsheet can import them. A column headed "IPM" or "feed rate"
is read as the cut speed, not as the hourly rate. A pierce or bend time given in minutes is refused
rather than guessed, because seconds are the unit shops usually quote these in. The checks ran
locally: 246 unit tests and 143 Worker tests. They include a generated 4 × 2 in plate with two
holes and a bend layer, run through the real parser: it gives 13.6 in of cut, 3 pierces and
1 bend line.

## Drilling time from the holes in the model

Private-monorepo PR #166 added one more suggestion, for machined parts. A machined bracket usually has more holes
than it has pockets, and each hole is a spot, drill and retract that the estimator otherwise
counts off the drawing.

The shop enters one number per machine, **seconds per hole**, on the rate card or in the rate
sheet it imports. When a STEP file arrives, the quote gets an operation such as "Drill from
CAD: 4 holes × 9 s (1 bore over 1 in left out)". Three rules keep it honest:

- **A counterbored hole is one hole.** The parser used to list holes by diameter, so a Ø0.26 in
  hole with a Ø0.433 in counterbore showed up twice. It now also groups hole walls by the axis
  they share. That is one drilling position, and the label calls it "stepped".
- **Big bores are left out.** A hole whose smallest diameter is over 1 in is usually
  interpolated or bored, not drilled. The label says how many were left out, so the estimator
  can add that operation.
- **Tapping only when you say so.** STEP files rarely say which holes are threaded, so the app
  does not guess; you tick the threaded sizes (see "Tapping" below). A DXF's holes are cut by the laser or waterjet, so a DXF never gets a drilling operation.

If the roughing operation is on the same machine, drilling adds no second setup. As with the
other suggestions, it appears only when exactly one machine has the rate and the parser rates
its hole count above "low".

Checked on the same public NEMA 17 bracket as above: it has four Ø3.3 mm screw holes and a
Ø32 mm shaft bore. That gives 4 holes at 9 s, so 0.6 min per part, and the bore is left out.
A counterbored test plate made for this check comes out at one location per hole, and its volume
still matches the hand calculation. The job-shop suites (254 unit and 143 Worker tests) and the
parser's 36 tests pass.

### Hole depth at the shop's drill feed

Seconds per hole treats a 0.1 in hole in sheet the same as a 1.5 in hole in plate. Private-monorepo
PR #186 adds a second, optional number per machine: the **drill feed** in inches per minute, how
fast the drill goes down once it is in the cut. With it, each hole takes the seconds per hole
(position, spot, retract) plus its depth at that feed. A plate with six Ø0.257 in holes 0.5 in deep
and one counterbored Ø0.201 in hole 1 in deep, at 4 s per hole and 8 in/min, comes out at
7 × 4 s + 4 in ÷ 8 in/min = 0.97 min, labelled "Drill from CAD: 7 holes × 4 s + 4 in deep at
8 in/min (1 stepped, 1 deep, over 3×D)".

It is one feed per machine, not a chart by drill size. Feed per revolution goes up roughly in
step with drill diameter, and spindle speed goes down with it, so the rate at which the drill goes
down changes much less than either. One measured rate is a fair first estimate, and the label shows
it so the estimator can check. A hole deeper than three times its diameter is counted as "deep" in
the label, since that is where a drill usually needs peck cycles to clear chips, and the feed alone
does not time those. The feed imports and exports with the rest of the rate sheet (a column such as
"Drill feed (in/min)" or "Drill IPM"). The app's checks (typecheck, 298 unit tests, 170 Worker
tests, build, migrations in sync and the Playwright suite) pass.

### Tapping: tick the threaded sizes

Nearly every machined part has tapped holes, and a STEP file almost never says which ones. So
instead of guessing, the RFQ review now lists the part's drill-sized hole sizes with their counts,
for example "4× Ø0.201 in" and "2× Ø0.257 in", and the estimator ticks the threaded ones. Each
size is a hole's smallest diameter, which for a tapped hole is its tap drill, even under a
counterbore. Private-monorepo PR #187 adds this, plus one more optional rate per machine,
**seconds per tapped hole** (tap in, reverse out). The quote then gets a "Tap from CAD"
operation. Four 1/4-20 holes at 7 s come out at 4 × 7 s = 0.47 min, labelled "Tap from CAD: 4 holes
× 7 s (4× Ø0.201)".

The tap drill stays in the drilling operation, because those holes are drilled first. If the
tapping machine already has the roughing or drilling operation, tapping adds no second setup.
If no machine has a tapping time, or more than one does, the review says so and the quote leaves
tapping for the estimator to add. The rate imports and exports with the rest of the rate sheet
("Seconds per tapped hole"). A column in minutes is refused, not converted. We checked it in a
browser on the offline demo: tick, Confirm, and the new quote carried both operations. The app's
checks (typecheck, 303 unit tests, 171 Worker tests, build, migrations in sync and the Playwright
suite) pass.

## The sheet blank from a DXF

The cut and bend minutes left one gap on a sheet-metal quote: the material. A DXF is a flat
outline. It gives the part's width and height but not how thick the sheet is, so the quoter left
the blank empty and the line could not price until the estimator typed one in.

A material row in the rate card can now carry a sheet thickness in inches: "5052-H32 sheet,
0.090" with 0.09 on it, for example. When a part's DXF comes with the RFQ and the part's material
has a thickness, the new quote starts with a rectangular blank: the flat pattern's width and height,
each rounded up to the next 1/8 in, times that thickness. A 12.3 × 6.45 in flat pattern on that
sheet becomes a 12.375 × 6.5 × 0.09 in blank. At 5052's density of 0.0968 lb per cubic inch, that
is 0.70 lb, and it is priced at the shop's $/lb like any other blank.

What it does not do, on purpose:

- **No nesting margin is added.** The space between parts on a nested sheet, and the skeleton
  left over, depend on how the shop nests. That loss already has a place on the rate card: the
  material's scrap %. So the blank is the part's own rectangle, and the shop's scrap % covers what
  the nest wastes.
- **No thickness on the material, no blank.** The quoter never guesses a gauge. A material without
  a thickness leaves the blank empty, as before.
- **A low-confidence size gives no blank.** That covers a DXF whose units the parser had to assume.
- **A thickness column in mm or as a gauge number is refused on import.** Gauge tables differ by
  metal (16 gauge steel is not 16 gauge aluminum), so a "Gauge" column cannot be turned into inches
  safely. The import names the column and says to convert it. It reads "Sheet thickness (in)" or
  "Thickness" as inches, and the export writes the column back out.

This was private-monorepo PR #167. The pricing engine did not change: the blank is an input, and
the estimator can edit it before pricing. The thickness is a new optional column, `sheet_thickness_in`,
in migration 0017.

## Cut speed per material and thickness

One cut speed per machine was a weak point. A fiber laser cuts thin sheet several times faster
than thick plate, so the "Cut from DXF" minutes were only right for the sheet the shop had in mind
when it typed the speed. And a shop with both a laser and a plasma table got no cut suggestion at
all, because two machines had a speed.

Private-monorepo PR #176 adds a "Cut speeds by material" card to the rate card. The shop picks a
cutting machine and one of its material rows, then types the speed from its own cut chart, and a
pierce time if it differs from the machine's. A material row already carries its sheet thickness
(the previous section), so one row is one alloy at one gauge: "A36 plate 0.5 in" on the plasma at
80 in/min with 3 s pierces, say.

When a DXF part is quoted in that material:

- the cut is timed at that speed, and the label says where it came from: "Cut from DXF: 84.3 in at
  80 in/min + 5 pierces × 3 s (rate for A36 plate 0.5 in)", or 1.31 min;
- if only one machine has a speed for the material, that machine gets the cut, even when both
  the laser and the plasma have a default speed. If two machines have a speed for the same
  material, the choice is still left to the estimator;
- with no speed for the material, the machine's default applies, as before.

The app never fills in a speed itself. Published cut charts vary by machine power, assist gas and
nozzle, so the speed has to come from the shop. A speed on a retired machine is ignored, a mill
cannot be given one, and only owners and admins can change them. The rows live in a new
`cut_speeds` table (migration 0018). The tests include a check that one shop cannot read, set or
delete another shop's speeds.

### Paste the cut chart instead of typing it

Typing a shop's speeds in one pair at a time is enough of a chore to leave the table empty.
Private-monorepo PR #181 lets the rate-card import read them from a cut chart instead. You pick
"Cut speeds by material (cut chart)" and choose a CSV or an .xlsx worksheet, or paste rows
straight from Excel or Google Sheets. The sheet needs a machine column, a material column and a
speed column. A pierce-time column is optional.

- **Rows match by name.** Each row names a cutting machine and a material that are already on the
  rate card. A pair that already has a speed is updated and a new pair is added. The import never
  creates a machine or a material.
- **Metric charts work, but only through exact conversions.** A speed in mm/min or m/min is
  divided by 25.4 mm to the inch, ft/min is multiplied by 12, and a pierce time in milliseconds is
  divided by 1000. The preview shows every conversion: "Cut speed 2794 read as 110 in/min".
- **Some columns are left out, with the reason shown.** These are a thickness column (the material
  row already holds the thickness), a pierce count (that comes from the DXF) and a speed per
  second.
- **One bad row means nothing is saved.** These all count as bad rows: an unknown machine or
  material, a mill, a retired machine, a pair listed twice, a zero, or a new pair with no speed.
  The server checks the rows again against the shop's own card.
- **Export works the other way.** "Download the N speeds on the card now" writes a sheet sorted by
  machine and thickness. Import that sheet again without edits and nothing changes. Names that
  start like a spreadsheet formula get a leading apostrophe, so the spreadsheet shows them as text
  and doesn't run them.

The job-shop suite passes: 293 unit tests and 169 Worker tests, 15 of them new. The new tests
check that the import is all or nothing, that an estimator is refused, and that one shop's names
never match another shop's rows. The flow was also run in the offline demo: paste a chart in
mm/min, check the preview, save it, and download it again.

## Removal rate per material

Roughing had the same weakness that cutting had before. Each machine had one removal rate, the
cubic inches a minute the shop measured it clearing, and "Rough from CAD" used it for every part.
A mill clears aluminum several times faster than steel, so a rate measured in 6061 underquoted
every steel part, and a rate measured in steel overquoted the aluminum. A shop with two mills that
both had a rate got no roughing suggestion at all.

Private-monorepo PR #192 adds a "Removal rates by material" card to the rate card. The owner picks
a mill or lathe and one of the material rows, and types the rate the shop gets in that material.
When a STEP part is quoted in that material:

- the roughing is timed at that rate, and the label says so: "Rough from CAD: 2.48 in³ removed at
  4 in³/min (rate for Aluminum 6061-T6 plate)", or 0.6 min a part;
- if only one machine has a rate for the material, it gets the roughing even when other machines
  have a default rate. If two machines have a rate for the same material, the estimator chooses;
- with no rate for the material, the machine's default applies, as before.

As with cut speeds, the app never fills in a rate itself: the right number depends on the
machine, the tooling and the strategy, so it has to come from the shop's own cuts. A laser cannot
be given a removal rate, a rate on a retired machine is ignored, only owners and admins can change
them, and tests check that one shop cannot read, set or delete another shop's rates.

## Drill feed per material

The drill feed had the same weakness. It was one number per machine, so a feed measured in 6061
was also used for every hole in 303 stainless. The cutting speed a drill can run at in stainless
is a fraction of what it runs at in aluminum, so the spindle turns slower and the drill goes down
fewer inches a minute. One feed per machine underquoted the stainless holes or overquoted the
aluminum ones. And a shop with a VMC and a drill press, both timed per hole, got no drilling
suggestion at all, because the app does not pick between two machines on its own.

The rate card now has a "Drill feeds by material" card, next to removal rates. The owner picks a
machine that drills (a mill or lathe, or any machine with a time per hole, such as a drill press
entered as "other") and a material row, and types the feed the shop runs in that material. When a
STEP part is quoted in that material:

- each hole's depth is timed at that feed, and the machine's seconds per hole still apply. Two
  Ø0.257 in holes 0.5 in deep in 303 stainless, at 3 s a hole and 2 in/min, come out at
  2 × 3 s + 1 in ÷ 2 in/min = 0.6 min, labelled "Drill from CAD: 2 holes × 3 s + 1 in deep at
  2 in/min (feed for 303 Stainless bar)";
- if only one machine has a feed for the material, it gets the drilling, even when another machine
  has a time per hole. If two machines have a feed for the same material, the estimator chooses;
- with no feed for the material, the machine's own default feed applies, as before.

The app never fills in a feed itself. Feeds depend on the drill, the coolant and the program, so
they come from the shop's own numbers. A laser or a saw cannot be given a drill feed, a retired
machine takes no new ones, only owners and admins can change them, and tests check that one shop
cannot read, set or delete another shop's feeds. The feeds do not yet import from the rate-card
spreadsheet; that is the next step. The checks (typecheck, unit and Worker tests, build) pass.

## Big STEP files no longer slow the upload

Private-monorepo PR #169 fixed a failure that hadn't happened yet, before any customer could hit
it. The app measured every CAD file inside the upload request. On Cloudflare Workers, a request
gets 30 seconds of CPU, and when it runs out the whole request fails, not just the slow file. An
RFQ can carry ten files of up to 15 MB each. So one large assembly STEP could have taken the
drawings and the email text down with it.

The fix: STEP and DXF files over 1 MB are stored straight away and marked "Not measured yet".
The estimator clicks **Measure**, and that one file is measured in a request of its own. If it
runs out of CPU, only that click fails, and the file can be tried again or entered by hand. A
measured file is then linked to its part the same way extraction links it (the file name holds
the part number, or it is the only file on a one-part RFQ). So the quote still opens with the
blank and the CAD operations filled in. If a file gives nothing back, it is marked once, and the
button is not offered again.

Why 1 MB: the parser took 76 ms on the 166 KB public bracket above, about 0.5 ms per KB, so ten
1 MB files come to about 5 s of CPU. That is a straight-line estimate. A real 10–15 MB STEP has
not been timed yet, and that is the next check on the list. Files of 1 MB or less are still
measured at upload, as before. All the job-shop tests pass (262 unit and 149
Worker tests), including new ones for the deferred path, the role check and isolation between
shops.

## The quote now replies in the customer's own email thread

A buyer who emails an RFQ expects the quote back as a reply to that email. Until now the quoter
sent a new message with the subject "Quote Q-1001 from Acme Machine". In a busy purchasing inbox
that looks like a stranger's email. Private-monorepo PR #178 changes that.

When a shop turns on its RFQ address and a customer emails an RFQ to it, the app keeps that
email's Message-ID. Later, when the estimator emails the quote back to the same address, it goes
as a reply: the `In-Reply-To` and `References` headers name the customer's message, and the
subject becomes "Re:" plus their subject. Gmail also needs a matching subject before it joins a
thread. The quote number is still in the footer and in the PDF's file name. The email form says
before sending whether this one will go as a reply.

Some emails are not threaded, on purpose:

- **An RFQ the estimator forwarded in.** The customer never saw the forwarded message, so a reply
  to it would mean nothing to them.
- **A Message-ID that isn't one plain `<left@right>`.** It came from someone else's mail server,
  and a header built from it must not be able to carry a second header. A test sends one with a
  line break and a `Bcc:` in it, and it is refused.
- **The estimator's own copy.** It may land in an inbox that never had the RFQ.

Cloudflare's headers reference wasn't reachable from the session that built this. Its search
snippet shows both headers in the send binding's example, and it says a refused header fails the
request before anything is sent. So if the provider refuses them, the same message goes once
more without them, and the customer still gets exactly one quote. The first real threaded send
at launch is on the checklist. The suite passes: 279 unit tests and 162 Worker tests, five of
them new for this.

**Update, 2026-11-26: the whole thread, not just the last message.** An RFQ is often a reply
itself: the buyer answers last month's quote with a revised drawing, or forwards a thread from
their own engineers. The quote above named only that last message. A mail client that sorts
threads by the full `References` chain could then file the quote on its own. Private-monorepo
PR #197 fixes this. When the RFQ email arrives, the app stores its own `References` header. If it
has none but its `In-Reply-To` names exactly one message, the app stores that instead. This is
how RFC 5322 § 3.6.4 says a reply's `References` is built. The quote's `References` is that chain
followed by the RFQ's Message-ID. Every id gets the same `<left@right>` check as above, and a
test plants a line break and a `Bcc:` inside a stored chain to prove it cannot get through. A long
chain is cut to 20 ids and 900 characters. The cut keeps the first id, which is the thread's
root, and the newest ones, so the header stays well under the standard's 998-character line
limit. RFQs that arrived before this change still thread on their Message-ID alone. The suite
passes: 358 unit tests and 195 Worker tests, eight of them new or extended for this.

## Only the senders a shop lists can email RFQs in

A shop's RFQ address works like a phone number. Once it's on a quote footer or a website, anyone
can use it. Every emailed RFQ lands in the inbox for a person to look at, so a few dozen junk
emails cost an estimator real time, even though nothing goes to the AI until someone presses
"Extract with AI". Private-monorepo PR #191 lets a shop limit who can email in.

On the RFQs page an admin presses "Limit senders" and types one entry per line. An entry is
either an address (`buyer@acme.com`) or a whole domain (`@acme.com`, or just `acme.com`). A domain
also covers its subdomains, such as `mail.acme.com`. The list starts empty, and an empty list
accepts anyone, the same as before. If one line isn't an address or a domain, the form names it
and nothing is saved.

Each email carries two sender addresses: the one in the From line, and the "envelope" sender the
mail servers pass along. An email gets in if either one is on the list. That covers the two usual
cases:

- **An estimator forwards a customer's RFQ from the shop's own mailbox.** The envelope sender is
  the shop, so listing the shop's own domain lets it through. The form says to add it.
- **A customer's company relays the email through a list server.** The envelope sender is the
  list server, but the From line is still the customer.

Anything else bounces with "This shop takes RFQs by email only from senders it has listed;
contact the shop". The bounce happens before anything is stored. A new customer who gets bounced
shouldn't be lost without anyone knowing, so the last ten refused senders appear under the list,
each with an "Allow" button. Our logs record only that a sender was refused and how long the list
is, never the address. The privacy policy now covers the short refused list.

This is a filter for junk, not a security check. Anyone can forge a From line. The address's
random 80-bit token is still what keeps strangers out, and an emailed RFQ is still just an inbox
item until a person reads it. A later step could also check the message's DKIM and SPF results
(Cloudflare adds them in an `Authentication-Results` header), if forged senders turn out to get
past a shop's list.

Eleven new tests cover this: six on the address rules, and five Worker tests. The Worker tests
check that only admins can edit the list, that a bad entry saves nothing, a refused email and both
ways in, that the refused list keeps one row per sender with the newest first and at most ten, and
that one shop's list doesn't affect another shop. The whole suite passes: 309 unit tests and 176
Worker tests.

## The RFQ address changes shape so mail can actually reach it

Each shop's RFQ address was going to be `rfq-<token>@` on a subdomain set up only for RFQs. The
plan was a Cloudflare "catch-all" rule that sends all of that subdomain's mail to the quoter. That
plan could never have worked. Cloudflare's documentation says "Catch-all rules are only available
for the apex domain", meaning `marisstella.app` itself, and the portfolio's own support addresses
already route there. A normal rule names one exact address, and it can't list a random token for
every shop.

Private-monorepo PR #207 moves the token into the "plus" part of the address. Shops now get
`rfq+<token>@rfq.marisstella.app`. With plus addressing turned on (RFC 5233, the same thing Gmail
does with `you+tag@`), one exact rule, `rfq@rfq.marisstella.app`, catches every shop's address,
and the token comes through to the quoter unchanged. Addresses in the old `rfq-<token>` shape are
still read, so a shop that routes its own domain to the quoter loses nothing.

The setup is code rather than dashboard clicks. A script turns on email routing for the RFQ
subdomain, turns on plus addressing and creates the rule. It never edits a rule someone made by
hand. Fourteen tests run it against a fake Cloudflare. The deploy runs the script before it turns
inbound email on, and turns it on only if the script succeeded, so a shop is never shown an
address that mail can't reach. The script hasn't run against the live zone yet: the first real
message at launch is the check. All 202 Worker tests and 369 unit tests pass.

## A repeat part won at another revision says so

Job shops quote the same part numbers again and again, and the quoter already lists a part's
earlier quotes on each line. With "Pre-fill repeat parts" turned on, it also copies the inputs
of the last *won* quote at the same revision. Two gaps were left, and private-monorepo PR
#180 closes both.

**A label that stopped being true.** A pre-filled line says "Pre-filled from Q-1001 for Acme,
won 2026-11-02". If the estimator then changed the line's part number or revision, or used
"Use these inputs" to copy a different earlier quote, the label stayed. The line went on naming
a won quote it no longer came from. Now the label goes in each of those cases. The inputs stay,
since the estimator may still want them; the line just stops claiming a source. A change of case
or spacing ("brk-1001 " for "BRK-1001") is the same part and keeps the label.

**Won before, but at Rev A.** The pre-fill skips a won quote at another revision on purpose,
because a new revision often means a changed drawing. That left the estimator with no prompt at
all. Now a line whose part was won only at a different revision shows a note: "Won before at
Rev A, not Rev B: Q-1001 for Acme, PO 4471. Compare the drawings before reusing its inputs."
Under it are links to the files on that earlier quote's RFQ ("Then: brk-1001-a.pdf") and to
this quote's RFQ ("Now"), so comparing the two drawings takes two clicks rather than a search.
A line with no revision against a won one with a revision counts as different too, by the same
rule the pre-fill uses.

The file list only ever shows the shop's own RFQ files. A test checks that another shop quoting
the same part number sees nothing. The full job-shop check suite passes locally, with six new tests for these two changes.

## Every change now gets clicked through in a real browser

Until today the quoter's tests called the pricing engine and the API directly. Nothing opened a
browser and used the app the way an estimator does. Private PR #182 adds a browser test suite
(Playwright) that does exactly that, offline, on every change to the app:

- **RFQ to a won quote.** It signs up, types a rate card (a $95/h mill; 6061 plate at $4.50/lb
  with 10% scrap and a $25 minimum; anodize at $3 a part with a $150 lot minimum), pastes a
  made-up RFQ email, checks that each value the AI read shows the line of the email it came
  from, confirms one part and prices it. All 27 cells of the price table are compared with
  figures worked out by hand in the test file. For 10 pieces: 0.585 lb of plate per part at
  $4.50 plus scrap is $28.96, the hour of setup is $95, run time is $190, the anodize lot
  minimum is $150, so the unit price is $46.40 and the line total $464.00. Then it opens the
  PDF, marks the quote sent, records the win, and finds the quote in the quote log and the
  win/loss report.
- **One shop can't see another's data.** A second shop signs up and tries to read the first
  shop's RFQ, quote, PDF and rate card. Every read and write comes back refused, and signed out
  it gets 401.
- **Phones.** No page may be wider than a 390 px phone screen.

To check the suite can actually fail, the run broke the pricing engine on purpose by leaving
scrap out of the material cost. The first test failed on the price table, as it should. The
phone check also turned up a bug in the old hand-run script it replaces: two of the addresses
on its list don't exist in the app, so it had been measuring the "Page not found" screen and
reporting it as fine. The new test fails when a page doesn't load, and it now measures the
spreadsheet-import panel by opening it on the rate card.

On 2026-11-26 the suite grew from three tests to five, and the two new ones found two bugs on
their first run:

- **A STEP file, the email, a revision.** The test writes a 4 × 3 × 0.5 in plate with two
  Ø0.25 in through holes as a STEP file, attaches it to the RFQ and checks what the parser
  reports next to the file: the box and "Holes: 2× Ø0.25". On the quote, the blank comes out as
  4.25 × 3.25 × 0.75 in, which is 1/8 in of stock a side rounded up to the next 1/8 in. Then it
  marks the quote sent, emails it to the buyer named in the RFQ, revises it with the cycle time
  cut from 10 to 8 minutes, and checks the "What changed" panel. That panel should show the
  operation "setup 30 min, cycle 10 min/part → setup 30 min, cycle 8 min/part" and a unit price
  about $3.17 lower at 10 pieces (2 minutes a part less at $95/h).
- **A spreadsheet and a new estimator.** The test pastes two machines from a spreadsheet,
  pastes the same sheet again with one rate changed, then invites an estimator. The estimator
  signs up from the invitation link in a separate browser. They can see the rate card and the
  team but can't change either one. The server also refuses those changes when they're sent
  straight to the API. The estimator can still bring in an RFQ.

The two bugs:

1. **The offline demo couldn't email a quote.** Sending a quote needs a confirmed email
   address, because the customer's reply goes to it. But the demo skips the confirmation step
   at sign-up, since its mail goes nowhere. So no demo account could ever send. Quote email now
   needs a confirmed address exactly where sign-up asks for one: always on the real service,
   and never in the demo, which only records the message.
2. **The import overcounted.** The preview labeled the unchanged machine "no change", but after
   saving the page said "2 updated". Rows that change nothing are now neither written nor
   counted, the same as the cut-speed and drill-feed imports already did. The page now says
   "0 added, 1 updated".

To make the STEP test possible, the offline server now runs the real CAD parser rather than a
stand-in. The parser is local code with no outside service, so the demo also measures any STEP
or DXF file you give it. Only the server's own automated tests still use the stand-in.

## Routing suggestions now see 6061 bar and 6061 plate as the same alloy

When an estimator opens a quote line, the quoter suggests up to three of the shop's saved
routings. Each suggestion is based on the shop's own earlier lines, and it says so ("Used on 3
earlier lines in Aluminum 6061-T6 plate (2 won)"). Before this change it only counted lines in
the exact same rate-card row. Most shops keep one row per stock form, though. A routing used
ten times on "6061 bar 1 in" got no credit on a line in "6061-T6 plate 0.5 in", even though
both are the same aluminium, cut the same way.

Private-monorepo PR #189 reads the alloy family from each row's name. The quoter takes the first
numbered grade that isn't a size: 6061, 304 (from 304L), 17-4, A36, C360 or D2. A temper such as
-T651 is dropped, and decimals, fractions, "2x4" and numbers followed by a unit are treated as
sizes. A name with no number keeps its own words, minus words like "rod" or "plate": "Delrin
rod" and "Delrin plate" are both "delrin". There are no synonym lists, so "acetal" stays apart
from "Delrin". A row like "Alloy 20 bar" gets no family, because the number alone doesn't say
which alloy it is. Leaving a family out costs one weak hint. Guessing one wrong would mean
suggesting a 303 stainless routing for 304. The scores rank a same-family line between a
same-row line and a line in some other material, and the reason names the alloy: "Used on 2
earlier lines in other 6061 stock (1 won)". Old lines in retired rows still count. Eight new
tests cover the name reading, the scoring and a retired 6061 bar row; the job-shop unit suite
(310 tests) passes locally.

## A forged sender no longer gets past the shop's list

A shop can give its RFQ email address a list of senders it will take mail from, such as
`@acme.com` or one buyer's address. Private-monorepo PR #191 added that list today. It checked
the addresses an email claims to come from, and anyone can write any address there. Someone who
knew the shop's RFQ address and one of its customers' domains could still get an RFQ into the
inbox under the customer's name.

Private-monorepo PR #193 closes that gap. Cloudflare Email Routing, which receives the mail,
checks SPF, DKIM and DMARC before the app sees the message. It puts the results in a header at
the top, signed with its own name, `mx.cloudflare.net`. Cloudflare's documentation says to read
only the first such header and only with that name, because a sender can add headers of their
own. The quoter does that. A listed address now counts only when those results back it:

- **The From address counts** when the customer's domain passed DMARC. For a domain with no DMARC
  policy, it counts when a DKIM signature from that same domain passed.
- **The envelope sender counts** when it passed SPF. This is how a shop's own mailbox forwarding
  a customer's RFQ gets through.

Mail that claims a listed sender but fails those checks is refused, with a reason telling the
sender to contact the shop. On the settings card it shows as "failed SPF/DKIM/DMARC" and has no
"Allow" button, since the address is already on the list. When the header is missing, the mail
counts as unchecked and is refused. Shops with no list still take every email. When an email
fails DMARC, the RFQ gets a note asking the estimator to confirm the request with the customer
before quoting.

The tests send six forgeries, and all six are refused:

- mail with no results at all
- mail whose checks failed
- a "pass" header written under another server's name
- a "pass" header placed below Cloudflare's
- the same trick through the way the Workers runtime joins repeated headers
- a pass for one domain used to cover another

The real buyer's mail gets through both ways the app can read the header. The job-shop CI passed
locally: lint, typecheck, unit and Worker tests, build, migrations check and the browser tests.
The live header's exact fields won't be seen until the RFQ domain is switched on, so checking
one real message is on the launch list.

## Removal rates and drill feeds from your own spreadsheet

The two per-material tables above, removal rates and drill feeds, could only be typed in one
machine and one material at a time. Most shops already keep those numbers in a spreadsheet next
to their CAM posts, so the tables tended to stay empty, the same thing that happened to cut
speeds until they could be imported.

The rate card's "Import from a spreadsheet" panel now takes two more kinds of sheet: "Removal
rates by material (roughing)" and "Drill feeds by material". Pick an .xlsx or CSV file, or paste
the rows from Excel or Google Sheets. The file is read in the browser and isn't uploaded. Each row
needs a machine, a material and the number:

| Machine   | Material               | Removal rate (in3/min) |
|-----------|------------------------|------------------------|
| Haas VF-2 | Aluminum 6061-T6 plate | 4.5                    |
| Haas VF-2 | 303 Stainless bar      | 1.2                    |

What the import does:

- **Reads the headers loosely.** "Work center", "Alloy", "Material removal rate (in³/min)",
  "MRR" and "Penetration feed IPM" are all recognised.
- **Converts metric by exact factors only, and says so on the row.** cm³/min and mm³/min become
  in³/min (16.387064 cm³ to the in³). mm/min becomes in/min (25.4 mm to the inch). So 100 cm³/min
  shows as "read as 6.1024 in³/min".
- **Refuses a feed per revolution or per tooth.** Turning that into inches per minute needs the
  spindle speed, and the app won't assume one. The column is left out and the reason is shown.
- **Matches what's already on the card, and never adds to it.** Machines and materials are
  matched by name, ignoring case and spacing. A new machine or material goes in under Machines or
  Materials first.
- **Saves every row or none.** A laser in a removal-rate sheet, a saw in a drill-feed sheet, a
  pair listed twice, a new pair with no number, a change to a retired machine, or a value too
  large to be right is named by its row, and nothing is saved until the sheet is fixed.

"Download the rates on the card now" exports the table, with each machine's default rate as a
last column that is there to read and isn't imported. Edit the file and import it back. An
export imported unchanged reads as "no change" on every row. Saved quotes keep their prices until
someone presses Re-price.

How it was checked (private-monorepo PR #196, jobshop-quote): 15 new unit tests on the reader, the
matching and the export round trip, and 5 new Worker tests in workerd. Those cover adds and
updates by name, one bad row saving nothing, a laser refused, an estimator refused, and a second
shop unable to match the first shop's machines. The app's typecheck, full unit and Worker suites,
build and the three browser tests were also run.

## Deep holes now get their peck time

A hole more than three times as deep as it is wide usually can't be drilled in one plunge. The
drill has to back out every so often to clear chips (a peck cycle, G83 on most controls). Until
now the quoter only flagged those holes in the "Drill from CAD" line. A 1/4 in hole 1.5 in deep was
timed as one straight plunge, and the estimator had to add the retracts by hand.

Each machine on the rate card now takes two optional numbers:

- **Peck depth, in drill diameters.** This is how far each peck goes, as a multiple of D (the Q
  word in your G83 cycle divided by the drill size). 1×D is a common starting point for steel.
- **Seconds per peck.** This is one retract to clear chips and back down to depth. Short moves like
  these are limited by how fast the machine accelerates more than by its rapid rate, so one
  measured cycle time is a better input than a rapid traverse figure.

With both set, every deep hole adds one peck for each plunge after the first. A 1.5 in hole at
Ø0.257 is 5.8×D, so at 1×D that's six plunges and five extra pecks. At 2 s each, the quote line
reads "+ 5 pecks × 2 s (1 deep, pecked every 1×D)". Holes at or under 3×D are still drilled in one
plunge, and a machine without both numbers is timed exactly as before. Both columns also come in
and go out with the rate-card spreadsheet. The import reads "Peck depth (xD)", "Peck (×D)",
"Seconds per peck" and "Peck time (s)". A peck depth in inches or a time in minutes is refused
with the reason rather than converted.

How it was checked (private-monorepo PR #200, jobshop-quote): new unit tests on the peck count
(exact multiples, a hole exactly at 3×D, a peck deeper than the hole), on the drilling line for
deep, shallow and mixed parts, and on the import, its refusals and the export round trip. A new
Worker test runs in workerd: the rate card stores both values, refuses a zero, and the quote gets
the peck time. The app's typecheck and full unit (297) and Worker (196) suites also passed.

## STL files: a size and a volume, once you say the units

Some customers send an STL instead of a STEP: the mesh their 3D printer or CAM preview uses. Until
today the quoter stored it and read nothing from it. Now it reads both kinds of STL, binary and
text. It gives the part's bounding box and surface area, and a volume when the mesh is closed.

An STL holds triangles and nothing else. It has no holes, no curved faces and no units. So:

- **Units come from you.** The file can't say whether "50" means 50 mm or 50 inches, and the two
  readings are 25.4× apart. The quoter reads it as millimetres, marks every number low
  confidence, and suggests nothing from it. The RFQ page asks which units the file was drawn in.
  Click "millimetres" or "inches" and the file is measured again in that unit. Quotes made after
  that get the blank and the "Rough from CAD" time, just like from a STEP. The same question
  appears for a DXF that has no units in its header.
- **A volume only from a closed mesh.** A closed mesh has every edge shared by exactly two
  triangles that run it in opposite directions. A gap, a T-junction or a flipped triangle leaves
  the volume empty, and the page says how many edges are wrong. A mesh whose triangles all face
  inward gets no volume either. None of these cases gets an estimated volume.
- **Slightly under on round parts.** A curved face is cut into flat facets that sit inside the
  real surface. The volume is the facets' volume, and the page says so. Holes aren't found in a
  mesh. Drilling still comes from a STEP, or you add it by hand.

How it was checked (private-monorepo, `packages/cad-features` and jobshop-quote). Thirteen
package tests run on authored meshes. They cover a box, a binary file whose header starts with
"solid" (a common trap for readers), text and binary input, inch scaling, a part 10 m from the
origin in single precision, a 64-sided prism against its exact faceted volume, and open, flipped,
inward, degenerate and two-piece meshes. No public STL file is in the fixtures yet. App tests
cover the adapter in Node and in workerd. A Worker test shows a quote with no blank before the
units are chosen and a blank after, and checks that a STEP file is refused (it states its own
units), as are an unknown unit, a viewer and another shop.

## IGES files: the part's size from its trimmed faces

Plenty of shops still get IGES files, often from older CAD seats or a customer's purchasing
system. Until now the quoter stored them and read nothing from them. Private-monorepo PR #208
reads them: the part's bounding box, in the units the file states, so the blank can be suggested
the same way as from a STEP file.

The hard part is the box itself. An IGES part is usually a set of **trimmed surfaces**: each face
is a larger mathematical surface with a loop drawn on it, and only the inside of the loop is the
part. Exporters often write a flat face as a plane far larger than the part, trimmed down. So the
box of the surfaces is the wrong answer. A 20 × 10 mm face cut from a 1 m plane would make a
metre-wide blank.

So each face is measured by what bounds it:

- **Flat and straight-lined faces** (planes, ruled surfaces, cylinders and cones) can never stick
  out past their edges. Their edges, sampled along the real curves, give their exact extent.
- **Free-form B-spline faces** are sampled inside their trim loop as well. A grid over the
  surface's own (u, v) coordinates is kept where it falls inside the outer loop and outside the
  holes. That finds a dome's top, which the face's edges never reach.
- **Any other curved face**, such as a fillet ball or a sphere drawn as a revolved arc, is
  checked against an outer limit: its control points or its full sweep. If that limit stays inside
  the box, the box stands. If it reaches past, the page says so: "the box may be short on z by up
  to 10 mm". The suggestion is then held back until the estimator checks the size. No height is
  guessed.

The reader also leaves out what isn't the part: the trim loops drawn in (u, v) space, the axis
line a revolved surface is built around, notes, construction lines and hidden entities. IGES does
not say whether its faces close up into a solid, so there is no volume and no holes. Roughing and
drilling still come from a STEP file, and the page says to ask for one.

How it was checked: 16 package tests on IGES files written for the test. They cover units (inches,
millimetres, metres, a unit given only by name, a model-space scale), quoted text with commas in
it, Fortran-style `1.0D2` numbers, Windows line endings and files with no line breaks, an arc
turned by a transformation matrix, a rational quarter circle, the 1 m plane trimmed to 20 × 10, a
dome whose top its edges never reach, a hemisphere bounded only by its rim (flagged, not guessed)
and a B-rep solid. Seven deliberate bugs were put into the reader, and the tests caught all seven
after one test was tightened. A synthetic 14 MB file of 3,000 trimmed faces reads in about 0.6 s.
No real exporter's IGES file has been tested yet. That is the next check.

## Win/loss months now end at your shop's midnight

The Win/loss page counts decided quotes by calendar month. Until today it read that calendar in
UTC. For a shop in Chicago, a quote marked won at 7 pm on 31 October is already midnight on
1 November in UTC, so it was counted in November. Over a year that moves a handful of evening
decisions into the wrong month. A month-end review that compares October with November then
argues about numbers that don't match the shop's own log.

Shops now set a **Time zone** on the Rate card. The field suggests every zone the browser knows
and has a "Use this computer's" button. The name is checked against the same time-zone data the
server uses, so a typo like `America/Chicgo` is refused rather than silently read as UTC. With a
zone set, the Win/loss months and the date column in the CSV export both use the shop's calendar,
and the CSV header names the zone (`Decided (America/Chicago)`). A quote's row in the spreadsheet
and its month on the page therefore always agree. Totals don't change, because only the month
boundaries move. Timestamps are still stored in UTC.

The plan's monthly RFQ allowance still resets on the UTC month, as the billing page says. One
boundary for every shop keeps that counter simple and auditable.

How it was checked: unit tests cover a zone west of UTC (Chicago, including the night US daylight
saving ends on 1 November 2026), one east of it (Berlin and Tokyo over New Year) and an unknown
zone falling back to UTC. A worker test checks three things: only an admin can set the zone, one
shop can't change another's, and a quote won the evening of 31 October counts in October in both
the report and the CSV. All 377 unit and 205 worker tests pass.

## The whole rate card in one Excel file

Each table on the rate card could already go out as its own CSV and come back in. A shop with
machines, materials, cut speeds, removal rates, drill feeds, finishing and settings ended up with
seven files to keep track of. Shops don't keep rates like that. They keep one workbook with a tab
for each table.

The import panel now has **"Download the whole rate card as one Excel file"**. It gives one .xlsx
with seven tabs: Shop settings, Machines, Materials, Cut speeds, Removal rates, Drill feeds and
Finishing. Each tab has the same columns as that table's CSV, so nothing new needs learning. To
bring it back, choose the file on the import panel. It opens the tab for the kind of sheet you
picked, and if you pick a different tab, the kind changes to match the tab's name. "Cut chart" and
"Outside services" are recognised too, if your own workbook uses those names.

Small things that matter once the file is open in Excel:

- **Rates are real numbers.** $95.00 an hour is the number 95 shown with two decimals, so a
  column can be summed or scaled with a formula. Scrap and markups are percentages Excel knows
  as percentages.
- **Names and descriptions stay text.** A stock description of "1.50" comes back as "1.50",
  not as the number 1.5. A machine named "=something" is shown as typed and never runs as a
  formula.
- **An unedited file changes nothing.** Every tab imported as it was downloaded shows "no change"
  on every row. Change one hourly rate in Excel and the preview shows exactly that one change.

The file is made in the browser with no spreadsheet library: a few XML files zipped by hand. The
same card always gives the same bytes. How it was checked (private-monorepo PR #251,
jobshop-quote): 18 new unit tests cover the cell rules, the ZIP and every tab's round trip through
the app's own importers. The file was also opened by two other readers, Python's openpyxl and
LibreOffice. Both kept the number formats and showed the formula-looking name as text.

## Next

The next item on the flagship list (milestone 3) is reading tolerances, material and finish from
a PDF drawing. The extraction already handles the RFQ email and the drawing's text. On the CAD
side, the next steps are a time per thread size if one tapping time per
hole proves too coarse, a drill feed split by hole diameter if one feed per material proves too
coarse, holes from IGES cylinders, and finding holes in an STL mesh if shops send STL for machined
parts.

The product isn't live yet. Deploy and billing are on its roadmap, and the paid path stays
switched off until the owner sets it up.
