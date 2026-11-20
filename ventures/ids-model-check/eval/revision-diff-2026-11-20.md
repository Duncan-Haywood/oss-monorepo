# Comparing two versions of an IDS (2026-11-20)

A client revises an IDS, or issues the next stage's, and the coordinator who
receives it has two files and a model. Before re-running a check and reading
every failure again, they need to know what the new file asks that the old one
did not. Text diff tools show XML, not meaning: a re-indented file, a
`<simpleValue>` turned into a one-value enumeration, or reordered
specifications all look like changes. `revision.mjs` compares what the checker
reads.

## What it does

- `diffIds(old, new)`: specifications paired by unique name, then repeated
  names in order, then an identical applicability and IFC versions (a rename),
  then a leading section number unique on both sides (`3.3 Verdiepingsnaamgeving`
  and `(3.3) Rangschikking ...`). Facets paired by what they ask about.
- Each change graded for the person who must meet the IDS: tighter (asks
  more), looser, changed (neither contains the other), or same (metadata).
  Values compare as sets where that is exact: single values and enumerations,
  numeric bounds with no other facet, a numeric list against a range. Patterns
  are never compared as languages: any pattern edit is "changed". In
  applicability the direction flips (a new condition selects fewer elements);
  for a prohibited facet it flips too (fewer forbidden values forbid less).
- `revisionImpact(oldCheck, newCheck, diff)`: both versions checked on one
  model; elements matched by GlobalId (else #id): newly failing, already
  failing with a reason the old check did not give, no longer failing. A side
  whose specification is invalid IDS is not run by `checkIds`, so its empty
  failure list is not read as "fixed".
- Page `revision.html`, CLI `node cli.mjs --diff OLD NEW [MODEL] [--json]`
  (exit 1 when anything was added, tightened or mixed).

## Real revisions

`eval/revision-history.mjs` diffs every committed version of every `.ids`
file in a set of git repositories against the one before. The 13 repositories
holding the public IDS files of `eval/real-ids-files.txt` were cloned
(`git clone --filter=blob:none --no-checkout`, HEADs on 2026-11-20:
CBenghi/Xbim.Xids 04ff894, I-Sokolov/RDFApps f14d6ab,
Municipality-of-Rotterdam/Vergunning-Controle-Service d799f51,
OpenAEC-Foundation/OpenAEC-BIM-validator 2c39239, imagemnl/IMAGEM-GeoBIM-IDS
1cc1a3c, sthebigai/IDS_Norma-de-Objetos-BIM 4480c68, and seven with one
version per file: BIM2SIM/bim2sim, DFE-EducationEstates/InformationModelAssurance,
both buildingSMART-Portugal EIR repositories, buildingSMARTSpain/ids-mei-edificacion,
minimum-information-models/miniGIM, peterrdf/VNG).

```
node eval/revision-history.mjs DIR --json out.json --show 300
```

| repository | files with 2+ versions | revision pairs | specs added | removed | changed | unchanged |
|---|---|---|---|---|---|---|
| CBenghi/Xbim.Xids | 14 | 48 | 1 | 1 | 35 | 70 |
| I-Sokolov/RDFApps | 5 | 15 | 38 | 12 | 20 | 125 |
| Municipality-of-Rotterdam/Vergunning-Controle-Service | 2 | 2 | 0 | 0 | 38 | 0 |
| OpenAEC-Foundation/OpenAEC-BIM-validator | 1 | 1 | 0 | 0 | 26 | 0 |
| imagemnl/IMAGEM-GeoBIM-IDS | 1 | 1 | 0 | 0 | 0 | 25 |
| sthebigai/IDS_Norma-de-Objetos-BIM | 2 | 2 | 3 | 1 | 11 | 0 |

Totals: 27 files, 99 versions, 69 pairs compared, 3 pairs not compared
because a version is not an IDS (an empty or truncated commit), 0 errors.
233 facet- or specification-level changes: 116 tighter, 69 looser, 6
changed, 42 metadata. So 185 of 233 (79%) got an exact direction. 23 of 69
revisions changed nothing the checker reads (whitespace, reordering, `<info>`
only). Of 130 changed specifications: 47 ask more, 17 ask less, 25 mixed, 6
different, 35 metadata only.

The commonest kinds: a data type added to a property facet (58; tighter, since
a typed facet fails a property written in another type), IFC versions edited
(26), a specification's optionality (23), requirements added (33) and removed
(34), the applicability class (28).

## Read by hand

- OpenAEC RVB_BIM_Norm_v1.1, d669a74 to 7001370: all 26 specifications changed
  (16 mixed, 10 "ask less": their applicability goes from any class to one
  class, their requirements unchanged); the old file breaks ids.xsd in 102 places.
  The git diff shows the old file wrote IDS 0.9's `<n>` for `<name>`, so the
  checker reads every entity and attribute facet as "any name" (class (any) to
  "IFCPROJECT", attribute (any) to "Name"). The diff is right about what each
  file asks, and now says the old file breaks ids.xsd in N places so the
  reader knows why.
- NL BIM Basis ILS (OpenAEC fixture vs ids-bestanden v2): 12 of 12 specs
  paired by section number after names were all reworded; 10 optional to
  required, `FireRating` "30" to one of 30/60/90/120 (looser), `IsExternal`
  "False" to "FALSE" (different: IDS booleans are `true`/`false`, so neither
  spelling is the lexical form; both files would need fixing).
- Rotterdam BIM, c152358 to 379dab1: 19 specifications, IFC2X3 to IFC4 only:
  metadata. (First run graded this "wording only", which undersold a change
  of delivery schema; the label is now "metadata only (names, descriptions,
  IFC versions, bSDD links)".)
- DFE-EducationEstates Stage 4 vs Stage 5 COBie IDS (two published files, not
  a git revision): six required properties added (SerialNumber, BarCode,
  TagNumber, AssetIdentifier, InstallationDate, WarrantyStartDate). Four of
  the patterns use `(?:`, which is not XSD, so the audit makes the Stage 5
  specification invalid and a model check does not run it. With a model, the
  diff says "not compared (an invalid side)" instead of reporting 218 fixed
  elements, which the first version did. After `cli.mjs --fix` on both files,
  on HHS Office architect.ifc 218 of 218 applicable elements were already
  failing and on Schultz_Residence.ifc 340 of 340; all 340 Schultz elements
  gain the six requirements ("more to fix"), none newly fail.

## Faults found and fixed on the way

1. The entity facet's class was part of its pairing key but not compared, so
   IFCWALL to IFCSLAB in applicability showed no change. Now compared.
2. A restriction identical in text but on another base (`xs:string` vs none)
   was "changed": 3 CBenghi pairs. Now same unless one base is numeric.
3. An empty `<xs:restriction base="xs:integer"/>` printed as an empty string
   and graded "changed" against no value. Now shown as "(any integer)"; still
   "changed", since a number base makes text values fail.
4. Invalid specifications counted their unchecked elements as fixed (above).

## Limits

- Patterns are not compared as regular languages, so tightening `D-.*` to
  `D-[0-9]{3}` is "changed", not "tighter". A regex-inclusion test over the
  XSD subset is possible but not done.
- Pairing by section number needs the number unique on both sides; a file
  that renumbers and rewords the same specification shows it removed and
  added.
- Elements are matched by GlobalId: a re-export that regenerates GlobalIds
  makes every failure look new. The diff of IDS files does not depend on it.
- No public IDS repository was found that versions a client's EIR IDS
  through real project stages with commits; the six with histories are tool
  test files, research projects and two national sets.
