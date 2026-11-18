---
title: "An IDS written for IFC2X3 and IFC4: the editor read it as IFC2X3 only"
seo_title: "IDS for IFC2X3 and IFC4: auditing every named version"
date: 2026-11-17
tags: [bim, ifc, ids]
description: "The IDS editor opened multi-version files in their first schema and flagged IFC4 sets as errors. It now edits in the best schema and audits in all."
---

An IDS specification can say it is written for more than one IFC schema:
`ifcVersion="IFC2X3 IFC4"`. Plenty of real files do. The Dutch NL-BIM Basis
ILS and the RVB BIM Norm, as published in the OpenAEC Foundation's validator
and viewer, name both. The BASIX file in IfcOpenShell's ifcbasix names three.
So do 147 of the 187 passing test cases in buildingSMART's own IDS suite.

The command-line audit in [IDS Model Check](https://marisstella.app/ids-model-check/)
already handled these. It reads such a specification in every schema it names
and calls it invalid only when every one of them finds the fault. The
[IDS editor](https://marisstella.app/ids-model-check/editor.html) did not. It
opened the whole file in one schema, the first version most specifications
name, which for every file above is IFC2X3. Its live audit used only that one
schema.

IFC2X3's property set templates lack a lot that IFC4 has: `Qto_SpaceBaseQuantities`,
and `Pset_LandRegistration` and `Pset_Address` on IfcSite. So the editor held
those requirements as read-only XML and listed them as errors ("not a
standard IFC2X3 property set"). The command-line tool, run on the same file,
raised none of them.

## What changed

When every specification in a file names the same several schemas, the editor
now imports the file in each of them and keeps the one where the most facets
become editable rows. Each specification keeps its own `ifcVersion`, so the
file writes back naming the same versions. The page then audits each
specification in every schema it names, in the same order the CLI uses, so the
two give the same reasons. The open message says what happened: "each
written for IFC2X3 and IFC4; the page edits in IFC4, where the most facets
are editable (IFC2X3 25, IFC4 26)".

## On public files

18 of the 65 public IDS files we test against have a specification naming
several versions. Five of them now open in a different schema:

- BASIX opens in IFC4X3 with 29 of 29 facets editable. Before, it opened in
  IFC2X3 with 19.
- The four NL-BIM Basis and RVB BIM Norm copies open in IFC4 with 26 of 27 and
  61 of 65 editable. Before, they had 25 and 58.
- Across all 18 files, the errors the page raised and the CLI did not went
  from **18 to 0**.

The only difference left between the page and the CLI is on a prohibited
specification that has requirements. The editor drops those requirements on
opening and says so, because IDS 1.0 cannot evaluate them.

Nothing else moved. The IDS-Audit-tool valid files and the buildingSMART pass
cases open exactly as before, and all 263 files still write back asking for
the same things. Overall, 90.1% of the public files' facets now open as
editable rows (was 89.2%).

## What is still read-only

116 property requirements in those public files are still held as written.
About 30 of them give a standard property a data type its template does not
give, such as `SerialNumber` as IFCTEXT where the template says IFCIDENTIFIER.
That is the next thing to make editable, with a one-click fix to the
template's type. The rest are mostly IDS 0.9 syntax (`<name>` where 1.0 says
`<baseName>`), set names given as patterns, and `Pset_` names the standard
does not have.

The measurements and the scripts that produce them are in
`ventures/ids-model-check/eval/multi-version-2026-11-17.md`.
