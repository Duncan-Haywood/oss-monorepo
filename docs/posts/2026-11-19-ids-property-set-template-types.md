---
title: "IFC property sets have a home: occurrence-only and performance history sets in our IDS audit"
seo_title: "Occurrence-only and performance history sets in an IDS audit"
date: 2026-11-19
tags: [ids-model-check, ventures]
description: "Our IDS audit now reads buildingSMART's template types: 647 occurrence-set offers on type objects removed, and a false error on 86 performance sets fixed."
---

[IDS Model Check](https://marisstella.app/ids-model-check/) checks a
building model (IFC) against an IDS file, the buildingSMART format for
writing down which information a model must contain. Before it reads a
model, it audits the IDS itself, and part of that audit compares every
standard property set (`Pset_...`, `Qto_...`) with buildingSMART's
templates: does the set exist, does it have that property, can the selected
class carry it.

"Can the class carry it" was answered from one field of the template, the
list of applicable classes. The templates hold a second field we had not
read: the **template type**, which says what kind of object the set goes on.
Most sets are `PSET_TYPEDRIVENOVERRIDE`: put them on a type (all fans of
this model) or on one occurrence (this fan), and the occurrence's value
wins. But two kinds are narrower:

- **Occurrence sets** (`PSET_OCCURRENCEDRIVEN`): 16 in IFC4, 105 in IFC 4.3,
  such as `Pset_FanOccurrence` or `Pset_ManufacturerOccurrence` (serial
  number, barcode). These describe one physical object. A fan *type* has no
  serial number.
- **Performance history sets** (`PSET_PERFORMANCEDRIVEN`): 42 in IFC4, 44 in
  IFC 4.3, such as `Pset_FanPHistory`. They go on an `IfcPerformanceHistory`
  object that records how a fan performed over time, not on the fan.

## What was wrong

Two things, one in each direction.

1. An IDS could require `Pset_FanOccurrence` on `IFCFANTYPE` and the audit
   said nothing, because a type object carries its occurrence class's sets.
   The editor even offered it: 118 such class/set pairs in IFC4, 529 in
   IFC 4.3.
2. Requiring `Pset_FanPHistory` on `IFCPERFORMANCEHISTORY`, which is exactly
   where the standard puts it, was an *error*: the template lists `IfcFan`,
   so a performance history "cannot carry it". That was wrong for all 86
   performance sets.

## What it does now

The audit warns `pset-occurrence` when an occurrence set is required on a
type object, and names the occurrence class to select instead. It warns
`pset-performance` when a performance set is required on the element, and a
performance set on `IFCPERFORMANCEHISTORY` audits clean. The editor stops
offering occurrence sets on types and offers performance sets on the
performance history.

We checked every class/set pair the editor offered before the change. All
647 occurrence-on-type pairs are warned, and the occurrence class each
warning names audits clean. All 196 performance-on-element pairs are
warned. All 86 performance sets audit clean on the history. None of the
1,247 pairs with a template type that the editor offers now draws either
warning. They are warnings, not errors: the template type is the standard's
guidance, and a model can still pass such a specification.

## What it did not find

None of the 65 public IDS files we audit has either case. The one file
naming an occurrence set, a UK Department for Education COBie requirement
for serial numbers and barcodes, is written for IFC2X3, whose templates
carry no template type, and it asks occurrences, which is right. So this is
a guard for authors and for our own editor, not a fix for a fault found in
the wild. The numbers and method are in the venture's
[eval note](../../ventures/ids-model-check/eval/template-types-2026-11-19.md).

The checker is free, MIT licensed, and runs in the browser; nothing is
uploaded. It is not a substitute for a BIM coordinator's review.
