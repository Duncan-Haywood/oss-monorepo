# The checker on IfcOpenShell's 294 test files, against IfcTester: 18 beams nobody checked (2026-11-24)

**Question.** The editor's four model-driven sweeps have run on the
opensourceBIM exports, buildingSMART's Sample-Test-Files, engine_web-ifc's 28
models and xBIM's 128 test files (`mixed-type-own-props-2026-11-24.md`,
`xbim-test-files-2026-11-24.md`). Do they hold on two more public sets? And
on a wide set of small models, do this checker and IfcTester give the same
verdict on the 65 public IDS files of `corpus-crosscheck-2026-11-17.md`,
which so far ran on four exports only?

**Data.**

- `github.com/IfcOpenShell/IfcOpenShell` at `16f9a41` (2026-11-23): every
  `.ifc` and `.ifczip` in the tree, 294 files, 30 MB (`sh
  eval/fetch-ifcopenshell-samples.sh`; LGPL-3.0, not committed here). 135
  IFC2X3, 133 IFC4, 26 IFC4X3_ADD2. They are IfcOpenShell's and Bonsai's test
  fixtures (geometry, units, validation, georeferencing), Bonsai's
  shipped libraries (steel sections, furniture, bridge and road libraries)
  and its 57 classification and property-set template files, plus the
  AC20-FZK-Haus ARCHICAD export and the C++ docs' hello_world. The
  `test/fixtures/validate` folder is a labelled set of broken files, each
  with one known fault.
- `github.com/buildingSMART/IFC4.3.x-sample-models` at `ef22440`
  (2026-10-14): 46 IFC4X3_ADD2 files, 2.5 MB (a blob-less sparse clone of
  `*.ifc`).
- IDS: the 65 public files `eval/fetch-audit-corpus.sh` fetches, at each
  repository's HEAD on 2026-11-24.
- IfcTester 0.9.0 with ifcopenshell 0.9.0.post1 from PyPI.

## The four sweeps

| Script | IfcOpenShell (294) | buildingSMART 4.3 samples (46) |
| --- | --- | --- |
| `eval/model-inventory.mjs` | 294 of 294 read, 0 failed, 11,652 objects; 25 standard (class, set) pairs, 10 Pset_/Qto_ on a class the standard does not give them, 132 project-own pairs (1,912 properties); 1 of 50 standard properties in a type the template does not give | 46 of 46 read, 393 objects; 1 standard pair; no own properties |
| `eval/model-attr-ranges.mjs` | numbers 27 of 27, booleans 9 of 9 pass their model | all pass (rebar BarLength, CrossSectionArea, cant RailHeadDistance, elevations) |
| `eval/model-attr-codes.mjs` | attribute one-of lists 792 of 792 pass, 1 of 1 fails on exactly the empty objects the row warns about; 37 classification rows, none with a code (below) | 317 of 317 pass |
| `eval/model-values.mjs` | property offers **1,734 of 1,734** pass | 1 of 1 range passes |

No editor fault on either set. The 37 classification rows with no code are
Bonsai's classification library files: each associates its
`IfcClassification` with an `IfcProjectLibrary` directly, not through a
reference, so there is no code to offer. That is what the files say.

The buildingSMART set has almost no properties: its files show geometry,
alignment and placement cases. It confirms the reader on 46 IFC4X3_ADD2
files and says little about the editor.

## This checker against IfcTester, 293 models x 65 IDS files

`eval/corpus-crosscheck.mjs` and `eval/corpus_crosscheck_ifctester.py` on
the 293 `.ifc` files (the one `.ifczip` left out), linked into one folder
(`fetch-ifcopenshell-samples.sh --flat DIR`). 19,045 model/IDS pairs: 22 s
here, about 35 min for IfcTester. IfcTester could not open 12 of the IDS
files, as on 2026-11-17; this checker could not read `A3_IDS.ids` (not
well-formed).

**126,781 specification results compared, 125,167 identical, 1,614
different.** A new script, `eval/corpus_crosscheck_group.py`, groups the
differences by (IDS file, specification) and names the cause where it can
tell it mechanically:

| Cause | Results | Groups | Which reading is right |
| --- | ---: | ---: | --- |
| This checker reports the specification as invalid IDS and does not run it: the four OpenAEC prohibited specifications with requirements (cause 2 of `corpus-crosscheck-2026-11-17.md`), and DFE's COBie spec whose date pattern uses `(?:`, which is not XML Schema regex | 1,453 | 10 | this checker's: buildingSMART's test suite and XSD say so; IfcTester passes the first when nothing applies |
| `IFCWALL`/`IFCBEAM` names leave out `IfcWallStandardCase` and the like; IfcTester in IFC2X3 also takes an occurrence by its type object (cause 1). Our applicable count plus the elements our warning counts equals IfcTester's applicable count in every one | 147 | 49 | the standard's ("no automatic inheritance"); this checker warns |
| `IsExternal` = `True` with no dataType (cause 3) | 12 | 3 | not settled; the audit already warns |
| `IFCBUILTELEMENT` in an IFC4 file (below) | 2 | 2 | IfcTester's: no IFC4 tool sees such a record |

So on 293 more models, every difference falls into the three causes found
on 2026-11-17, plus one file built to be invalid. The cross-check found no
new verdict fault.

## The defect: classes the model's schema does not have

Two files hold records whose class their declared schema lacks:

| File | Schema | Records | What the class is |
| --- | --- | --- | --- |
| `test/fixtures/units/beam-standard-case.ifc` | IFC4X3_ADD2 | 18 `IFCBEAMSTANDARDCASE` | an IFC4 subclass of IfcBeam. IFC4X3 removed the StandardCase classes, but an exporter moving from IFC4 to IFC4X3 can keep writing them; the header names IfcDoc and SDS/2 |
| `test/fixtures/validate/fail-expected-3-invalid-entity.ifc` | IFC4 | 1 `IFCBUILTELEMENT` | IFC4X3's name for IfcBuildingElement; the fixture exists to be rejected |

IfcOpenShell opens the first file and drops the 18 records without a word:
`by_type("IfcBeam")` is empty. This checker kept them but knew no
attributes for them and no parent, so an entity facet on `IFCBEAM` did not
take them either. **Both tools agreed, and both were wrong in the way that
matters.** 26 specification results in the public IDS files have an entity facet that
reaches IfcBeam (IFCBEAM itself, or a list or ancestor class that takes it),
and all 26 skipped the model's every beam; **7 of them passed**, among them
the Dutch RVB BIM Norm's "LoadBearing balken" and "NL-SfB Balken" (both in
two copies). A user who checks an export for load-bearing beams gets a PASS
on a model where no beam was looked at.

The sample `samples/edge/outside-schema.ifc` reproduces it: one `IFCBEAM`
with a name, two `IFCBEAMSTANDARDCASE`, one of them with no name.
`outside-schema.ids.xml`'s B-01 ("every beam has a name") passes with 1
applicable in IfcTester (it reads 4 of the file's 6 records) and passed the
same way here, with nothing to say.

## What changed

- `ids.mjs` `Model`: after reading, every class the model's schema lacks is
  listed in `model.outsideSchema` (`{type, count, first, from, parent}`) and
  gets one reader note:
  `#11: IFCBEAMSTANDARDCASE is not an IFC4X3_ADD2 class (18 records from #11;
  an IFC4 class, there a subclass of IFCBEAM). Its attributes are unknown
  and IfcOpenShell drops it; an IDS entity facet on IFCBEAM does not check
  it (re-export it as IFCBEAM)`. The parent comes from another loaded schema
  that has the class (the CLI loads all three). The page loads only the
  model's own schema, so there the parent comes from IFC4X3's rule for the
  removed `*STANDARDCASE` and `*ELEMENTEDCASE` classes. When the parent is
  abstract (IFCBUILTELEMENT's IFCELEMENT in IFC4), the advice is to write the
  file in the schema that has the class, or use a concrete class.
- `skippedSubclasses` counts such records where the entity facet names
  their parent or an ancestor of it, and the specification's warning ends:
  `IFCBEAMSTANDARDCASE is not in the model's schema, so IfcOpenShell and
  IfcTester do not see it at all: re-export as IFCBEAM`. It appears wherever
  the subclass warning already does: CLI, page, HTML report, `--json`
  (`skippedSubclasses[].outside`).
- The verdict is unchanged: B-01 still passes with 1 applicable, as IDS and
  IfcTester read it. The warning is the change.

After: on the 19,045 pairs, **0 verdicts changed**, and those 26 specification
results now warn about the 18 beams (all on `beam-standard-case.ifc`).
The four sweeps give the same numbers on both sets. `outside-schema.test.mjs`
(6 tests) covers the note, the page's own-schema case, the warning, the
abstract parent and a class no schema knows. The venture suite passes (549
tests).

## Not done

- IfcOpenShell's other `validate` fixtures (wrong attribute counts, typed
  values of the wrong type, derived attributes written): the cross-check ran
  them and found no verdict difference, but no one has checked whether each
  fault reaches the user as a note. That is the next use of this set.
- A real export, not a fixture, that writes IFC4 StandardCase classes into
  an IFC4X3 file. The fixture's header names SDS/2, so such exports may
  exist.
- The one `.ifczip` (Bonsai's `basic.ifczip`) was swept but not
  cross-checked.
