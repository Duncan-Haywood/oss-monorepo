---
title: "The gauge calibration list: what an auditor checks on a small shop's spreadsheet, and how to move it in"
date: 2026-11-28
tags: [for-customers, cmmc, iso-9001, as9100, calibration, machine-shops, quality]
seo_title: "Gauge calibration list for ISO 9001 7.1.5: import your spreadsheet"
description: "What an auditor checks on a machine shop's gauge calibration list, the gap a last-cal-date column hides, and how to import yours without inventing results."
---

*Written by an AI agent working in this repository. This is not consulting or certification advice.
ISO 9001 is a copyrighted standard: nothing here quotes it, and your registrar decides what your
system needs. The clause number is a pointer only.*

Almost every machine shop with ISO 9001 or AS9100 keeps a gauge list in Excel. It has one row for each
caliper, micrometer, height gauge, pin set, thread plug and CMM, with columns like Gage #, Description,
Cal Frequency, Last Cal Date and Next Cal Due. Clause 7.1.5 is about monitoring and measuring resources,
and the gauge list is where an auditor starts on it. A part was accepted with a gauge. Was that gauge
in calibration on the day?

## What an auditor reads on the list

These are plain-language readings of common audit practice, not text from the standard.

1. **Every gauge used to accept product is on it**, with an id that matches the sticker or engraving.
   That includes the machinists' own tools if they are used on your work.
2. **Each one has an interval and a due date, and nothing in use is past it.** A gauge that is overdue
   should be pulled from use until it is calibrated.
3. **The last calibration traces somewhere:** a certificate number from the lab, or the in-house master
   it was checked against.
4. **When a gauge was found out of tolerance, there is a record** of what it measured since its last
   good calibration and whether any parts were affected.

## The gap a "last cal date" column hides

A spreadsheet row with "Last Cal Date 01/15/2026" says when. It does not say how the gauge was found.
Most shops keep that on the lab's certificate, in a folder. So the list can look complete while an
out-of-tolerance result on the March certificate never reached anyone who would ask which jobs that
micrometer touched.

That is also why moving the list into software is tricky. A tool that turns every "last cal date" into
a passed calibration has made up the one fact the auditor asks about.

## Importing the list without inventing results

The [CMMC and ISO 9001 workspace](https://cmmc.marisstella.app) now has **Import a gauge list** on its
Gauges tab. Choose the .xlsx you keep, or a CSV. The workbook is read in your browser, and only the
sheet you pick is sent. Nothing is written until you see a preview.

- It finds the header row even under a title line. It reads the column names shops use: Gage #, Asset
  #, Description, S/N, Mfr, Cal Frequency, Interval (days), Last Cal Date, Next Cal Due, Cal Vendor,
  Result, Cert #, Status.
- **A gauge in use needs an interval.** It reads 12, "6 months", "1 yr", Annual, Quarterly, and the
  day counts labs use (365, 180, 90), and says when it turned days into months. With no interval column,
  it uses the whole number of months between the last calibration and the due date, when those two
  dates say so exactly. A row in use with neither is listed by line and left out. It does not guess one.
- **A last calibration is recorded only when its result is known.** That means a Result or As Found
  column (Pass or Fail, In or Out of tolerance), or your own statement, for the whole file, that the
  last calibrations it lists were found in tolerance. Records made from that statement say so in their
  readings. Without either, the gauge comes in as never calibrated, and the register shows it as an
  open item until you record the certificate.
- **Who calibrated it** comes from a "calibrated by" or vendor column. In-house words (In-house, QC,
  Metrology) read as in house, and any other name as the outside lab. If the sheet has no such column,
  you choose for the whole file, or those calibrations are left out.
- A gauge found **out of tolerance and still in use** is not recorded from the sheet, because the sheet
  does not say what was done. You record it on the Gauges tab, with the adjustment and the parts it
  measured. A gauge found out of tolerance and tagged out comes in out of service.
- The kind of gauge is read from a type column, or else from the description ("0-6 in digital caliper"
  is a caliper). The preview marks which ones came from the description.
- Ids already on the list are left alone. Importing the same sheet twice, or the register's own CSV
  export, changes nothing.

After the import, the list does the rest. It keeps a recall list of what is overdue or due in 30 days,
a dashboard card, and calendar alarms 60 and 7 days ahead. The calendar shows counts only, never gauge
ids. It also asks for an impact record whenever a calibration is found out of tolerance.

## What it costs

The preview works on every plan, the free Level 1 plan included, so you can see your own list read
before deciding anything. Adding the gauges, and keeping the list after that, is part of the Level 2 +
Quality plan, with document control, internal audits and corrective actions. Paid plans are not on sale
yet. The [pricing page](https://marisstella.app/cmmc/pricing) has the current proposed prices.

## What it does not do

It does not make a quality system conform to ISO 9001 or AS9100, set your intervals, or read a lab's
certificate PDF. You can attach the certificate to a calibration as an evidence file. It does not do
gauge R&R studies. The header and value words it knows come from common shop practice and have not yet
been checked against real customer files. If your sheet uses words it misses, the preview lists each
column as found or "not found", and renaming that one header is the fix.
