---
title: "Checking an ifcJSON model against an IDS: 97 twins and what the converters drop"
seo_title: "Check ifcJSON models against IDS in the browser"
date: 2026-11-21
tags: [bim, ifc, ifcjson, ids, ids-model-check]
description: "IDS Model Check now reads ifcJSON. On 97 STEP/JSON twins the starter IDS verdicts agree 291 of 291; the differences left are what two converters leave out."
---

[IDS Model Check](../../ventures/ids-model-check/README.md) checks a building model against a buildingSMART IDS file in the browser, with nothing uploaded. Until today it read STEP `.ifc`, ifcXML and `.ifczip`. Its "Not covered" list also had one line: ifcJSON input.

ifcJSON is buildingSMART's draft JSON form of IFC. It is still a draft: there is no released schema and no authoring tool exports it. It turns up anyway, because web developers would rather `fetch()` JSON than parse EXPRESS. The [ifcJSON repository](https://github.com/buildingSMART/ifcJSON) publishes 97 models as both `.ifc` and `.json`. That makes a good test: read both, check both, compare.

**There are two dialects.** IfcOpenShell's `ifc2json` writes a header that names the schema. Every rooted object sits in a flat `data` list, and links look like `{"type": "IfcOwnerHistory", "ref": "<uuid>"}`. The IFC.JAVA converter writes no header and one nested tree. Every value is wrapped (`{"type": "IfcLabel", "value": "Wall"}`). A second use of an object is just its id as a string. Relationships sit under the inverse attribute (`isDecomposedBy`, `containsElements`) with their pointer back to the parent left out. The new reader, `ifcjson.mjs`, takes both. It puts the pointers back, resolves the bare ids, and picks the schema that knows the class names when there is no header. Both converters write GlobalIds as UUIDs, so the reader turns those back into IFC's 22-character form. `22e66ddf-794d-40bb-8aa5-3dda450d8255` becomes `0YvctVUKr0kugbFTf53O9L`, which is what the STEP twin says. The BCF issues therefore name the same elements whichever file you drop.

**The numbers** ([eval/ifcjson-twins-2026-11-21.md](../../ventures/ids-model-check/eval/ifcjson-twins-2026-11-21.md)):

| | result |
| --- | --- |
| ifcJSON files read | 97 of 97 (0 before) |
| starter IDS verdicts identical | 291 of 291 |
| with 65 public IDS: same status and failing GlobalIds | 6,552 of 6,596 |
| fully identical, counts included | 6,485 of 6,596 |

**All 44 remaining differences trace to the converters, not the reader.** We read each kind by hand. `ifc2json` drops every empty string and every property with an empty value. STEP's `''` Phase becomes a missing key, and a property set of blank properties comes out with none. The Java converter leaves out objects that are only reachable through an inverse it does not write. That covers four path connections between walls, a project library, and the IfcMapConversion that georeferences a site. So two public IDS files with a "Map conversion" rule pass on the STEP file and find nothing on the JSON. If your pipeline converts to ifcJSON before checking, that is the kind of information you lose before any checker sees the model.

**A STEP file writes an object once and points at it; a JSON tree repeats it.** The first reading turned 59,733 STEP entities into 126,359. Now identical id-less objects become one entity, and the 97 files read as 54,416. The STEP files hold 1,386 pieces of geometry that nothing points at. A JSON tree written from the project down has no place for those, which explains the 67 differences that are counts only.

What is next: an authoring tool's own ifcJSON, if one appears, and buildingSMART's IFC5 `.ifcx` drafts, which are JSON too but shaped quite differently. Try it on the [live page](https://marisstella.app/ids-model-check/) by dropping a `.json` model, or run `node cli.mjs model.json spec.ids` from the repository.
