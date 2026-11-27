# STEP support: what ships, and the options for more

Status on 2026-11-24. This is for the owner to decide whether to go beyond what the package does
today.

## What ships (no dependencies)

`extractStep` reads AP203, AP214 and AP242 physical files (ISO 10303-21) with its own parser
(`src/step-parse.ts`) and walks the B-rep:

| Measure | Covered | Not covered (flagged, never guessed) |
|---|---|---|
| Units | SI length units (mm, m, ...), `CONVERSION_BASED_UNIT` inch/foot; degrees vs radians for cone angles | no length unit → assumed (`assumeUnits`, default mm), `units-unknown` flag |
| Bounding box | Every edge sampled along its real curve: line, circle, ellipse, B-spline (incl. rational), polyline, surface/seam curves | Spheres, tori and free-form faces can bulge past their edges → `bbox-may-underestimate`. Assembly placements (NAUO / mapped items) are not applied → `assembly-placement-ignored` |
| Volume | Exact (to edge sampling, about 1e-6 relative) for solids whose faces are planes, cylinders in any direction and cones: plates, brackets, drilled, counterbored and countersunk holes, straight bends, turned parts without fillets | Any sphere, torus (corner fillet), surface of revolution or B-spline surface → `volume: null` with the reason in `volumeNote` |
| Holes | Full cylinders (≥ 350° of wrap) grouped by axis and diameter, hole vs boss from the face orientation, depth along the axis | Partial cylinders (fillets, slot ends) are counted, not classified. Threads, counterbores as features, tapped holes |
| Bends | none: a solid does not say which faces are bends | `fieldConfidence.bends` is always `low` |

How volume works: ⅓ ∮ p·n dA summed per face from boundary integrals only. A plane gives
(n·o)·area. A cylinder gives r·area + o·∫n dA, with the area from Stokes' theorem (W = t·θ̂) and
∫n dA = ½∮p×dp. A cone gives apex·∫n dA. No surface is tessellated, so the code stays small and
fast. On the public NEMA-17 bracket it takes about 60 ms.

Checks: analytic fixtures (box, Z and X holes, countersink, inch rod) match to < 1e-6 relative.
The CadQuery cylinder matches π·r²·h, and the NEMA bracket's volume does not change when the file
is translated. Any face with a wrong orientation would break that invariance.

## Options for full STEP (spheres, tori, free-form, mass properties, tessellation)

Every serious option is Open CASCADE (OCCT) or a from-scratch kernel. Licences checked from the
npm registry metadata and package contents on 2026-11-24. Sizes were measured from the published
tarballs.

| Option | Licence | Size | Fit for a Worker | Notes |
|---|---|---|---|---|
| **occt-import-js** 0.0.23 | LGPL-2.1 (npm `license`; ships `license.occt.txt`, LGPL-2.1 text) | `occt-import-js.wasm` 7.6 MB raw, 3.1 MB gzip -9 | Borderline: compare with Cloudflare's current script-size limit for the plan. Memory for large assemblies is a real risk. | Returns a **triangle mesh** (three.js-style, per-face triangle ranges), not volume or B-rep properties. Volume would be computed from the closed mesh (signed tetrahedra): simple, but tessellation-limited. |
| **opencascade.js** 1.1.1 | LGPL-2.1-only | full build 65.9 MB raw, 13.7 MB gzip | No, not as published. A custom build with only STEP + BRepGProp might fit; that needs to be built and measured. | Full OCCT API: `BRepGProp` exact volume, `Bnd_Box`, feature recognition possible. |
| replicad-opencascadejs 1.2.1 | LGPL-2.1-only | 48.8 MB unpacked | No | Same OCCT, trimmed for replicad. |
| **Server-side OCCT** (CadQuery/build123d, Apache-2.0, on OCP/OCCT LGPL-2.1 + Open CASCADE exception) in a container (e.g. Cloudflare Containers or any VM), called from the Worker | Apache-2.0 + LGPL-2.1 | n/a | Yes, behind an HTTP call | Most capable: exact mass properties, robust healing, also IGES/BREP. We run it and do not distribute it, so the LGPL relinking terms do not bite. Costs a service to run. |
| Rust kernels compiled to WASM (e.g. truck, `truck-stepio`) | Apache-2.0 (truck; check each crate) | not measured | Unknown | Permissive, but STEP coverage and robustness on real exporter output need a trial before relying on them. |

LGPL in a proprietary product. Running an LGPL library on our own servers (Worker or container)
does not distribute it, so no source or relinking obligations reach customers. Shipping the WASM
to browsers counts as distribution. Then keep the LGPL module as a separate, replaceable `.wasm`
file, ship its licence text and offer its source. Do not statically merge it into our bundle.
OCCT itself is LGPL-2.1 with the Open CASCADE exception. I did not find the exception text inside
the occt-import-js tarball (its bundled file is plain LGPL-2.1). Check upstream before relying on
the exception. This is engineering guidance, not legal advice.

## Recommendation

1. Quote from what ships. Prismatic and sheet parts (the bulk of job-shop RFQs) get exact volume
   and holes. Everything else gets an exact-ish bounding box plus a flag, which is enough for a
   stock-size (bounding box + allowance) material estimate.
2. If quotes often hit `volume-unsupported`, add a server-side OCCT service (option 4). It is the
   only route with exact mass properties for every surface type, and it avoids distributing LGPL
   code and Worker size limits.
3. Try occt-import-js inside a Worker only if a second service is unwelcome. Measure the
   deployed size and memory on real customer files first.

Not verified here: Cloudflare's current Worker size, memory and CPU limits. The limits page could
not be fetched from the build session. Check them before choosing option 1 or 3.
