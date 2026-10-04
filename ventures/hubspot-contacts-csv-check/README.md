# HubSpot Contacts CSV Check

A free browser tool for marketers, sales ops and founders moving contacts into HubSpot from a
spreadsheet, another CRM, a mailing-list tool or an event scan: **paste or drop the contacts file and
see every problem with its line number before the import fails, merges the wrong people or creates
duplicates, then download a cleaned copy.** The file is read in the browser; nothing is uploaded and
no login or API key is needed.

After using this, you can now **find the rows HubSpot will silently merge because they share an
email, the email cell holding two addresses, the Lifecycle Stage that is not a stage, the date column
that mixes day-first and month-first, and the phone number Excel turned into `4.41175E+11`**, which
used to mean a bad import and a clean-up inside the CRM.

## Input

A contacts CSV with a header row. Headings are matched to HubSpot's default contact properties by
name and common aliases (E-mail, Mobile, Surname, Zip, …); anything else is reported as a column to
map by hand. Comma, semicolon or tab separated; UTF-8 with or without a BOM.

## Checks

Headings and column aliases; missing email column; delimiter; unterminated quotes; cell counts;
email shape, multiple addresses, domain typos and role addresses; shared emails and exact duplicate
rows; Lifecycle Stage and Lead Status values; mixed and ambiguous date formats; number properties;
scientific notation and phone digit counts; lost leading zeros; website shape; Excel error values;
encoding; file size.

## Safe fixes

`repair()` changes only things with one reasonable reading and lists every change. It never edits the
letters of a name, a company, a phone number, a postal code, a date or a lifecycle stage.
`duplicatesCsv()` lists every group of rows that share an email for review.

## Run

Open `index.html` through any static server. Tests: `node --test`.
