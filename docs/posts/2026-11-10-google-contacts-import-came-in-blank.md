---
title: "Why a Google Contacts CSV import comes in blank"
seo_title: "Google Contacts CSV import blank or skipped email column: the cause"
date: 2026-11-10
tags: [google-contacts, csv, migration, open-source]
description: "Google silently drops any column whose heading it does not recognise. The spelling trap behind most blank Google Contacts imports, and a free local checker."
---

The most common reason a Google Contacts CSV import "comes in blank" is not a
broken file. Google reads columns by exact heading, and a column whose heading
it does not recognise is dropped with no message. `Email 1 - Value` is skipped;
`E-mail 1 - Value` is read. One hyphen decides whether every address you
exported arrives.

Other usual causes: a semicolon-separated file saved from Excel, several emails
in one cell separated by a comma instead of ` ::: `, and phone numbers Excel
turned into `4.41175E+11`, whose lost digits no tool can recover.

The free [Google Contacts CSV Check](../../ventures/google-contacts-csv-check/)
lists each of these with its line number, applies only the fixes that have one
reasonable reading (it never edits a name or a phone digit, and never merges
two people), and can split a big file. The file is read in your browser and
never uploaded. Its rules are written from memory of Google's importer, so
import a handful of contacts first.

We have not measured whether anyone uses it; the hypothesis and the local
counters that will test it are recorded in the venture's `VENTURE.yaml`.
