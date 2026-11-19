# Where a property set may sit: template types (2026-11-19)

**Question.** buildingSMART's property set templates carry a template type
that says what kind of object a set belongs on. Until now the audit and the
editor read only a set's applicable classes, and the README listed "property
set template types (occurrence versus type driven)" as unchecked. Do the
template types change any verdict, and which?

**Data.** The same template sources and pinned commits as
`eval/predefined-sets-2026-11-19.md`: IFC4 from `psd_IFC4_ADD2_TC1` in
`buildingSMART/IFC4.3.x-development@c6928569` (the `templatetype` attribute on
`PropertySetDef`; IFC4's `QtoSetDef` files carry none), IFC4X3 from
IfcOpenShell's `Pset_IFC4X3.ifc` at `7092a6ae`
(`IfcPropertySetTemplate.TemplateType`). IFC2X3's PSD files have no template
type; `psets-ifc2x3.json` regenerates byte for byte. The regenerated IFC4 and
IFC4X3 files differ from the old ones only by a new `tt` field (every set's
`classes`, `pt` and `props` identical, 513 and 760 sets compared); it is kept
only where it narrows where a set may sit:

| template type | IFC4 | IFC4X3 ADD2 | meaning (IFC4 IfcPropertySetTemplateTypeEnum) |
| --- | ---: | ---: | --- |
| PSET_TYPEDRIVENOVERRIDE | 353 | 379 | type or occurrence (not kept: the default) |
| PSET_OCCURRENCEDRIVEN | 16 | 105 | occurrences only |
| QTO_OCCURRENCEDRIVEN | (none named) | 14 | occurrences only |
| PSET_PERFORMANCEDRIVEN | 42 | 44 | an IfcPerformanceHistory only |
| PSET_MATERIALDRIVEN | 0 | 19 | a material (left to the class check) |
| PSET_PROFILEDRIVEN | 0 | 3 | a profile (left to the class check) |

(IFC4X3 also has 101 QTO_TYPEDRIVENOVERRIDE sets, not kept.)

**What changed.**

- Audit (`audit.mjs`, `templateTypeIssue`), requirements only, warnings:
  - `pset-occurrence`: an occurrence set required on a selected type object
    (`Pset_FanOccurrence` on `IFCFANTYPE`). Before, the type-object rule
    (`IFCFANTYPE` carries `IFCFAN`'s sets) let it pass silently. The message
    names the occurrence class to select instead.
  - `pset-performance`: a performance set required on the element
    (`Pset_FanPHistory` on `IFCFAN`); the standard puts it on the
    `IfcPerformanceHistory` that records the fan's performance over time.
  - Requiring a performance set on `IFCPERFORMANCEHISTORY` was a `pset-class`
    error ("cannot carry it") on every one of the 42 IFC4 and 44 IFC4X3 sets,
    a false error on the one place the standard says the set goes. Now clean.
  - Both outrank `pset-predefined` when a facet draws both (a performance set
    limited to one type is on the wrong object first).
  - Warnings, not errors, like `pset-predefined`: the template type is the
    standard's guidance, not a schema rule, and a model can still satisfy the
    specification.
- Editor (`editor.mjs` `setApplies`): occurrence sets are no longer offered on
  type objects; performance sets are offered on `IFCPERFORMANCEHISTORY`, which
  now appears in the class list, and not on the element.

**Results.** `node eval/template-types.mjs` (output `eval/template-types.txt`)
takes every class/set pair the editor offered before the change ("before" is
the same code with `tt` stripped) and audits each as a specification:

| | IFC4 | IFC4X3 |
| --- | ---: | ---: |
| class/set pairs offered before / now | 3,095 / 2,939 | 8,610 / 8,009 |
| occurrence set on a type object: pairs | 118 | 529 |
| warned pset-occurrence (before) | 118 (0) | 529 (0) |
| no longer offered | 118 | 529 |
| the named occurrence class audits clean | 118 of 118 | 529 of 529 |
| performance set on its element: pairs, warned | 80, 80 | 116, 116 |
| performance set on IFCPERFORMANCEHISTORY: pset-class before, clean now, offered now | 42, 42, 42 | 44, 44, 44 |
| pairs offered now with a template type drawing either warning or pset-class | 0 of 192 | 0 of 1,055 |

None of the 14 IFC4X3 occurrence quantity sets names a class that has a type
object (they are for buildings, storeys, sites, strata, earthworks and any
product), so in practice they draw no new warning; the field is kept for
completeness.

`eval/predefined-sets.mjs` still agrees everywhere on the smaller set of
offers (IFC4 338 of 338 limited pairs warned with no type, IFC4X3 651 of
651; `eval/predefined-sets.txt` regenerated).

Public files (`node eval/audit-corpus.mjs --all`, 65 real IDS and the
IDS-Audit-tool test files): output identical before and after. No public file
requires an occurrence set on a type object or a performance history set at
all. The one file naming an occurrence set (`Pset_ManufacturerOccurrence`,
UK DfE COBie requirements) is IFC2X3, whose templates carry no template type,
and selects occurrences. So this guards authors (and the editor's own offers)
rather than changing a verdict on files found today.

**Tests.** `audit.test.mjs` "template types: ..." and `editor.test.mjs`
"template types: ..."; the venture suite: 284 tests, 282 pass, 0 fail (2 skipped).
