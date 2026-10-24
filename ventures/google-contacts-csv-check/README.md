# Google Contacts CSV Check

A free browser tool for anyone moving contacts into Google Contacts from a phone, Outlook, a CRM or a
spreadsheet: **paste or drop the CSV and see every problem with its line number before the import
comes in blank or duplicates everyone, then download a cleaned copy or smaller files.** The file is
read in the browser; nothing is uploaded and no login or API key is needed.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/google-contacts-csv-check/

After using this, you can now **find the column Google silently skipped because its heading was
spelled `Email 1 - Value`, the cell with two emails separated by a comma, the phone number Excel
turned into `4.41175E+11`, and the rows that would import as the same person twice**.

## Input

A contacts CSV in either Google layout (`First Name`, `Last Name`, `Labels`, `E-mail 1 - Value` ...
or the older `Given Name`, `Family Name`, `Group Membership`, `E-mail 1 - Type` ...). Comma,
semicolon or tab separated; UTF-8 with or without a BOM.

## Checks

Headings (unknown, duplicate, spelling, mixed layouts); the `:::` multi-value separator; email and
phone shape; scientific notation; lost leading zeros; birthdays; websites; blank and nameless rows;
exact duplicate rows and shared emails; delimiter; unterminated quotes; cell counts; Excel error
values; encoding; file size.

## Safe fixes and splitting

`repair()` changes only things with one reasonable reading and lists every change. It never edits
the letters of a name, note or address, or the digits of a phone number, and never merges two
people. `splitContacts()` cuts a file into parts of a chosen size, each with the heading row.

## Run

Open `index.html` through any static server. Tests: `node --test`.
