---
title: "1.#INF in an IFC file: the property that vanished and the check that passed"
seo_title: "1.#INF and -1.#IND in IFC files: why an IDS check passed"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "Some exporters write 1.#INF or -1.#IND for a bad number. The checker dropped those records, so a wall with infinite U-value passed. Now it fails."
---

Ask a C program on Windows to print a number that is infinite and you get
`1.#INF`. Ask it to print an undefined one, say 0 divided by 0, and you get
`-1.#IND`. Some IFC exporters write a computed value without checking it
first, so this text ends up in the model file:

```
#2 = IFCCARTESIANPOINT((-1.#INF,-1.#IND,1.#INF));
```

The IFC file format (ISO 10303-21) has no such number. xBIM, the .NET IFC
toolkit, keeps a test file with exactly this line, `FormallyIllegalFile.ifc`,
because people sent it real exports that held these values.

## What the checker did with it

[IDS Model Check](https://marisstella.app/ids-model-check/) reads a model and
checks it against an IDS file, buildingSMART's format for "every wall must
have a U-value of at most 1". Its file reader stopped at the `#`, wrote a
reader note ("#2: expected , or ) at 809") and skipped the whole record.

For a point, that costs little. For a property, it changes the answer. We
built a three-wall sample where one wall's thermal transmittance is written
`IFCTHERMALTRANSMITTANCEMEASURE(1.#INF)`. The property record was dropped, so
as far as the checker knew the wall had no U-value. "U at most 1, if present"
then **passed** that wall. A required check would have said the property was
missing, and sent someone looking for a value that is in the file. Another
check, one that applies only to walls carrying the property, left the wall
out entirely. The report said `PASS: 2 of 2`.

## What it does now

The reader takes `1.#INF`, `-1.#INF`, `-1.#IND`, `1.#QNAN` and `1.#SNAN`
(with or without digits after them) as infinity or NaN, and adds a reader
note saying it did: `#202: 1.#INF read as Infinity (a Microsoft C runtime
spelling, not ISO 10303-21)`. The same sample now reads `FAIL: 0 of 2`:

```
Acme.ThermalTransmittance is Infinity, not <= 1
Acme.Thickness is NaN, not >= 0
```

The [IDS editor](https://marisstella.app/ids-model-check/editor.html) works
from the same reading. When it lists a property's values from an open model,
it shows these as `INF` or `NaN` and leaves them out of "Use the model's
range". The row also says the export wrote a fault, and that any range or
value check will fail those objects until the source model is fixed or
re-exported.

## The rest of xBIM's test files

We ran the editor's four model sweeps over all 128 of xBIM's test models
(19 MB, IFC2X3 to IFC4X3, many of them broken on purpose). Every file read.
Each sweep builds checks from a model and runs them on the same model, and
all of them passed: 3,786 of 3,786 property offers, 1,295 attribute lists,
131 attribute ranges. We also compared every text value against what
IfcOpenShell 0.9.0 reads. On the 91 files it opens, 24,290 of 24,290 strings
were the same, including the escape sequences used for non-Latin text.
IfcOpenShell refused the other 30, mostly for schema versions it doesn't ship.

`1.#INF` was the only fault the set turned up. The full numbers, file by
file, are in the
[write-up](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/ventures/ids-model-check/eval/xbim-test-files-2026-11-24.md).
