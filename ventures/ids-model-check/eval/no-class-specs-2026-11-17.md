# IDS editor: specifications with no class (2026-11-17)

**Question.** IDS 1.0 does not require an entity facet. A specification can
select objects by an attribute or a property alone, and buildingSMART's own
IDS-Audit-tool test files do it on almost every specification
(`RichFileAttribute_Ifc2x3/4/4x3.ids`: "anything with a Version must ...").
The editor offered no rows there: with no class, property rows offered only
the author's own sets and attribute rows only Name, Description, ObjectType and
Tag, so such a file opened almost entirely as read-only XML
(`eval/date-oneof-2026-11-17.md`: 16 date lists kept for this reason alone).
What should a no-class specification offer, and how much of the real files
does that open?

## What landed (`editor.mjs`, `editor.html`)

- `commonSets(L, [])`: every standard set a template gives to some class
  (509 in IFC4). With no class, the specification checks every object that
  matches its other facets, so any set is a meaningful condition.
- `commonAttributes(S, [])`: every attribute that is stored, single and
  comparable on at least one class (468 in IFC4; Name, Description,
  ObjectType, Tag first, then A to Z). `FontFamily` is left out: a list on
  IFCTEXTSTYLEFONTMODEL.
- `attributeValueKind(S, [], name)`: typed only when every class that has the
  attribute gives it the same single stored type. OverallHeight is
  IFCPOSITIVELENGTHMEASURE on every class that has it, so it is a number with
  a range on `xs:double`; Name is a label on most classes but IFCSIUNITNAME on
  IFCSIUNIT, so it stays free text on `xs:string` (what the page wrote before).
- The page says what a no-class specification means, and warns when it has
  neither a class nor a condition (the audit's `applicability-empty` error).
- A class still narrows every list exactly as before.

## Opened files

`node eval/editor-open.mjs` (corpora from `eval/fetch-audit-corpus.sh` and
`eval/fetch-testcases.sh`), before and after:

| Files | Write back asking the same | Facets editable, before | after |
| --- | --- | ---: | ---: |
| 64 public IDS | 64 / 64 (507 specs) | 1,738 (86.4%) | **1,795 (89.2%)** |
| 12 IDS-Audit-tool ValidFiles | 12 / 12 (288 specs) | 227 (28.1%) | **613 (75.9%)** |
| 187 buildingSMART pass cases | 187 / 187 | 319 (85.3%) | 319 (85.3%) |

Audit errors changed on 0 files in every group. An opened facet becomes a row
only when the row writes the same XML the file had, so these counts cannot
change what a file asks.

## What is still kept, and why

`node eval/kept-facets.mjs` tallies each kept facet. After this change:

- IDS-Audit-tool: 166 requirement attributes with a value in no-class
  specifications, almost all a one-value enumeration on `xs:double` or
  `xs:integer` (BarCount one of 27). The page has no one-of mode on numbers,
  and an equals row writes a simpleValue, which is different XML. These are
  randomly generated test values; a one-of on numbers is the next step if
  real files need it. 17 applicability attributes are kept for the same kind
  of reason (an enumeration on `xs:anyURI`, `IsVentilated` one of
  "innovation" on a boolean).
- Public files: 132 property requirements in specifications that do name a
  class are now the largest kept group, then 21 entity facets in no-class
  specifications (names the schema does not know, or patterns).

## Not done

- Model-based hints ("on N of M in the model") need a class to count against;
  a no-class specification shows none.
- A one-of row on numbers (above).
