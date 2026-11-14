# Maryland, Utah and Colorado vendor discounts, read on the legislatures' own pages, 2026-11-14 (fourth batch)

The flagship's open item (8) listed IN, MD, NJ, UT, AR, RI, CO, ME and MA as states whose pages had refused
the session's proxy. Probed again from the cloud session on 2026-11-14: tax.utah.gov, dfa.arkansas.gov,
tax.ri.gov, tax.colorado.gov, maine.gov/revenue and mass.gov still answered 403, and law.justia.com 403.
These answered 200: in.gov, nj.gov (the old sales tax overview URL is now a 404), marylandtaxes.gov
(a redirect to a script shell), mgaleg.maryland.gov, le.utah.gov, leg.colorado.gov, legislature.maine.gov,
malegislature.gov, iga.in.gov (a script app; statute text not reachable without it). Each document was
fetched with curl, converted to text in the session's scratch directory, and the sentences below were
copied from that text. Nothing was saved in the repository.

## Maryland: applied

Source: Tax-General § 11-105, mgaleg.maryland.gov (`Laws/StatuteText?article=gtg&section=11-105`).

- (a)(1): "a vendor who timely files a sales and use tax return is allowed, for the expense of collecting
  and paying the tax, a credit equal to 0.9% of the gross amount of sales and use tax that the vendor is to
  pay to the Comptroller."
- (a)(2): "The credit allowed under this section does not apply to any sales and use tax that a vendor is
  required to pay to the Comptroller for any purchase or use that the vendor makes that is subject to the tax."
- (b)(1): "the credit allowed under this section is 1.2% of the first $6,000 of the gross amount of sales
  and use tax that the vendor is to pay with each return."
- (c)(1): "The credit allowed under subsection (a) of this section may not exceed $500 for each return."
  (c)(2): a consolidated return's "total maximum credit ... for all returns filed for any period is $500."

Modelled as `tiers` (1.2% to $6,000 of tax, 0.9% above) with `cap: 50000` cents per return, whatever the
frequency. Worked: $5,000 tax, $60; $20,000, $72 + $126 = $198; $60,000, $558 capped at $500. The
qualified job training organization credit in (d) (100%, $100,000 a year) is not modelled.

## Utah: applied for monthly filers

Source: Utah Code 59-12-108 (version `C59-12-S108_2020051220210101`, "Amended by Chapter 459, 2023 General
Session"), le.utah.gov.

- (1)(a): a seller with "a tax liability under this chapter of $50,000 or more for the previous calendar
  year shall ... file a return with the commission: (A) monthly on or before the last day of the month
  immediately following the month". That matches the "last" due day already preset.
- (2)(b): "A seller subject to Subsection (1) or a seller described in Subsection (4) may retain each
  month 1.31% of any amounts the seller is required to remit to the commission" for transactions subject
  to the state tax and the local taxes listed.
- (4): a seller under $50,000 "may: (a) voluntarily meet the requirements of Subsection (1); and (b) if
  the seller voluntarily meets the requirements of Subsection (1), retain the amounts allowed".

No other section read gives a quarterly or annual filer a retention, so `stateDiscounts("UT", f)` is
`{ "UT state": { rate: 0.0131 } }` for monthly and `{}` otherwise. The 1% on municipal energy and some other
taxes in (2)(d), and the (2)(c) food-rate arithmetic, are not modelled.

## Colorado: none from 2026

Sources: Colorado Revised Statutes 2024, Title 39 (`leg.colorado.gov/sites/default/files/images/olls/crs2024-title-39.pdf`),
and HB25B-1005 as signed (`leg.colorado.gov/sites/default/files/2025b_1005_signed.pdf`).

- CRS 2024, 39-26-105(1)(d)(I)(A): "For sales made on or after January 1, 2020, ... the amount retained by
  a retailer ... is four percent of the tax reported; except that a retailer shall not retain more than one
  thousand dollars in any filing period." (1)(d)(IV): "Beginning January 1, 2022, a retailer is not permitted
  to retain any money ... for any filing period that the retailer's total taxable sales were greater than one
  million dollars."
- HB25B-1005, title: "CONCERNING THE ELIMINATION OF THE SALES TAX VENDOR FEE THAT RETAILERS ARE AUTHORIZED TO
  RETAIN". New (1)(d)(V): "BEGINNING JANUARY 1, 2026, A RETAILER IS NOT PERMITTED TO RETAIN ANY MONEY TO COVER
  THE RETAILER'S EXPENSES IN COLLECTING" (the scan's OCR reads "COYER"). The last page carries the Governor's
  approval, handwritten, dated August 28 (OCR garbled; the date is from the search result that pointed here).

The 2024 statute alone would have added a 4% preset that is wrong for every 2026 return. A web search for
2025 changes found the special-session bill; the signed text above settles it. `--state CO` applies no
discount; the note gives `--discount "CO state=4,1000"` for a 2025 or earlier period. A November 2026 ballot
measure on the vendor fee (HCR25B-1001) is mentioned in a fiscal note; its outcome was not checked.

One wording point not acted on: (1)(b) says a return is made "before the twentieth day of each month", which
read literally is the 19th. The preset stays the 20th, the date the Department's own calendars give per
earlier search excerpts; tax.colorado.gov refused, so this was not confirmed.

## Still open

- Indiana: the sales tax information bulletin index and the INTIME business guide (in.gov) were read; the
  guide's "Due Date" section says only that a weekend or holiday moves the date. No due day or allowance rate.
- Maine: 36 M.R.S. § 1951-A(1), "on or before the 15th day of each month", matches the preset. No section
  on a discount was read.
- New Jersey, Arkansas, Rhode Island, Massachusetts: their tax sites refused; not read.
