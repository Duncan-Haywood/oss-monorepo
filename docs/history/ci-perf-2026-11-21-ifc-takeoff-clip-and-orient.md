# ifc-quantity-takeoff: the takeoff 18% faster, same bytes (2026-11-21)

Perf track. Target: what a visitor waits on. The page runs the takeoff
before the model view starts, and `NEXT.md` recorded 20 s on ARK_NUS and
"speed on MEP fittings" as open (FM_ARC_DigitalHub went 4.7 s to 13.4 s
when curved breps landed, `eval/curved-breps-2026-11-20.md`).

## Reading

The 28 `.ifc` models in `ThatOpen/engine_web-ifc` `tests/ifcfiles/public/`
(blob-less sparse clone, not committed). One `node cli.mjs <model>` run per
model, wall time from `date +%s%N`, in a cloud container. Old code from
`git archive HEAD`, new from the working tree, run back to back.

`node --cpu-prof` on the CLI, self time summed per function:

| FM_ARC_DigitalHub (15.9 s) | self | ARK_NUS (18.2 s) | self |
|---|---:|---|---:|
| garbage collector | 36% | garbage collector | 28% |
| `orientShell` + its `idOf` (string key per point) | 22% | `clipPoly` | 17% |
| `solidPoints` generator + `solidExtent` | 9% | `item` | 7% |

Inclusive on ARK_NUS: `unionTerms` (joining overlapping body items) 4.5 s,
nearly all in `clipByPlanes` → `clipPoly`. Counted by instrumenting
`unionTerms`: 116,504 term pairs had overlapping boxes, and 86,849 (75%)
clipped down to nothing. Only 29,581 shared volume.

## Changes (geom.mjs)

1. **`solidExtent`** loops over the arrays directly instead of iterating the
   `solidPoints` generator. It is called up to 200 times per element by
   `thinnestNormal`, and 3 times by `worldBox`. Same arithmetic as `dot`.
2. **`orientShell`** keys points by nested `Map`s on x, y, z instead of a
   `"${x},${y},${z}"` string. Map keys compare as SameValueZero, which
   matches the strings (0 and -0 are one key, NaN one key). Edge uses are
   stored as `face * 2 + forward` numbers in slot arrays instead of
   `{fi, fwd}` objects. Slots keep the Map's insertion order, so the
   adjacency lists come out in the same order.
3. **`clipPoly`**:
   - It checks every point against the plane before building anything. All
     inside returns the faces as they are, all beyond returns `[]`, both
     exactly as the full loop did.
   - Each vertex's distance is computed once, not twice.
   - Crossing points are built as one array instead of three, with the same
     arithmetic.
   - The cap is sorted on precomputed angles. The comparator returns the
     same values, and V8's sort is stable.
4. **`beyondAPlane`** skips a `unionTerms` pair when one of A's planes has
   all of B's points beyond it by at least twice the clip tolerance. Clipping
   keeps points inside B's hull, so the later tolerance is no larger and the
   points are no nearer. The margin (1e-9 × scale) is far above rounding
   (~1e-16 × scale).

## Verification

- `--json` and CSV output byte-identical (`cmp`) on all 27 models that run;
  Viadotto Acerno stops with the same `IfcLinearPlacement` error on both.
- `fastpaths.test.mjs`: each fast path against a verbatim copy of the code
  it replaced, on 3,000 random prisms at three scales. Planes through
  vertices exercise the tolerance branch. `beyondAPlane` is only ever true
  where the old clip came back empty. `orientShell` is checked on random
  shells and on a cube written with -0 corners. The venture suite: 147 pass.

## After

| Model | before ms | after ms |
|---|---:|---:|
| ISSUE_098_R8_F1_MAB_AR_M3 (73 MB) | 32,859 | 29,562 |
| ISSUE_068_ARK_NUS_skolebygg (57 MB) | 17,737 | 14,111 |
| FM_ARC_DigitalHub (14 MB) | 16,444 | 12,512 |
| S_Office_Integrated Design Archi | 14,486 | 12,967 |
| advanced_model | 13,348 | 12,342 |
| ISSUE_102_M3D-CON-CD | 8,903 | 5,481 |
| kleine_Wohnung_R22 | 7,331 | 4,597 |
| ISSUE_129_N1540 | 6,822 | 5,755 |
| ISSUE_021_Mini Project | 4,310 | 3,633 |
| schependomlaan | 4,014 | 3,549 |
| **all 28** | **138,905** | **114,546** (−17.5%) |

Models under 1 s move by ±100 ms, which is noise at one run each.

## Not changed, ranked for the next run

1. **The garbage collector is still 28% on ARK_NUS.** Most of it comes from
   `clipPoly`'s per-face arrays in the 25% of pairs that really intersect,
   and from `transformPoly`. A flat Float64Array polytope would cut it, but
   that rewrites every caller.
2. **`unionTerms` still clips 30k pairs that share volume on ARK_NUS.** A
   cheap exact test for "B inside A" (return B whole) would skip the clip
   copies.
3. **`item` self time is 1.2 s** (geom.mjs, the big switch). Not looked at.
4. **`step.mjs` `value`/`args` is ~1.3 s inclusive** on ARK_NUS: the
   parser.
5. Viadotto Acerno: `objectPlacement` throws on `IfcLinearPlacement`
   (IFC4x3), and the CLI dies with a stack trace. That is a feature gap
   plus an error-message bug, not perf.
