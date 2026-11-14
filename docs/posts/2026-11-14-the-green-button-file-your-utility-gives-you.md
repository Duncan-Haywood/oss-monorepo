---
title: "The Green Button File Your Utility Gives You, and Two Ways a Tool Can Misread It"
seo_title: "Reading Green Button CSV and XML Interval Data Correctly"
date: 2026-11-14
tags: [energy, demand-charges, green-button, website]
description: "Our demand-charge analyzer refused a common Green Button CSV layout and could not open the XML. Both are fixed, with daylight saving read from the file."
---

Most US utilities let a customer download their meter's 15-minute readings through Green Button "Download My Data". The [demand charge analyzer](/demand-charge-interval-analyzer/) is built on that file: it finds each month's peak, the charge it set, and what a battery would save. Everything it reports depends on reading the file correctly. Two things were wrong.

## 1. The layout many utilities use was refused

Opower hosts the account pages for many utilities (PG&E and ComEd among them), and their CSV puts the date and the start time in separate columns:

```
TYPE,DATE,START TIME,END TIME,USAGE,UNITS,COST,NOTES
Electric usage,2024-01-01,00:00,00:14,1.25,kWh,$0.20,
```

The parser took the first column that looked like a date, `DATE`, and ignored `START TIME`. Every reading in a day got the same timestamp, 95 of 96 were thrown away as duplicates, and the page said the readings were "more than two hours apart". A month of real data came out as 31 readings.

It now joins a date-only column to the start-time column (24-hour or `1:15 PM`). It also reads the unit: a `kWh` header or a `UNITS` column sets "Readings are" to kWh per interval, unless you already chose a unit yourself. If your choice disagrees with the file, the page flags it. On 15-minute data, mixing up kW and kWh makes every peak four times too big or too small.

## 2. The XML download could not be opened

The other Green Button format is XML (the NAESB ESPI standard). The file picker accepted only `.csv`. It now opens the XML too, and three details matter:

- **Each series has its own unit and scale.** A file can hold electricity delivered to you and electricity your solar panels sent back, each with its own `powerOfTenMultiplier`. The reader follows each block's link to its reading type, uses the delivered series, and names what it skipped. The sibling [service load check](/service-load-check/) used to merge the two by keeping the larger reading. It now uses the same reader.
- **Times are in UTC.** Each reading's start is a Unix timestamp. The file carries the local offset (`tzOffset`) and daylight-saving rules packed into 32-bit codes. US files write `360E2000` (second Sunday of March, 02:00) and `B40E2000` (first Sunday of November, 02:00).
- **Daylight saving changes what you are billed for.** A reader that applies only `tzOffset` puts every summer reading an hour early. On a 16:00 to 21:00 on-peak window, that bills the battery plan against 17:00 to 22:00 instead. The reader decodes all eight rule operators in the schema (fixed day, on-or-after, first to fifth occurrence, last occurrence). The tests check the exact minute of each change for US Eastern, the EU last-Sunday rule and Sydney, where daylight time wraps the new year.

The converted readings appear in the input box as plain CSV, so you can see exactly what is being analyzed. A synthetic year of 15-minute XML (12 MB) reads in under half a second.

## What is not checked

No real utility's XML file could be downloaded from the machine this was built on, so the test files follow the ESPI schema's structure rather than copying a real download. Some files may define the November change hour as standard rather than daylight time. That would move only the readings in the hour around the change. If your utility's file reads wrong, the page shows its notes and the converted CSV, and an issue with the notes (not your data) is the fastest way to get it fixed.

Source and tests: [`ventures/demand-charge-interval-analyzer/greenbutton.mjs`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/demand-charge-interval-analyzer). Nothing is uploaded: the file is read in your browser.
