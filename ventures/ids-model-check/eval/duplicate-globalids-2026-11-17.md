# Duplicate GlobalIds as a model finding (2026-11-17)

IFC's `IfcRoot` carries a uniqueness rule, `UR1: GlobalId`, in IFC2X3, IFC4
and IFC4X3: no two rooted instances (elements, types, property sets,
relationships, groups) may share one. The tools downstream of a model check
rely on it. A BCF topic selects components by `IfcGuid`, so a topic about one
of two elements sharing a GlobalId selects both. Model-comparison tools match
revisions by GlobalId. This checker's own GitLab Code Quality report keys its
fingerprints on GlobalId and class (`eval/gitlab-codequality-2026-11-17.md`).
Before this change the checker read GlobalIds but never said when two
elements shared one.

## What changed

- `duplicateGlobalIds(model)` (`ids.mjs`): every GlobalId held by more than
  one `IfcRoot` instance, each with its elements by `#id`, sorted by
  GlobalId. Only the schema's `GlobalId` attribute of `IfcRoot` subtypes
  counts, so a 22-character string repeated in a property value is ignored.
  The result is cached on the parsed model, so CI checking one model against
  several IDS files counts it once.
- `checkIds()` returns it as `duplicateGlobalIds`. It is a fault in the model,
  not an IDS verdict, so it leaves `pass` alone.
- Every output reports it:
  - the page: a "MODEL" block above the specifications, listing each
    GlobalId and the elements holding it;
  - the CLI's text report: a `model warning:` block;
  - CSV: one row per element in a group, with status `duplicate`;
  - BCF: one topic per duplicated GlobalId, before the IDS topics, selecting
    it;
  - CI (`ci-cli.mjs`, `action.yml`): one warning annotation per model, on
    the STEP line of the first element that repeats an earlier element's
    GlobalId; a "Duplicate GlobalIds" paragraph and a details list in the job
    summary; a `duplicate-globalids` output and a `tally.duplicateGlobalIds`
    count; one GitLab issue `ifc-duplicate-globalid` per GlobalId,
    fingerprinted on model and GlobalId (stable when a re-export renumbers
    `#id`s).
- `--fail-on-duplicate-globalids` (Action input `fail-on-duplicate-globalids`)
  turns the warning into a failure. It is off by default, like
  `--fail-on-unchecked` and `--fail-on-audit-warnings`: a team adopting the
  check on an existing model should not have the build go red over a fault
  its IDS never asked about.

## Measured on 163 public files

All of `opensourceBIM/IFC-files` at `cb96c50` that the earlier evals use
(HHS Office MEP, MEP2, architect, architect2, construction, construction2;
OpeningDesign's Schultz Residence). Every `.ifc` in buildingSMART's
`Sample-Test-Files` at `80d976a` (35 files). Every `.ifc` in xBIM's
`XbimEssentials` at `e3c8777` (121 files, test inputs included). Run with
`node --max-old-space-size=8000 eval/duplicate-globalids.mjs DIR...`.

| | |
|---|---:|
| Files | 163 (163 read) |
| IfcRoot instances | 179,721 |
| Files with a duplicate GlobalId | 3 |
| `HHS Office/construction2.ifc` | 1: `3XrBtx9eX7mQE6EqWHPk2a` on #82 IFCCOLUMN and #357 IFCSLAB |
| xBIM `SpecicalSolidusEscape.ifc` | 1: six IFCGROUPs (#1001 to #1006), written that way on purpose |
| xBIM `Alignment/sectioned-solid.ifc` (IFC4X1) | 1: #57 and #58 IFCSPACE |
| Time on the largest (HHS MEP, 54,072 rooted of 665,224 entities) | 130 to 155 ms after a 1.5 to 1.9 s parse |

The six original HHS and Schultz exports have none. The one HHS duplicate is
in the revision file `construction2.ifc`, where a column was given a slab's
GlobalId. An earlier note (`eval/gitlab-codequality-2026-11-17.md`) said the
files "already had 1 to 3". A plain regex over the STEP text does find a
repeated 22-character string in both construction files, but it is
`'TreadLengthAtInnerSide'`, a property name, not a GlobalId. That note is
corrected in this PR.

**Cross-check with IfcOpenShell 0.9.0.post1**
(`eval/duplicate_globalids_ifcopenshell.py`: `by_type("IfcRoot")`, grouped by
`GlobalId`). On the 133 files IfcOpenShell opens, the groups (GlobalId to the
list of `#id`s) are identical on all 133. IfcOpenShell does not open the other
30: 20 are in schemas it does not ship (IFC4X1, IFC4X3_RC4, IFC4X3_ADD1,
IFC4X3, IFC2X3_FINAL), 5 have headers it cannot parse and 4 have syntax errors
(xBIM keeps several on purpose as test inputs).

## A STEP reader fault found on the way

The first comparison differed on one file. IfcOpenShell found six IFCGROUPs
sharing the GlobalId in `SpecicalSolidusEscape.ifc` and this checker found
five. The sixth is
`#1006= IFCGROUP(...,'This string ends with as special case of solidus escape \S\'',$,$);`.
ISO 10303-21's `\S\` directive takes the next character and adds 128, and here
that character is an apostrophe: `\S\'` is "§" (39 + 128 = 167), and the
quote after it closes the string. `step.mjs` treated the two apostrophes as an
escaped quote and ran the string on through the next record. That cost #1006
with a parse error, and also the `IFCPROJECT` on the line after it, so the file
read as having no project. Both the record splitter and the tokenizer now
treat an apostrophe straight after a `\S\` directive as the directive's
character, unless that `\S\` is itself the tail of an escaped backslash (`\\S\`).
After the fix the file reads with no parse errors, 7 rooted instances instead
of 5, and the same six-element group IfcOpenShell finds. Of the 163 files, only
this one and xBIM's `Badly formed Ifc file.ifc` contain `\S\'`, and the second
already fails on other faults. No other file's count changed.

Tests: `duplicates.test.mjs` (6) and one more in `engine.test.mjs`. The page
was checked in Chromium with `construction2.ifc` and the coordination starter
IDS: the MODEL block lists the column and the slab.

## Not done

- No fix-up offered: a new GlobalId for the copy belongs in the authoring
  tool. Rewriting the file here would break the link to the native model.
- Duplicates across federated models (two discipline files sharing a
  GlobalId) are not checked. `ci-cli.mjs` takes models one at a time, and a
  shared GlobalId across files is sometimes intended (a copy-monitored grid).
