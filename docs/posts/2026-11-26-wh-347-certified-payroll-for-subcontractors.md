---
title: "Filling out the WH-347 certified payroll every week: a subcontractor's guide"
seo_title: "How to fill out WH-347 certified payroll for subcontractors"
date: 2026-11-26
tags: [payapps, for-customers, construction, certified-payroll, davis-bacon, wh-347, prevailing-wage, california, ecpr, new-york, new-jersey, washington, illinois]
description: "The WH-347 column by column for Davis-Bacon subs, the checks before sending it, and the CA, NY and WA files for states that want it filed online."
---

*Written by an AI agent working in this repository.*

If your crew works on a federal or federally assisted construction job, you owe the general
contractor a certified payroll for every week you have people on site (29 CFR 5.5(a)(3)(ii)). Most
subcontractors use the Department of Labor's optional Form **WH-347**. The current edition is
**Rev. January 2025, OMB No. 1235-0008, expiring 01/31/2028**. DOL also accepts its page 2, the
statement of compliance, on "another document with identical wording", so a payroll printed by
software is fine as long as the columns and the statement match.

This guide goes through the form the way a payroll clerk fills it, and says which numbers should
never be typed by hand. It is drawn from the form and DOL's instructions
(dol.gov/agencies/whd/forms/wh347instr) as read for PayApps on 2026-11-26.

## The header

Check **final** only on the last payroll for the job. Then: prime or subcontractor, project name and
contract number, the **payroll number** (1 for your first week on the job, then 2, 3 ...), your
business's legal name and address, the project's location, the **wage determination** number(s)
and revision your contract carries, and the **week ending** date. The seven days on the form are
the seven days ending on that date: get the date right and the day letters follow.

## One row per worker, per classification

Each worker gets an entry number, a name and an identifying number. **Never put the full Social
Security number on the form.** DOL's instructions say full SSNs must not be included; use the last
four digits or another number specific to the worker.

A worker who works under two classifications in the week (a laborer part of the week, an operator
the rest) gets one row per classification under the same entry number. Mark each row **J**
(journeyworker) or **RA** (registered apprentice); an apprentice row also carries the level of
progression (say, "2nd year, 60%"), and the apprenticeship program goes on page 2.

For each row: straight-time and overtime hours for each of the seven days, the straight-time and
overtime rates paid, and any **cash paid in lieu of fringe** per hour.

## The columns you should not type

These are arithmetic, and typing them is where weekly payrolls drift:

| Column | What it is |
|---|---|
| 5, total hours | The sum of the days. |
| 6B, fringe credit | The worker's total hourly credit under the plans on page 2, times the row's hours. |
| 6C, cash in lieu | The row's hourly cash in lieu, times its hours. |
| 7A, gross for this project | From your payroll. If you leave it to arithmetic: ST hours × ST rate + OT hours × OT rate + 6C. |
| 7B, gross for all work | Includes other jobs that week; if there were none, it equals 7A. |
| 8, deductions | Tax, FICA and other, added up. Name every "other" deduction in the remarks. |
| 9, net | 7B minus the deductions. |

## Page 2: the statement of compliance

The signer certifies six statements. Boxes 1, 2, 3 and 6 apply to every payroll. Box 4 applies
when anyone is paid as an apprentice. Box 5 is about fringe benefits paid to bona fide plans and/or
in cash. Page 2 also has room for **three** apprenticeship programs (registered with the Office of
Apprenticeship or a state agency) and **six** fringe benefit plans; past that, attach an addendum.

The page ends with the falsification warning: willful falsification can bring civil or criminal
prosecution (18 U.S.C. 1001 and 31 U.S.C. 3729) and debarment, and certified payrolls may be
disclosed under a Freedom of Information Act request. Sign it by hand every week. DOL does not
accept copied signatures.

## The checks worth running before you send it

None of these decides compliance, but each one is a common audit finding or a typo the GC's
compliance reviewer will send back:

- **More than 40 straight-time hours in the week.** On contracts under the Contract Work Hours and
  Safety Standards Act, hours over 40 in the week, on and off this job, are overtime.
- **An overtime rate under 1.5 × the straight-time rate.**
- **A rate under the wage determination.** Type the determination's basic and fringe rate for each
  classification once, and every week's row can be checked against them.
- **Cash in lieu paid at straight time on overtime hours.** Cash in lieu of fringe counts in the
  overtime regular rate; a bona fide plan contribution does not. The free
  [overtime and fringe check](https://marisstella.app/certified-payroll-calculator/) shows the
  dollars for one worker.
- **A credit under an unfunded plan.** 29 CFR 5.28 needs DOL's approval before you take it.
- **Arithmetic:** a day over 24 hours, deductions over gross, gross for all work under gross for
  this project, an apprentice row with no program listed.

## Hours by day from your time report

The slowest part is copying hours into seven day columns. Most payroll and time systems
(QuickBooks time activities, Gusto, ADP or Paychex time-card detail, a payroll-by-job report) can
export a CSV with one row per employee per day worked. That is enough to fill the week.

A report with one date per pay period (a pay date, check date or period end) is not enough: it
cannot say which day the hours were worked, and spreading them across the week would be making
them up. Holiday, vacation, PTO and sick hours are not hours worked on the job and stay off the
form. Double time needs care: the WH-347's overtime row has one rate.

## California public works: the DIR eCPR file, version 2.0

On a California public work the payroll goes to the Department of Industrial Relations (Labor Code
§ 1776), uploaded to its Public Works portal, usually as an XML file in DIR's eCPR format. DIR
has published **version 2.0** of that format and accepts version 1 files only until
**13 January 2027** (DIR's V2 FAQ). After that, a V1 export from older payroll software will not
upload. What changed, from DIR's XSD and "eCPR XML Guidelines V2" (read 2026-11-26):

- **Fewer contractor and project fields, stricter ones.** License, FEIN, addresses and the project
  location block are gone. The **PWCR** (your Public Works Contractor Registration, exactly 10
  digits) and DIR's **project ID** are required, and a mismatch with DIR's records fails the upload.
- **Names split** into first, middle and last. **ITIN** is accepted for a worker with no SSN. SSNs
  must be unique in the file: a duplicate rejects every employee who shares it.
- **Several classifications per worker**, each with its own craft, level (`journeyman` or
  `apprentice`, with the apprentice period 1 to 10), seven days of straight time, **overtime and
  doubletime**, rates and fringe.
- **Fringe in five categories** (health and welfare, vacation and holiday, pension, training,
  other) as hourly amounts, plus whether it was paid to the worker or to a plan. At least one of
  those two must be true.
- **Deductions in eight categories** (federal tax, FICA, state tax, SDI, fund administration,
  savings, dues, other) and a total.
- **"Source of truth" totals.** DIR stores the total hourly rates, total deductions, gross for this
  project, gross for all work and net as you send them, without recomputing them. A file can pass
  the schema and still be wrong (the FAQ's own warning), so compute these, don't type them.

The one thing the WH-347 can't give you is the full Social Security number. DOL says never put it on
the federal form; DIR's file requires it. Keep the two apart.

## New York public work: the NYSDOL bulk upload file

On New York public work under Labor Law Article 8, the payroll goes into NYSDOL's Certified Payroll
portal, required since 1 January 2026. You can type each worker in, or upload one XML file per
project per week. NYSDOL publishes an XSD ("XML SCHEMA for electronic New York Certified Payroll
Records Version 2.0"), a sample file, a Bulk Upload Formatting Guide and the list of classification
names the file must use (all read on dol.ny.gov on 2026-11-27). What the file wants that the WH-347
does not give you:

- **The project's PRC number** (prevailing rate case number, 10 characters), from your portal
  dashboard. A PRC that doesn't match the project you picked, or a week ending date that doesn't
  match the week you picked, fails the upload.
- **The worker's home address, with the state spelled out.** "NY" is rejected ("State is
  invalid"); write "New York".
- **The last four digits of the SSN, or else the date of birth.** One or the other, never both:
  the guide lists "both" as a common error.
- **Whether the worker is a New York registered apprentice** (true or false).
- **A classification from NYSDOL's list, spelled exactly as printed.** "Electrician" alone is not
  on it; "Electrician – Building/Wireman" is, with its en dash. A name that doesn't match is
  rejected ("Work Category is invalid"). A worker with two classifications is one employee with two
  work weeks. Listing the same worker twice is rejected as a duplicate.
- **Deductions by type** (up to 10, each under $10,000) and **supplements by type**: Health/Welfare,
  Vacation/Holiday, Apprenticeship/Training, Pension or "Other Benefit (Type)". Each supplement is
  tied to a classification and has its own straight-time and overtime hourly rate. An "Other" one
  needs an explanation, and the other types must leave the explanation empty.
- **Limits:** 500 employees per file, one project and one week per file, wage rates up to $999.99
  in the XSD (the guide's table says $9,999.99; the portal validates against the XSD).

NYSDOL suggests a small test upload first. Whatever you upload goes into its system of record,
so test with a real week you're ready to file, not dummy data.

## Washington public works: the L&I PWIA XML upload

In Washington every contractor on a public works project files certified payroll online with L&I,
at least once a month, in the Prevailing Wage Intent and Affidavit (PWIA) system. You can type each
week in, or use "Submit Payroll in XML File". L&I publishes the XML schema
(lni.wa.gov/licensing-permits/_docs/xmlschema.xsd), an XML Payroll Upload Guide and a list of its
four-letter trade codes (all read on 2026-11-27). What the file wants that the WH-347 does not give
you:

- **The project's Intent ID**, the number L&I gave the Statement of Intent to Pay Prevailing Wages
  you filed. The upload checks that you can file for that Intent.
- **The worker's full 9-digit Social Security number** (RCW 39.12.120), not the last four the
  WH-347 now asks for. Numbers the SSA never issues (starting with 9, 666 or 000, 00 in the middle,
  0000 at the end) are rejected, and so is the same SSN twice in one week.
- **The home address** with a two-letter state and a 5- or 9-digit ZIP.
- **For each row, L&I's trade code and the county of the work.** The trade is four capital letters
  from L&I's list (ELEC for inside electricians, PLUM for plumbers and pipefitters, LABO for
  laborers; 99 codes). The county must be one of Washington's 39, in Title Case ("Walla Walla").
  The job classification must match L&I's journey-level wage lookup for the project's bid due date
  or award date. A worker who worked two trades, counties or rates in the week gets one entry per
  combination.
- **Apprentices:** no job classification, but the ARTS registration ID, the state of registration
  (WA, OR, MT or AK only), the apprentice occupation and step name from L&I's apprentice wage lookup,
  and the step's begin and end hours as whole numbers.
- **Fringe benefits by type, per hour:** pension, health and welfare, vacation, holiday and the
  apprentice training fund each have their own field (zero if none). Anything else, including cash
  paid in lieu, is listed by name.
- **Overtime and double time apart.** The WH-347 has one overtime column; L&I's file has separate
  overtime and double-time hours and rates.
- **A week with no work** can be filed with a no-work flag and no workers.

After the upload L&I runs five checks: the file against the schema, the week (every week for an
Intent must end on the same weekday, and a week already filed becomes an amendment that replaces it),
the workers' details, the trades and classifications (you can map a mismatch to L&I's own), and,
optional but recommended, the wages against the prevailing rate. If that last step shows you paid
less, L&I's guide says to pay the difference on the next check and file an amended week.

## Other states where certified payroll is filed online

California is no longer the only state that wants the payroll in its own system. On a **state or
local** prevailing-wage job, the payroll you hand the GC may also have to go to the state labor
department, in that state's portal and format. On a purely federal Davis-Bacon job the WH-347 to the
GC is usually the whole duty (Maryland says so outright). Where we could find a state's rule, as the
agencies describe it:

| State | Where it goes | Since | How you can send it |
|---|---|---|---|
| California | DIR Public Works portal, eCPR (Labor Code § 1776) | SB 854 (2014) | Online form or eCPR XML; version 2.0 only from 13 Jan 2027 |
| New York | NYSDOL Electronic Certified Payroll Submissions (MPWR portal), all Article 8 public work | 1 Jan 2026 | At least every 30 days, up to five weekly payrolls per cycle; online entry or a bulk XML upload checked against DOL's published XSD. No API |
| New Jersey | NJ Wage Hub, for registered public works contractors (P.L. 2023, c.138) | Pay periods ending on or after 15 Aug 2024 | Typed in, an electronically filled MW-562, the Hub's CSV template (DOL suggests CSV past 10 employees), or a copy of last week edited; hard copy to the public body still owed |
| Washington | L&I's Prevailing Wage Intents and Affidavits system, all public works | 1 Jan 2020 | Weekly payrolls filed online at least monthly; an XML upload takes several at once |
| Illinois | IDOL Certified Transcript of Payroll portal (Illinois Public ID login) | in force | Typed in or a CSV on IDOL's template; the address must match the project's |
| Maryland | Division of Labor and Industry online system, state-funded public works | in force | The prime files its own and its subs' site payrolls within 14 days of each pay period; $10 a day late. Davis-Bacon jobs do not file with the state |
| Michigan | LEO, through LCPtracker, after a $500-a-year contractor registration | 2 Apr 2026 | LCPtracker's entry or upload |
| Nevada | the awarding body (NRS 338.070), monthly, by the 15th | in force | Whatever system that awarding body uses; NDOT uses LCPtracker |

Read on 2026-11-27 from the agencies' own pages as published (NYSDOL's electronic payroll FAQ and
bulk upload formatting guide, NJDOL's Wage Hub FAQ and contractor user guide, L&I's public works
contractor pages, IDOL's Certified Transcript of Payroll page, Maryland's prevailing wage
instructions, LEO's prevailing wage page and Nevada's NRS 338 overview). Rules change and the dates
above are the agencies' own. Before your first payroll on a job, check the contract and the agency's
page: many cities, counties and DOTs run their own system on top (LCPtracker is common), and on
those jobs the GC tells you where to file.

What it means for your week: the hours, rates, fringes and deductions are the same numbers as on
the WH-347. Only the wrapper changes (a form, a CSV, an XML file). Keep one set of numbers, compute
the totals once, and produce each state's file from them rather than retyping the week into a
second portal.

## Doing it in PayApps

PayApps, our pay-app billing for specialty subcontractors, added certified payroll on 2026-11-26.
It sits on the job, next to that job's pay applications:

- The header, rows and page 2 follow the Rev. January 2025 form. The statement of compliance is
  printed in the form's own words, with the signature and date left blank for a hand signature.
- Columns 5, 6B, 6C, the deduction total and 9 are computed; 7A and 7B fill themselves when left
  blank, and the screen says so.
- A full SSN, a day over 24 hours, deductions over gross and missing rates block the PDF; the
  overtime, wage-determination and unfunded-plan checks above print as warnings to look at.
- "Hours from a time report" reads a by-day CSV in your browser, matches workers by name, refuses a
  pay-period date column with the reason, and lists every hour it left out (holiday, PTO, double
  time).
- **Hours from PayApps timesheets (added 2026-11-27):** if your crew's hours are already on the
  Timesheets page, one button fills the week for this job, with no export and import. Straight time
  and overtime are what the timesheet counted (hours past 40 in your workweek, across every job),
  each worker's trade becomes the classification, and the page names anyone who also worked other
  jobs that week, since the WH-347's "gross amount earned" for all work has to include that pay.
  If the payroll week ends on a different day than your workweek, both workweeks are read and each
  day keeps its own overtime.
- "Start next week" moves the payroll number and date on and clears hours and deductions, keeping
  the crew, rates and plans.
- Workers' names and numbers are not stored on our servers: the draft stays in your browser and the
  PDF is rendered and sent back.
- **California public works (added the same day):** tick the California box and the same week
  downloads as DIR's eCPR version 2.0 file. You add the PWCR, project ID, addresses, crafts, check
  numbers and any doubletime. State tax is split out of the withholding, and SDI, dues and the rest
  out of "other", so the PDF and the XML show the same deductions and net. It checks DIR's upload
  rules before you download, and the output validates against DIR's published XSD. The file is
  built in your browser. Full SSNs and ITINs are held only while the page is open: they are not
  saved with the draft and never sent to us.
- **New York public work (added 2026-11-27):** tick the New York box and the same week downloads
  as NYSDOL's bulk upload XML. You add the PRC number, addresses, and each row's classification,
  picked from NYSDOL's own list of 261 names (a near miss like "Laborer - Building" with a hyphen
  is matched to the list's spelling). The SSN's last four come from the WH-347 ID number when it is
  four digits. Otherwise you enter the date of birth, which is held only while the page is open.
  Fringe plans become supplements of the type you pick, at time and a half on overtime where your
  rate schedule says so. Cash in lieu is reported as "Other Benefit (Type)" with an explanation.
  State and local tax are split out of the withholding, and disability/PFL and dues out of
  "other", so the PDF and the XML agree. The output validates against NYSDOL's XSD.
- **Washington public works (added 2026-11-27):** tick the Washington box and the same week
  downloads as the XML file for L&I's PWIA upload. You add the Intent ID, the county, addresses, and
  each row's L&I trade (picked from L&I's list) and classification; apprentices get their ARTS ID
  and step. Fringe plans go into L&I's pension, medical, vacation, holiday and training fields by
  the type you pick, and other plans and cash in lieu are listed by name. A row can be marked as
  double time. A week with no work makes the no-work file. Full SSNs are held only while the page is
  open: not saved with the draft and never sent to us. The output validates against L&I's
  published schema.

Not yet: hours straight from a QuickBooks Time or payroll connection, the crew saved with the job
instead of the browser, the other states' files in the table above (New Jersey's Wage Hub CSV next, once its template can be read), and uploads to the compliance systems GCs use (LCPtracker and the like). These come if
contractors ask for them.

PayApps is in early access and not yet offered for sale:
[see the construction tools and join early access](https://marisstella.app/industries/construction/).
Not affiliated with the Department of Labor, California DIR or LCPtracker. This is general information, not legal,
payroll or compliance advice; which wage determination applies and whether your contract is covered
come from your contract and the contracting officer.
