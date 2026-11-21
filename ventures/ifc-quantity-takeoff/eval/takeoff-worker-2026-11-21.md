# The takeoff runs in the worker (2026-11-21)

**Question.** After the model view moved its meshing into a Web Worker
(eval/view-worker-2026-11-21.md), the page still ran the takeoff itself on
its own thread: from dropping a file until the bill of quantities showed,
the page could not answer a click. The worker was already running the
same takeoff on the same bytes, to get the solids it meshes. Can the page
take the worker's takeoff instead, and what does it cost to copy?

**Why this works now when copying solids did not.** Copying the solids to
the worker took 18 s of the page's thread on ARK_NUS. But a takeoff row
keeps its solids, world matrix and length unit as *non-enumerable*
properties (qto.mjs), and structured cloning copies only enumerable ones.
So posting `{ schema, units, rows }` from the worker sends the plain rows:
on ARK_NUS (4,459 elements) 6.0 MB, serialised in 29 ms and read in 27 ms
(Node 22 `v8.serialize`/`deserialize`, the same algorithm; Mini Project
3.7 MB, 23/26 ms; the takeoff itself took 16.7 s and 3.8 s).

**Same output.** The cloned takeoff gives byte-identical results to the
page's own for every output the page makes: the element CSV, the check
summary, the storey list, the view origin, the BoQ CSV grouped by
class/type, storey/class, Uniformat and material under every
method-of-measurement preset, and the revision diff (changes CSV and BoQ
delta). Checked on the two samples and five public models (sample-office,
its rev2, duplex, AC20-FZK-Haus, Mini Project, kleine_Wohnung_R22,
C20-Institute-Var-2: 24-26 outputs each, all identical).
`takeoff-worker.test.mjs` runs `view-worker.mjs` in Node with a stand-in
`self` and checks the same on the sample.

**What changed.**

- `view-worker.mjs` posts `{ takeoff, ms }` as soon as the takeoff is done,
  then meshes as before. A file it cannot read comes back as
  `{ failed, read: true }`, so the page reports it rather than trying again.
  `{ mesh: false }` stops after the takeoff: the earlier revision of a
  comparison is read in a worker too.
- `index.html` no longer runs its own takeoff when a worker answers. The
  status line counts the seconds while it reads. A newer file cancels an
  older read. With no worker, or one that stops before it answers
  (memory, an old browser), the page takes off the model itself as before.
  If the worker stops part-way through meshing, the page reads the file
  again for the solids of what is left (its rows have none) and meshes
  them in 30 ms slices.
- The model is now taken off once, not twice (page and worker in
  parallel), so a big model uses half the CPU and one copy of the parsed
  model, and the view finishes sooner.

**Method.** `node eval/takeoff-responsiveness.mjs <models> --json ...`:
headless Chromium (pre-installed Playwright); a 5 ms `setTimeout` chain on
the page from before the file is set until the view says "elements
drawn"; gaps between ticks are how long a click would wait. "Read" is
the window until the result shows, "draw" the rest. `drawArrays` is
stubbed, as in view-responsiveness.mjs. "Before" is `main` at the start
of this run (`--root` on a `git archive` of it). One run each in a shared
container: read differences of a few tens of ms as noise.

| Model | Longest freeze while reading, before → after | Read s | View drawn, s from drop | Freezes > 100 ms while drawing |
|---|---:|---:|---:|---:|
| duplex (215 elements) | 825 ms → 117 ms | 0.7 → 0.5 | 1.9 → 1.6 | 0 → 0 |
| C20-Institute-Var-2 (701) | 1,351 ms → 210 ms | 1.2 → 0.9 | 2.0 → 1.6 | 0 → 0 |
| kleine_Wohnung_R22 (425) | 4,283 ms → 248 ms | 4.1 → 3.9 | 7.1 → 6.7 | 4 → 2 |
| Mini Project, Tekla (2,636) | 3,695 ms → 310 ms | 3.5 → 3.1 | 9.9 → 9.9 | 3 → 3 |
| ARK_NUS_skolebygg, 56 MB (4,459) | **11,660 ms → 681 ms** | 11.3 → 11.5 | **46.9 → 35.0** | 4 → 3 |

Rows: `takeoff-worker-2026-11-21-before.json`, `-after.json`, `-noworker.json`.

**What is left.** In every "after" run the read window still has exactly
one gap over 100 ms: the task that receives the rows and builds the
summary cards, the bill of quantities and the checks table in one go (and
starts the view). On ARK_NUS that is 0.68 s, against 27 ms for reading the
rows alone, so most of it is building the tables; slicing that work is
the next step. The 230-300 ms freezes while drawing are unchanged from
eval/view-worker-2026-11-21.md and still untraced. The fallback works as the page did before: with `Worker` removed
(`--no-worker`, `takeoff-worker-2026-11-21-noworker.json`) every model was
read on the page, with the old freezes while reading (duplex 609 ms, kleine_Wohnung_R22 3,634 ms, Mini Project 3,233 ms, C20-Institute-Var-2 1,037 ms, ARK_NUS_skolebygg 12,166 ms).
