# Indiana, Arkansas, New Jersey, Rhode Island, Maine and Massachusetts, read on their own pages, 2026-11-14 (fifth batch)

The flagship's open item (8) still listed six states: Indiana's due day and allowance, New Jersey, Arkansas,
Rhode Island, Maine's discount and Massachusetts. Earlier batches had found tax.ri.gov, dfa.arkansas.gov's
forms, maine.gov/revenue and mass.gov refusing the session's proxy. This batch went to the statutes, the
rules and the agencies' own bulletins instead. Each document was fetched with curl from the cloud session,
converted to text in the session's scratch directory (pdftotext for PDFs), and the sentences below were
copied from that text. Nothing fetched was saved in the repository.

Hosts that answered 200: secure.in.gov, www.nj.gov, webserver.rilegislature.gov, legislature.maine.gov,
malegislature.gov, www.dfa.arkansas.gov (its sales tax FAQ prints neither the due day nor the discount),
www.law.cornell.edu. Refused or empty: codes.findlaw.com (403), advance.lexis.com (405, where the Arkansas
Code is officially published), iga.in.gov (a script app; no statute text without it), law.counselstack.com
(an empty shell).

## Indiana: due day and allowance, both worked out from the book

**Due day.** General Tax Information Bulletin #102, `secure.in.gov/dor/files/gb102.pdf`, "Publication Date:
March 2023", "Replaces Bulletin #102, dated September 2020":

- "Sales tax returns are primarily due on a monthly basis, unless the retail merchant has annual collections
  of less than $1,000, in which case the merchant will only be required to file a return annually."
- "If filing on a monthly basis, sales tax returns are due on the 30th day of the month following the close
  of the reporting period, unless the average monthly tax due for the preceding year is in excess of
  $1,000.00, in which case the returns must be filed by the 20th day of the month following the close of
  the reporting period."

Before this, the 30th came from secondary sources and the note said Indiana's own pages did not print the
day. Now `stateHistoryPresets("IN", books, "monthly")` totals the book's "IN state" tax for the year before
each return year. Above $12,000 (an average over $1,000 a month) the year's returns are due the 20th;
otherwise the 30th. That only happens when the book holds the whole year before. If it doesn't, the 30th
stays, with a note naming the missing months. The 30th is clamped to the last day of February, as before.
The statute says "not more than thirty (30) days after the end of that month", per search excerpts of IC
6-2.5-6-1 that were not read whole. That would put a January return on March 2, not February 28. The
bulletin's wording ("the 30th day of the month following") is what is modelled, and the gap is left as a
note here.

**Allowance.** Sales Tax Information Bulletin #83, `secure.in.gov/dor/files/sib83.pdf`, "Publication Date:
December 2025", "Effective Date: January 1, 2026", "Replaces Bulletin #83, dated January 2023":

- "The collection allowance for a calendar year will be based on the total sales tax or gasoline use tax
  liability accrued for the 12-month period ending on June 30 of the preceding calendar year."
- The table: "$60,000.00 or Less 0.73%", "$60,000.01 through $600,000.00 0.53%", "$600,000.01 or More 0.26%".
- "INTIME, the department's e-services portal, will show the collection allowance percentage for retail
  merchants".
- "Timely payments are permitted a collection allowance in the manner permitted under IC 6-2.5-6-10".

Modelled as a per-year rate (`byYear`). For return year Y, the book's "IN state" tax from July Y-2 to June
Y-1 picks the band, but only when the book's first and last dates span those twelve months. A year the book
cannot look back on gets no allowance (rate 0), and the note says which months are missing. Credit notes
reduce the look-back tax. Worked: $4,000 a month gives $48,000, so 0.73% ($29.20 on a $4,000 month).
$6,000 a month gives $72,000, so 0.53%. $50,001 a month gives $600,012, so 0.26%. Exactly $60,000 stays at
0.73%.

**Caveat.** The book's history is a stand-in for the Department's own figure. A book that starts mid-year,
holds only part of the business, or labels Indiana tax differently gets a different band from the one
INTIME shows. The note says so, and `--discount "IN state=<percent>"` replaces it.

## Arkansas: 2% discount applied, filing schedule noted

Source: Arkansas Administrative Code 006.05.06, rules GR-77 and GR-84 (Gross Receipts Tax Rules), read as
published on law.cornell.edu (`regulations/arkansas/006-05-06-Ark-Code-R-005-GR-84` and `-GR-77`). The
official Arkansas Code host refused the session, so the statutes behind the rules (Ark. Code 26-52-503 and
26-52-512) were not read.

GR-84:

- "If the tax is remitted to the Director on or before the due date required by rule GR-77, the taxpayer is
  entitled to deduct two percent (2%) of the state tax due and two percent (2%) of the city and county tax
  due as a discount for prompt payment of the tax."
- "A taxpayer's discount for prompt payment of state tax shall not exceed $1,000.00 for each month included
  in the tax report, regardless of whether the taxpayer files a report monthly, quarterly, annually, or
  occasionally."
- "A taxpayer who operates more than one location shall be entitled to one aggregate monthly discount of
  $1,000.00 for state tax".
- "There is no limitation on the discount for prompt payment of city and county tax".
- "The two percent (2%) discount may not be deducted from prepayments but may only be taken on the excise
  tax report".
- "Failure to remit the tax on or before the due date shall result in a forfeiture of the two percent (2%)
  discount".

GR-77:

- "on or before the twentieth (20th) day of each month, a return showing the tax due, during the preceding
  calendar month."
- Quarterly when the average tax for the previous July-June year "does not exceed $100.00 per month, the
  Director may notify the taxpayer that the taxpayer may file quarterly reports on or before July 20, October
  20, January 20, and April 20."
- Annual when it "does not exceed $25", on "January 20 for the preceding twelve (12) month period";
  "Taxpayers should not change their method of filing until they receive the notice to begin filing
  annually."
- An EFT payer who "fails to do so by the due date ... shall not be allowed the benefit of the discount for
  prompt payment".

Modelled as `AR: { rate: 0.02, capPerMonth: 100000 }` on "AR state". Worked: $10,000 of tax gives $200. On a
monthly return $80,000 gives $1,000, capped. On a quarterly return $80,000 gives $1,600 (the cap is
$3,000), and $200,000 gives $3,000. City and county tax gets 2% with no cap. It is left to `--discount`
because local labels are the user's own. The due dates were already the 20th and are now pinned to GR-77.
A non-monthly `--freq` notes that the Department's notice comes first.

## New Jersey: no discount, quarterly returns with monthly vouchers

Source: Division of Taxation, "How to Pay" (`nj.gov/treasury/taxation/su_12.shtml`). The older Sales Tax
Guide S&U-4 (Rev. 07/22) agrees ("return due April 20").

- "Once your business is registered to collect Sales Tax, you will be required to file quarterly returns and
  make quarterly payments. Some sellers must also make monthly payments."
- "You must make monthly payments only if you: Collected more than $30,000 in Sales and Use Tax in New Jersey
  during the prior calendar year; and Collected more than $500 in the first and/or second month of the
  current calendar quarter."
- "You must file your monthly payments and quarterly Sales Tax returns on or before 11:59 p.m. of the 20th
  day of the month after the end of the filing period."
- "File quarterly Sales Tax returns on Form ST-50."

The page prints no vendor discount or collection allowance, so none is applied and the note says so.
`--state NJ --freq monthly` now explains that monthly rows are vouchers, not returns. An annual frequency
says the page lists quarterly filing only.

## Rhode Island: statute confirms the dates

Source: R.I. Gen. Laws § 44-19-10 (webserver.rilegislature.gov).

- "due and payable to the tax administrator monthly on or before the twentieth (20th) day of the month next
  succeeding the month for which return is required to be made."
- "Where a taxpayer's sales and use tax liability for six (6) consecutive months has averaged less than two
  hundred dollars ($200) per month, a quarterly return and remittances in lieu of a monthly return may be made
  on or before the last day of July, October, January, and April of each year for the preceding three (3)
  months' period when specially authorized, in writing, by the tax administrator".
- Authorization can be revoked if the liability "exceeds six hundred dollars ($600) in sales and use taxes for
  any subsequent quarter".

This matches the presets: the 20th monthly, and the last day of the month after a quarter. The quarterly
note now names the written authorization and the $600 limit. The section prints no discount, and none is
applied.

## Maine: statute confirms the 15th

Source: 36 M.R.S. § 1951-A (legislature.maine.gov, "Data for this page extracted on 10/05/2026").

- "Every retailer shall file with the State Tax Assessor, on or before the 15th day of each month, a return
  ... The return must report the total sale price of all sales made during the preceding calendar month".
- "The assessor may permit the filing of returns other than monthly."

The section prints no discount, and none is applied. Only § 1951-A was read, not all of chapter 219.

## Massachusetts: statute confirms 30 days

Source: G.L. c. 62C, § 16(h) (malegislature.gov).

- "Each vendor who has made any sale taxable under the provisions of chapter 64H, 64I or 64L shall file a
  return with the commissioner for each calendar month. The commissioner may by regulation require returns
  under this section to be filed on a quarterly rather than a monthly basis".
- "Every such return shall be filed within 30 days after the expiration of the period covered thereby."
- "A materialman ... Each return shall be filed within 50 days after the expiration of the period covered by
  the return." (Not modelled.)

This matches `{ after: 30 }`, which until now rested on a search excerpt of mass.gov. The section prints no
vendor discount, and none is applied.

## What is still open in item (8)

All the states named in item (8) have now been read. What remains: the Arkansas statutes themselves
(26-52-503 and 26-52-512, on a host that refuses the session); Indiana's IC 6-2.5-6-1 read whole, to
settle whether February's 30th is February 28 or "30 days after"; and a real return layout. Not tax advice:
your own notice decides your date and discount.
