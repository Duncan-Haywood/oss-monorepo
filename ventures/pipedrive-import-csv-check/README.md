# Pipedrive Import CSV Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/pipedrive-import-csv-check/>

A free browser tool for sales teams, agencies and ops people moving deals, people or organizations
into Pipedrive from a spreadsheet or another CRM: **paste or drop the CSV and see every problem with
its line number before the import skips rows or doubles your pipeline, then download a cleaned
copy.** The file is read in the browser; nothing is uploaded and no login or API key is needed.

After using this, you can now **find the deal whose status is `Closed Won`, the value written
`$12,000`, the probability of `0.6` that Pipedrive reads as 0.6 percent, the same deal on two rows,
the phone number Excel turned into `4.41175E+11`, and the date column that mixes `25/03/2026` with
`03/25/2026`**, which used to mean a half-imported pipeline and a hunt through the rows.

## Input

A deals, people or organizations CSV whose headings are Pipedrive field names (`Title`, `Value`,
`Stage`, `Status`, `Name`, `Email`, `Organization`). Comma, semicolon or tab separated; UTF-8 with
or without a BOM. The kind is worked out from the headings, or chosen.

## Checks

Required name or title; headings against standard field names (typos, aliases, spelling,
duplicates); deal status Open / Won / Lost; value as a plain number; 3-letter currency codes;
probability 0 to 100; won time on open deals; email shape and duplicates; duplicate organizations
and duplicate deals; scientific notation in phones and numbers; date layouts and mixed day-first /
month-first columns; owner and stage lists for you to compare; delimiter; unterminated quotes; cell
counts; blank rows; row and file size limits; Excel error values; encoding.

## Rules read from memory, and what is not checked

Field names, deal statuses and limits are read from memory of Pipedrive's public import help; no
Pipedrive account was available. `NOT_CHECKED` in `calc.mjs` lists what a file alone cannot answer
(custom fields, pipeline and stage names, owner matching, existing records, enabled currencies, the
date and number formats chosen at import, deliverability). The page shows it and every result
carries it.

## Safe fixes

`repair()` is formatting only and lists each change with its line: separator, heading spelling to
the field name, stray spaces, `mailto:`, email case, a trailing `.0` or apostrophe on phone cells,
deal status written as Open / Won / Lost, currency codes in capitals, blank rows. It never edits a
name, a value, a date, an ID or the digits of a phone number, and never deletes duplicates.

## Run

Open `index.html` through any static server. Tests: `node --test`.
