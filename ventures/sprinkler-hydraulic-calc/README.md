# Sprinkler hydraulic calculator

Free, open-source (MIT) hydraulic calculation for fire sprinkler systems laid
out as a tree, a loop or a grid. Give it the water supply from a flow test,
the design (density, area per head, minimum pressure, hose allowance) and the
heads and pipes; it returns the pressure and flow needed at the source so
every open head gives its required flow, the supply's pressure and margin at
that flow, the operating point where the system and supply curves meet, and
every pipe's flow, velocity and friction loss and every node's pressure.

- Live: https://marisstella.app/sprinkler-hydraulic-calc/
- How it works: https://marisstella.app/sprinkler-hydraulic-calc/how-it-works.html

**No warranty. An estimate, not engineering advice and not a stamped
hydraulic calculation.** NFPA 13, the local code and the authority having
jurisdiction decide what is accepted; a qualified fire protection designer
signs off on a real system.

## Who it is for

Sprinkler fitters and estimators checking whether a layout will make it
before they bid, designers wanting a second opinion on a grid, and students
learning hydraulic calculations. Commercial sprinkler design packages do far
more (drawing, area selection, fittings, submittal reports); this does one
thing, openly, and shows its working.

## Method

- Hazen-Williams friction in NFPA 13's form, `p = 4.52 Q^1.85 / (C^1.85 d^4.87)`
  psi per foot, over the pipe length plus the fittings' equivalent length;
  0.433 psi per foot of elevation; heads discharge `Q = K sqrt(P)`.
- All flows and pressures are solved at once by the global gradient
  algorithm (Todini, E. and Pilati, S., 1988, "A gradient algorithm for the
  analysis of pipe networks", in *Computer Applications in Water Supply*,
  vol. 1, Research Studies Press), the method EPANET uses. Heads are
  EPANET-style emitters (Rossman et al., *EPANET 2.2 User Manual*, US EPA,
  EPA/600/R-20/133, 2020), shut like a check valve if their pressure would go
  negative.
- Design point: bisection on the source pressure for the lowest pressure at
  which every head gives max(density x area, K sqrt(min psi)).
- Supply: `P(Q) = Ps - (Ps - Pr)(Q/Qr)^1.85` from a flow test.
- Inside diameters for schedule 10 and 40 steel from ASME B36.19M/B36.10M
  outside diameters and wall thicknesses; any pipe can take `id=` instead.

## Verification

- `hydraulics.test.mjs` compares the solver, run with EPANET's own
  Hazen-Williams constants, against EPANET 2.2 results stored in
  `check/epanet-results.json` for 61 seeded networks (`check/cases.mjs`: the
  example, 30 grids, 30 trees). On the 59 where every head stays at positive
  pressure, every node pressure and pipe flow agrees to within 1e-5 psi and
  gpm (measured worst: 4.6e-7 psi, 1.4e-6 gpm). The other two have heads
  above the water's reach, where EPANET 2.2 lets an emitter draw water in.
  To regenerate: `node check/cases.mjs > cases.json && python -I
  check/epanet_compare.py cases.json check/epanet-results.json` with `wntr`
  (1.5.0 used) installed.
- A single branch line, worked by the head-by-head hand method in the test
  itself, matches the design pressure to 1e-6 psi.
- Mass balance at every node and head-loss balance on every pipe for all 61
  networks; supply-curve and operating-point identities; elevation adds
  exactly 0.433 psi/ft.
- `check/grid_vs_tree.mjs` prints the grid-against-tree table on the
  how-it-works page; `page.test.mjs` checks the page's numbers against it.

## Input format

One item per line (`format.mjs`); `#` starts a comment.

```
source BOR
supply static=65 residual=45 at=800
design density=0.15 area=130 min=7 hose=250 margin=5
node BOR elev=0
node H11 elev=12 k=5.6 x=2 y=0      # a head; area= overrides the design area
node HV elev=10 gpm=50              # a fixed outflow
pipe feed BOR RISER len=40 fit=30 size=4 sch=sch40 c=120
pipe tie A B len=12 id=2.2 c=150    # any inside diameter
```

## CLI

```
node cli.mjs --example
node cli.mjs --print-example > system.txt
node cli.mjs system.txt [--json]     # or a JSON model
```

## Not modelled

Choosing the most remote design area, area reductions, room design method,
automatic fittings, pumps, backflow preventers and valves as separate items
(put their loss in the supply or a pipe's equivalent length), velocity
pressure (left out throughout, which NFPA 13 permits), dry-system trip time.

## Privacy and usage

Everything runs in the browser. `usage.mjs` keeps an anonymous count of
calculations and the day in the visitor's own local storage, honours Do Not
Track and Global Privacy Control, and has an opt-out on the page.

## Licence

MIT. Built with AI assistance. If it saved you a calculation,
[sponsor the work](https://github.com/sponsors/Duncan-Haywood).
