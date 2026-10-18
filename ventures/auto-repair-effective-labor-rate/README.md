# Effective Labor Rate Calculator

A free browser tool that shows an independent auto repair shop what it actually
collects for an hour of labor, where the rest of its posted rate went, and what
the door rate would have to be to fix it. Nothing is uploaded; the arithmetic
runs on the visitor's own device.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/auto-repair-effective-labor-rate/

```
cd ventures/auto-repair-effective-labor-rate && node --test
```

Open `index.html` in a browser to use it — there is no build step.

**Start from your repair orders.** Paste the month's labor lines (CSV, or cells copied from a spreadsheet) with columns for pay type, hours billed and labor sales; `ro-import.mjs` totals them into the customer-pay, warranty and internal boxes, and shows each technician's rate over sold hours. Lines it cannot classify are listed and left out, never guessed. Nothing is uploaded.

## Why it exists

Every shop has a posted door rate and almost none of them collects it. The rate
that reaches the bank — labor dollars divided by the labor hours they were
billed against — is routinely 15-30% lower, and the shortfall is invisible in
every report a shop already runs.

That invisibility is structural rather than careless. A management system
reports labor sales, and it reports labor hours, and in a busy month both go up.
Dividing one by the other is the only operation that shows the rate falling, and
nothing on an estimate, a repair order or a daily summary performs it. Meanwhile
the gap arrives in pieces that never look like a discount at the moment they
happen: a coupon, a fleet account on a standing rate, a diagnostic hour waived
to win the job, book time trimmed at the counter, and a warranty claim paid at a
rate somebody else sets.

So the shop knows it is busy, knows the sign says $165, and cannot say why the
year came out the way it did.

## What it does that a division would not

Dividing labor sales by hours is one line of arithmetic. The reason this is a
page rather than a note is the three things that come after it.

**It splits the gap into causes that are separately fixable.** Customer-pay
discounting is a pricing and counter-process problem; warranty shortfall is a
mix problem whose only lever is how much of that work the shop accepts; and
internal hours are a quality and capacity problem. They have nothing in common
except the direction they push the rate, so a shop reading only the total goes
after whichever is most visible rather than whichever is largest.

**It keeps comebacks out of the headline and prices them anyway.** The industry
measures the effective rate over hours that were *sold*, which is what a shop
can reconcile against its own reports in a minute — so that is the headline
here. Comebacks, policy work and shop vehicles were never sold at all, so they
appear beside it two ways: as a rate over every hour the technicians turned, and
priced at the door rate as capacity the month did not earn. Folding them into
the headline would produce a truer number nobody could check, and a figure
nobody can check is a figure nobody acts on.

**It says what the posted rate would have to be, not what the effective rate
would have to be.** This is the output the venture exists for. A shop realizing
84% of its door rate and needing $175.34 an hour to hit 70% labor gross profit
does not need a $175 door rate — it needs about $208, because the coupons, the
fleet agreements and the warranty mix do not go away when the sign changes. The
naive answer is the single most common reason a rate rise lands short of what it
was meant to fix, and no free tool computes the corrected one.

## Design decisions worth knowing

Each of these is argued at length in `calc.mjs`'s header; the short form:

- **The headline rate is over sold hours**, because that is the definition a
  shop can check against its management system.
- **Internal hours are forgone capacity, not a discount.** Their payroll cost is
  already inside cost per billed hour, so adding them to the billing gap would
  count the same problem twice.
- **Overhead carried by labor is `max(0, overhead - parts gross profit)`.** No
  allocation percentage between the parts and labor departments is invented —
  that number is always a guess — and both inputs are lines on a profit-and-loss
  statement.
- **Efficiency and cost per billed hour are reported together**, because a shop
  can lift its rate and lose the gain to a drop in efficiency without either
  number looking wrong on its own.

## Privacy

There is deliberately **no shareable link**, and no URL encoding of any input.
Every other calculator in this portfolio that holds job-shaped figures offers
one; this one holds a month of a business's labor sales, payroll and fixed
expenses, which is more than should ever ride in a URL that a proxy might log or
an owner might paste into a chat app. `page.test.mjs` asserts the absence.

Saving a month writes the twelve figures to this browser's own local storage so
an owner is not retyping them next month. Usage counting is anonymous, aggregate,
local, opt-out, and honours Do Not Track and Global Privacy Control; it records
which features were used and the day, never a number from anybody's month.

## Files

| file | what it is |
|---|---|
| `calc.mjs` | the arithmetic, and the reasoning behind each choice |
| `index.html` | the tool — one page, no build step, no dependencies |
| `what-is-my-effective-labor-rate.html` | the search-facing explanation, with the same worked example |
| `usage.mjs` | anonymous local feature counting |
| `*.test.mjs` | 50 assertions across the arithmetic, the page and the counter |

## What it is not

Not an accounting, tax, legal, insurance or employment opinion. It makes no
determination about how any figure should be recorded or how any technician
should be paid or classified, and it does not tell anybody what to charge or
what work to accept — it has no way to know a shop's market, competition or
contracts. It says what the month that was entered actually did.
