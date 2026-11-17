# IDS editor: conditions beyond the class in the applicability (2026-11-17)

**Question.** A specification's applicability says which elements it is
about. The editor could write only the class (and a predefined type), so
"external walls must have a fire rating" could not be written: the author got
every wall, internal ones included. Opened files with a property or attribute
in their applicability showed it as read-only XML. Can the page hold those
conditions as ordinary rows, write them back unchanged, and tell the author
how many of an open model's objects each one keeps?

**What landed:**

- `editor.mjs`: a specification has `app`, rows of the same shape as
  requirements (property, attribute, classification, material, place) written
  into the applicability with no cardinality (IDS 1.0 applicability facets
  have none). `importIds` reads the class first, then turns each other
  applicability facet into a row when the row writes the same XML, and keeps
  the rest as written, as it does for requirements.
- `appMatchCount`: how many of the model's objects of the class a condition
  keeps, from the inventory's tallies, or null when the tallies cannot say
  exactly (a value list cut short, values outside the row's kind, objects
  holding several values, a classification code, a material or a place).
  Numbers compare with IDS's tolerance; "any value" leaves out attributes
  set to an empty string or UNKNOWN, and counts a classification reference
  with no code, as the checker does.
- The page: **Narrow it** adds a condition row under the class, with the
  model's values and counts as on requirement rows, and a line such as
  "2 of the model's 3 object(s) of this class match this condition, so the
  specification checks those 2" (a warning when none match and the
  specification is required).

## Checked

- `inventory.test.mjs`: on the tiny-house sample (one wall given an uncoded
  Uniclass reference), 11 condition rows across properties (true, false, any,
  equals text), attributes (enumeration, pattern, one-of, unset) and
  classifications (in a system, in an unused system):
  `appMatchCount` equals the checker's own `applicable` count for every one
  (2, 1, 3, 1, 1, 2, 2, 2, 0, 3, 0). A code value returns null, not a guess.
  The narrowed specification "external walls must have FireRating" applies
  to 2 walls and fails 1. The written IDS audits with no error and has no
  cardinality in its applicability.
- An opened IDS with a classification, an attribute value, a standard
  property value and an own-set property in its applicability opens them as
  four rows and writes back asking the same; an exclusive bound
  (`minExclusive`) stays kept as written.
- In Chromium (Playwright, the shipped page and sample model): Narrow it,
  Pset_WallCommon / IsExternal / true gives the count line above and the
  applicability XML with the property facet; no console errors.

## Measured: opened files

`node eval/editor-open.mjs` after `sh eval/fetch-audit-corpus.sh && sh
eval/fetch-testcases.sh` (corpus not committed), run on main's `editor.mjs`
and on this one:

| Corpus | Facets editable before | After | Files with every facet editable | Write back asking the same |
| --- | ---: | ---: | --- | --- |
| 64 public IDS files (`eval/real-ids-files.txt`) | 1,650 of 2,012 (82.0%) | 1,681 (83.5%) | 10 to 14 of 64 | 507 of 507 specifications, both |
| 12 IDS-Audit-tool valid files | 78 of 808 (9.7%) | 174 (21.5%) | 3 of 12, both | 288 of 288, both |
| 187 buildingSMART pass cases | 312 of 374 (83.4%) | same | 125 of 187, both | 187 of 187, both |

Audit errors changed on no file. The buildingSMART cases do not move: their
non-entity applicability facets are mostly in files with no known class.

## What is still held

Of the 94 non-entity applicability facets in the public files, 31 are rows
now and 63 are kept as written. 39 of those are a property with a value and
**no dataType** (`<property><propertySet>..</propertySet><baseName>..</baseName><value>..</value></property>`):
the page always writes the template's dataType on a standard property, which
would change what the facet asks, and an own-set row without a dataType takes
no value. 21 of the 63 sit in specifications whose class the page cannot hold
(a pattern on the class name, or no entity facet), so nothing is offered for
them. 3 are an attribute value with a pattern on a schema enumeration.

Next, most valuable first: a "no dataType" value row (the page writes what it
read; a value test without a type, as IDS 1.0 allows); the same count line for
requirement rows (how many would fail before the IDS is run).
