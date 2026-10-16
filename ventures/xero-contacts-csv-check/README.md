# Xero Contacts CSV Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/xero-contacts-csv-check/>

A free browser tool for bookkeepers and small businesses moving customers and suppliers into Xero
from a spreadsheet, a CRM or another accounting package: **paste or drop the contacts file and see
every problem with its line number before the import fails or creates the wrong records, then
download a cleaned copy or a set of smaller files.** The file is read in the browser; nothing is
uploaded and no login or API key is needed.

After using this, you can now **find the two contacts whose names collide once capitals and spaces
are ignored, the email cell holding two addresses, the phone number Excel turned into
`4.41175E+11`, the ZIP code that lost its zero, and the payment term Xero does not know**, which used
to mean a rejected upload and a hunt through the rows.

## Input

A contacts CSV in Xero's import template layout (`*ContactName` plus optional email, name, postal and
street address, phone, bank, tax, payment terms, discount and tracking columns). Comma, semicolon or
tab separated; UTF-8 with or without a BOM.

## Checks

Headings and duplicates; the required name; delimiter; unterminated quotes; cell counts; duplicate
and near-duplicate names; exact duplicate rows; email shape and multiple addresses; scientific
notation; lost leading zeros; payment term values; discount range; website shape; Excel error
values; encoding; file size.

## Safe fixes and splitting

`repair()` changes only things with one reasonable reading and lists every change. It never edits
the letters of a name, an address, or a phone, bank or tax number. `splitContacts()` cuts a file into
parts of a chosen size, each with the heading row.

## Run

Open `index.html` through any static server. Tests: `node --test`.
