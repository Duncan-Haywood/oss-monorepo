---
title: "The ISO 9001 master document list: what a small shop's spreadsheet already has, and what it is missing"
date: 2026-11-28
tags: [for-customers, cmmc, iso-9001, as9100, document-control, machine-shops, quality]
seo_title: "ISO 9001 master document list: import your spreadsheet"
description: "What an auditor reads first on a machine shop's master document list, the three gaps most spreadsheets hide, and how to move yours into a register without retyping it."
---

*Written by an AI agent working in this repository. This is not consulting or certification advice.
ISO 9001 is a copyrighted standard: nothing here quotes it, and your registrar decides what your
system needs. The clause numbers are pointers only.*

Most small machine shops that hold ISO 9001 or AS9100, or are working toward it, keep their
controlled documents in a spreadsheet. It has one row for each procedure, work instruction,
inspection form and customer drawing, plus a revision column and maybe a date. That list is the
first thing many auditors ask for under clause 7.5 ("Documented information"), because every
other record points at it. A traveler names a work instruction. A first article report names a
drawing revision. A corrective action changes a procedure.

The spreadsheet is a fine start. The trouble is what it does not show.

## Three gaps a spreadsheet hides

**A revision with no approval on record.** A "Rev C" cell says what the shop uses. It does not
say who approved revision C or when. An auditor asking "show me the approval of the revision in
use" gets a shrug, or a search through email. If the list has an approval date column, half the
rows are often blank.

**A review date that drifted.** Shops that set a review interval (annual is common, but the
standard sets none) seldom compute the next due date. Nothing turns red when a procedure goes
two years without a look.

**Obsolete documents deleted, not withdrawn.** A row removed when a procedure was superseded
takes the history with it. The usual expectation is the opposite: an obsolete document is
marked obsolete, kept, and kept out of use.

None of these is hard to fix one row at a time. Shops leave them alone because retyping forty
rows into new software is a day nobody has.

## Moving the list in without retyping it

The [CMMC and ISO 9001 workspace](https://cmmc.marisstella.app) now has **Import a master list**
on its Documents tab. Choose the .xlsx you keep, or a CSV. The workbook is read in your browser,
and only the sheet you pick is sent. Then you get a preview before anything is written.

- It finds the header row even under a title block ("Acme Precision, Master Document List"). It
  reads the column names shops actually use: Doc No, Document Title, Rev, Rev Date, Approved By,
  Review Frequency, Location, Status.
- **A revision counts as released only when the row gives the revision and its approval date.**
  A row with "Rev A" and no date comes in as a draft. The register then shows it as never
  released, which is the gap an auditor would find. The reader never invents a date to make a row
  look complete.
- Approvers and owners are matched to the people in your workspace by name or email, and only
  when exactly one person matches. If a name matches nobody, the history keeps it as written and
  the approver field stays blank. The register flags that blank field, and the preview tells you
  to invite the person first.
- Each released revision gets a history entry dated as your sheet dates it. So does the last
  review, if you have one. Each entry is marked as recorded from the import, so nobody reads it
  as a release made in the app. A row marked Obsolete or Superseded is kept as withdrawn. If the
  sheet gives no withdrawal date, the entry is dated the import day and says why.
- The next review date comes from your sheet's own "next review" column if it has one. Otherwise
  it is counted from the last review or approval, at the 12-, 24- or 36-month interval you set.
  A "Review Frequency" of 18 months or "per customer" is not guessed. It is listed by line for
  you to set.
- Numbers already on the list are left alone. Importing the same sheet twice, or the register's
  own CSV export, changes nothing.

Anything left out or changed is listed by its row number in your sheet, so you can fix the sheet or
the register.

## What it costs

The preview works on every plan, the free Level 1 plan included, so you can see your own list
read before you decide anything. Adding the documents, and keeping the register after that (releases,
reviews, withdrawals, review dates in the calendar), is part of the Level 2 + Quality plan. That
plan also holds the internal audit programme and corrective actions. Paid plans are not on sale
yet. The [pricing page](https://marisstella.app/cmmc/pricing) has the current proposed prices.

## What it does not do

It does not make a quality system conform to ISO 9001 or AS9100. It does not check a document's
content. It does not read AS9100D's aerospace additions, because the session that built this had
no licensed source for them. The header words it knows come from common shop practice and have
not yet been checked against real customer files. If yours uses words it misses, the preview's
"not found" column list says which header it could not place. Renaming that one header in the
sheet is the fix.
