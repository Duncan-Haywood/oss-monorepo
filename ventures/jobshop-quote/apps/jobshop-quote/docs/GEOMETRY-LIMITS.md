# How large a CAD file the Worker can measure

Measured 2026-11-27 on real STEP files; the numbers behind `INLINE_GEOMETRY_MAX_BYTES` (1 MB,
measured inside the upload) and `MAX_MEASURE_BYTES` (6 MB, measured at all) in
`src/worker/services/rfq/index.ts`.

**Short version.** CPU is not what limits measuring a large STEP. Memory is. A 12.9 MB STEP
measures in 1.3 s of workerd time, well inside the 30 s CPU limit, but needs about 132 MB of V8
heap, more than a Worker isolate's 128 MB in total. A request killed for memory cannot record that
it failed, so before this change a large file's "Measure" button would have failed on every click.
Files over 6 MB are now stored with a note saying why they were not measured, and "Measure" is not
offered for them.

## The files

Real exports, none committed here (only measured):

- NIST MBE PMI test models ([NIST PMI STEP files](https://www.nist.gov/document/nist-pmi-step-files),
  public domain, NIST asks for acknowledgement): CTC, FTC and STC parts from NX, CATIA, Creo and
  SolidWorks, AP203 and AP242, 0.4 to 6.1 MB. The largest STEP NIST publishes is 6.1 MB.
- Three Voron-0 printer parts from Onshape (ST-Developer STEP, 3.3, 8.0 and 12.9 MB;
  [VoronDesign/Voron-0](https://github.com/VoronDesign/Voron-0), `CAD/`, GPL-3.0): multi-body
  assemblies of the kind a shop gets when a customer exports a whole sub-assembly.

## CPU: timed in workerd

`packages/cad-features` bundled with esbuild into a bare Worker (`workerd` 1.20251118.0,
`nodejs_compat`), the file POSTed to it locally; the time is the request's wall time minus a no-op
request carrying the same bytes (Workers freeze `Date.now()` during compute, so timing inside the
Worker reads 0). First request and median of four more.

| File | Size | First | Median | ms per KB |
|---|---:|---:|---:|---:|
| MiniSB_Bowden.step (Onshape) | 12.9 MB | 1,355 ms | 1,250 ms | 0.095 |
| MiniSB_adxl.step (Onshape) | 7.8 MB | 1,000 ms | 965 ms | 0.121 |
| nist_ftc_09_asme1_ap242-e1 | 5.8 MB | 211 ms | 204 ms | 0.034 |
| nist_stc_09_asme1_ap242-e3 | 5.0 MB | 247 ms | 232 ms | 0.045 |
| nist_stc_10_asme1_ap242-e2 | 4.6 MB | 289 ms | 290 ms | 0.061 |
| nist_ftc_08_asme1_ap242-e2 | 4.5 MB | 268 ms | 257 ms | 0.056 |
| FS_Hotend_Mount.step (Onshape) | 3.2 MB | 419 ms | 413 ms | 0.124 |
| nist_ctc_02_asme1_ap203 | 3.2 MB | 390 ms | 411 ms | 0.125 |
| nist_ctc_02_asme1_ap242-e2 | 1.9 MB | 270 ms | 287 ms | 0.149 |
| nist_ftc_11_asme1_ap242-e2 | 1.9 MB | 64 ms | 79 ms | 0.041 |
| nist_ctc_04_asme1_ap242-e1 | 1.2 MB | 242 ms | 212 ms | 0.168 |
| nist_ctc_02_asme1_rc | 1.1 MB | 249 ms | 210 ms | 0.186 |
| nist_ctc_05_asme1_ap242-e1 | 0.8 MB | 105 ms | 87 ms | 0.101 |
| nist_ctc_01_asme1_ap242-e1 | 0.4 MB | 48 ms | 39 ms | 0.102 |
| nist_ftc_07_asme1_rd | 0.4 MB | 78 ms | 76 ms | 0.194 |

The old estimate was 0.5 ms per KB, from one 166 KB file in Node. The worst real file here is
0.19 ms per KB, so ten 1 MB files at upload take under 2 s, and even 15 MB would be about 3 s of
CPU. Time per KB varies with content (B-spline faces cost more than planes and cylinders), not size.

## Memory: smallest heap that measures each file

V8 is the same engine in Node and workerd, but workerd run locally does not enforce the 128 MB
isolate limit, so this was measured in Node: the smallest `--max-old-space-size` at which
`extractFeatures` finishes, found by bisection (`node packages/cad-features/scripts/heap.ts
<file>...`). An empty STEP needs about 9 MB (Node itself). In production the isolate also holds the
app's own code and data and the file's bytes as read from R2.

| File | Size | Heap needed |
|---|---:|---:|
| MiniSB_Bowden.step | 12.9 MB | 132 MB (198 MB before the parser change below) |
| MiniSB_adxl.step | 7.8 MB | 124 MB |
| nist_ctc_02_asme1_ap203 | 3.2 MB | 78 MB |
| nist_ctc_02_asme1_ap242-e2 | 1.9 MB | 66 MB |
| nist_stc_10_asme1_ap242-e2 | 4.6 MB | 58 MB |
| nist_ctc_04_asme1_ap242-e1 | 1.2 MB | 54 MB |
| nist_stc_09_asme1_ap242-e3 | 5.0 MB | 54 MB |
| nist_ftc_09_asme1_ap242-e1 | 5.8 MB | 50 MB |
| nist_ftc_08_asme1_ap242-e2 | 4.5 MB | 50 MB |
| FS_Hotend_Mount.step | 3.2 MB | 47 MB |
| nist_ctc_05_asme1_ap242-e1 | 0.8 MB | 31 MB |

Memory is not proportional to size either: a 1.9 MB file with many B-spline faces
needs more than a 5.8 MB file of planes and cylinders, because the analysis keeps every sampled
edge. Every file up to 6 MB fitted in 78 MB; both files above it needed over 120 MB. Hence 6 MB.
It is a judgment from 12 files, not a guarantee: a 6 MB file dense with free-form faces could still
run out, in which case that one request fails and the file stays pending.

## The parser change

`src/step-parse.ts` kept every argument list as the array `push` built. V8 gives an array 17 slots
on its first push, so a three-number point held about five times the memory it needed, across
~180,000 instances in the 12.9 MB file. Lists are now copied to exact size when they close, a
simple instance's parts array is built at size one, and entity names and enum values are kept once
each instead of upper-cased per instance. The parse of the 12.9 MB file went from 132 MB retained
to 71 MB and from 771 ms to about 650 ms, and the whole measure from 198 MB to 132 MB of heap. The
`PartFeatures` for all 33 STEP files in the NIST set and the three Onshape files are byte-for-byte
the same as before. Interning `{ ref }` objects per id was tried and dropped: the map cost about
what it saved.

## Next, if shops send larger files

- Free the sampled edges as each body is done (`Sampler.cache` holds them all until the end), the
  next memory target in `packages/cad-features/src/step.ts`.
- Or measure large files off the request path, in a container or a queue consumer with more memory,
  if shops' real RFQs carry assemblies over 6 MB often.
