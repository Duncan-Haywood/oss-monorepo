---
title: "Is the house late? A deadline check for the construction schedule"
seo_title: "Construction schedule deadline check: working days late or to spare"
date: 2026-10-31
tags: [construction, scheduling, wall-framing-takeoff]
description: "The free wall-framing-takeoff schedule engine now takes a contract completion date and says how many working days late or to spare the job is, and what the late days cost."
---

The schedule engine in `wall-framing-takeoff` already finds the critical path,
levels crews and prices slips. It now also takes a `deadline` (a `YYYY-MM-DD`
completion date from your contract) and reports the finish with your crews
against it: working days late, or to spare. Type a `carryPerDay` figure and the
late days get a dollar cost.

A deadline on a weekend or holiday counts as the working day before it. The
dates are yours; nothing is forecast. It is covered by hand-checked tests, and
for now it is available from the CLI and the JSON output, not yet a page field.
