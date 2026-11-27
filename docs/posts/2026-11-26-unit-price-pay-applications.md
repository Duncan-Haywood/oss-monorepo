---
title: "Unit-price pay applications: billing by quantity installed, to the cent"
seo_title: "Unit price pay application: billing quantities on a schedule of values"
date: 2026-11-26
tags: [payapps, for-customers, construction, schedule-of-values, unit-price, gcpay, invoicing]
description: "Billing a unit-price subcontract each month: quantity × unit price per line, rounding, quantities to date, change orders and GCPay's unit-price SOV."
---

*Written by an AI agent working in this repository.*

Most pay-application software assumes a lump-sum subcontract: each schedule-of-values line has a
dollar value and each month you bill a dollar amount or a percent of it. Site work, paving, utility,
concrete and landscaping subcontracts are often written the other way. The line says **3,400 LF of
concrete curb at $18.25/LF** and you are paid for what you put in the ground: 600 LF in March, 500
LF in April. The general contractor's form or portal wants the quantity, and your office wants the
dollars to come out the same every time.

## The arithmetic, and where it slips

Each month, for each unit-price line:

- **This period** = quantity installed this period × unit price.
- **Completed to date** = the sum of every period's dollars, and the quantity to date is the sum of
  every period's quantity.
- **Scheduled value** = contract quantity × unit price. It should equal the line's value in your
  subcontract to the cent; if it does not, the quantity or the price was copied wrong.

Two things go wrong in spreadsheets:

1. **Rounding.** 12.5 LF at $18.25 is $228.125. Rounded each month, then added, the dollars can
   drift a cent or two from the quantity to date × price. Pick one rule (round each period half
   away from zero) and never let a person type over the computed dollars.
2. **Mixed entries.** Someone bills one month in dollars ("$10,000 on curb") because the field
   quantity was not in yet. From then on the quantity to date is a guess. Either record the
   quantity, or mark the to-date figure as approximate.

## Change orders on a unit-price line

A change order on a unit-price job usually adds quantity (another 400 LF at the same price) or adds
a new item at a new price. Either way the GC's form tends to carry it as dollars on the change
order. Keep the unit price on the new line so you can bill it by quantity like the others.

## GCPay's unit-price schedule of values

GCPay's subcontractor guide says a unit-price schedule of values has five columns: **Item Number,
Description, Units, Unit Description, Unit Value** (against three for a lump-sum one). The guide
names them without defining them; the natural reading is contract quantity, unit, and price per
unit. Check against the GC's own template before you upload. The rest of the upload rules (Excel
only, values add up to the GC's contract amount, base contract only) are in
[the Procore, Textura and GCPay guide](2026-11-25-procore-subcontractor-sov-csv-template.md).

## Doing it in PayApps

PayApps added unit-price lines on 2026-11-26:

- On the job page, a line takes a contract quantity, a unit (CY, LF, TON, or any short text) and a
  unit price (up to six decimals, for $0.875/LF). The scheduled value is computed from them, and a
  line whose quantity × price does not match its value is refused with both figures shown.
- On each pay application a unit-price line has a quantity box instead of a dollar box. The dollars
  are always quantity × unit price, rounded half away from zero to the cent, and the server refuses
  an entry where they differ, so nobody can type over them.
- The quantity this period and to date are on the screen, in the continuation CSV (five columns
  after the standard ones) and on the PDF continuation sheet. Work billed in dollars before a line
  had a price, or carried in from an earlier system as an opening balance, is converted back at the
  price and marked "about".
- The unit price and contract quantity lock once a pay application is submitted, like the rest of
  the original schedule of values.
- The GCPay panel downloads the five-column unit-price workbook, with lump-sum lines as 1 LS.

Not yet: quantities read from an imported SOV spreadsheet, a change order that adds quantity rather
than dollars, and stored materials by quantity. These come if contractors ask for them.

PayApps is open: unit-price pay applications, retainage and change orders are free on one active
job, with no card ([start free](https://marisstella.app/industries/construction/)). Lien waivers and QuickBooks are on the paid plans, which
are not on sale yet. Not affiliated with GCPay. Its forms are not
AIA documents. This is general information, not legal or accounting advice.
