---
title: "Open an IDS, change it, save it: 64 public files come back asking the same thing"
seo_title: "Edit an existing buildingSMART IDS file in the browser, losslessly"
date: 2026-11-16
description: "The free IDS editor now opens existing IDS files. All 64 public files we tried, and 187 buildingSMART test cases, write back asking for the same thing."
tags: [ids-model-check, bim, ifc, ids]
---

An IDS (Information Delivery Specification) is the buildingSMART file a client
or BIM manager writes to say what a model must contain: every wall says whether
it is external, every door has a fire rating, nothing is left as a proxy. The
[IDS editor](/ids-model-check/editor.html) we shipped this morning could only
start from a blank page. Most people who write an IDS start from one they
already have: a national requirement set, a client's file, the one from the last
project. So it now has an **Open an IDS file** button.

The risk with opening someone else's file in a form is that the form quietly
rewrites it. Our editor offers a narrow set of controls (one class, standard
property sets, a few kinds of value), and real IDS files use much more:
custom property sets, patterns on property names, exclusive bounds, conditions
on properties in the applicability. A form that coerced those into its own
controls would hand back a file that checks something different, and nobody
would notice until a model passed that should have failed.

So the editor follows one rule: **writing the file back must ask for what the
file asked.** Every condition the page can hold without changing it becomes an
editable row. Everything else is kept as written: shown as its XML, written
back byte for byte, and removable if you no longer want it. Before a row is
offered as editable, it is written out with the same code the page uses and
compared with the original XML; if they differ, it stays as written.

## Measured on files other people wrote

We opened every IDS file in our test corpus, wrote each back, and compared the
two specification by specification: names, descriptions, IFC versions,
optionality, and every condition's kind, cardinality, data type and value.

- **64 IDS files from public GitHub repositories** (national sets, research
  projects, tool samples): 64 of 64 come back asking the same, 507 of 507
  specifications. 75% of their conditions open as editable rows.
- **buildingSMART's 187 passing test cases**: 187 of 187.
- **buildingSMART's IDS-Audit-tool valid files**, written to stress every
  restriction: 12 of 12, almost all of it kept as written.
- Validated against buildingSMART's `ids.xsd` with IfcTester: no file that was
  valid before is invalid after. One became valid: its title had a bare `&`.

The first run found two real bugs that the shipped tests had not: an empty
`<xs:restriction base="xs:boolean"/>` was written back as "any value", which
our own checker treats differently (the empty restriction requires a value to
exist), and an empty predefined type was dropped. Both are fixed and tested.

One change is deliberate. Four public files (two Dutch requirement sets, each
in two repositories) put requirements on a *prohibited* specification. IDS 1.0
cannot evaluate those, so the editor drops them and names the specifications
when you open the file.

## What stays read-only, and what comes next

Of the 503 conditions in the public files that open as kept-as-written, the
biggest groups are properties in custom sets (110), properties under a class
list the page cannot hold yet (103) and conditions inside the applicability
(85). Those three are the next steps for the editor.

Everything runs in your browser; nothing is uploaded. The method and every
number are in the
[evaluation note](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/editor-open-2026-11-16.md),
and `node eval/editor-open.mjs` reruns it.
