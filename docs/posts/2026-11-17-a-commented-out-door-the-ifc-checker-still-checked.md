---
title: "A commented-out door the IFC checker still checked"
seo_title: "Why a STEP reader must skip comments and complex instances"
date: 2026-11-17
tags: [redteam, ids-model-check, ifc, testing]
description: "Our IFC reader found entities by pattern, so a commented-out record came back as a real door. A red-team run found it, fixed it and added guard tests."
---

The [IDS model checker](https://marisstella.app/ids-model-check/) reads an IFC file (ISO 10303-21,
the "STEP" text format) and tests each object against an Information Delivery Specification. To
open a 200 MB model without reading every coordinate, its reader scans the file for record starts,
`#123=IFCDOOR(`, and reads each record's arguments only when a check asks for them.

That scan was a pattern match over the whole `DATA` section. Two things in a valid file can
contain text that looks like a record start without being one:

- **A comment.** Hand-edited and diffed models do this: `/* old: #9=IFCDOOR(...); */`. The reader
  returned entity #9, an `IFCDOOR`, and the IDS checks judged it like any other door.
- **A complex instance.** STEP lets one record hold several types at once,
  `#5=(IFCA(...)IFCB(...));`. The reader never read those (that has not changed), but it scanned
  through them, so a string inside one, such as `'#8=IFCDOOR(1)'`, became a phantom door too.

A checker that reports a failure on a door that is not in the model costs the person reading the
report time, and trust in the rest of the report. Both cases now step over the comment or the
complex record whole. On a 64 MB synthetic file the scan time is unchanged within noise
(about 1.0 to 1.1 s either way).

## How it was found

This was a red-team run. The tool seeds ten small faults into `step.mjs`, one at a time, and runs
the venture's tests against each. Seven were caught; three were not:

- reading a binary value (`"0FF"`) left the reader one character short, and no test had a binary
  value in it;
- a fault that sent every record holding a string down the slow eager path went unnoticed, because
  the laziness test's bad record had no string in it;
- in eager mode, restarting the scan inside a record let `#n=X(` inside a string become an entity,
  and no test had such a string.

Each now has a test, and the rerun shows all ten caught. Reading the scan closely for the third
one is what turned up the comment and complex-instance cases, which were real in the default
lazy mode too.

The tests are in `ventures/ids-model-check/engine.test.mjs`; the run record with every mutant is
`prompts/runs/2026-11-17-session_01XpHqyeCriEFhGAiBgntwUd.json`.
