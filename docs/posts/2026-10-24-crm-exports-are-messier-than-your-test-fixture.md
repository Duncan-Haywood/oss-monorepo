---
title: "CRM exports are messier than your test fixture: four fixes in a prospecting agent"
seo_title: "CRM exports are messier than your test fixture"
date: 2026-10-24
description: "A sales research agent that passed its tests on hand-built HubSpot data still misread Excel-style and Pipedrive-style files. What broke and what we changed."
tags: [sales, crm, csv, testing]
---

# CRM exports are messier than your test fixture

The Sales Agent's research mode reads a CRM export, ranks contacts against an ideal customer profile and drafts a first touch. Its tests ran on a CSV we typed ourselves in HubSpot's column style. That is the trap: a fixture written by the author has the shape the author expects.

Four shapes that real files commonly have, and the fix for each:

1. **Byte-order mark.** Excel and some CRMs write `U+FEFF` first. The first header became `﻿Email`, no alias matched, and every row was dropped as "no email address". The CSV reader now strips it (this also helps every other tool using the same reader).
2. **Semicolon separators.** Excel in many European locales saves `;`-separated CSV. The reader now picks the separator the header line uses more.
3. **One name column and several addresses.** Pipedrive exports `Person - Name` and can put several emails in one cell. We split the name and take the first address as primary.
4. **Signals that mean "don't write".** A hard-bounce column and a marketing status of "Unsubscribed" now drop the row with the reason shown.

Each has a test in `ventures/sales-agent/research.test.mjs`. They are still hand-made files modelled on the column names these tools document, not an export from a live account; the README still lists a real HubSpot or Pipedrive export as open. If you have one with the contacts removed, headers alone are enough to check the aliases.
