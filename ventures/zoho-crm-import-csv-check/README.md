# Zoho CRM Import CSV Check

A free browser tool for sales teams, agencies and ops people moving Leads, Contacts, Accounts or
Deals into Zoho CRM from a spreadsheet or another CRM: **paste or drop the CSV and see every problem
with its line number before the import skips rows or duplicates records, then download a cleaned
copy.** The file is read in the browser; nothing is uploaded and no login or API key is needed.

After using this, you can now **find the lead with no Company, the contact with no Last Name, the
deal with no Closing Date, the Amount written `$12,000`, the phone number Excel turned into
`4.41175E+11`, and the date column that mixes `25/03/2026` with `03/25/2026`**, which used to mean a
half-imported file and a hunt through the rows.

## Input

A Leads, Contacts, Accounts or Deals CSV whose headings are Zoho CRM field names (`Last Name`,
`Company`, `Account Name`, `Deal Name`, `Stage`, `Amount`, `Closing Date`). Comma, semicolon or tab
separated; UTF-8 with or without a BOM. The kind is worked out from the headings, or chosen.

## Checks

Required fields (Last Name on Leads and Contacts, Company on Leads, Account Name on Accounts, Deal
Name / Stage / Closing Date / Amount on Deals); headings against standard field names (typos,
aliases, spelling, duplicates); amounts as plain numbers; probability 0 to 100; email shape and
duplicates (Email and Secondary Email); duplicate accounts and duplicate deals; scientific notation
in phones and numbers; date layouts and mixed day-first / month-first columns; Lead Source, Lead
Status, Stage and other picklist-like columns (inconsistent spellings, distinct values listed for you
to compare); owner lists; delimiter; unterminated quotes; cell counts; blank rows; row and file size
limits (stated cautiously, from memory); Excel error values; encoding.

## Rules read from memory, and what is not checked

Field names, required fields and limits are read from memory of Zoho CRM's public import help; no
Zoho account was available, and the limits in particular should be verified against Zoho's current
help. `NOT_CHECKED` in `calc.mjs` lists what a file alone cannot answer (custom fields, picklist
options, pipeline fit, owner matching, existing records and lookups, the date format and mapping
chosen in the wizard, deliverability). The page shows it and every result carries it.

## Safe fixes

`repair()` is formatting only and lists each change with its line: separator, heading spelling to
the field name, stray spaces, `mailto:`, email case, a trailing `.0` or apostrophe on phone cells,
blank rows. It never edits a name, an amount, a date, an ID, a picklist value or the digits of a
phone number, and never deletes duplicates.

## Run

Open `index.html` through any static server. Tests: `node --test`.
