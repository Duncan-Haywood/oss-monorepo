# Water supply pipe sizing calculator

**Live:** https://marisstella.app/water-supply-sizing/ · [How it works](https://marisstella.app/water-supply-sizing/how-it-works.html)

How big should the water pipe be? Adding up every fixture's flow badly
oversizes it, because fixtures rarely all run at once. This tool works out the
peak flow each pipe must carry with Roy B. Hunter's 1940 probability method,
worked exactly for your mix of fixtures, then sizes every segment of a copper
or PEX supply tree from the pressure you have and reports what is left at each
fixture. Everything runs in the browser.

Who it is for: plumbers and small builders checking a service upgrade, a long
run or a low-pressure house; designers who want to see why a code table gives
the size it does; owners trying to understand a quote.

## Method

Every step is in `demand.mjs` and `pipe.mjs` and on `how-it-works.html`.

- **Demand.** A fixture drawing *q* gpm for *t* seconds once every *T* seconds
  is running with probability *p = t/T*; with *n* of them the count running
  is binomial(*n*, *p*). The design flow is the smallest flow exceeded with
  probability no more than 1% (Hunter's criterion; configurable). For a mix
  of types the total flow's distribution is the convolution of the scaled
  binomials on a 0.1 gpm grid. That replaces Hunter's fixture-unit weights. An
  optional zero-truncated form counts only instants when water is running. The
  design flow is never below the largest single fixture's flow.
- **Pipe.** A tree of segments, each feeding its own fixtures and everything
  downstream. The tightest path's pressure budget (static − fixed losses −
  minimum − 0.433 psi/ft × rise, over developed length = length × (1 +
  fittings %)) sets one allowable friction rate (the uniform friction-rate
  method). Each segment gets the smallest size within that rate (Hazen-Williams,
  C = 140 copper, 150 PEX) and the velocity limit. Every end's pressure is then
  computed by walking the tree. `--trim` steps segments down while every end
  holds the minimum.
- **Sizes.** Inside diameter = OD − 2 × nominal wall: copper water tube K, L
  and M (ASTM B88, OD = nominal + 1/8 in) and PEX at copper-tube size, SDR 9
  (wall OD/9, at least 0.070 in). Nominal dimensions; check your product.

It is **not** a plumbing code's fixture-unit table and uses none. Your local
code and the authority having jurisdiction decide what is accepted.

## Checked against Hunter

`demand.test.mjs` reads BMS65 Table 2 from the NIST scan
(<https://nvlpubs.nist.gov/nistpubs/Legacy/BMS/nbsbuildingmaterialsstructures65.pdf>,
fetched 2026-11-13). Hunter's Table 1 inputs are flush valves 9/300 at 27 gpm,
flush tanks 60/300 at 4 gpm and bathtubs 1/15 at 8 gpm.

- The probability of exactly *r* running matches Hunter's printed value to the
  fourth decimal in 13 of the 14 legible rows (flush valves and bathtubs). The
  one difference is 31 bathtubs: 0.0115 computed, 0.0118 printed. The
  flush-tank column is garbled in the scan's text layer and is not used.
- At each of Hunter's tabulated group sizes, the exact 1% tail rule gives his
  design number *m*.
- **The exact rule steps up sooner than his table for larger groups.** Hunter
  stepped up when P(exactly *r*) reached 1%; P(more than *m*) reaches 1% a
  few fixtures earlier. For flush valves, *m* = 8 is needed from 99 fixtures by
  the tail rule, while the table waits until 107. At 106 the chance that more
  than 7 run is 1.47%. The full comparison is on `how-it-works.html` and a test
  checks it against the engine. The tool follows the stated tail rule.

## Use

- Browser: open `index.html` (any static server), edit fixture types and
  segments, then "Size the pipes". JSON export and import; CSV of the sizes.
- CLI: `node cli.mjs --example`, `node cli.mjs system.json [--json] [--trim]`.

### Input file

```json
{
  "staticPsi": 60, "meterLossPsi": 6, "minPsi": 20, "fittingsPct": 50,
  "maxVelocityFps": 8, "material": "copper-l", "tail": 0.01, "truncate": false,
  "fixtureTypes": [{ "name": "Shower", "gpm": 2.5, "seconds": 480, "usesPerHour": 2 }],
  "segments": [
    { "name": "Service", "lengthFt": 60, "fixtures": {} },
    { "name": "Bath", "parent": "Service", "lengthFt": 25, "riseFt": 10, "fixtures": { "Shower": 1 } }
  ]
}
```

A fixture type takes `usesPerHour` and `seconds`, or `seconds` and
`everySeconds` (Hunter's *t* and *T*), or `p` directly. `material` is
`copper-k`, `copper-l`, `copper-m` or `pex-sdr9`; `c` overrides the
Hazen-Williams coefficient. The example's flows and timings are illustrative
assumptions, not measured data.

## Limits

Fixtures are assumed independent. Hazen-Williams is a cold-water
correlation. Fittings are a percentage, and meter loss is a fixed number, not
a curve. There is no water hammer, recirculation, sprinkler or irrigation
demand.

## Tests

`node --test '*.test.mjs'` (27 tests: Hunter's table, the convolution against
brute-force enumeration, Hazen-Williams scaling, sizing and trim invariants,
the page and CLI wiring, the explainer's numbers against the engine).

## Licence, disclaimer, privacy

MIT (`LICENSE`). No warranty: an estimate, not engineering advice and not a
plumbing code sizing method. Nothing leaves the browser; an optional,
switch-off-able counter in the browser's local storage records only that a
sizing ran and the day.
