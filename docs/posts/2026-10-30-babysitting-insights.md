---
title: "The babysitting family that pays $34.50 an hour and earns you $15.40"
date: 2026-10-30
tags: [babysitting-business-kit, small-business, self-employed, pricing]
description: "A new Insights tab counts drive time, mileage and minimum-hour padding per family, plans a rate raise with notice messages, and prints an income letter."
---

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now has an **Insights** tab. It answers questions a sitter's own records already hold, without anyone having to build a spreadsheet.

**Per real hour, not per hour at the house.** Take two families from the test fixture. Both use a $20 rate card, $3 for each extra child and a 3-hour minimum. The near family books a 4-hour sit with one child, 10 minutes' drive round trip and 2 miles. That earns $80, or $20.00 an hour at the house. Subtract the car (2 miles at the IRS rate of 76 cents) and add the drive to the hours, and the sitter keeps **$18.84** an hour. The far family books 2 hours with two children. The minimum turns that into 3 billed hours at $23, so $69, which looks like **$34.50** an hour at the house. But it is a 60-minute, 30-mile round trip. Subtract the $22.80 the car costs and count the drive, and it pays **$15.40** an hour. The tab ranks families this way. It also points out when driving is a quarter or more of a family's hours, and how much the minimum-hours rule added (here, 1 billed hour, $23). Drive time comes from what the sitter types for each family. If they leave it blank, the tab estimates it from miles at a speed they set, and the screen says which sits were estimated.

**Where the week has room.** Weekday and season totals show when the money comes in. A capacity view compares booked hours with the weekly availability in Settings, for the last 8 weeks and the next 4. The invented example desk offers 50.5 hours a week and books about 1 of them, so most of the week is still open.

**A rate raise, with the arithmetic and the message.** The sitter types a new rate and a start date. For each family, the tab works out the change per month from that family's billed hours over the last 90 days. On the example desk, going from $20 to $22 on January 4, 2027 adds $6.43 a month from one family and $2.03 from the other: $101.52 a year if both keep booking the same way. It drafts a kind message to each family that names their children, gives the date and the monthly difference, and says that sits already booked keep the old rate. It never suggests a "market rate". If they want a comparison, they type their own figure and where it came from.

**An income letter a landlord can read.** Lenders and landlords ask self-employed people for proof of income. The letter totals the sitter's recorded payments month by month from January 1, adds a monthly average that counts a part month as part of a month, and leaves a line for their signature. If they want, it also shows net income after their recorded expenses and mileage. It says plainly that it is a self-prepared summary and not a tax return, a tax form or an IRS document.

**Year over year.** Once two years of sits or payments are on the desk, the tab compares this year so far with the same stretch of last year, month by month. It also compares sits, hours, families and pay per real hour.

All of it is in `insights.mjs`: pure functions with 11 tests that check the numbers above by hand. Like the rest of the kit, it runs in the browser and nothing is uploaded.
