---
kind: analysis
date: 2026-11-27
---
# Which state's certified payroll file PayApps should build next (bet #1)

PayApps' ROADMAP has "other states' prevailing-wage formats once their official specs are read"
under certified payroll part 3 (California's DIR eCPR v2.0 is done, part 3a). This explore run read
which states now require electronic filing, so the next run can pick one without starting from
scratch. The customer-facing table is in
`docs/posts/2026-11-26-wh-347-certified-payroll-for-subcontractors.md`, "Other states where
certified payroll is filed online".

## Method and its limit

Web searches on 2026-11-27 that returned the agencies' own pages (dol.ny.gov, nj.gov and
njwages.nj.gov, lni.wa.gov, labor.illinois.gov, labor.maryland.gov, michigan.gov, labor.nv.gov).
**No state host could be fetched from the cloud session** (WebFetch: ENOTFOUND for dol.ny.gov,
www.nj.gov, lni.wa.gov, labor.illinois.gov; www2.census.gov too, so `cbp_counts.py` could not give
state counts). So the facts below are the agencies' sentences as the search tool quoted them, not
pages read end to end, and **no XSD, CSV template or formatting guide was downloaded**. Building a
format starts by getting the spec file itself (a session whose network policy allows the state host,
or the owner downloading it into the repo).

## Ranking for the next format

1. **New York (NYSDOL Electronic Certified Payroll Submissions, MPWR portal).** Required from
   1 Jan 2026 for all Article 8 public work (Article 9 building service excluded), at least every 30
   days, up to five weekly payrolls per cycle. Bulk upload is XML, with a **Bulk Upload Formatting
   Guide, a sample XML file and an XSD** (`NYDOL_CertPayroll.xsd`) on
   https://dol.ny.gov/electronic-payroll; the guide is at
   https://dol.ny.gov/certified-payroll-bulk-upload-formatting-guide. Known upload errors:
   `<prcNumber>` must match an existing project (PRC = the project's prevailing rate case number),
   field lengths, min/max values, date formats. Bulk upload works only for pay weeks with no
   employee entries yet; there is no API. **Why first:** new this year (every NY sub on public work
   is moving now), a large state, and an XSD means the output can be tested exactly as the CA file
   is (`ECPR_XSD=<path> pnpm test:unit`). A penalty of $100 a day after a 14-day grace period is
   reported by law-firm summaries, not confirmed on DOL's page: do not quote it to customers.
2. **New Jersey (NJ Wage Hub).** P.L. 2023, c.138; pay periods ending on or after 15 Aug 2024
   (NJDOL's July 2024 release; an earlier release said 16 Aug). Accepts manual entry, an electronic
   MW-562 upload, the Hub's **CSV template** (DOL recommends CSV past 10 employees; "fill out every
   cell", do not alter the template, times as HH:MM), or a copied week. Hard copy to the public body
   is still owed. The last submission for a week ending date is the one that counts. Needs: the
   CSV template file (njwages.nj.gov) and the MW-562 field list.
3. **Washington (L&I PWIA).** Weekly payrolls filed online at least monthly since 1 Jan 2020; an XML
   upload takes several at once. The schema link was not in any search result; LCPcertified's
   WA guide says it links to "the most current XML schema, in full, issued by WA L&I".
4. **Illinois (IDOL Certified Transcript of Payroll portal).** CSV on IDOL's template (DCEO's BEAD
   guidance links it); the CSV's address must match the project address or the payroll goes to
   "Need Info".
5. Not file formats to build: **Maryland** (state-funded work; the prime files its own and subs'
   payrolls online within 14 days; $10/day late; Davis-Bacon jobs exempt), **Michigan** (through
   LCPtracker since 2 Apr 2026 after a $500/yr registration: an LCPtracker upload format would
   cover it and many cities and DOTs at once, the ROADMAP's "if GCs ask" item), **Nevada** (monthly
   to the awarding body by the 15th; NDOT uses LCPtracker).

A design note for whoever builds it: the CA module already splits deductions into eight categories,
fringe into five and names into three, a superset of what the WH-347 holds. Mapping that one
in-memory week to each state's wrapper (XML, CSV) keeps the "one set of numbers" promise the post
makes.

## Prices of standalone certified payroll tools (pricing evidence for bet #1)

Aggregator figures, read 2026-11-27, re-check on the vendor page before pricing against them:
Certified Payroll WH-347 from **$79/mo** ([SaaSworthy](https://www.saasworthy.com/product/certified-payroll-wh-347/pricing));
PaidReady **$49/mo** (5 active projects) and $99/mo ([GetApp](https://www.getapp.com/all-software/a/paidready/));
Points North for RUN by ADP **$175/mo + $7.50 per report** ([ADP Marketplace](https://apps.adp.com/en-us/apps/253943/points-north-certified-payroll-reporting-for-run-powered-by-adp/configure));
LCPtracker's sub product **$12 per report or $145/mo for up to 5 projects** (per the search summary
of [lcptracker.com/solutions/lcpcertified](https://lcptracker.com/solutions/lcpcertified/)).
eMars says **55,000+ contractors** use its web certified payroll (August 2025 release,
[EIN Presswire](https://www.einpresswire.com/article/851114037/payroll-service-keeps-construction-companies-compliant-with-davis-bacon-act)).
Miter (construction payroll including certified payroll) raised a **$40M Series B** in September
2026, $78M in total, and says 2,000+ contractors use it
([Construction Dive](https://www.constructiondive.com/press-release/20260930-miter-the-ai-platform-for-construction-raises-40-million-for-the-built-w/)).
The DBRA final rule estimates **$217B a year** of covered construction and **1.2M workers**
([Federal Register, 2023-08-23](https://www.federalregister.gov/documents/2023/08/23/2023-17221/updating-the-davis-bacon-and-related-acts-regulations)).

Reading: subs already pay $49–$175 a month for certified payroll alone. PayApps puts the WH-347 on
every plan (ROADMAP, part 1), so on the pricing page it is a reason to pick the $99 plan over a
pay-app tool plus a certified payroll tool, and the state files are where that bundle beats the
$49 tools (one listing notes its product is federal-only).

## Update, later on 2026-11-27: New York built (part 3b)

A later ventures run could fetch dol.ny.gov with curl through the proxy (the 301 to
`/bizserve/ep` follows), so the spec files above were read whole: the XSD
(`dol.ny.gov/certpayrollxsd`, a zip dated 2026-10-01), the sample (`certpayrollsamplexml`), the
formatting guide (`/bizserve/ep/guide/buf`) and the classification list it links
(`/electronic-payroll-xml-work-classification-list`, a PDF of 261 names; `pdftotext -layout` reads it).
NYSDOL's own sample validates against its XSD with xmllint, and so does PayApps' output
(`NY_CPR_XSD=<path> pnpm test:unit`). Differences worth knowing: the XSD says
`deductionsGrossEarnings` (the guide's table says `deductionGrossEarnings`) and caps wage rates at
999.99 (the guide says 9,999.99); a deduction amount is at most four integer digits; `country` is
required by the XSD though the guide marks it optional. njwages.nj.gov still answered 403 from this
session, so New Jersey's CSV template is the next to fetch; lni.wa.gov answered 200.

## Update, later on 2026-11-27: Illinois built (part 3c)

labor.illinois.gov answered 200 through the proxy, and its Certified Transcript of Payroll page
(`/laws-rules/conmed/certifiedtranscriptofpayroll.html`) links the Full Import template
`/content/dam/soi/en/web/idol/laws-rules/conmed/documents/ctp/Full-CTP-Upload.xlsx` (one sheet: a
102-column header row and two sample rows), the "2026 Prevailing Wage Certified Transcript of
Payroll Training Slides" PDF in the same folder (`pdftotext -layout` reads it; it gives the date
format MM/DD/YYYY, the required fields and the region, class type and class code options) and
`/faqs/certifiedpayrollfaq.html` (17 answers; 3, 7, 13, 15 and 16 shape the file). PayApps now
writes that CSV (`src/shared/il-ctp.ts`). What the sources leave open, for whoever gets a real
upload: the race, ethnicity and gender values the portal accepts (the sample has "Chinese" with
ethnicity "Y", and "Hispanic or Latino" as a race), whether the hour and money columns take more
than two decimals, and what AddOT15/AddOT20 mean per hour versus per week (PayApps writes what is
typed, 0 by default). The contractor's FEIN and the "Agency" dropdown are on the manual-entry
screen but not in the template, so the file has neither. www.nj.gov's Wage Hub page answers 200,
but it links nothing downloadable: the CSV template is behind njwages.nj.gov, which still answers
403 from this session.
