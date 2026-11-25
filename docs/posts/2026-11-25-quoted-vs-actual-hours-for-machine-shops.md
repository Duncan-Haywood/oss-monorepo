---
title: "Quoted vs actual hours: your finished jobs already know how far off your quotes are"
seo_title: "Estimated vs actual hours for machine shops: free quote calibration"
date: 2026-11-25
tags: [for-customers, jobshop-quote, machine-shop-guides, cnc, quoting, job-costing]
description: "Paste your job history and see, per machine, how far quoted setup hours and cycle times ran from actuals, what that cost, and the factor for the next quote."
---

Every machine shop quote is a guess at two numbers: how long the setup will take and how long each part will sit in the machine. Most job-shop ERPs then record what actually happened, in a report usually called estimate vs actual, job costing or variance. That report is rarely read back into the next quote. If setups on one mill run long every time, the quotes for that mill are wrong in the same direction every time.

The new **[quoted vs actual hours](https://marisstella.app/machine-shop-guides/quote-vs-actual.html)** page reads that history. Paste a CSV, or open the export, with one row per job: quoted and actual setup hours, quoted and actual cycle minutes per part, and if you have them the machine, the quantity and whether the quote was won or lost. Column names are matched loosely (`Est Setup (min)`, `Actual Cycle Time (hrs)` and `Work Center` all work), and the page tells you which column it read as what before you trust the answer. Nothing is uploaded.

## What it tells you, per machine

- **Median actual ÷ quoted.** 1.25 means the typical setup took a quarter longer than quoted. This is the median, not the average, so one scrapped-and-rerun job does not drag every future quote up. Those jobs are listed separately as "worth a look".
- **The middle half.** The 25th to 75th percentile of the ratios. If that range is narrow, the estimates are consistently off and one factor fixes most of it. If it is wide, the estimates are scattered, and it is better to find what the slow jobs had in common.
- **Hours missed.** Actual minus quoted, with cycle time multiplied by quantity so a 200-piece run counts for more than a one-off. Enter your shop rate and it becomes dollars.
- **Win rate**, counting quotes that never became jobs. A machine that runs over its quotes and wins nearly every job is probably priced low.
- **A factor** for the next quote, offered once a group has 5 jobs and labelled "rough" below 15. One link carries it into the [job-shop quote calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html), which now has setup and cycle-time factor fields that scale your raw estimate before it is priced.

## An invented example

The page's example button loads 14 invented rows for two machines, a vertical mill and a lathe. On the mill, setups ran a median of 1.25 times the quote and every job's cycle time ran over, by a median of 10%. On the lathe, the quotes were slightly generous. Added together, the 11 finished jobs took 5.7 more hours than were quoted, about $542 at an example rate of $95 an hour. One mill setup took 2.25 times its quote. One factor across both machines would have hidden both of these things, which is why the page splits the results by machine. These numbers are made up to show the method, not to say what shops in general do; the page ships no benchmark.

## Why it's built like this

The numbers that matter are the ones in your own history. A generic cycle-time table cannot know your fixtures, your operators or your customers' tolerances. So the page has no built-in rates, and the tests fail if a dollar figure appears in its text outside the invented example. The method is short enough to check by hand. It lives in `calibrate.mjs` in the [source](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/machine-shop-guides), and its tests work the medians, quartiles and quantity-weighted hours out by hand.

## Then send the quote

A price is not a quote until the buyer has it. The [job-shop quote calculator](https://marisstella.app/machine-shop-guides/job-shop-quote-calculator.html) now ends with a **customer quote** section. You add your shop's details, the customer, their RFQ reference, the part number and revision, material and finish, lead time, how long the price holds, and your payment and shipping terms. It then writes the quote: price each and extended price at every quantity break, as a standalone HTML file to print to PDF, or as plain text to paste into your reply.

A few things are deliberate:

- **Your cost lines stay off it.** Material, setup, machining and markup are your numbers, not the buyer's. The tests fail if any of them show up in the document.
- **Price each is rounded up to the cent**, and the extended price is that price times the quantity. A buyer who checks the arithmetic gets the same total you did, and the quote never comes in below the calculated price.
- **It names the revision.** A quote that doesn't say which drawing revision it priced can end up being held to a later one. Before you send, a check lists anything a buyer would send back: no revision, no validity period, no lead time, no material, or a larger lot that costs less in total than a smaller one (a buyer will order the bigger lot).
- **Customer details stay put.** Nothing is uploaded. If you tick the box, your shop's name, contact details and standard terms are kept in your browser for the next quote. Customer and part details never are.

## Which kinds of job you win

A shop-wide win rate hides the useful part. Winning 40% overall can mean winning most milled brackets and almost no weldments. If so, the weldment rates are probably too high, or those buyers are shopping on price. The question to ask your history is which kinds of job you win, not just how often.

The RFQ-to-quote assistant described below (in development) now answers that from your own records. If you save routings, the named operation lists you reuse for a family of parts, its win/loss page shows the win rate for each routing and each part family. The rules are simple enough to check by hand:

- **A quote counts once per routing it used**, however many of its lines used it. A line counts as using a routing when it has that routing's operations in the same order, on the same machines, with the same operation labels. Editing a cycle time after applying a routing still counts.
- **Lines that match no saved routing get their own row**, so jobs quoted from scratch don't vanish from the totals.
- **Expired quotes are shown but not counted** in the rate, and a row with fewer than five decided quotes is marked "few". A 100% win rate on two quotes is noise.
- **The CSV export names the routings** on each quote, so you can make the same pivot table in a spreadsheet and check the page against it.

Routings are matched as they are saved today. If you change a routing's operations, older lines that used the old version stop matching it.

## Where this is going

The RFQ-to-quote assistant we are building for small CNC and fabrication shops (in development, early access on the [manufacturing page](https://marisstella.app/industries/manufacturing/)) is meant to do this comparison every time a job closes. That way the next quote starts from how your shop actually runs, not from how it ran when the rates were last set. This free page is the manual version of that step.

*Not engineering, financial or legal advice. Check what it says against your own records before you change a price.*
