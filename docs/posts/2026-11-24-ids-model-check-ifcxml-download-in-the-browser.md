---
title: "IFC to ifcXML in the browser, byte for byte the command line's file"
date: 2026-11-24
tags: [ids-model-check, ventures, bim]
description: "The free IFC checker page now writes an IFC4 or IFC4X3 model as XSD-laid-out ifcXML in your browser, identical to the CLI's output on four test models."
---

This morning the IDS checker gained `--to-ifcxml`. It writes an IFC4 or IFC4X3
STEP model as ifcXML, the standard's XML form, laid out the way buildingSMART's
XSD says ([the earlier post](2026-11-24-ids-model-check-ifcxml-export-against-the-xsd.md) has
how it was checked). That was a command-line feature. Most people who use the
checker open [the page](https://marisstella.app/ids-model-check/) and never
install Node, so the next step was a button there.

## One import was in the way

The writer opened with `import { readFileSync } from "node:fs"`. It read two
JSON files at load time: the schema table and the layout taken from the XSD.
A browser refuses a module with that import, and the page's own test suite
already fails any page module that imports something Node-only.

The fix was small. The writer now takes its schema and layout as arguments.
In Node, `ifcXmlTarget("IFC4")` still reads them from disk, reaching `fs`
through `process.getBuiltinModule` instead of a static import. On the page,
the worker fetches `schema/ifcxml-layout-ifc4.json` from the site, as it
already fetches the schema tables, and hands both to the writer. Nothing is
uploaded: the model never leaves the tab.

## Checked by comparing files

Two writers sharing one code path can still drift: a different name in the
header, a different schema object, a different order of properties. So the
check was the plainest one available. Headless Chromium opened the page,
loaded a model and an IDS, ran the check, pressed *Download as .ifcxml* and
saved the file. That file was then compared with the command line's output.

On the tiny-house sample and buildingSMART's three IFC4X3 samples (a building
HVAC model, a railway and a road, 50 to 894 entities), the files are
identical apart from the time stamp. The first run did find one difference:
the page wrote the output file's name in the header, while the CLI writes the
source file's. It now sends the source name. The tiny-house download, checked
again against the three sample IDS files, gives the same verdict and failure
count for each of the 32 specifications as the STEP file it came from.

## Limits

The button appears only for STEP models in IFC4 or IFC4X3. IFC2X3's ifcXML is
another layout, which the writer does not produce, and an ifcXML model is
already ifcXML. The page builds the file as one string before the download, so
a model whose XML would pass V8's string limit (about 512 MB) fails with a
message. The command line streams to disk and is the route for those. The
measurements are in
[`eval/ifcxml-page-download-2026-11-24.md`](../../ventures/ids-model-check/eval/ifcxml-page-download-2026-11-24.md).
