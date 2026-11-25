# Cloudflare file limit, 2026-11-25: five more directories to the shard

Every `main` deploy of Portfolio Pages from 11:29 UTC failed in
`deploy-cloudflare`, step `split.mjs`:

```
site Worker: 20026 files; shard Worker: 12129 files (limit 20000 each)
::error::site: 20026 files, over the free plan's 20000
```

(job 139201487892, run 45611949063). This is the same failure as 2026-11-20,
when `changepoint-detector` and `hearth-and-horizon` moved at 20,071 files.
The site Worker grew about 1,600 files in the five days between, so roughly
300 a day.

## Change

`SHARD_DIRS` (`platform/pages/cloudflare/router.mjs`) and the site Worker's
`run_worker_first` (`wrangler.toml`) gain `open-tennis-robots`, `chant-forge`,
`saints-by-candlelight`, `open-house-plans` and `open-floor-robots`. These are
the MIT-commons and story directories. None is a for-profit product page in
`portfolio/monetization/transition.py`, so no paid page pays a Worker request
per view. `einvoice-preflight` (811 files, bet #3), `league-schedule-generator`
(464, product 8) and `shift-roster-builder` (334, product 5) were the larger
options, and I passed them over for that reason.

## Verification

- `node --test cloudflare/*.test.mjs`: 19 pass (split.test.mjs checks that the
  two lists agree).
- `split.mjs` on a local full build: site Worker 18,580 files before, 17,626
  after (−954); shard 13,049. On CI's numbers that is about 19,070 and 13,080,
  so the deploy passes but stays above split.mjs's 90% warning.

## Next

About three days of headroom. The lasting fix is structural. The shard
already packs its 8,900 share cards into 512 files (`cardpack.mjs`), and doing
the same for the site Worker's own cards, or moving a whole section such as
`c/` or `compare/` together with every non-product venture, would buy months
instead of days. Read the step's `site Worker: N files` line before choosing.
