# HubSpot Contacts CSV Check

A free browser tool for sales-ops people, marketers and agencies loading a contacts or companies
list into HubSpot from a spreadsheet, another CRM or an old export: **paste or drop the CSV and see
every problem with its line number before the import fails or creates the wrong records, then
download a cleaned copy.** The file is read in the browser; nothing is uploaded and no login or API
key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/hubspot-contacts-csv-check/

After using this, you can now **find the same email on two rows, the address that is not an
address, the phone number Excel turned into `4.41175E+11`, the ZIP code that lost its zero, the
`Customer` that should be `customer`, and the date column that mixes `25/03/2026` with
`03/25/2026`**, which used to mean a half-imported list and a hunt through the rows.

## Input

A contacts or companies CSV whose headings are HubSpot property labels (`First Name`) or internal
names (`firstname`). Comma, semicolon or tab separated; UTF-8 with or without a BOM. The kind is
worked out from the headings, or chosen.

## Checks

Headings against default property labels and internal names (typos, common aliases, spelling,
duplicates); Email or Record ID present; email shape and multiple addresses; duplicate emails and
company domains; scientific notation; lost leading zeros in ZIP and phone cells; lifecycle stage and
lead status internal values; date layouts and mixed day-first / month-first columns; plain numbers
in number properties; delimiter; unterminated quotes; cell counts; blank rows; row, column and file
size limits; Excel error values; encoding.

## Rules read from memory, and what is not checked

Property names, option values and limits are read from memory of HubSpot's public import help; no
HubSpot account was available. `NOT_CHECKED` in `calc.mjs` lists what a file alone cannot answer
(owner matching, custom properties and options, existing records, backwards lifecycle moves, the
date format chosen at import, deliverability, account validation rules). The page shows it and every
result carries it.

## Safe fixes

`repair()` is formatting only and lists each change with its line: separator, heading spelling to the
property label, stray spaces, `mailto:`, email case, a trailing `.0` or apostrophe on phone and ZIP
cells, default lifecycle stage and lead status written as internal values, blank rows. It never edits
a name, an address, the digits of a phone or ZIP code, or a date, and never deletes duplicates.

## Run

Open `index.html` through any static server. Tests: `node --test`.
