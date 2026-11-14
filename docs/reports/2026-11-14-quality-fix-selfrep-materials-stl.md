---
kind: note
subjects: [selfrep-materials]
topics: [research-integrity]
date: 2026-11-14
---
# Quality fix: selfrep-materials sourced part list (2026-11-14)

For the next run that touches the self-replication track (`research/selfrep-*`).

- `research/selfrep-materials/src/selfrep_materials/sourced.py` gives a sourced variant of
  `selfrep_closure.bom`. Printed masses are STL volume × density × fill, with the volumes in
  `research/selfrep-materials/data/stl_volumes.json` and recomputed by
  `experiments/stl_volumes.py --check`. Fasteners are counted per printer, with the derivation
  in `FASTENER_DERIVATION`. Select it with `Params(bom="sourced")`.
  `Params()` still defaults to `"placeholder"`, so `selfrep-recyclers` and other callers kept
  their numbers.
- Printed plastic is 480 cm³ (0.595 kg solid PLA) against the 1.10 kg placeholder. A per-part
  table is in the JSON.
- **Open follow-ups:**
  1. Move `selfrep-closure` (closure by mass and cost) and `selfrep-recyclers` (payback) to the
     sourced list. The recycler payback depends on the washer count (88 M8 washers, not 100)
     and on printed mass.
  2. Source the vitamin unit masses: NEMA17 mass from a datasheet, rods from steel density ×
     length (8 mm × length is exact geometry), and nuts and washers from ISO 4032/7089 tables.
  3. The audit's low defect (aluminium cp of 0.90 kJ/kgK typed from memory) is still open.
- Hosts: `raw.githubusercontent.com` and `reprap.org` (including `api.php` and `action=raw`)
  were reachable from the cloud proxy on 2026-11-14. `github.com`, `api.github.com`,
  `codeload.github.com`, Thingiverse and web.archive.org were not.
