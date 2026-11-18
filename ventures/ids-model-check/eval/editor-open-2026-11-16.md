# IDS editor: opening an existing IDS file (2026-11-16)

Until today `editor.html` could only start from its example. Most people who
write an IDS already have one: a national requirement set, a client's file, last
project's. **Open an IDS file** now reads one into the editor (`importIds` in
`editor.mjs`). The rule it follows: **writing the file back must ask for what
the file asked.** A facet the page's controls can hold without changing it
becomes an editable row; anything else is **kept as written**: shown as its
XML, written back unchanged, and removable.

## What the page can edit, and what it keeps

Editable: one class per specification (a single name, or a class with all its
concrete subclasses in any order), a predefined type from the class's
enumeration, and requirement rows the page already offers: a standard
`Pset_`/`Qto_` property the class can carry, with the template's `dataType` and a
value the page's value modes produce (exactly, one of the standard's
enumeration, between two inclusive bounds, one pattern, true/false); an
attribute the class has; a classification with a plain system name; a
material; a place through one of the five IDS 1.0 relations.

Kept as written: custom property sets (`Acme_Wall`), a pattern or enumeration
on a set or attribute name, exclusive bounds and length facets, several
patterns, a `dataType` other than the template's, applicability facets other
than the class, a class list that is not one class and its subclasses. The
spec's own `ifcVersion` (when it names more than one), the requirements'
`description` and every `<info>` field (copyright, version, author, date,
purpose, milestone) are carried through.

Each requirement row the importer proposes is written with the same code the
page uses, and kept only if its XML is identical to the opened facet's; so a
row the page would change (a base type, an enumeration order) falls back to
kept-as-written rather than changing.

One deliberate change: a prohibited specification (`maxOccurs="0"`) with
requirements. IDS 1.0 cannot evaluate those (the audit's
`prohibited-requirements` error) and the editor never writes them, so they are
dropped and the page names the specifications on open.

## Measured: `node eval/editor-open.mjs`

Opens each file, writes it back, parses both and compares per specification:
name, description, instructions, ifcVersion, optionality, requirements
description, and every facet's kind, cardinality, `dataType` and value as
`ids.mjs` reads them (a class list compared as a set). Also compares the audit's
errors before and after.

| Files | Opened | Write back asking the same | Specifications the same | Audit errors changed | Facets editable | Kept as written |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 64 public IDS files (`real-ids-files.txt`; 1 more is not XML) | 64 | 64 | 507 of 507 | 0 | 1,509 (75.0%) | 503 |
| IDS-Audit-tool ValidFiles | 12 | 12 | 288 of 288 | 0 | 12 (1.5%) | 796 |
| buildingSMART test cases, `pass-*` | 187 | 187 | 187 of 187 | 0 | 256 (68.4%) | 118 |

0.4 s for all 263. Four public files (the OpenAEC NL-BIM Basis ILS v2 and RVB
BIM Norm v1.1, each in two repositories) had 4 requirements on prohibited
specifications; those are the 4 not written, and the only audit change is that
`prohibited-requirements` goes away. The IDS-Audit-tool files are written to
exercise restrictions, so almost everything in them is kept as written, and
all of it comes back the same.

First run, before fixes: 60 of 64 public files and 11 of 12 IDS-Audit-tool
files came back the same. The misses were real round-trip bugs, each now
covered: an empty `<xs:restriction base="xs:boolean"/>` was written back as no
value (the checker treats them differently: the empty restriction needs a
value to be present), and an empty `<simpleValue/>` predefined type was
dropped.

## Measured: still valid against ids.xsd

`node eval/editor-open.mjs --write DIR` saves each opened file and its
written-back copy; `python3 eval/editor-xsd-compare.py DIR` opens both with
IfcTester 0.9.0 (`ids.open(path, validate=True)`).

| Files | Valid before | Valid after writing back | Made invalid |
| --- | ---: | ---: | ---: |
| 64 public | 53 | 54 | 0 |
| 12 IDS-Audit-tool ValidFiles | 11 | 11 | 0 |
| 187 test cases | 187 | 187 | 0 |

The one made valid is `IMAGEM-GeoBIM-IDS/IDS_IBRO_FI_IMAGEM.ids`, whose title
has an unescaped `&` (not well-formed XML; the checker's parser is lenient, the
editor writes `&amp;`).

## What is kept, in the public files (503 facets)

| Why the page cannot edit it | Facets |
| --- | ---: |
| property in a custom (non-standard) set | 110 |
| property, in a specification whose class the page cannot hold | 103 |
| standard property with a `dataType` or value the page would change | 62 |
| property facet in the applicability | 52 |
| class list that is not one class and its subclasses, or a pattern | 46 |
| attribute, in a specification whose class the page cannot hold | 44 |
| attribute facet in the applicability | 33 |
| attribute with a value the page cannot hold | 25 |
| standard set the class cannot carry | 23 |
| other (classification, material, partOf, entity) | 25 |

So the next steps that would make most of what people open editable: custom
property sets as a free-form row (set, property, `dataType` from the IFC
measure types), several classes per specification, and property and attribute
facets in the applicability.

## The page in Chromium

Playwright, 2026-11-16: opened the DfE Education Estates Stage 3 building IDS
(IFC2X3; "4 of 14 facets are editable here; 10 are kept as written"), audit
VALID, removed a kept facet (the XML shrank by that facet), reloaded (the
draft, kept facets included, survives), 390 px wide with no horizontal scroll,
no console errors.
