# ADU plan set: generated report

**Research output, not a design for construction.** Nothing here was reviewed by a licensed architect or engineer or checked against a building code. A real build needs both, plus a permit.

## Plan
24 x 20 ft, 480 sq ft, 1 bedroom, 4:12 roof, studs at 24 in, joists at 16 in, rafters at 24 in.

- living: 24 x 10 ft, 240 sq ft
- bed1: 18 x 10 ft, 180 sq ft
- bath: 6 x 10 ft, 60 sq ft

Layout and member checks: all pass

## Framing members (from `house-spans` and `house-framing`)

- stud: 2x4
- joist: 2x8
- girder: 2x10
- rafter: 2x10
- ceiling: 2x12
- ridge: 2x12
- central bearing wall under the ceiling joists: no
- 2614 board feet of framing lumber, 5.45 per sq ft of floor

## Bill of materials

```
   9 x 2x4 x   288.00 in  (  144.0 bf)
   6 x 2x4 x   240.00 in  (   80.0 bf)
   3 x 2x4 x   120.00 in  (   20.0 bf)
  77 x 2x4 x    92.62 in  (  396.2 bf)
  22 x 2x4 x    79.50 in  (   97.2 bf)
   1 x 2x4 x    51.00 in  (    2.8 bf)
  17 x 2x4 x    48.00 in  (   45.3 bf)
   2 x 2x4 x    36.00 in  (    4.0 bf)
  14 x 2x4 x    33.00 in  (   25.7 bf)
   4 x 2x4 x    30.00 in  (    6.7 bf)
   3 x 2x4 x    24.00 in  (    4.0 bf)
  17 x 2x4 x     9.62 in  (    9.1 bf)
   4 x 2x4 x     7.62 in  (    1.7 bf)
   4 x 2x6 x    48.00 in  (   16.0 bf)
   2 x 2x8 x   288.00 in  (   64.0 bf)
  38 x 2x8 x   120.00 in  (  506.7 bf)
   3 x 2x10 x   288.00 in  (  120.0 bf)
  22 x 2x10 x   164.44 in  (  502.4 bf)
  11 x 2x12 x   288.00 in  (  528.0 bf)
   1 x 2x12 x   240.00 in  (   40.0 bf)
  22 x 4x8 sheet, wall sheathing  (672 sq ft)
  19 x 4x8 sheet, roof sheathing  (603 sq ft)
  15 x 4x8 sheet, subfloor sheathing  (480 sq ft)
   4 x girder post (size not designed)
```

## Lateral check (`house-structure` coefficients, exterior walls only)

Loads: 115 mph wind and Sds = 0.5, as house-structure defaults, not for any site. Nailing is the loosest panel-edge spacing (inches) of 15/32 sheathing that carries the demand on every wall line of the pair.

| direction | load | walls | demand per line, lb | edge nailing | solid wall, ft | max wind, mph |
|---|---|---|---|---|---|---|
| across ridge | wind | S+N | 1164 | 6 | 6.5 of 24 | 188 |
| across ridge | seismic | S+N | 290 | 6 | 6.5 of 24 |  |
| along ridge | wind | E+W | 1023 | 6 | 16.0 of 20 | 322 |
| along ridge | seismic | E+W | 290 | 6 | 16.0 of 20 |  |

## Envelope energy (`house-energy` degree-day model; assumed packages and prices)

- **baseline**: UA 155.7 Btu/h F (walls 50.4, ceiling 15.2, windows 40.6, door 7.0, floor 25.1, infiltration 17.3); walls 568 sq ft, windows 116
- **tight**: UA 98.8 Btu/h F (walls 24.1, ceiling 9.5, windows 31.3, door 7.0, floor 16.6, infiltration 10.4); walls 568 sq ft, windows 116

Annual heating and cooling cost, USD (assumed prices of $1.30 per therm and $0.16 per kWh):

| climate (stand-in) | system | baseline | tight | saving |
|---|---|---|---|---|
| Houston (2A) | heat pump | 195 | 123 | 72 |
| Houston (2A) | gas furnace + AC | 175 | 111 | 65 |
| Baltimore (4A) | heat pump | 297 | 189 | 109 |
| Baltimore (4A) | gas furnace + AC | 231 | 146 | 84 |
| Chicago (5A) | heat pump | 364 | 231 | 133 |
| Chicago (5A) | gas furnace + AC | 276 | 175 | 101 |
| Minneapolis (6A) | heat pump | 433 | 275 | 158 |
| Minneapolis (6A) | gas furnace + AC | 325 | 206 | 119 |

## Cost index (`house-cost`; no dollar figure)

- with lot: price index 54.0 (construction 28.9), 225 per sq ft against 100 for the 2,000 sq ft two-storey reference
- own lot: price index 37.5 (construction 28.9), 156 per sq ft against 100 for the 2,000 sq ft two-storey reference

## Roof option: trusses against rafters and ceiling joists (`house-truss`)

- stick roof (rafters, 2x12 ceiling joists spanning the full width, ridge): 1070 board feet
- 11 W trusses at 24 in, top 2x6, bottom 2x6, web 2x4: 60.6 bf each, 667 board feet
- trusses use 38% less roof lumber (404 bf), before connector plates, bracing, waste and a heel detail
- the truss check assumes 30 psf ground-snow roof load on plan (the plan states no site load); a truss is an engineered, sealed component, so this is a lumber comparison, not a roof design

The index extrapolates a model fitted to a 2,000 sq ft average house to a 480 sq ft one through assumed fixed/area splits; treat it as a lever, not a price.
