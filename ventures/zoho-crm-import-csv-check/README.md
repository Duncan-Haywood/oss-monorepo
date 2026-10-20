# Zoho CRM Import CSV Check

A free browser tool for sales teams, agencies and ops people moving leads, contacts, accounts or deals
into Zoho CRM from a spreadsheet or another CRM: **paste or drop the CSV and see every problem with
its line number before the import skips rows or doubles your pipeline, then download a cleaned
copy.** The file is read in the browser; nothing is uploaded and no login or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/zoho-crm-import-csv-check/

After using this, you can now **find the lead with no Company, the deal whose Stage is `closed won`, the Amount written `$12,000`, the Probability of `0.6`, the same deal on two rows, the phone number Excel turned into `4.41175E+11`, and the date column that mixes `25/03/2026` with `03/25/2026`**, which used to mean a half-imported pipeline and a hunt through the rows.

## Input

A leads, contacts, accounts or deals CSV whose headings are Zoho CRM field names (`Last Name`, `Company`, `Deal Name`, `Amount`,
`Stage`, `Status`, `Name`, `Email`, `Organization`). Comma, semicolon or tab separated; UTF-8 with
or without a BOM. The kind is worked out from the headings, or chosen.

## Checks

Required Last Name, Company, Account Name or Deal Name; headings against standard field names (typos, aliases, spelling,
duplicates); Stage and Lead Status against the default picklists; Amount as a plain number; 3-letter currency codes;
probability 0 to 100; probability against Closed Won / Closed Lost; email shape and duplicates; duplicate accounts
and duplicate deals; scientific notation in phones and numbers; date layouts and mixed day-first /
month-first columns; owner, stage and picklist lists for you to compare; delimiter; unterminated quotes; cell
counts; blank rows; row and file size limits; Excel error values; encoding.

## Rules read from memory, and what is not checked

Field names, default picklist values and limits are read from memory of Zoho CRM's public import help; no
Zoho CRM account was available. `NOT_CHECKED` in `calc.mjs` lists what a file alone cannot answer
(custom fields and edited picklists, owner matching, existing records and the duplicate setting,
enabled currencies, edition limits, the date and number formats chosen at import, deliverability). The page shows it and every result
carries it.

## Safe fixes

`repair()` is formatting only and lists each change with its line: separator, heading spelling to
the field name, stray spaces, `mailto:`, email case, a trailing `.0` or apostrophe on phone cells,
a default Stage or Lead Status in its usual capitals, currency codes in capitals, blank rows. It never edits a
name, a value, a date, an ID or the digits of a phone number, and never deletes duplicates.

## Run

Open `index.html` through any static server. Tests: `node --test`.
