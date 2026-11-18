---
title: "Checking IFC models against IDS in a browser tab: 334 of 334 buildingSMART test cases"
seo_title: "A free browser IDS checker for IFC: 334 of 334 test cases"
date: 2026-11-16
tags: [ventures, ids-model-check, construction, bim]
description: "A free tool checks IFC models against buildingSMART IDS files in the browser. It gets all 334 official test cases right and matches IfcTester on real models."
---

When a client hands a design team an IDS file, they are saying exactly what
information every model must carry: which walls need a fire rating, which
elements need a Uniclass code, which doors must sit on a storey. IDS
(Information Delivery Specification) is buildingSMART's XML format for that,
approved as version 1.0 in 2024. Someone then has to check each model against it.

The free way to do that today is IfcTester from the IfcOpenShell project, which
needs Python and a command line, or a desktop BIM tool. The paid ways are seat
licences and subscriptions, often with an upload of the model.
[IDS Model Check](https://marisstella.app/ids-model-check/) is a third way: drop
the .ifc and the .ids into a browser tab. Nothing is uploaded. You get each
specification's result, every failing element with the reason, and a BCF issue
list that Revit, Archicad, Navisworks or BIMcollab can open.

## How do you know a checker is right?

buildingSMART publishes 334 small pairs of IFC and IDS files, each named with the
answer it expects: pass, fail, or invalid (which must not pass). They cover every
facet, every kind of value restriction, the floating-point tolerance and the
required, optional and prohibited rules. The first version of this checker got
309 of them right. The 25 it missed were each a rule worth knowing:

- **Tolerance is inclusive.** The documentation describes the 1e-6 tolerance band
  as exclusive, but the test cases put values exactly on its edge (1.000002
  against 1) and expect a pass.
- **`ifcVersion` is metadata.** A specification written for IFC2X3 still checks
  an IFC4 model.
- **Empty is not the same as missing.** Under an optional requirement, a null
  attribute passes, but an empty string or a logical UNKNOWN fails.
- **A bounded property matches its bounds, not its range.** A required value of 2
  against a property bounded 1 to 5 with set point 3 fails. The user manual's
  table says the opposite; the test cases win.
- **A user-defined predefined type answers to both names**: its own text and
  `USERDEFINED`.

After those fixes it scores 334 of 334 on the suite as of buildingSMART's
2026-09-25 commit. The script that scores it fetches the suite rather than
copying it in, since the suite's licence (CC BY-ND) doesn't allow mixing it into
MIT code.

## Against the reference tool on real models

Test cases are small. To see real models, the same two IDS files were run
through both this checker and IfcTester 0.9.0.post1, comparing each
specification's verdict and the exact set of failing elements. The models were
OpeningDesign's Schultz Residence (a 22 MB Revit export with 424,819 entities),
buildingSMART's sample scenes in IFC2X3, IFC4 and IFC4X3, and two small houses.

Every result matched except one. A naming rule with two `xs:pattern`s
("Type:Name:Id" or a short code like W-01) failed every wall in IfcTester and
none here. XML Schema says several patterns in one restriction are alternatives,
and buildingSMART's `regex_patterns_work_in_OR` test cases expect that.
IfcTester 0.9.0.post1 requires all of them to match. Scored on the same suite,
that release gets 312 of 334. Its development branch may already fix that, but
the PyPI release was what got tested.

On the Schultz house, the starter IDS found one real problem: 146 building
element proxies (beds, a refrigerator, a range), the classic sign of objects
exported without a proper IFC class. Its walls, doors and windows all passed.

IfcTester is faster, at 0.6 seconds against 1.4 seconds on the command line for
the Schultz house. The point here is not speed. It's that a coordinator can
check a model on any computer with nothing to install. In Chromium the page
checks the same model in 0.8 seconds.

## What's next

The checker doesn't yet audit the IDS itself: an IDS that names a class missing
from the model's schema is checked as written, and those specifications fail
rather than being flagged as invalid. That audit comes next, then `.ifczip`
input, then more real models through the IfcTester comparison, starting with an
MEP model and an IFC4X3 infrastructure model.

The code is MIT and has no dependencies, so the same engine runs in CI:
`node cli.mjs model.ifc spec.ids --bcf issues.bcfzip` exits 1 when a
specification fails. Source:
[ventures/ids-model-check](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/ids-model-check).
