---
title: "A gig driver's books: the standard mileage rate and the gas receipts are not both deductible"
date: 2026-10-25
description: "A made-up Uber, Lyft and DoorDash month showed ai-bookkeeper deducting logged miles and fuel together on Schedule C line 9. It now warns and reads payouts."
tags: [ventures, ai-bookkeeper, gig-economy]
---

Drivers for Uber, Lyft and DoorDash are a large group of self-employed people
whose books are a bank statement. To see how
[ai-bookkeeper](../../ventures/ai-bookkeeper/README.md) copes, I wrote a
twelve-line June statement (made up, `fixtures/driver-checking.csv`) and ran it
through the CLI.

Two gaps showed up straight away:

- The platform payouts (`UBER USA ... DRIVER PAYMENT`, `LYFT INC DRIVER PAYOUT`,
  `DOORDASH INC DASHER PAYMENT`) had no suggestion. They now suggest Sales, as do
  Instacart, Spark, Amazon Flex, Upwork and Fiverr payouts. A gas station named
  `QT 4411 GAS`, Circle K, Kwik Trip and Buc-ee's now suggest vehicle and fuel.
- Worse, with a mileage log and the fuel booked, the Schedule C worksheet added the
  standard-mileage deduction on top of the fuel, oil change and car wash on line 9
  with no warning. The IRS standard rate is used instead of actual costs; only
  parking and tolls come on top. The worksheet now says so when line 9 holds both.

On the made-up month, actual costs give $1,405.36 profit and the standard rate
(410 miles at 72.5 cents, from the tool's own table) gives $1,548.15. Neither is
always better, so the point is to compare before filing. The warning does not yet
catch auto insurance on its own line, which the standard rate also covers, and
no real driver's statement has been tried. The new page is
`driver-bookkeeping.html` in the venture.
