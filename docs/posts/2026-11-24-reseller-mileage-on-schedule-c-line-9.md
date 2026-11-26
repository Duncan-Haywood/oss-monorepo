---
title: "Sourcing runs are a business expense: putting a reseller's mileage on Schedule C line 9"
seo_title: "Reseller mileage on Schedule C line 9: the 2026 rate change"
date: 2026-11-24
tags: [resellers, mileage, bookkeeping, schedule-c, reseller-books, for-customers]
updated: 2026-11-26
description: "Thrift runs go on Schedule C line 9, and the IRS rate changed mid-year in 2022 and 2026, so trips are priced by date. Both Reseller Books tools now do it."
---

A reseller's marketplace reports carry sales, fees, postage and ads. They do
not carry the drive to the Goodwill outlet, the estate sale across town or the
three trips a week to the post office. For many resellers those miles are one
of the largest expenses after the goods themselves, and they sit in a notes app
or a spreadsheet that never meets the rest of the books.

[Reseller Books](../../ventures/reseller-books/) now reads that log beside the
eBay, Etsy, Poshmark, Mercari, Whatnot and Shopify files, and puts the result
where a preparer looks for it: Schedule C line 9, car and truck expenses.

## The rate changed in the middle of 2026

The standard mileage rate is not one number for the year this time. The
figures, as the repository's [mileage log](../../ventures/mileage-log/) records
them after checking irs.gov on 2026-09-29:

| Trips dated | Business rate | Source |
|---|---|---|
| 2025 | 70¢ a mile | Notice 2025-5 |
| 2026-01-01 to 2026-06-30 | 72.5¢ | Notice 2026-10 |
| From 2026-07-01 | 76¢ | Announcement 2026-11 |

So a year's miles times one rate is wrong for 2026. A hundred miles on
June 30 is worth $72.50 and a hundred on July 1 is worth $76.00; the tool
prices each trip at the rate for its own date, and a test pins exactly that
pair. Business tolls and parking are added on top, as the Schedule C
instructions for line 9 allow with the standard rate.

## What it reads, and what it refuses to guess

- **Any trip log CSV** with a date column and a miles column (or odometer
  start and end), including the Mileage Log venture's own export. Dates in
  `2026-03-04` or `3/4/2026` form both work.
- **No category column means a business log.** That is what a reseller keeps
  one for. With a category column, only rows marked business (or sourcing,
  shipping, post office, work) are deducted; commuting is counted for Part IV
  and never deducted, and anything blank or unrecognised is treated as
  personal, so nothing is deducted by accident.
- **Overlapping downloads count a trip once.** If two files share a row, it
  counts once. Two identical rows in the same file (two post office runs on
  the same day, same distance) both count, because that is what a real log
  looks like.
- **Trips the rate table cannot price are not priced.** A trip before 2025 is
  left out with a note. A trip after 2026 is priced at the last known rate and
  flagged, because the 2027 rate is not published yet.
- **Trips without a destination or purpose are counted and flagged.** A
  mileage log is expected to show where and why for each business trip.

The mileage stays out of the marketplace reconciliation (sales + refunds +
deductions = net payout still holds month by month), because it is not money a
marketplace moved. It appears as its own worksheet row, a Part IV row with
business, commuting and other miles, a monthly section in the CSV, and, when
every sale has a cost, a "profit after the car" figure.

## What it does not do

It does not compare the standard rate with actual car costs (the
[method comparison](../../ventures/mileage-deduction-method-calculator/) does),
and it does not decide whether the standard rate is open to you: it generally
has to be chosen in the first year the car is used for business, and the row
says so. It is arithmetic on your files, not tax advice.

This is the third milestone of Seller Books, a hosted product being built for
multi-marketplace resellers that this free page is the engine of: one ledger,
cost of goods, mileage, then a Schedule C line-mapped export.

## Update, 2026-11-26: trips from MileIQ, Stride or Everlance

Most resellers who log miles at all let a phone app do it: MileIQ, Stride,
Everlance, TripLog or Driversnote notice each drive and ask afterwards whether
it was business. Typing those drives into a second log is the step that gets
skipped, and line 9 comes up short. So the hosted Seller Books now reads the
app's own CSV export on its Mileage page:

- **Only business drives are offered.** A drive the app marks personal,
  commuting, charity or medical is left out, and so is one never classified,
  each with the reason on the page. Charity and medical miles are real
  deductions, but on Schedule A, not C. Everlance puts "Work" or "Personal" in
  a column called Purpose; that is read as the classification, and the trip's
  notes become the purpose.
- **Every trip needs a purpose before it is saved.** Trackers often export
  none. The page fills in what the file has, and one box fills the rest
  ("Sourcing: Goodwill Main St"), because a log without the why is the weak
  point in an audit.
- **Kilometres are converted.** A km column, or a Unit column saying km,
  becomes miles at 1.609344 km to the mile.
- **Importing the same month twice adds nothing.** A trip with the same date,
  miles and route is marked as already in the log. Two identical post office
  runs on one day still count as two.

What it rests on: none of these apps publishes its CSV header row on a page
we could reach, so the reader matches columns by name, accepts several
spellings for each field, and shows on the page which of your columns it read
for each one. A file it cannot place is refused with the column names it
expected, never guessed at. Seller Books is in early access and not yet open
for sign-up.


## Update, 2026-11-26: the hosted books price every trip by its date too

The free page above priced trips by date from the start. The hosted Seller
Books did not: its Schedule C page asked for one rate and multiplied the
year's miles by it, and left line 9 blank until you typed something in. An
independent quality audit of the app the same day singled that out as the
one mileage gap a preparer would hit, and the product's own marketing page
already promised the per-date rate. Now the app does what the page says:

- **Each trip takes the IRS business rate in force on the day it was
  driven.** The table runs from 2019 and was read directly from
  [irs.gov's standard mileage rates page](https://www.irs.gov/tax-professionals/standard-mileage-rates)
  on 2026-11-26, which lists both mid-year changes:

  | Trips dated | Business rate | IRS release |
  |---|---|---|
  | 2022-01-01 to 2022-06-30 | 58.5¢ | IR-2021-251 |
  | 2022-07-01 to 2022-12-31 | 62.5¢ | IR-2022-124 |
  | 2023 | 65.5¢ | IR-2022-234 |
  | 2024 | 67¢ | IR-2023-239 |
  | 2025 | 70¢ | IR-2024-312 |
  | 2026-01-01 to 2026-06-30 | 72.5¢ | IR-2025-128 |
  | 2026-07-01 to 2026-12-31 | 76¢ | IR-2026-29 |

  The 2026 figures match the ones in the table above; the IRS page names
  its news releases rather than the notice and announcement.
- **Line 9 shows its working.** Its note reads, for example, "25 mi at
  72.5¢ (IRS 2026-01-01 to 2026-06-30, IR-2025-128); 100 mi at 76¢ (IRS
  2026-07-01 to 2026-12-31, IR-2026-29)", and the total is rounded once, so
  25 miles in May and 100 in August come to $94.13, where the year's
  January rate alone would give $90.63.
- **The mileage log download agrees to the cent.** Each trip row now carries
  its rate and amount, and the total row is line 9. The quarterly
  estimated-tax page reads the same rule, so a period that ends on May 31
  counts only the spring miles, at the spring rate.
- **A year the IRS has not priced yet is not guessed.** Here the hosted app
  differs from the free page: a 2027 trip is left out of line 9, with a
  warning naming its miles and dates, until the 2027 rate is added or you
  type a rate in. A blank on a worksheet is easier to catch than a figure
  that looks finished.
- **Your own rate still wins.** Type one in and every trip uses it, which is
  the right choice if your preparer tells you to.

It still assumes you use the standard mileage rate for that car rather than
actual expenses, which is generally fixed by the choice made in the first
year the car is used for business. It is your own records arranged by line,
not tax advice.
