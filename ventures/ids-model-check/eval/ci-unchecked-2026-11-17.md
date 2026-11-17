# Unchecked subclass elements in CI outputs and in the editor (2026-11-17)

`corpus-crosscheck-2026-11-17.md` found that IDS has no inheritance: an
entity facet naming `IFCWALL` never looks at an `IfcWallStandardCase`, which
is how Revit's IFC2X3 exports write most walls. The text, JSON and page
reports started saying so (`ids.mjs`, `skippedSubclasses`). It left two items
open, both landed here:

1. CI outputs (JUnit, annotations, job summary) did not carry the warning, so
   a build could go green on 4 walls while 101 were never looked at.
2. The IDS editor did not tell an author, with a model open, that their
   specification would skip the model's subclass objects.

## What landed

**CI (`ci.mjs`, `ci-cli.mjs`, `action.yml`).** The verdict does not change.

- `tally()` counts `uncheckedSpecs` and `elementsNotChecked`; `notChecked(spec)`
  sums a specification's `skippedSubclasses`.
- JUnit: the warning goes in the test case's `<system-out>` (a pass stays a
  pass), at the top of a failure's text, and in the skip message when no
  element of the named class matched but subclass elements exist ("no element
  of the named class(es) matches the applicability; not checked: ...").
- Annotations: one `::warning` per such specification on the IDS file (the fix
  is there: name the classes), titled with the count.
- Job summary: a "Not checked" paragraph, a column in the table and a list per
  pair naming class, parent and count.
- stdout: a `warning:` line per specification and the count on the PASS/FAIL line.
- GitHub output `not-checked`; Action input `fail-on-unchecked` (`--fail-on-unchecked`)
  turns the annotations into errors and fails the build; `fail-on: never`
  still wins. Off by default.

**Editor (`editor.mjs` `modelSubclassesLeftOut`, `editor.html`).** With a model
open in the same schema, a specification whose classes leave out some of the
model's subclass objects shows "The model also has N object(s) of
IFCWALLSTANDARDCASE, a subclass of IFCWALL. IDS class names do not include
subclasses, so this specification would not check them. [Add it]". The button
adds those exact classes to "Also applies to" (the model's classes only, not
every schema subclass). "Add a specification" from the model's class table
starts with subclasses off, so this is where an IFC2X3 Revit model's walls
show up. Checked in Chromium (Playwright) on a 1 IfcWall + 2
IfcWallStandardCase model: the warning names the 2, one click lists
IFCWALLSTANDARDCASE and the applies-to count goes from 1 to 3; no page errors.

## Measured on real files

Setup as `corpus-crosscheck-2026-11-17.md`: the 65 public IDS files
`eval/fetch-audit-corpus.sh` fetches, the four `opensourceBIM/IFC-files`
exports at `cb96c50` (HHS MEP, architect, construction; Schultz Residence; all
IFC2X3), 260 pairs, through the CI entry point as the Action runs it:

```
GITHUB_ACTIONS=true node --max-old-space-size=8192 ci-cli.mjs --root DIR \
  --models "models/*.ifc" --ids "ids/*.ids" --junit j.xml --json r.json --fail-on never
```

53.5 s wall on Node 22, this container.

| | |
|---|---:|
| Specification checks | 2,028 |
| ... that left subclass elements unchecked | 165 (in 25 of the 65 IDS files) |
| ... of those, verdict `pass` | 76 |
| ... of those, applicable to 0 elements | 39 (11 of them `pass`) |
| Elements not checked, summed | 21,405 |
| `::warning` annotations for them | 165 |

By model: architect 10,944, Schultz Residence 6,747, construction 2,566,
MEP 1,148.

By parent the facet names:

| Facet names | Left out | Elements |
|---|---|---:|
| IFCWALL (157 specification checks) | IFCWALLSTANDARDCASE | 13,049 |
| IFCBUILDINGELEMENT (8 checks, 2 IDS files) | IFCMEMBER, IFCBUILDINGELEMENTPROXY, IFCPLATE, IFCCOLUMN, IFCRAILING, IFCWALLSTANDARDCASE, IFCDOOR, IFCSLAB, IFCBEAM and 9 more | 8,356 |

The second row is new. Two copies of the Dutch RVB BIM Norm v1.1 IDS
(OpenAEC-Foundation's BIM-validator and open-3d-viewer) apply specifications to
`IFCBUILDINGELEMENT` (one specification each, `applicability minOccurs="1"`,
on line 372 of the file). That class is abstract in IFC2X3 (`schema/ifc2x3.json`),
so no element ever has it as its own class: all 8 checks (2 files x 4 models)
applied to 0 elements and failed as "required, nothing applicable", while
8,356 building elements sat under it. The failure read as "the model has no
building elements"; now it also says which 8,356 elements the facet missed
and that naming their classes would check them.

Exit status and `result` are unchanged by default (the run above: the same
counts of pass, fail, optional warning and invalid as before; `result` follows
the check, not `--fail-on`, as before). With `--fail-on-unchecked`, the
synthetic test model fails (`ci.test.mjs`).

## Verified

- `node --test *.test.mjs` in the venture: 135 pass (5 new: 3 in
  `ci.test.mjs`, the CLI end to end with `GITHUB_OUTPUT`; 1 in
  `editor.test.mjs`; the existing 130 unchanged).
- `node platform/pages/venture-preflight.mjs ids-model-check`: see the PR's run
  record notes.

## Not done

- The editor's offer covers a model that is open. Without a model it still
  offers the schema's subclasses by checkbox, as before.
- An audit rule for an entity facet naming an abstract class (IFC2X3's
  `IFCBUILDINGELEMENT`) with no concrete subclass listed: it can never apply
  to anything, and the audit could say so without a model.
