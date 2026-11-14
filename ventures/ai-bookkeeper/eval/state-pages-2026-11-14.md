# Eight more states' sales tax pages, read 2026-11-14

The 2026-11-12 batch (README, "State due dates read on the states' own pages") checked 26
jurisdictions on their own sites. On 2026-11-14 the hosts below answered from a cloud session, so
each page was fetched, converted to text and saved locally, and the sentences below were copied
from the saved text. Every one matches the preset `salestaxreturn.mjs` already used. What changes:
`STATE_SOURCES` now lists these pages (with `read: "2026-11-14"`), so the tax calendar links the
source, and a frequency the page does not list gets a note. Pinned in `salestaxreturn.test.mjs`,
"eight more states' due dates match their own pages, read 2026-11-14".

| State | Page | Sentence relied on | Frequencies listed |
|---|---|---|---|
| GA | dor.georgia.gov/taxes/business-taxes/sales-use-tax/file-pay | "Sales tax returns are due and payable no later than the 20th day of the month following the period being reported. ... For most taxpayers, sales tax returns are due every month; however, taxpayers may submit a written request to change their filing frequency." | none named (no `freqs`) |
| IL | tax.illinois.gov/research/taxinformation/sales/rot.html (Form ST-1) | "A monthly return is due the 20th day of the month following the month for which the return is filed." "A quarterly return is due the 20th day of the month following the quarter ..." "An annual return is due January 20th of the year following the year ..." | monthly, quarterly, annual |
| MN | revenue.state.mn.us/guide/filing-information (and the "Sales Tax Return Filing Due Dates" table) | "Annually / Less than $100 per month / February 5 of the following year"; "Quarterly / $100 to $500 per month / April 20, July 20, October 20, and January 20"; "Monthly / More than $500 per month / 20th day of the following month". Table: "Annual (calendar year 2026) February 5, 2027". | monthly, quarterly, annual |
| NC | ncdor.gov ... /filing-frequency-and-due-dates | "Taxpayers assigned a monthly filing frequency must file on or before the 20th day of each month for all taxes due for the preceding calendar month." "Taxpayers assigned a quarterly filing frequency must file on or before the last day of January, April, July, and October for the preceding three-month period." (Monthly with prepayment at $20,000 a month or more: also the 20th.) | monthly, quarterly |
| NV | tax.nv.gov/faqs/sales-tax-information/ | "Important notice: Sales and Use Tax returns are now due on the 20th of the month." | none named |
| SC | dor.sc.gov/tax/sales | Monthly, quarterly (Mar 31 to Apr 20 ... Dec 31 to Jan 20) and annual (Dec 31 to Jan 20) tables; "You must request approval from the SCDOR to file quarterly or annually". | monthly, quarterly, annual |
| VA | tax.virginia.gov/retail-sales-and-use-tax | "Your filing frequency, either monthly or quarterly, is based on your tax liability." "Monthly returns are due on the 20th day of the month following the close of the filing period"; quarterly table Apr 20, Jul 20, Oct 20, Jan 20. | monthly, quarterly |
| WA | dor.wa.gov/file-pay-taxes/filing-frequencies-due-dates | "Monthly returns are due the 25th of every month." "Quarterly returns are due the end of the month following the tax quarter." "Annual returns are due April 15." | monthly, quarterly, annual |

**Georgia's vendor's compensation, read on the form.** The discount preset (`stateDiscounts("GA")`)
came from search excerpts on 2026-10-28. Form ST-3 (Rev. 07/25/22, effective for sales from
April 1, 2022) and its instructions, downloaded from dor.georgia.gov, print Part C as "3%" on
"State and Local tax-non motor fuel sales/use (first $3,000)" and ".5%" on "(over $3,000)", and say
"Vendor's compensation is only given when both the payment and return are submitted timely." That is
what the preset does. The 2026 proposal to raise the $3,000 step is still unconfirmed and not modelled.

**Still not read.** Refused or redirected to pages with no due-date text this time: MA, CO, ME, UT,
AR, RI (403), OH (404), MD, NJ, NY (pages moved; no due-date text found at the URLs tried), TN (403
on the page and the SLS-450 instructions), MO (FAQ URL moved). Indiana's day of the month is still
unprinted on its own pages.

Not tax advice: your own notice decides your frequency and date.
