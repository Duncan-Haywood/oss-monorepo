---
title: "Importing a schedule export: the header names real tools use"
seo_title: "Importing a shift schedule CSV: start, end and date header names"
date: 2026-11-05
tags: [shift-roster-builder, csv, scheduling]
description: "The roster builder's shift importer now also reads Start DateTime, Ends At and Shift Day style headers."
---

Switching schedulers usually starts with an export, and every tool names its columns differently. The shift-roster-builder importer matches headers by synonym. Today it learned `Start DateTime`, `Starts At`, `Clock In Time`, `Scheduled Start Time` and the matching end names, plus `Shift Day` and `Scheduled Day` for the date.

The synonyms were written from memory, not from a real 7shifts, When I Work or Homebase export, so they are tested on invented layouts only. If you have a real export header row (no names or wages needed), it is the most useful thing to send us. The importer runs entirely in the browser or the CLI.
