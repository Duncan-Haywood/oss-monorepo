---
title: "Our IRIS 1099 checker rejected the IRS's own template"
date: 2026-11-10
description: "The free IRIS 1099 CSV check had been written from memory in its own column layout, so a correctly filled IRS template failed it with ten missing-column errors. It now reads the 54-column template, and the AI Bookkeeper exports it."
tags: [irs-iris-1099-csv-check, ai-bookkeeper, 1099-nec, iris]
---

The [IRIS 1099 CSV check](https://marisstella.app/irs-iris-1099-csv-check/) is a free page that checks a 1099-NEC or 1099-MISC bulk-upload file before it goes to the IRS's IRIS Taxpayer Portal. Its README said what it was built from: "every rule is from memory". That covered the column names too. It expected a short layout of its own: `Payer TIN`, `Recipient Name`, `NEC Box 1 Nonemployee Compensation` and so on.

The real template looks nothing like that. We could not read it directly: the portal gives the template out only after login, and irs.gov does not load from where we build. So we compared four open-source projects that write or check these files and say they follow the IRS template or its formatting guidelines: ubukhari/iris-1099, christcr2012/appliance-desk, techmore/rupert and Tyler-LeDuc/leducsystems. All four use the same header row. For the 1099-NEC it has 54 columns, A to BB, from `Form Type`, `Tax Year`, `Payer TIN Type` and `Payer Taxpayer ID Number`, through a `Recipient Name Type` and the business-name and first/middle/last-name columns, to `Box 1 - Nonemployee Compensation`, a `Combined Federal/State Filing (CF/SF)` flag and two blocks of six state columns. The 1099-MISC has 64 columns, A to BL.

Fed a correctly filled template, the old checker reported ten errors, one for each of its own "required" column names it could not find. Someone filling in the IRS's file would have been told it was broken. That is the opposite of the tool's job.

## What changed

The checker now spots the template by its column names and checks it in its own terms:

- every template column present (IRIS checks the header row against its template, so a missing column is a warning, and a missing TIN, address or form column is an error), the template's column order, and one form per file;
- `Payer TIN Type` and `Recipient TIN Type` on every row;
- name type `B` with the name in `Business or Entity Name Line 1`, or `I` with first and last name filled in;
- Y/N check-box columns, `State 1` and `State 2` codes, and US state and ZIP rules skipped for a foreign `Recipient Country`;
- a warning above 100 records in one upload.

Findings and safe fixes now use the template's own column names, so a message reads "Recipient Taxpayer ID Number starts with 666", not the old internal name. The old short layout is still read. Where the four sources disagree, every spelling passes: `Last Name` with or without `(Surname)`, a `*` on required columns, and the 1099-MISC `FATCA Filing Requirements` and `Box 14` columns.

## The bookkeeper writes the file now

The [AI Bookkeeper](https://marisstella.app/ai-bookkeeper/) already listed contract labor by payee against the 1099-NEC line. `node cli.mjs contractors --iris --payer payer.json`, or a new button on the page, writes those payees straight into the 54-column template. The payer block comes from the JSON file. The recipient's TIN and address stay blank, because the books never store them. They come from each W-9.

A test runs that export through the checker. The only errors are the W-9 fields: TIN type, TIN, street, city, state and ZIP. Fill those in and the file comes back clean.

## What is still not known

None of this was checked against irs.gov or a real IRIS upload. Four projects agreeing is good evidence for the header text, but they may have copied each other or the same out-of-date guide. The accepted values for name type and the check boxes, and the 100-record limit, come from those projects too. The names in the export are a guess. A name with a business word such as LLC goes on the business line. Any other name is split at its last space into first and last name. Check every row against the W-9.

The first real IRIS acceptance or rejection report is the next thing to fix against. Code: `ventures/irs-iris-1099-csv-check/calc.mjs` (`TEMPLATE_NEC`) and `ventures/ai-bookkeeper/taxforms.mjs` (`nec1099IrisCsv`).

*Not tax advice. Both tools are independent of the IRS.*
