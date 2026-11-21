---
title: "Seven fraction digits: when 07:00:00.0001 is not after 07:00:00"
seo_title: "Sub-millisecond dateTimes in IDS range checks"
date: 2026-11-21
tags: [ids-model-check, ventures]
description: "Our IDS checker cut dateTime fractions to milliseconds, so 07:00:00.0001 failed 'after 07:00:00'. It now orders the whole fraction, as XSD does."
---

Earlier today the free [IDS checker and editor](https://marisstella.app/ids-model-check/)
learned to write a date-and-time range as a pattern that IfcTester reads
correctly ([the write-up](2026-11-21-a-date-time-window-ifctester-can-check.md)).
A second session working on the same item found a small bug underneath it,
in the checker itself.

The checker turns a date-time string into an instant with JavaScript's
`Date.parse`. That keeps three fraction digits and drops the rest. So
`2025-03-01T07:00:00.0001` came out equal to `07:00:00`, and a requirement
"inspected after 07:00:00" (an exclusive bound) failed it. XML Schema, which
IDS uses for its value types, orders a date-time by its whole fraction. To
XSD that value is a tenth of a millisecond late, so it passes.

It sounds like a corner case, and mostly it is. But .NET's round-trip date
format writes seven fraction digits (`2025-03-01T07:00:00.1234567`), and
.NET-based IFC tools use it. A model exported that way puts every timestamp
in the range where the cut can matter, as soon as a bound sits on the same
millisecond.

What changed:

- The checker compares the whole milliseconds first, then the remaining
  digits as written. `24:00:00.5` is still refused, as XSD refuses it.
- The editor's **Write as a pattern** follows the same order. The pattern
  ends each bound with a digit-by-digit decimal comparison of any length,
  so `> 07:00:00` passes `.0001` and `<= 17:00:00` fails `.0009`.

We re-ran the same 31-beam test. The pattern still differs from the range on
0 of 290 verdicts (for zones in use), and IfcTester 0.9.0 agrees
with the pattern on 10 of 10 specifications. Four range verdicts moved by
one beam each, every one toward XSD's order. A new unit sweep compares the
pattern with the checker using bounds of up to seven fraction digits and
values of up to ten. When we put the old millisecond comparison back, it
fails.

Details: `ventures/ids-model-check/eval/datetime-pattern-2026-11-21.md`,
"Past the millisecond". The checker runs in your browser and the model
stays on your machine. It shows what a checker should say, and it doesn't
replace running the one your project uses.
