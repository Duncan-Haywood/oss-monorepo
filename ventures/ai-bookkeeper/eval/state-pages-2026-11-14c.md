# Michigan and Virginia vendor discounts, read on the states' own pages, 2026-11-14 (third batch)

Until this run `stateDiscounts("MI")` and `stateDiscounts("VA")` returned nothing and the worksheet
only explained why: Michigan's rule is a greater-of with limits that the old discount shapes could not
express, and for Virginia only the statute (Code 58.1-622, which prints 4% / 3% / 2% "of the first three
percent of the tax") had been read, not the rates the Department actually applies. michigan.gov,
legislature.mi.gov, law.lis.virginia.gov and tax.virginia.gov all answered from the cloud session today.
Each document was fetched, converted to text (`pdftotext`) in the session's scratch directory, and the
sentences below were copied from that text. Nothing was saved in the repository.

## Michigan

Sources:

- MCL 205.54, legislature.mi.gov (`Laws/MCL?objectName=mcl-205-54`).
- 2026 Form 5080, Sales, Use and Withholding Taxes Monthly/Quarterly Return, and its instructions
  (5080 Rev. 12-25), linked from michigan.gov "2026 Sales and Use Tax Forms"
  (`/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2026/5080.pdf`).
- 2026 Form 5081, the annual return, and its instructions (Rev. 04-25), same page.

The statute: "a taxpayer not subject to section 6(2) may deduct the amount provided by subdivision (a)
or (b), whichever is greater: (a) If the tax ... is remitted ... on or before the twelfth day ..., 0.75%
of the tax due at a rate of 4% ..., but not to exceed $20,000.00 of the tax due for that month. If ...
after the twelfth day and on or before the twentieth day ..., 0.50% of the tax due at a rate of 4% ...,
but not to exceed $15,000.00 of the tax due for that month. (b) The tax at a rate of 4% due on $150.00
of taxable gross proceeds for the preceding monthly period". (2): accelerated filers "may deduct from
the amount of the tax paid 0.50% of the tax due at a rate of 4%." (4): for periods longer than a month,
"a deduction ... that is equivalent to the deduction allowed under subsection (1) or (2) for monthly
periods."

The 2026 Form 5080 instructions, line 5: "Discounts apply only to 2/3 (0.6667) of the sales and/or use
tax collected at the 6 percent tax rate."

- Monthly filer: "If the tax is less than $9, calculate the discount by multiplying the tax by 2/3
  (.6667)." "If tax is $9 to $1,200 and paid by the 12th, or $9 to $1,800 and paid by the 20th, then
  enter $6." "If the tax is more than $1,200 and paid by the 12th ... (Tax x .6667 x .0075). The maximum
  discount is $20,000 for the tax period." "If the tax is more than $1,800 and paid by the 20th ...
  (Tax x .6667 x .005). The maximum discount is $15,000 for the tax period."
- Quarterly filer: the same with $27, $3,600, $5,400 and "$18".
- Accelerated filer: "If the tax is paid by the 20th ... (Tax x .6667 x .005). No maximum discount
  applies."
- Form 5081 line 10, annual filers: "Enter $72 if the tax due on line 9 is $108 or more. If tax due is
  less than $108, calculate the discount by multiplying line 9 by 2/3 (0.6667)."

One difference between the two texts: the statute caps the deduction at a percentage of "$20,000.00 of
the tax due" (which would make the largest discount $150 or $75), while the Department's form says "The
maximum discount is $15,000 for the tax period". The preset follows the form, which is what a filer
fills in; the difference only matters above about $4.5 million of tax a month.

What `stateDiscounts("MI", freq)` now returns, applied to the "MI state" line:

| Frequency | Rule | Shape |
|---|---|---|
| monthly, quarterly, semiannual | greater of tax x .6667 x .005 (at most $15,000 a period) and $6 a month of the period, the floor never above 2/3 of the tax | `{ rate: 0.0033335, cap: 1500000, floorPerMonth: 600, floorShare: 0.6667 }` |
| annual | $72, or 2/3 of the tax when that is less | `{ rate: 0, floorPerMonth: 600, floorShare: 0.6667 }` |

The form's breakpoints fall out of the greater-of: $1,800 x .6667 x .005 = $6.00, and $9 x 2/3 = $6.
Payment by the 12th (0.75%, $20,000) and accelerated filers (no maximum) are not applied; the note says so.

## Virginia

Sources:

- Code of Virginia 58.1-622, law.lis.virginia.gov (the statute's 4% / 3% / 2% "of the first three
  percent of the tax", monthly taxable sales bands $0 to $62,500, $62,501 to $208,000, $208,001 and up).
- Form ST-1, Virginia Retail Sales and Use Tax Return, "For Periods Beginning On and After 04/01/2025",
  instructions Rev. 09/26 (`tax.virginia.gov/sites/default/files/taxforms/sales-use-tax/any/st-1-any.pdf`;
  found through the Department's form search, the old ST-9 links return 404).

The ST-1 instructions, Line 18:

- Eligibility: "Businesses that have a tax account starting with '14' are not eligible for the dealer
  discount." "Businesses with an average monthly sales tax liability that exceeds $20,000 are not
  eligible for the discount", notified in May for periods beginning July 1.
- "The dealer discount applies only to state sales and use taxes. The dealer discount does not apply
  to the portion of the sales and use taxes distributed to the Localities or to designated regional and
  other districts."
- "For tax returns filed for return filing periods beginning on or after January 1, 2025: Use taxable
  sales on Form ST-1 Line 5 to determine your dealer discount rate. If you have multiple business
  locations in Virginia and file more than one return ..., use the total of taxable sales from all of
  your returns. If you file on a quarterly basis, divide the taxable sales by 3 to determine monthly
  taxable sales."
- Rate table: at least $0 but less than $62,501, .01116; $62,501 to less than $208,001, .00837;
  $208,001 and up, .00558.
- "1. Multiply Line 5 by 0.043", "2. Enter your rate", "3. Multiply Line 1 by Line 2". "You must file
  timely and pay timely to claim a Dealer Discount."
- Line 5 is "Total Taxable General Sales"; food and personal hygiene items (Line 13) are taxed at the
  local 1% only, so they earn no discount.

So the discount the form computes is 1.116%, 0.837% or 0.558% of the tax at the 4.3% state rate, not
the statute's 4% / 3% / 2% of the first 3%; the form does not say where the difference comes from, and
it was not looked up further. The earlier `DISCOUNT_NOTES.VA` was right not to apply the statute's
numbers.

What `stateDiscounts("VA")` now returns, applied to the "VA state" line:
`{ rate: 0, onSales: 0.043, bands: [{ belowMonthlySales: 6250100, rate: 0.01116 }, { belowMonthlySales: 20800100, rate: 0.00837 }, { rate: 0.00558 }] }`.
The discount is figured on the line's taxable sales, not its tax, so it is the same whether the
business books the combined 5.3% (or 6%, 7%) under "VA state" or splits state and local.

## Pinned

`salestaxreturn.test.mjs`, "MI discount: ..." (8 hand-worked figures across monthly, quarterly and
annual, including the $15,000 cap) and "VA dealer discount: ..." (6 figures: each band, the $62,500
edge, and a quarter divided by 3 against the same sales in one month).

## Still not read

Indiana's collection allowance needs the prior July-June liability, which the books may not hold;
Oklahoma and New Mexico print no vendor discount line. New Jersey, Maryland and Indiana's due day are
as `state-pages-2026-11-14b.md` left them.
