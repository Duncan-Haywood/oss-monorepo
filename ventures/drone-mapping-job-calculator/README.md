# Drone Mapping Job Calculator

A browser worksheet for Part 107 pilots quoting aerial mapping and
photogrammetry survey work. Static ES modules, no build step, no dependencies,
no network requests.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/drone-mapping-job-calculator/

- **[`index.html`](index.html)** — the calculator.
- **[`how-much-to-charge-for-drone-mapping.html`](how-much-to-charge-for-drone-mapping.html)** —
  a worked 100-acre job, line by line.
- **[`calc.mjs`](calc.mjs)** — all the arithmetic, exported and unit-tested.
- **[`usage.mjs`](usage.mjs)** — the anonymous, opt-out, device-local counter.

```
node --test
```

## What it is for

Mapping work is quoted per acre, and per acre is not a price. The term that
moves the job most is the **overlap specification**, and it does not appear in
a per-acre quote at all.

The reason it matters more than it sounds is that the two overlap settings do
different things:

| | scales as | 70/70 → 80/80 |
|---|---|---|
| image count | `1 / ((1 − front) × (1 − side))` | **2.25×** |
| airtime | `1 / (1 − side)` | ~1.5× |

Front overlap triggers the shutter more often along a line you were flying
anyway; only *side* overlap adds flight lines. So conceding "a bit more
overlap" on a call leaves the flight looking almost unchanged and more than
doubles the processing bill. On the shipped 100-acre example that is **$135.30**
more to quote — 21.9% — on a job whose acreage did not change by a square foot.

The second thing the worked example shows is where the day actually goes:

| activity | minutes | share |
|---|---|---|
| travel, round trip | 60 | 44% |
| setup and site walk | 30 | 22% |
| ground control, 5 × 6 min | 30 | 22% |
| **actually flying** | **16.4** | **12%** |

A pilot who prices "the flight" has priced an eighth of the job.

## The arithmetic

Ground sample distance, in centimetres per pixel:

```
GSD = (sensor width mm × altitude m × 100) / (focal length mm × image width px)
```

Pinned in the tests against a published spec sheet: the Phantom 4 RTK returns
2.741 cm/px at 100 m, against DJI's stated 2.74.

The formula takes a **physical sensor width** and a **true focal length**.
Using the "35 mm equivalent" alongside the real sensor width is the most common
error in a hand-rolled mapping spreadsheet, and it fails silently — the number
looks plausible and the flight comes back at the wrong resolution.

Everything else follows from the footprint:

```
footprint          = GSD × image dimensions
line spacing       = footprint width  × (1 − side overlap)
exposure spacing   = footprint height × (1 − front overlap)
lines              = ceil(site side / line spacing)
exposures per line = ceil(site side / exposure spacing) + 1
airtime            = path length / ground speed + turns × turn overhead
sorties            = ceil(airtime / usable battery window)
price              = cost / (1 − margin)
```

## Stated limits

These are on the pages themselves, not only here.

- **The site is modelled as a square.** Acreage alone does not determine a
  flight, and a square has the least perimeter for a given area — so this is
  the *optimistic* end of the range. Real parcels run longer, never shorter.
  A corridor job (pipeline, road, transmission line) should be priced from
  length and swath width instead; the square model will be badly wrong.
- **Still air, constant altitude, no terrain.** Wind, relief, obstacle
  avoidance, temperature and battery degradation all move the airtime, and
  almost always upward.
- **It is not a flight plan and grants no authorisation.** No airspace data, no
  LAANC, no mission file. It flags a target GSD that would need more than the
  400 ft (121.92 m) ceiling in 14 CFR 107.51(b) rather than quietly planning an
  altitude that cannot legally be flown — but airspace, currency, waivers and
  the safety of the actual mission remain entirely the pilot's.
- **Margin is taken on price** (`cost / (1 − margin)`), not as a markup on cost
  (`cost × (1 + markup)`). The two differ by $267 on a $1,000 job.

## Privacy

Nothing is uploaded. The page makes no network request of any kind; there is no
account and no server. A pilot's acreage, hourly rate and quoting margin are the
commercially sensitive core of a small operation, so no figure the worksheet
touches is written anywhere but the page in front of the person typing it.

The optional usage counter records only an event name and the day, in the
visitor's own browser. It is opt-out from the page and switches itself off for
browsers sending Do Not Track or Global Privacy Control.

## Licence

MIT — see [`LICENSE`](LICENSE). Free and open source;
[sponsorship](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.
