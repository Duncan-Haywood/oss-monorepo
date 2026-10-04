# Zoho CRM Import CSV Check

A free browser tool for sales teams, agencies and ops people moving leads, contacts, accounts or
deals into Zoho CRM from a spreadsheet or another CRM: **paste or drop the CSV and see every problem
with its line number before the import rejects rows or duplicates records, then download a cleaned
copy.** The file is read in the browser; nothing is uploaded and no login or API key is needed.

After using this, you can now **find the lead with no Company, the deal with no Closing Date, the
Amount written `$12,000`, the same deal on two rows, the phone number Excel turned into
`4.41175E+11`, the ZIP code that lost its leading zero, and the date column that mixes `25/03/2026`
with `03/25/2026`**, which used to mean a half-imported module and a hunt through the rows.

## Input

A leads, contacts, accounts or deals CSV whose headings are Zoho CRM field names (`Last Name`,
`Company`, `Account Name`, `Deal Name`, `Stage`, `Closing Date`, `Amount`, `Email`). Comma,
semicolon or tab separated; UTF-8 with or without a BOM. The module is worked out from the
headings, or chosen.

## Checks

Required fields per module; headings against standard field names (typos, aliases, spelling,
duplicates); email shape and duplicates; duplicate accounts and duplicate deals; amount as a plain
number; employee counts as whole numbers; 3-letter currency codes; probability 0 to 100;
scientific notation in phones and numbers; ZIP codes that lost a leading zero; date layouts and
mixed day-first / month-first columns; owner, stage and lead-source lists for you to compare;
delimiter; unterminated quotes; cell counts; blank rows; row and file size limits; Excel error
values; encoding.

## Rules read from memory, and what is not checked

Field names, mandatory fields, field lengths and limits are read from memory of Zoho CRM's public
import help and are **unverified against a Zoho account** (none was available). `NOT_CHECKED` in
`calc.mjs` lists what a file alone cannot answer (custom fields, picklist options, layouts, owner
matching, existing records and duplicate handling, enabled currencies, the date format chosen at
import, deliverability). The page shows it and every result carries it.

## Safe fixes

`repair()` is formatting only and lists each change with its line: separator, heading spelling to
the field name, stray spaces, `mailto:`, email case, a trailing `.0` or apostrophe on phone cells,
currency codes in capitals, blank rows. It never edits a name, an amount, a date, an ID or the
digits of a phone number, and never deletes duplicates.

## Run

Open `index.html` through any static server. Tests: `node --test`.
