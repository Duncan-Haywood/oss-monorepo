# Property sets for one predefined type (2026-11-19)

**Question.** buildingSMART's templates give many standard property sets to
one predefined type of a class, not the whole class:
`Pset_ActuatorTypeElectricActuator` is for `IfcActuator/ELECTRICACTUATOR`,
`Pset_SolidStratumCapacity` for `IfcGeotechnicalStratum/SOLID`. Until now the
audit and the editor dropped that suffix (`schema/gen-psets.mjs` kept the class
only), so an IDS requiring a type-limited set on every object of the class
audited clean, and the editor offered all three actuator sets side by side
with nothing to say which actuator each is for. What does keeping the type
change?

**Data.** The same template sources as before, regenerated at the same pinned
commits: IFC4 from `psd_IFC4_ADD2_TC1` in
`buildingSMART/IFC4.3.x-development@c6928569` (ClassName
`IfcActuator/ELECTRICACTUATOR`), IFC4X3 from IfcOpenShell's `Pset_IFC4X3.ifc`
at `7092a6ae` (`IfcPropertySetTemplate.ApplicableEntity`,
`IfcActuator/ELECTRICACTUATOR,IfcActuatorType/ELECTRICACTUATOR`). IFC2X3's PSD
files name classes without types (four mention one in free text,
`RelatedEntityIs:IfcFanType.PredefinedType=...`), so IFC2X3 is unchanged:
`psets-ifc2x3.json` regenerates byte for byte.

Regenerated `psets-ifc4.json` and `psets-ifc4x3.json` differ from the old ones
only by the new `pt` field: every set's `classes` and `props` are identical
(513 and 760 sets compared). A class the template also names bare (any type)
gets no entry.

| schema | sets | limited to predefined types |
| --- | ---: | ---: |
| IFC4 | 513 | 186 |
| IFC4X3 ADD2 | 760 | 343 |

**What changed.**

- Audit (`audit.mjs`, `predefinedIssue`): a requirement naming a type-limited
  set warns `pset-predefined` when the applicability names no predefined type
  (entity facet `predefinedType` or an attribute facet on `PredefinedType`), or
  names only types the set is not for. The message names the types to add.
  Fine whenever some selected class carries the set whatever its type.
  Classes with no `PredefinedType` attribute are never warned: IFC4 writes
  `IfcMaterial/Concrete`, which is a material category, not a type (the first
  draft warned on three buildingSMART Portugal files for this; fixed before
  landing and covered by a test). A warning, not an error: a model can still
  pass the specification, it just asks objects for something the standard
  does not give them.
- Editor (`editor.mjs` `setTypeLimit`, `commonSets(L, classes, predefinedType)`;
  `editor.html`): sets limited on the chosen class are labelled
  "(ELECTRICACTUATOR only)"; picking one fills in the specification's
  predefined type when the limit is one enumeration member; once a type is
  chosen, sets for other types are no longer offered, and a row holding one is
  cleared. Usage event `editor_predefined_from_set`.

**Results.** `node eval/predefined-sets.mjs` (output `eval/predefined-sets.txt`)
writes every type-limited class/set pair the editor offers as a specification
and audits it three ways:

| | IFC4 | IFC4X3 |
| --- | ---: | ---: |
| class/set pairs offered | 3,095 | 8,610 |
| limited on that class | 343 | 665 |
| no predefinedType: warned | 343 of 343 | 665 of 665 |
| the set's own type: audit clean | 321 of 321 | 665 of 665 |
| another of the class's types: warned | 341 of 341 | 661 of 661 |
| another type: set no longer offered | 341 of 341 | 661 of 661 |

22 IFC4 pairs are limited to ObjectType text, not an enumeration member
(`IfcDiscreteAccessory/Wire loop`, `IfcAnnotation/ContourLine`); the editor
does not fill those in (the audit's own `predefined-custom` warning explains
that such a type matches only USERDEFINED objects). 22 IFC4X3 pairs are
limited to several types; the editor labels them and leaves the choice to the
author.

Public files (`node eval/audit-corpus.mjs`, 65 real IDS and the IDS-Audit-tool
test files): one new warning, in
`GeotechnicalBIM/Fachsektionstage2025_Qualitaet_FM_Baugrund` example 2:
"Reibungswinkel Sande" selects every `IFCGEOTECHNICALSTRATUM` whose material
contains "Sand" and requires `Pset_SolidStratumCapacity.FrictionAngle`, a set
IFC 4.3 gives only to strata of type SOLID. Read by hand: a real finding (a
stratum left NOTDEFINED by its exporter is asked for a SOLID-only set), and a
mild one, which is why it is a warning. No IDS-Audit-tool verdict changed
(errors are untouched); no other public file has a type-limited set.

**Tests.** `audit.test.mjs` (two tests: right, wrong and missing type, the
attribute-facet form, IfcMaterial, IFC2X3 quiet) and `editor.test.mjs` (limits,
filtering, a written spec auditing clean). Driven in Chromium: picking
`Pset_ActuatorTypeElectricActuator` on IFCACTUATOR set the predefined type to
ELECTRICACTUATOR and removed the hydraulic and pneumatic sets from the list,
no page errors.

**Not done.** IFC2X3 (no types in its templates); occurrence-versus-type
template types (`PSET_TYPEDRIVENONLY`): IDS property facets read the type's
sets on the occurrence, so that distinction does not change a verdict.
