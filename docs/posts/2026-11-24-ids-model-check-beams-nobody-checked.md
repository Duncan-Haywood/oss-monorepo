---
title: "18 beams nobody checked: an IFC4X3 file, a class it no longer has, and two checkers that agreed"
seo_title: "IfcBeamStandardCase in IFC4X3: the beams IDS checks never saw"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "An IFC4X3 file wrote its beams as IFC4's IfcBeamStandardCase. IfcOpenShell drops them, so 7 public IDS checks passed it. Our checker now says so."
---

When two independent checkers give the same answer, it is tempting to call
the answer right. This week's run of
[IDS Model Check](https://marisstella.app/ids-model-check/) turned up a case
where they agreed and both were wrong in the way that matters to a user.

## The run

IDS is buildingSMART's format for requirements like "every beam has a name"
or "every external wall has a U-value". The checker reads an IFC model and
an IDS file and says which elements pass. To test it on files it had never
seen, we took every IFC file in IfcOpenShell's repository: 294 files from the
project's test fixtures, Bonsai's libraries and templates, and a few sample
buildings. We also took the 46 sample models buildingSMART publishes for IFC
4.3. Then we ran the 65 public IDS files we know of against 293 of those
models, once with this checker and once with IfcTester, IfcOpenShell's own
IDS checker.

That is 126,781 specification results. 125,167 were identical. Each of the
other 1,614 came from a difference we had already found and written up
in November: IDS entity names do not include subclasses, a prohibited
specification may not carry requirements, and a boolean written as `True`
with no data type. Apart from one file built to be invalid, there was
nothing new. So far, so good.

## The file that both tools read the same wrong way

IfcOpenShell's unit tests include a small steel model,
`beam-standard-case.ifc`. Its header says IFC4X3_ADD2. Its 18 beams are
written like this:

```
#11= IFCBEAMSTANDARDCASE('0juf4qyggSI8rxA20Qwnsj',$,'A-1','IPE220','Beam',#232,#77,'A-1',$);
```

`IfcBeamStandardCase` is an IFC4 class. IFC 4.3 removed it, along with the
other "StandardCase" classes, and wants a plain `IfcBeam`. An exporter that
moved from IFC4 to IFC4X3 without renaming its classes writes exactly this
file.

IfcOpenShell opens the file without complaint and sees no beams at all. It
drops the 18 records because it has no IFC4X3 class by that name. IfcTester
is built on IfcOpenShell, so every IDS check on `IFCBEAM` applies to nothing.
Our checker kept the records but knew nothing about them: no attributes and
no parent class. So it also found no beams.

The two tools agreed perfectly. 26 specifications in the public IDS files
reach IfcBeam, by naming it or a class above it, and **7 of them passed this
model**. Two come from OpenAEC's IDS version of the Dutch RVB BIM Norm: "LoadBearing
balken" (beams must say whether they are load-bearing) and "NL-SfB Balken"
(beams must carry an NL-SfB code). Both gave a green tick on a model where
no beam was looked at.

## What changed

The verdict stays as IDS defines it. A specification on `IFCBEAM` still
applies to the model's real `IfcBeam`s, and IfcTester agrees. What changed is
that the checker now says what it skipped:

```
note: #11: IFCBEAMSTANDARDCASE is not an IFC4X3_ADD2 class (18 records from #11;
  an IFC4 class, there a subclass of IFCBEAM). Its attributes are unknown and
  IfcOpenShell drops it; an IDS entity facet on IFCBEAM does not check it
  (re-export it as IFCBEAM)

[PASS] Every beam has a name (optional)
  applies to: entity "IFCBEAM"  -> 0 element(s)
  warning: not checked: 18 element(s) of subclasses the entity facet does not
  name: 18 IFCBEAMSTANDARDCASE (not in IFC4X3_ADD2; another schema's subclass
  of IFCBEAM). [...] IFCBEAMSTANDARDCASE is not in the model's schema, so
  IfcOpenShell and IfcTester do not see it at all: re-export as IFCBEAM
```

The same note appears on the web page, in the HTML report and in the JSON
output. The page loads only the model's own schema, so there it finds the
parent class from IFC 4.3's rule for the removed StandardCase classes.
Across all 19,045 model and IDS pairs, no verdict changed, and 26 results now
carry the warning.

## What it means if you check models

A PASS means "every element this specification applied to passed". It does
not mean every beam in the file was checked. Read the applicable count as
well. If it says 0 or a number lower than you expect, the model may be
writing its elements under a class name your IDS does not reach.

The full measurement, the scripts and a hand-written sample that reproduces
the case are in the venture's
[evaluation notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/ifcopenshell-test-files-2026-11-24.md).
