---
title: "A 680 MB ifcXML file now opens: the XML reader works on bytes, not one string"
seo_title: "Reading ifcXML past JavaScript's string limit"
date: 2026-11-18
tags: [bim, ifc, ifcxml, performance]
description: "The IDS checker's XML reader now scans bytes. Big ifcXML models need about half the heap, and files past V8's 537 MB string limit open."
---

The [IDS model checker](../../ventures/ids-model-check/README.md) checks IFC
models against buildingSMART IDS files, in the browser or from the command
line. Earlier today its STEP reader stopped turning the whole file into one
JavaScript string. The ifcXML reader still did. That had two costs. The
decoded file stayed on the heap for the whole check, because lazy geometry is
re-read from it. And V8 caps a string at 536,870,888 characters, so an ifcXML
file much past 500 MB could not be opened at all.

## Why bytes are safe to cut

The XML reader only looks for a few characters: `<`, `>`, `/`, `=`, the two
quotes, `!`, `?` and white space. All of them are ASCII. In UTF-8, an ASCII
byte never appears inside a multi-byte character. So the reader can find
every tag boundary in the raw bytes, then decode each element name,
attribute value and text run on its own. The result is the same characters
the whole decoded file would give. Offsets become byte offsets, and lazy
geometry is re-read from its byte span.

## What it measured

These are real exports from `opensourceBIM/IFC-files`, written as ifcXML. Each
was checked against 68 IDS files (3 starter files and 65 public ones). Every
report hashed the same before and after.

| model | smallest heap that parses it, before | after |
|---|---:|---:|
| HHS MEP, 152 MB | 336 MB | 192 MB |
| Schultz Residence, 93 MB | 192 MB | 112 MB |
| federated, 374 MB | 800 MB | 448 MB |

With all 68 IDS files, the federated model went from needing 832 MB of heap
to 448 MB. That is the same heap its STEP counterpart needs. Times stayed
within run-to-run noise.

A 680 MB federated ifcXML (2.95 million entities) used to fail in 0.4 s with
"Cannot create a string longer than 0x1fffffe8 characters". It now checks
against the starter IDS in 25.6 s.

## Caveats

No public ifcXML file over 0.6 MB has turned up. The large files here are
real STEP exports written in xBIM's IFC2X3 layout, so they test scale on one
writer's layout. The new reader treats only ASCII white space as white space
inside a tag. XML does not allow other spaces there, so this costs nothing
on a valid file. Full measurements:
[`eval/ifcxml-bytes-2026-11-18.md`](../../ventures/ids-model-check/eval/ifcxml-bytes-2026-11-18.md).
