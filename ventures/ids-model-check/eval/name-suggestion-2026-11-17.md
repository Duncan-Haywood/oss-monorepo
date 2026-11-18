# "Did you mean Length?" in the IDS editor (2026-11-17)

**Question.** Published IDS files name standard properties one slip away from
the real name: Portugal's EIR files ask for `Qto_DuctSegmentBaseQuantities.Lenght`,
Rotterdam's permit checks for `Pset_WallCommon.AkousticRating`, an openingBIM
sample for `Pset_WallCommon."Thermal Transmitance"`. A model that follows the
standard never has those properties, so every element fails. The audit named
the fault; the editor either held the facet as read-only XML (Lenght, written
with a dataType) or opened it as a row whose property box was blank
(AkousticRating, written with none). Can the editor offer the standard name,
and does taking it clear the audit's error?

**Change.**

- `audit.mjs`: the edit distance behind the audit's "did you mean" now counts
  a swapped pair of letters as one slip (optimal string alignment). `Lenght`
  to `Length` was two Levenshtein edits, over the one-edit cap for a 6-letter
  name, so the audit listed the set's properties instead of naming `Length`.
  `nearName` is exported. Audit error and warning counts on the 64 public
  files and the IDS-Audit-tool files are unchanged (`node eval/audit-corpus.mjs`
  before and after: same tallies); the only lines that differ are the 8
  `Lenght` errors, which now end "did you mean Length?" instead of listing
  the set's properties.
- `editor.mjs`: `nameSuggestion` (a kept property facet whose Pset_/Qto_ set or
  property the templates lack, one slip from a standard name),
  `renameSuggestion` (the same for an editable row with no dataType) and
  `renameRow` (the fix: the corrected facet opens as an editable row when the
  page writes it back unchanged bar the name, else stays kept, corrected). A
  standard set the class cannot carry, and words that are no slip (`Mark`,
  `Verblijfsruimte`, `Brandweer_ingang`), get no suggestion.
- `editor.html`: such a row shows **NAME** "... has no standard property
  Lenght; did you mean Length? A model that follows the standard can never
  pass this check as written." with **Use Length** (usage event
  `editor_renamed`). An editable row whose property the template lacks now
  shows that name in its property box ("AkousticRating (not in the template)")
  instead of a blank "choose a property".

**Measurements** (`node eval/name-suggestion.mjs`, output
`eval/name-suggestion.txt`; corpus `sh eval/fetch-audit-corpus.sh`, 64 public
IDS files at each repository's HEAD on 2026-11-17 plus IDS-Audit-tool).

| | public files | IDS-Audit-tool |
|---|---|---|
| files with a suggestion | 7 of 64 | 0 of 75 |
| rows with a suggestion (requirements + applicability) | 17 (13 + 4) | 0 |
| ... that open as an editable row after the fix | 17 | - |
| audit pset-property / pset-name errors, before / after every fix | 31 / 14 | 2 / 2 |
| other audit findings changed | 3 files (below) | 0 |

The 17: Portugal's `Lenght` (8 rows in 5 files: duct, cable-carrier and railing
quantities), Rotterdam's `AkousticRating` (8 rows: 4 requirements, 4
applicability conditions on the same four sets), openingBIM's `Thermal
Transmitance`. The 14 left are names that are no slip (`Mark`,
`Verblijfsruimte`, `Entrance`, `IFC Predefined Type`, `RenovationStatus`,
IFC2X3's missing `IsExternal`), for which guessing would be wrong.

Fixing a name lets the audit see what the name fault was hiding:

- Two Portugal railing rows write `Length` as IFCPOSITIVELENGTHMEASURE; the
  template gives IFCLENGTHMEASURE. After **Use Length** the row is a
  `fileType` row with the existing **Use the template's type** button; taking
  it too leaves the files' `pset-datatype` count where it started (14 of 14 on
  the public set, the two new ones fixed).
- Rotterdam's four requirement rows carry a value with no dataType; once the
  name is standard the audit adds its `value-no-datatype` warning, which the
  row's existing **Write dataType IFCLABEL** button addresses.

In the page, driven in Chromium at 390 px (`eval/name-suggestion-page.mjs
FILE.ids`): Rotterdam 8 buttons, 8 "did you mean" errors to 0; the five
Portugal files 1, 2, 1, 2, 2 buttons, all to 0, with the railing's uncovered
type error fixed by its **Use the template's type** button; openingBIM 1 to 0.
No page errors, no horizontal scroll. The page counts matched the CLI's "did
you mean" counts on every file, and the CLI audit of Rotterdam's written-back
file finds 0 (was 8).

**Limits.** One suggestion per row, the audit's: nearest name within one slip
(two on names of 12+ letters), none on a tie. Set typos are handled
(`Pset_WallComon` in the tests) but none of the public files has one the
templates miss for its class. Kept applicability facets (`fixedApp`) get no
button yet; none of the public files has a misspelt one.
