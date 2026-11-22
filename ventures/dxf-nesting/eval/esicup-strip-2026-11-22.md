# ESICUP strip benchmark and an order search, 2026-11-22

## Pre-registration (written before any held-out run with the search)

- **Data.** The 23 discrete-rotation ESICUP strip-packing instances as JSON in
  [sparrow](https://github.com/JeroenGar/sparrow) (MIT, commit b8ef033), `data/input`.
  Reference: sparrow's best strip length per instance (`data/records/final_best_*.svg`,
  the bin's bbox `x_max`), the state of the art in the 2025 paper
  "An open-source heuristic to reboot 2D nesting research" (arXiv 2509.13329).
  The `_c` (continuous rotation) twins are left out: no record to compare to.
- **Score.** Length ratio = record length / our length (1.0 = matches the record),
  averaged over instances; density = parts' area / (strip height x our length).
  Grid: strip height / 500 cells, gap 0, margin 0, tolerance 1e-6 of the height.
  Every nest must pass `verify` (exact segment-to-segment check).
- **Split.** Dev (tuning allowed): gardeyn0 to gardeyn9 (10). Held out: the 13
  classic sets (albano, blaz1, dagli, fu, jakobs1, jakobs2, mao, marques,
  shapes0, shapes1, shirts, swim, trousers), run once with the setting the dev
  set picks.
- **Change under test.** `searchIters`: after the four fixed orders, mutate the
  best order (swap two copies of different parts, or move one earlier), keep it
  when the nest is no worse, seeded so it repeats; runs that can no longer win
  stop early.
- **Adopt as the page default if** the held-out mean length ratio rises by at
  least 0.01 over searchIters 0, no held-out instance gets worse (the search
  only accepts no-worse nests, so a worse one would be a bug), and the
  page's worked example still finishes in under 5 s on this machine.
