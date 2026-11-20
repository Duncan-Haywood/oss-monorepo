---
title: "An IDS file your contractor can read: every requirement as a sentence"
date: 2026-11-20
tags: [ids-model-check, ventures]
description: "The free IDS checker now writes an IDS as a printable document in plain English. On 4,458 facets it carries every value IfcTester reads, none dropped."
---

An IDS (Information Delivery Specification) file says what a building model
must contain: which walls need `Pset_WallCommon.IsExternal`, which spaces need
a Uniclass code, which beams must sit inside a bridge. Software reads it
well. People mostly do not. The modeller at a consultant, the contractor's BIM
coordinator and the client who signs off the requirements usually get them as
a PDF appendix to the contract, and someone made that appendix by retyping
the XML by hand. After the next edit to the IDS, the appendix and the file the
models are checked against no longer say the same thing.

[IDS Model Check](https://marisstella.app/ids-model-check/) now writes that
appendix from the IDS itself. Audit an IDS on the page and press *Download as
a readable document*. You get an HTML page that prints cleanly to PDF, or
Markdown. From the command line it is `node cli.mjs --to-doc spec.ids -o
spec.html`.

## What it looks like

A summary table comes first: each specification, what it applies to, how many
requirements it has and which IFC versions it covers. Then each specification
gets its own section. Here is one from buildingSMART Portugal's published
requirements for architectural models:

> **2. Spaces**
>
> Applies to every `IfcSpace`.
>
> **Required: the model must contain at least one such element, and every one must meet the requirements below.**
>
> - It must be classified in the system `SECClasS` with a code matching the pattern `SL_.*`.
> - Its attribute `Name` must be filled in (not empty).
> - Its attribute `Description` must be filled in (not empty).
> - It must have the property `NetFloorArea` in the set `Qto_SpaceBaseQuantities`, of data type `IFCAREAMEASURE`, with a value.

Names and values are copied exactly as the IDS writes them, since a model has
to match them character for character. The one change is that class names get
their schema spelling, so `IFCSPACE` reads as `IfcSpace`. Where a number
carries a unit, the sentence says which SI unit IDS expects: "at least `0.1`
and less than `0.5` (in metres, as IDS requires, whatever unit the model
uses)". That one trips people up, because a model drawn in millimetres still
has to meet the requirement in metres.

## How we know it says what the file says

A document like this is only useful if it says exactly what the XML says.
Turning XML into English could drop the third value of an enumeration, leave
out a bound, or describe an optional property as required. So we compared
every sentence with an independent reader of the same files, IfcTester
0.9.0 from IfcOpenShell.

The test set was 64 IDS files published on GitHub plus buildingSMART's own
test files, 144 in all. IfcTester opens 113 of them. Those 113 hold 1,224
specifications and 4,458 facets. For every facet the check confirmed:

- it got a sentence, of the same kind and in the same position;
- the sentence has the same required, optional or prohibited reading;
- each of the 10,892 names and values IfcTester holds for it (enumeration
  members, patterns, bounds, lengths, data types) appears in the sentence.

There were no misses. To make sure the check could actually fail, we renamed
one property set and flipped one cardinality on a copy of the output. It
reported 83 and 11 misses.

The test cannot tell you whether the English is clear. For that, we collected
the 128 sentence shapes the corpus produces and read each one. That read found
four bits of clumsy grammar, now fixed, such as "a code that is matching the
pattern". Nobody who receives these appendices for a living has read the
output yet, and their opinion is the one that counts.

Method, numbers and limits are in
[`eval/spec-doc-2026-11-20.md`](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/spec-doc-2026-11-20.md).
The tool is free and MIT licensed. Your IDS never leaves your browser.
