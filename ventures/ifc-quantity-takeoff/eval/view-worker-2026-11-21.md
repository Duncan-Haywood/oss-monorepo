# The model view meshes in a worker; storeys and a section plane (2026-11-21)

**Question.** The 3D view (eval/model-view-2026-11-21.md) meshed elements
on the page's own thread in 30 ms slices. A single intricate element can
take longer than a slice, and each second the whole model was re-uploaded
to the GPU. How long did the page stop answering while a model drew, and
does meshing in a Web Worker fix it?

**What changed.**

- `view-worker.mjs`: a module worker that gets the file's bytes
  (transferred) and runs `parseStep` and `takeoff` itself, alongside the
  page's own takeoff, then meshes with the same `meshRows` the page uses
  and posts batches every ~150 ms with the arrays transferred. The takeoff
  is deterministic, so the ids and the view origin match the page's.
- Rejected first: posting the page's solids to the worker. Structured
  cloning `viewRows(rows)` (only what the mesher needs) took 2.8 s on
  Mini Project and **18.2 s on ARK_NUS** on the page's thread (Node 22
  `structuredClone`, this container), longer than the meshing it was
  meant to move.
- `viewer.mjs`: GPU buffers grow by doubling and `commit()` writes only
  the new elements (`bufferSubData`), so the page commits every 250 ms
  instead of re-uploading the model each second.
- Worker replies that queue up while the page is busy with its own takeoff
  are taken one per task (taking them in one loop gave 300-400 ms gaps on
  kleine_Wohnung).
- No worker, or a failed one (an old browser, memory: the worker holds a
  second copy of the model): the page meshes what is left in 30 ms slices,
  and the status line says so.
- Storeys: `row.level` is the IfcBuildingStorey above the element's
  container, so an element contained in an IfcSpace counts on its storey
  (duplex: 15 containers, 11 of them rooms, became 4 storeys). `storey`,
  which the bill of quantities groups by, is unchanged. The view draws only
  the vertex ranges of shown elements (`visibleRuns`, neighbours merged).
- Section plane: a fragment discard on `n.p > w` in both the drawing and
  the picking shader, horizontal or across x or y, flippable; a plan cut
  starts 1.2 m above the bottom of the shown elements. Cut faces are open.

**Method.** `node eval/view-responsiveness.mjs <models> --json ...`: headless
Chromium (pre-installed Playwright), the model set via the file input, and
from the moment the bill of quantities shows until the view says "elements
drawn", a 5 ms `setTimeout` chain on the page; gaps between ticks are how
long a click would wait. `drawArrays` is stubbed out: SwiftShader takes
hundreds of ms a frame on 1.8M triangles that a GPU draws in a few, and
those frames swamped the first readings. "Before" is `main` at the start of
this run (`--root` on a `git archive` of it). One run each, a shared
container: read differences of a few tens of ms as noise.

| Model | Mode | Draw s | p99 gap ms | Max gap ms | Gaps > 100 ms |
|---|---|---:|---:|---:|---:|
| duplex | before | 1.4 | 374 | 374 | 1 |
| | page fallback | 0.9 | 126 | 126 | 1 |
| | worker | 0.8 | 15 | 24 | 0 |
| Mini Project (Tekla) | before | 8.0 | 317 | 429 | 18 |
| | page fallback | 8.6 | 347 | 413 | 17 |
| | worker | 6.4 | 34 | 256 | 2 |
| schependomlaan | before | 1.0 | 62 | 62 | 0 |
| | page fallback | 1.2 | 78 | 78 | 0 |
| | worker | 0.8 | 146 | 146 | 1 |
| kleine_Wohnung_R22 | before | 3.0 | 293 | 293 | 3 |
| | page fallback | 3.2 | 307 | 307 | 6 |
| | worker | 2.4 | 101 | 306 | 3 |
| ARK_NUS_skolebygg (56 MB) | before | 38.8 | 605 | 763 | 59 |
| | page fallback | 34.2 | 387 | 862 | 49 |
| | worker | 25.7 | 31 | 648 | 4 |

(The sample office draws in 0.1 s in every mode.) Raw:
`view-responsiveness-2026-11-21.txt`, `-before.txt` and their `.json`.

**Reading.** On the two big models the worker takes the stalls over 100 ms
from 18 to 2 (Mini Project) and 59 to 4 (ARK_NUS), and the 99th-percentile
gap from 300-600 ms to about 30 ms; the view is also done sooner (38.8 to
25.7 s on ARK_NUS) because meshing overlaps the page's takeoff. A few
stalls of 250-650 ms are left in worker mode: where they come from is not
traced (candidates: the final commit, fit and recolour; large batches'
`_write`; garbage collection of transferred arrays). On small models the
worker gains little, and schependomlaan showed one 146 ms gap the page
path did not: it finished meshing before the page finished its takeoff,
so all its batches land at once.

**Not changed, and the next limit.** The page still parses the model and
builds the bill of quantities on its own thread before the view starts
(20 s on ARK_NUS in Node). Moving the takeoff into a worker is the next
item (NEXT.md).

**Checked by hand** (Playwright screenshots, real SwiftShader drawing): the
sample's Level 2 alone with a plan cut at +4.2 m; duplex Level 2 with a
plan cut at +3.99 m shows its door openings; a click picks only shown,
uncut elements (duplex: a Level 2 finish-floor slab).
