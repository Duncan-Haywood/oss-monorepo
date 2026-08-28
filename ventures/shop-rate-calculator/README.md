# Shop Rate Calculator

A free browser tool that works out what one crew hour actually costs a trade
contractor, and what it has to be sold at. Nothing is uploaded; the arithmetic
runs on the visitor's own device.

```
cd ventures/shop-rate-calculator && node --test "*.test.mjs"
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

Every trade bid calculator in this repository asks for four numbers about the
contractor's *business* rather than about the job: crew hourly wage, payroll
burden %, overhead on direct cost %, and target net margin %.
`platform/pages/rates.mjs` carries those four between tools so they are typed
once, across 100+ calculators.

Nothing computed them. A contractor arriving at any of those pages supplied a
burden rate and an overhead rate from memory, and the two answers most people
reach for — "about 20%" for burden and "10%" for overhead — are, for a small
trade shop, wrong by enough to turn a bid that looks profitable into one that is
not. Every downstream calculator inherits that error, in the same direction,
on every job.

This is the upstream tool. It is the only page on the site that *produces* the
shop rates rather than consuming them, and it writes them straight into the key
the rest of the site reads.

## The two numbers it gets right

**Payroll burden, per billable hour.** The textbook burden — employer taxes,
workers' comp and liability as a percentage of wages — is around 20% and does
not account for the paid hours that are never billed. A field employee is paid
for 2,080 hours a year; holidays and vacation come off that, and of the hours
actually worked, drive time, loading, estimating, shop time and warranty
callbacks are on nobody's invoice. The bid calculators multiply a loaded wage by
the hours *estimated for a job*, which are billable hours, so the rate they want
is the one that recovers a person's whole annual cost across only the hours that
get sold. On the shipped example a $28 wage becomes $53.76 per billable hour: a
**92% burden**, not 20%.

**Overhead, as a percentage of direct cost.** A profit-and-loss statement
expresses overhead over revenue; bidding arithmetic — including
`SHOP_RATE_FIELDS`, which says so explicitly — applies it to a job's direct
cost. They are different numbers for the same business, and using the smaller
where the larger is wanted under-recovers overhead on every job. The denominator
here is annual direct cost: loaded field labour plus materials and subs.

The headline is then cost, plus overhead, divided by one minus the target
margin — `$65.18` break-even, `$74.07` at a 12% margin, on the shipped example.

The tool also names which input is doing the damage. In this arithmetic the
sensitive number is the **billable share**: ten points of utilization moves the
required rate further than the entire target margin does. That is the argument
for measuring it, and it is why the notes call it out below 60%.

## The contract with `platform/pages/rates.mjs`

`shop-rates.mjs` writes `portfolio-shop-rates`, the one `localStorage` key on
this origin that every trade bid calculator's injected bar reads.

The two files cannot import each other at the point where it matters: the
platform module runs at build time in Node and injects a string of script, while
this one is fetched by the browser from the published venture directory. So the
contract is duplicated — and a duplicated contract that drifts is a failure this
repository has already paid for once.

The guard is `shop-rates.test.mjs`, which **reads `platform/pages/rates.mjs` as
text** and fails if the storage key, the four field ids, or their ceilings stop
matching. Without it, a rename there would show up in production as a set of
rates that saves successfully and silently never appears on any calculator.

Three rules the writer keeps, each matching the consuming side:

- **It merges.** A field saved by another tool is not wiped by a write here.
- **It never clamps.** A computed rate above the ceiling the calculators accept
  (500% burden, 500% overhead) is reported to the contractor and refused, not
  quietly reduced to a number this page never computed.
- **It never writes a rate that is not on screen.** Editing any field discards
  the last result, so the carry button cannot save a rate the current inputs no
  longer produce.

Because this page produces the four rather than consuming them, it is listed in
`RATE_SOURCE_SLUGS` in `platform/pages/rates.mjs` and does not receive the
injected bar. Its own panel is the fuller control: the bar could only have
offered a partial save of the two fields that happen to be inputs here.

## Privacy and disclaimers

The page holds more of a business's cost structure than any other tool on the
site — wages, workers' comp, benefits, owner pay. None of it leaves the device.
There is deliberately **no share link and no saved bid** here: both exist to move
figures between people or pages, and a shop's payroll is not something to encode
into a URL that gets pasted into a chat app. `page.test.mjs` asserts the script
reads neither.

Usage counts are anonymous local tallies of which features were used
(`rate_calculated`, `rates_carried`, `rates_forgotten`) in `shop-rate-usage`,
silent under Do Not Track, Global Privacy Control, and the page's own opt-out.
`rates_carried / rate_calculated` is the reading that matters: whether working
out a rate actually changes how the next bid is priced.

The disclaimer covers what this tool looks like it is doing beyond arithmetic —
it is not tax, accounting, insurance, or legal advice, and it makes no
determination about how anybody should be classified or paid.

## Files

| File | What it is |
|---|---|
| `calc.mjs` | The arithmetic. Pure, no DOM. |
| `shop-rates.mjs` | The writer for `portfolio-shop-rates`, and the contract with the platform. |
| `usage.mjs` | Anonymous, device-local event counts. |
| `index.html` | The calculator. |
| `what-should-i-charge-per-hour.html` | The search-intent page, with the worked example and an `FAQPage` node. |
