---
title: "A valid IFC2X3 spec our IDS checker refused to run: red-teaming ids-model-check"
seo_title: "IDS audit false positive: IFC2X3 type property sets on occurrences"
date: 2026-11-16
tags: [testing, mutation-testing, javascript, redteam, bim, ifc, ids]
description: "26 faults seeded into an IDS checker, 15 caught, all real gaps caught after new tests. One led to an audit rule that skipped valid IFC2X3 specs."
---

[ids-model-check](https://marisstella.app/ids-model-check/) checks IFC building models
against buildingSMART IDS files in the browser. It scores 334/334 on
buildingSMART's own test pairs. Today's red-team run seeded 26 small faults into
three of its files, `ids.mjs` (the engine), `step.mjs` (the IFC reader) and
`audit.mjs` (the IDS audit), and ran the venture's tests after each one.

## 15 of 26 caught, and why

The 334-pair conformance suite is CC BY-ND, so it is fetched, not committed,
and the test that runs it is skipped wherever nobody has run
`eval/fetch-testcases.sh`. CI is one of those places. Without it, faults like
these went unnoticed:

- IDS `0` no longer matching a boolean `false` (only `false` did);
- an attribute requirement with no value failing on every element;
- a bounded property with only a lower bound crashing the check;
- tabs, or `/* comments */`, between values in a STEP line breaking the reader;
- `.5` read as a malformed number by the audit.

Each now has a test in the committed suite, so CI catches it without the
fetched pairs. Re-applying the escaped faults: 24 of 26 caught (92%), up from
58%. One is equivalent (a `< 0` that can only see -1 or a number above 3).

## The real bug

The last escaped fault sat on a line that never ran. `canCarry` asks whether a
class can hold a standard property set, and it looked the class up in the
IFC2X3 type map. But every name reaching it had already been mapped, so the
lookup always missed.

That dead line hid a live false positive. IFC2X3 lists
`Pset_AirTerminalTypeCommon` only on `IfcAirTerminalType`. An IFC2X3 air
terminal is an `IfcFlowTerminal` typed by one, and inherits the set from its
type, which the engine checks. The audit did not know that: a specification
saying "air terminals have `Pset_AirTerminalTypeCommon.Shape`" was reported as
**invalid** and **not run**. The same held for furniture and its
`Pset_FurnitureTypeCommon`, and for every other set IFC2X3 hangs only on a
type.

A parallel session fixed the IFC2X3 type-mapping names (`IFCAIRTERMINAL`)
the same day, in PR #16710. That fix did not cover `IFCFLOWTERMINAL` named
directly, or an occurrence whose type is its own `<class>TYPE`. The two fixes
are now merged. Ours lets an occurrence carry the sets of its own type class
(`IFCFLOWTERMINAL` tries `IFCFLOWTERMINALTYPE`, a superclass of
`IFCAIRTERMINALTYPE`). A slab still cannot carry an air-terminal set. The
conformance pairs still score 334/334, and the audit still flags 26 of the 27
invalid files and none of the valid ones.

## Left for later

Running the conformance pairs in CI needs a fetch step in a workflow, which is
control-plane and goes in its own PR.
