---
title: Why the framing budget now asks for the prices it needs
date: 2026-11-03
description: The wall-framing takeoff budget used to take prices as lines of text; it now lists exactly the prices a plan still needs, with units, as boxes.
tags: [wall-framing, construction, ux]
---
The framing takeoff turns a house into quantities, then into a budget from the prices you type. Until now you typed those as `name, number` lines into a text area, and had to know the names (`drywallSheet`, `laborWallFoot`, and about 80 more).

Every budget line now carries the price name that would fill it. The page lists a price sheet from that: one box per price the plan still needs, with the quantity and the unit (per sheet, per board, per foot). Typing in a box writes the line in the text area, and emptying it removes the line, so the CLI and plan-file route are unchanged. Nothing is pre-filled; the tool still ships no price.

Checked three ways: a unit test that every unpriced line names its price and that typing those prices leaves nothing unpriced, the existing 138 page, budget and CLI tests, and a headless Chromium click script (`eval-pricesheet-click.mjs`). A real contractor has not yet used it.
