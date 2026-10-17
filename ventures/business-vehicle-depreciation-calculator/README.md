# Business Vehicle Depreciation Calculator

After using this, you can see how much of a business vehicle you can write off this year under regular
MACRS, 100% bonus depreciation and Section 179 — with the car "luxury auto" caps and the 6,000 lb SUV cap
applied — and the tax that saves, which used to mean reading Publication 946 and a Rev. Proc. table.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/business-vehicle-depreciation-calculator/

```
node cli.mjs compare --price 80000 --business-pct 90 --class heavy_suv --tax-rate 32
node cli.mjs compare --price 60000 --business-pct 100 --class passenger --json
node cli.mjs compare --price 70000 --business-pct 100 --class exempt --income 50000
node cli.mjs compare --price 80000 --business-pct 90 --class heavy_suv --limits limits.json
node cli.mjs classes
```

`--limits` is a JSON object merged over the defaults (`passengerCaps`, `heavySuv179Cap`, `mileageRate`).
Exit 2 on bad input.

## What it is not

A deterministic calculation over typed numbers and the 2025 limits dated in the source
(`LIMITS_AS_OF`), all editable. It ignores mid-quarter convention, state conformity, AMT, leases,
trade-ins and recapture. Not tax advice.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not tax advice; verify its output before relying on it.
> **Best-effort hosting, no SLA.**
