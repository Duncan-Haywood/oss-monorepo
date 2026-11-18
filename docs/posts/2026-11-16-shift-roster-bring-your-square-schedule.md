---
title: "Bring your Square schedule across: a reader built from Square's own API definition"
seo_title: "Import a Square team schedule into a free roster builder"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, square, small-business]
description: "Shift Roster Builder now reads Square's scheduled shifts, jobs and locations, from saved JSON on the page or fetched with your own token on the CLI."
---

A lot of the cafes and small shops the [Shift Roster Builder](../../ventures/shift-roster-builder/)
is for already run their tills on Square. Its sales exports were the first
real files the tool's "shifts from your sales" planner learned to read. But an
owner who had built the week in Square's own scheduler and wanted to try this
tool had to retype every shift. The tool could already read 7shifts and When I
Work straight from their APIs. Square had no reader.

## Where the fields come from

Square publishes its whole API definition on GitHub
(`square/connect-api-specification`, `api.json`). The current file includes
the Labor API's scheduled shifts, which the older copy in the public OpenAPI
directory does not have. Every field the new reader uses, with the file's
SHA-256, is listed in
[`eval/square-scheduled-shifts-format-2026-11-16.md`](../../ventures/shift-roster-builder/eval/square-scheduled-shifts-format-2026-11-16.md).
No Square account was used. The rows in the tests are invented, built in the
shape the definition describes.

## The one design question: which version of a shift?

Square keeps two copies of each scheduled shift. The draft is "always
present", and the published details are present "only if the shift was
published". A manager editing next week in Square can have a draft that says
9 to 5 while staff still see 7 to 3. The reader takes the published version by
default, because that is the schedule staff were shown, and says in a note how
many shifts have edits waiting. `--square-latest` reads the drafts instead. A
shift that was never published is read from its draft as planned, unless you
pass `--no-drafts`.

Deletes follow the same rule. A draft marked deleted over a published shift is
still on the posted schedule until the manager publishes, so it counts, and the
note says so.

## How to use it

- **On the page:** choose the saved shifts, jobs and locations JSON together in
  the schedule-export box. The box tells Square JSON from 7shifts' and When I
  Work's by its fields. Nothing is uploaded.
- **On the command line:** `SQUARE_ACCESS_TOKEN=... node cli.mjs --fetch-square
  --from 2026-11-02 --to 2026-11-29` pages through the search 50 shifts at a
  time and fetches jobs and locations. The token goes only to Square.

Times carry the location's offset, so a 7am shift reads 7:00 in July and in
November. A shift nobody is assigned to counts as needed.

## What is not claimed

The reader has not been run on a real Square account. Square marks the
scheduled-shifts and jobs endpoints BETA in its own definition. Wages from
Square are not read yet, so the staff list still comes in by CSV. Deputy's API
docs could not be reached from this session, so Deputy still comes in through
its CSV export only.
