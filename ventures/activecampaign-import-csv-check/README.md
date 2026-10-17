# ActiveCampaign Import CSV Check

A free browser tool for marketers, agencies and ops people moving contacts, accounts or deals into
ActiveCampaign from a spreadsheet, a mailing platform or another CRM: **paste or drop the CSV and see
every problem with its line number before the import skips rows or doubles your list, then download a
cleaned copy.** The file is read in the browser; nothing is uploaded and no login or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/activecampaign-import-csv-check/

After using this, you can now **find the contact with no email, the same address on two rows, the tags written `vip;wholesale`, the deal Value written `$12,000`, the Status of `won`, the phone number Excel turned into `4.41175E+11`, and the date column that mixes `25/03/2026` with `03/25/2026`**, which used to mean a half-imported list and a hunt through the rows.

## Input

A contacts, accounts or deals CSV whose headings are ActiveCampaign field names (`Email`, `First Name`,
`Tags`, `Account Name`, `Title`, `Value`, `Status`). Comma, semicolon or tab separated; UTF-8 with or
without a BOM. The kind is worked out from the headings, or chosen.

## Checks

Required Email, Account Name or Title; headings against standard field names (typos, aliases, spelling,
duplicates); email shape and duplicates; tag separators; deal Value as a plain number; 3-letter currency
codes; deal Status Open / Won / Lost; duplicate accounts and deals; scientific notation in phones and
numbers; date layouts and mixed day-first / month-first columns; owner and stage lists for you to compare;
delimiter; unterminated quotes; cell counts; blank rows; row and file size limits; Excel error values; encoding.

## Rules read from memory, and what is not checked

Field names, statuses and limits are read from memory of ActiveCampaign's public import help; no
ActiveCampaign account was available. `NOT_CHECKED` in `calc.mjs` lists what a file alone cannot answer
(custom fields, pipelines and stages, owner matching, existing contacts, suppression and consent,
enabled currencies, plan limits, the formats chosen at import, deliverability). The page shows it and
every result carries it. Whether you may email a contact is out of scope.

## Safe fixes

`repair()` is formatting only and lists each change with its line: separator, heading spelling to the
field name, stray spaces, `mailto:`, email case, a trailing `.0` or apostrophe on phone cells, a deal
Status written as Open, Won or Lost, currency codes in capitals, blank rows. It never edits a name, a
value, a date, an ID or the digits of a phone number, and never deletes duplicates.

## Run

Open `index.html` through any static server. Tests: `node --test`.
