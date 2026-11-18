---
title: "Reading In/Out columns from a scheduler export"
seo_title: "Import a published schedule CSV with In and Out columns"
date: 2026-11-05
tags: [shift-roster-builder, import, product]
description: "The shift roster builder's schedule import now reads In/Out and Time In/Time Out headers, so more exports load without renaming columns."
---

Owners leaving a paid scheduler want their old shift pattern loaded without fiddling with column names. The roster builder's `--import-shifts` and page import already matched Start/End style headers. It now also reads `In`/`Out`, `Time In`/`Time Out`, `Scheduled In`/`Scheduled Out`, and `Position Name`, `Role Name` and `Job Name` for the role.

These names are still written from common usage, not from a real vendor export; the importer lists any column it did not use so a mismatch is visible. A real published-schedule export is still the open item in the flagship's notes.
