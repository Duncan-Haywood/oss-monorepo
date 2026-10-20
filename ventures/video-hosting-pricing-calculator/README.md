# Video Hosting Pricing Calculator

Price Cloudflare Stream, Mux, Bunny Stream, api.video and a DIY AWS MediaConvert + CloudFront pipeline
side by side at the minutes of video you store, the minutes viewers watch each month and your
monthly uploads, see the 12-month spend under your growth rate, and find the viewing level where
the cheapest platform changes — before you build a course site or creator tool on one.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/video-hosting-pricing-calculator/

```
node cli.mjs compare --stored-min 20000 --watched-min 500000 --uploaded-min 500 --growth 5
node cli.mjs compare --stored-min 20000 --watched-min 500000 --provider mux --budget 300   # CI gate: exit 1 over budget
node cli.mjs crossover --stored-min 20000
node cli.mjs compare --stored-min 20000 --watched-min 500000 --prices prices.json --json
node cli.mjs providers
```

`--prices` is a JSON object of platform overrides merged over the defaults (base fee, storage per
minute, included storage minutes, delivery per minute, included delivery minutes, encoding per minute).
Exit 1 when `--budget` (monthly USD) is exceeded; 2 on bad input.

## What it is not

Arithmetic on three typed volumes at approximate public list prices dated in the source
(`PRICES_AS_OF`) and editable. Per-GB platforms are converted at roughly 2.5 Mbps. It ignores live
streaming, DRM, captions, resolution ladders, minimum commitments, regions and contracts, so it
compares the storage, delivery and encoding lines and does not forecast an invoice. Not a quote, a
guarantee or advice. Not affiliated with any platform named.

## Privacy

No network call, no account, no analytics vendor. The browser page (`index.html`) calculates
locally and never uploads anything.

## Licence

MIT, no warranty. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.

> **No warranty.** This tool is provided free and as-is, without warranty of any
> kind. It is not financial or engineering advice; verify its output before
> relying on it. **Best-effort hosting, no SLA.**
