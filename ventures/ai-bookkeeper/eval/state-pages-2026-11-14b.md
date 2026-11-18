# Four more states read on their own pages, 2026-11-14 (second batch)

The first 2026-11-14 batch (`state-pages-2026-11-14.md`) left Missouri (FAQ URL moved), New York
(pages moved), Ohio (404) and Tennessee (403) unread. A later session the same day probed them again:
tn.gov, tax.ny.gov and dor.mo.gov answered, and Ohio's statute answered on codes.ohio.gov although
tax.ohio.gov still returns 404. Each page was fetched, converted to text and saved in the session's
scratch directory, and the sentences below were copied from that text.

| State | Page | Sentence relied on | Frequencies listed | Result |
|---|---|---|---|---|
| MO | dor.mo.gov/faq/taxation/business/sales-tax-filing.html | "Monthly returns are due on or before the last day of the following month." "Quarterly returns are due on or before the last day of the month following the end of the quarter. For example, your return for the January through March period would be due on or before April 30." "Annual returns are due on or before January 31 of the following year." Frequency: "$500 or more per month ... monthly", "$500 or less per month ... quarterly", "less than $200 per quarter ... annual". | monthly, quarterly, annual | Dates match the `"last"` preset. **New:** "On all sales tax returns filed and paid by the required due date, you are granted a 2 percent timely payment allowance. Take the amount of tax due times 2 percent." Now `stateDiscounts("MO")`, uncapped (no cap is printed). The FAQ's own example ($100 tax, $2 allowance, $98 due) is a test. |
| NY | tax.ny.gov TB-ST-275 "Filing requirements for sales and use tax returns" (updated November 20, 2015) | "The annual return, Form ST-101 ... covers the period March 1 through February 28/29. Since sales tax returns are generally due within 20 days after the end of the reporting period, annual returns are due by March 20 each year." "Quarterly returns are due no later than 20 days after the end of the quarter." Quarters "March 1 through May 31, June 1 through August 31, September 1 through November 30, and December 1 through February 28/29." | quarterly, part-quarterly (monthly), annual | Matches `stateDueDay("NY")` and `stateEndMonth("NY")`. |
| NY | tax.ny.gov TB-ST-925 "Vendor Collection Credit" | Eligible if you file "on a quarterly basis (Form ST-100 ...)" or "an annual basis (Form ST-101 ...)"; "not eligible ... if you file your sales tax returns on a monthly basis (Form ST-809 ... and Form ST-810 ...)"; "the credit equals 5% of the taxes and fees reported on your return, up to a maximum of $200 for each quarterly or annual reporting period"; "you must file your return on time and pay what you owe in full." | | **New:** `stateDiscounts("NY", frequency)` gives 5% capped at $200 per return for quarterly and annual, nothing for monthly. `stateDiscounts` now takes the frequency; the CLI and the page pass it. |
| OH | codes.ohio.gov/ohio-revised-code/section-5739.12 | (A)(1) "Each person who has or is required to have a vendor's license, on or before the twenty-third day of each month, shall make and file a return for the preceding month". (B)(1) "the vendor shall be entitled to a discount of three-fourths of one per cent of the amount shown to be due on the return. The amount of the discount on the basis of sales other than the sales, including leases, of motor vehicles shall not exceed seven hundred fifty dollars per vendor's license for each month covered by the return." | monthly (the commissioner may authorise less frequent) | Matches the 23rd and the 0.75% / $750-a-month preset, which until now came from search excerpts. |
| TN | tn.gov/revenue/taxes/sales-and-use-tax/due-dates-and-tax-rates.html | "Monthly 20th day of the month following the end of the reporting period"; "Quarterly 20th day of the month following the end of the quarter (January 20, April 20, July 20, October 20)"; "Annually January 20". | monthly, quarterly, annual | Matches the preset of 20. |

Pinned in `salestaxreturn.test.mjs`, "MO, NY, OH and TN match their own pages (read 2026-11-14)".

**What the discounts do not model.** Each preset applies to the jurisdiction labelled "MO state" or
"NY state" only. New York's credit is on "the taxes and fees reported on your return", local tax
included, and Missouri's on "the amount of tax due", so a business that books local tax under its own
labels gets a smaller discount here than the return gives; add `--discount "<label>=5,200"` (NY) or
`--discount "<label>=2"` (MO) for those labels, keeping in mind that New York's $200 cap is for the whole
return. Both presets assume the return is filed and paid on time.

**Still not read.** New Jersey: the sales tax pages tried return 404, and the S&U-4 guide (2022) and
ANJ-10 have no due-date text. Maryland: the new marylandcomptroller.gov sales tax page returns 404 and
marylandtaxes.gov is JavaScript only. Indiana: the business FAQ ("What determines my filing frequency
and the due dates associated with each frequency?") names the frequencies' basis but no day; the
Indiana Code (iga.in.gov) is JavaScript only and law.justia.com refused (403), so IC 6-2.5-6-1 was not
read and the 30th stays with its note. Colorado, Massachusetts, Maine, Utah, Arkansas and Rhode Island
still refused (403).

Not tax advice: your own notice decides your frequency and date.
