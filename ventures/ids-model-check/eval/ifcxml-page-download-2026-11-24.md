# The page's "Download as .ifcxml" (2026-11-24)

**What landed.** A STEP result in IFC4 or IFC4X3 now carries a "Download this
model as ifcXML" block on the checker page. The page's worker writes the model
with `ifcxml-writer.mjs`, the writer behind `node cli.mjs --to-ifcxml`
(eval/ifcxml-export-2026-11-24.md), and the browser downloads it. Nothing is
uploaded: the worker fetches `schema/ifcxml-layout-<schema>.json` from the site,
as it already fetches the schema tables.

**What changed in the writer.** `ifcxml-writer.mjs` imported `node:fs` at the
top, so a browser could not load it. The import is gone:
- `ifcXmlTarget(id)` still reads `./schema` in Node, reaching `fs` through
  `process.getBuiltinModule` (Node 22.3+), and says plainly when it runs
  without Node;
- `makeIfcXmlTarget(id, schemaJson, layoutJson)` builds the same target from
  JSON already in hand. `writeIfcXml` takes either the id string, as before,
  or that target.

## How it was checked

1. **Same bytes as the CLI.** The page was driven in headless Chromium
   (Playwright, a local `http.server` over `ventures/`). It loaded a model and
   an IDS, ran the check, pressed *Download as .ifcxml* and saved the file.
   That file was compared with `node cli.mjs --to-ifcxml` on the same model,
   with `<time_stamp>` taken out:

   | model | schema | entities | nested relationships | page vs CLI |
   |---|---|---:|---:|---|
   | samples/tiny-house.ifc ("Try a tiny sample") | IFC4 | 50 | 13 | identical |
   | samples/bsi-ifc43/Building-Hvac.ifc | IFC4X3_ADD2 | 152 | 21 | identical |
   | samples/bsi-ifc43/Infra-Rail.ifc | IFC4X3_ADD2 | 726 | 23 | identical |
   | samples/bsi-ifc43/Infra-Road.ifc | IFC4X3_ADD2 | 894 | 71 | identical |

   On the first run only the header `<name>` differed: the page wrote the
   output name, the CLI the source name. The page now sends the source name,
   so the files match.
2. **Same verdicts.** The tiny-house file the page downloaded, checked by the
   CLI against the three sample IDS files, gives the same status and failure
   count for every specification as the STEP file: 7, 18 and 7 specifications,
   none different.
3. **No page errors.** No `pageerror` or console error on any of the four runs.
4. **Tests.** `ifcxml-writer.test.mjs` adds two tests. A target built from
   fetched JSON writes the same bytes as the Node path, and the writer has no
   static `node:` import. `page.test.mjs` checks that the button, the worker
   branch and the usage counter are wired. Its existing test already fails if
   the page or worker imports a Node-only module.

The check script is not kept in the tree: it was a 20-line Playwright driver
in the session's scratch space, with the steps above.

## Limits

- Only STEP sources in IFC4 or IFC4X3 get the button. IFC2X3 ifcXML has a
  different layout that the writer does not produce, and an ifcXML source is
  already ifcXML.
- The file is built as one string in the worker before it is downloaded. The
  STEP read already holds the model, so peak memory is roughly the model plus
  the XML text. A model near V8's string limit (about 512 MB of XML) would
  fail with the error shown on the page; the CLI streams to disk and has no
  such limit.
