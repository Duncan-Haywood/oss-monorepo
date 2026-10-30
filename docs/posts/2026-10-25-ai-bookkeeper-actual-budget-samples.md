---
title: "26 statement files from Actual Budget, one missing header"
date: 2026-10-25
description: "Actual Budget's test statements (UTF-16, Latin-1, CAMT, QIF, OFX) through ai-bookkeeper's readers: text and signs fine; one Hungarian header unrecognised."
tags: [ai-bookkeeper, bank-import, testing]
---

Most of [ai-bookkeeper](../../ventures/ai-bookkeeper/)'s import tests use rows we wrote ourselves, so this run read the sample statements another open-source budgeting app keeps for its own importers: Actual Budget's `mocks/files` folder (MIT, fetched at run time, nothing copied).

The 26 files cover OFX and QFX in UTF-8, Windows-1252 and ISO-8859-1, QIF with payee and memo lines, three CAMT.053 files (one Latin-1), and CSV in UTF-8 with a byte-order mark, UTF-16 in both byte orders and Windows-1252. Every file read with the right accents, euro signs, dates and signs. Encoding is where bank-file readers usually break, so that is a useful result.

One gap: a Hungarian CSV header, `Partner név` ("partner name"), was not treated as a description column. The sample's own two rows have no partner, so the miss only appears with filled rows. We now recognise the header and added a test with made-up rows in that layout.

Not covered: no real Hungarian bank download has been tried, and the rows in the test are invented.
