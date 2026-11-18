---
title: "Seven public IDS files ask for a data type no standard model can have"
seo_title: "IDS pset-datatype errors: one-click fix in the IDS editor"
date: 2026-11-17
tags: [bim, ifc, ids]
description: "16 requirements in 7 public IDS files give a standard property the wrong dataType. The IDS editor now opens them as rows and fixes each one with a click."
---

An IDS requirement names a property and, usually, the data type it should
hold: `Pset_ManufacturerOccurrence.SerialNumber` as `IFCIDENTIFIER`. The
buildingSMART property templates fix that type for every standard property.
If an IDS asks for another type, a model that follows the standard fails the
check every time, however good its data is.

In the 64 public IDS files we audit, 16 requirements in 7 files do this:

- the UK Department for Education's asset files ask for SerialNumber and
  BarCode as `IFCTEXT` (template `IFCIDENTIFIER`);
- two CHEK permit files ask for `Pset_BuildingUse.MarketCategory` as
  `IFCREAL` or `IFCLENGTHMEASURE` (template `IFCLABEL`);
- the Dutch RVB BIM Norm asks for BuildingID and IsExternal as `IFCLABEL`
  (templates `IFCIDENTIFIER` and `IFCBOOLEAN`);
- buildingSMART Spain's MEI file asks for a space's Height, GrossVolume and
  GrossFloorArea as `IFCREAL` (templates `IFCLENGTHMEASURE`,
  `IFCVOLUMEMEASURE`, `IFCAREAMEASURE`).

The [checker's audit](https://marisstella.app/ids-model-check/) already
reported these as `pset-datatype` errors. The
[IDS editor](https://marisstella.app/ids-model-check/editor.html) could not
do anything about them: its rows always write the template's type, so it held
each one as read-only XML rather than change what the file asked.

Now each of them opens as an ordinary row that keeps the file's type, so
opening and saving a file still writes it back as it was. The row says why the
check cannot pass and offers **Use the template's type**. The click moves the
row to the template's type and keeps the value when it still fits: the DfE
files' serial-number patterns stay, a TRUE becomes `true` on a boolean, and a
value the new type cannot hold is dropped with a warning instead of guessed.

Measured on the public files (driven in a real browser, and with the
command-line audit): all 16 rows show the button, every value carried over,
the 14 errors on those rows went to 0, and the rewritten files still validate
against IDS's XML schema. Overall the editor can now edit 90.8% of the facets
in public IDS files, up from 90.0%, and 23 of 63 files open fully editable.

What it still leaves alone: a property the template does not have at all, like
Portugal's `Qto_DuctSegmentBaseQuantities.Lenght`. That is a misspelling of
Length, and a "did you mean" for it is next.

The measurements and scripts are in the repository:
`ventures/ids-model-check/eval/template-type-2026-11-17.md`.
