---
title: "A third of IFC's standard property sets are for one kind of object; IDS files can ask for them on all"
seo_title: "IDS audit: property sets limited to one IFC predefined type"
date: 2026-11-19
tags: [bim, ifc, ids, editor]
description: "IFC4 limits 186 of 513 standard property sets to one predefined type; IFC 4.3 limits 343 of 760. Our free IDS audit now warns when a rule ignores that."
---

An IDS file is a list of rules for a building model (IFC): "every actuator
has a rated input power", written as "objects of class `IfcActuator` must
carry `Pset_ActuatorTypeElectricActuator.ActuatorInputPower`". Our free
[IDS checker and editor](../../ventures/ids-model-check/README.md) audits rules
like that against buildingSMART's property set templates before any model is
read.

Those templates say more than which class a set belongs to. Many say which
*kind* of that class. `Pset_ActuatorTypeElectricActuator` is for
`IfcActuator` objects whose predefined type is `ELECTRICACTUATOR`. The
hydraulic and pneumatic actuators have their own sets. Our audit used to drop
that part of the template, so the rule above audited clean. Run against a
model, though, it asks every hydraulic and pneumatic actuator for an
electric-actuator set the standard never gives them, and they all fail.

## How common it is

We regenerated the template tables from the same pinned buildingSMART and
IfcOpenShell sources, this time keeping the type:

| schema | standard sets | limited to some predefined types |
| --- | ---: | ---: |
| IFC4 | 513 | 186 |
| IFC 4.3 | 760 | 343 |

Apart from that new field, every set's classes and properties came out
identical to the old tables. IFC2X3's templates don't name types, so nothing
changes there.

## What the tool does now

- **The audit warns** (`pset-predefined`) when a rule requires a type-limited
  set and its applicability names no predefined type, or only other types. The
  warning names the type to add. It counts a `PredefinedType` attribute facet
  as well as the entity facet's own field.
- **The editor labels** such sets ("Pset_ActuatorTypeElectricActuator
  (ELECTRICACTUATOR only)"). When you pick one, it fills in the predefined type
  for you, and once a type is chosen it stops offering the sets for other types.

We wrote out every type-limited class and set pair the editor offers, 343 in
IFC4 and 665 in IFC 4.3, and audited each one three ways. With no type, all
1,008 drew the warning. With their own type, every one we could fill in
audited clean. With another of the class's types, every one was warned and
the editor no longer offered the set
([numbers](../../ventures/ids-model-check/eval/predefined-sets-2026-11-19.md)).

## A false alarm we caught first

The first draft also warned on three of buildingSMART Portugal's IDS files,
which require `Pset_MaterialConcrete` on `IfcMaterial`. The IFC4 template
writes that as `IfcMaterial/Concrete`, but `IfcMaterial` has no predefined
type: "Concrete" there is a material category. Our check now skips any class
that has no `PredefinedType` attribute, and a test covers the case.

## In real files

Across 65 IDS files from public repositories, one rule trips the warning. A
geotechnical example asks every `IfcGeotechnicalStratum` whose material
contains "Sand" for `Pset_SolidStratumCapacity.FrictionAngle`. IFC 4.3 gives
that set only to strata of type `SOLID`. Sand is solid, so the intent is
clear, but a stratum its exporter left `NOTDEFINED` will be asked for a set it
was never meant to carry. That is a mild finding, which is why this is a
warning and not an error.

The check is in the checker page's "Audit the IDS only", `node cli.mjs
--audit spec.ids`, and the GitHub Action's audit annotations. Everything runs
in your browser, and nothing is uploaded.
