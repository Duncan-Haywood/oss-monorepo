---
title: "Filling out the WH-347 certified payroll every week: a subcontractor's guide"
seo_title: "How to fill out WH-347 certified payroll for subcontractors"
date: 2026-11-26
tags: [payapps, for-customers, construction, certified-payroll, davis-bacon, wh-347, prevailing-wage, california, ecpr]
description: "The WH-347 (Rev. January 2025) column by column for Davis-Bacon subcontractors: computed columns, the six statements, and checks before you send it."
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

Not yet: hours straight from a QuickBooks Time or payroll connection, the crew saved with the job
instead of the browser, other states' prevailing-wage formats, and uploads to the compliance systems GCs use (LCPtracker and the like). These come if
contractors ask for them.

PayApps is in early access and not yet offered for sale:
[see the construction tools and join early access](https://marisstella.app/industries/construction/).
Not affiliated with the Department of Labor, California DIR or LCPtracker. This is general information, not legal,
payroll or compliance advice; which wage determination applies and whether your contract is covered
come from your contract and the contracting officer.
