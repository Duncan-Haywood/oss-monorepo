---
title: "Two IDS checkers agreed on 51 results per model, and both skipped 112 walls"
seo_title: "IDS IFCWALL vs IfcWallStandardCase: the walls nobody checks"
date: 2026-11-17
tags: [bim, ifc, ids, validation]
description: "65 public IDS files on four real IFC exports, against IfcTester: 1,661 of 1,736 results identical, and a gap both tools share that reports now show."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks IFC
building models against buildingSMART IDS files. We had compared it with
IfcOpenShell's IfcTester before, but only with IDS files we wrote ourselves.
This time we used the ones other people publish: 65 IDS files from public
GitHub repositories (national requirement sets, research projects, tool
samples), run against four real exports from the
[opensourceBIM/IFC-files](https://github.com/opensourceBIM/IFC-files)
collection (three HHS Office models and OpeningDesign's Schultz Residence,
all IFC2X3).

## What matched

IfcTester 0.9.0 could not open 12 of the 65 files: eight fail its schema
validation, two use an old or misspelled namespace, and two are not
well-formed XML. On the other 53, the two checkers produced 1,736
specification results per tool, and **1,661 were identical**: the same
verdict, the same number of applicable elements, the same failing elements by
id.

All 75 differences come from three causes:

- **50: what `IFCWALL` means in IFC2X3.** Revit's IFC2X3 exports write most
  walls as `IfcWallStandardCase`. The IDS user manual says entity facets have
  "no automatic inheritance", so `IFCWALL` does not take them. IfcTester also
  matches any occurrence whose type object is an `IfcWallType`, so on the
  Schultz Residence it counts 105 walls where we count 4.
- **16: a prohibited specification with requirements.** Four public files
  forbid building element proxies this way. buildingSMART's own test suite
  says such an IDS is invalid; IfcTester runs it anyway.
- **9: `True` on a boolean with no data type.** XSD writes booleans as
  `true` or `false`. IfcTester accepts `True`; we don't, and our audit
  already warns that checkers disagree.

In the first two cases we follow the standard's text and test suite. But that
doesn't make our reports useful.

## The gap both checkers share

The HHS models hold 112 `IfcWallStandardCase` walls with no type object.
There IfcTester's type rule doesn't apply, so **the two tools agree**: on 51
specification results per model, both report the same thing, and neither has
looked at most of the walls. A requirement that walls carry a fire rating
can pass on a model where almost none of them do. Comparing two checkers
can't catch a mistake they both make. We only found this one because the
Schultz model made them disagree.

So the report now says what an entity facet left out:

```
[FAIL] Wall Fire Rating Check (optional)
  applies to: entity "IFCWALL"  -> 4 element(s)
  warning: not checked: 101 element(s) of subclasses the entity facet does not name:
    101 IFCWALLSTANDARDCASE (a subclass of IFCWALL). IDS entity names do not include
    subclasses; add these class names to the entity facet to check them
```

The verdict stays the one the standard gives. Across the 260 model and IDS
pairs, 165 of 2,028 specification results now carry this warning, and
**76 of them are a PASS** that left elements unchecked. The fix in the IDS is
one line: list `IFCWALLSTANDARDCASE` next to `IFCWALL`.

The invalid prohibited specifications got the same treatment. They still
read INVALID, but they now add "85 element(s) in this model match its
applicability and would fail it once the requirements are removed". Before,
an invalid result with "0 applicable" looked like a clean model.

## Check it yourself

The scripts are in the repository:
`eval/corpus-crosscheck.mjs`, `eval/corpus_crosscheck_ifctester.py` and
`eval/corpus_crosscheck_compare.py`, with the full write-up in
`eval/corpus-crosscheck-2026-11-17.md`. The checker runs in your browser and
your model never leaves your machine. It is free, open source (MIT), and
not a substitute for a BIM coordinator's review.
