# Hosting alternatives to GitHub Pages, measured against our own build

**Date:** 2026-10-24. **Asked by:** the owner ("a blog post on what some
alternatives to the ghp setup we have currently and what the upsides and
downsides of switching or expanding could be"). **Post:**
[`docs/posts/2026-10-24-github-pages-alternatives-what-switching-would-buy.md`](../posts/2026-10-24-github-pages-alternatives-what-switching-would-buy.md).
**Method:** built the site locally the way `portfolio-pages.yml` does, measured
the output, and read each host's published limits. No host was trial-deployed
and nothing was read from the live site (the egress proxy returns 403 for
`github.io`).

## Measurement

```
node platform/pages/build.mjs --out=<dir>      # exit 0
du -sb <dir>                                   # 738,129,399 bytes
find <dir> -type f | wc -l                     # 14,941
find <dir> -type f -iname '*.mp3' -printf '%s\n' | awk '{s+=$1} END {print s}'   # ~414 MB, 76 files
find <dir> -type f -iname '*.png' ...          # ~146 MB, 2,735 files
find <dir> -type f -iname '*.html' ...         # ~114 MB, 4,238 files
```

MP3s by directory: `writing/podcast/audio` 33, `hearth-and-horizon/audio` 24,
`saints-by-candlelight/audio` 19. The `docs/podcast/` filenames date the blog
episodes 2026-10-20 (18), -21 (9), -22 (4), -23 (2). Largest file: 16.0 MB
(`saints-by-candlelight/audio/the-angel-who-called-himself-azarias.mp3`).
Average episode ≈ 5.4 MB, so the ~262 MB under a 1 GB cap is ≈ 48 episodes.

`platform/pages/check.mjs` has no total-size check (grepped for size budgets:
only a description-length budget and per-page byte ceilings in
`build.test.mjs`).

## Limits relied on (from each provider's docs)

| Host | Limit used | Source |
|---|---|---|
| GitHub Pages | 1 GB published site, 100 GB/month soft bandwidth, 10-minute deploy timeout | docs.github.com, "GitHub Pages limits" |
| GitHub Pages | No custom headers (COOP/COEP) | GitHub community discussion #13309; our own `wasm-on-the-site` report |
| Cloudflare Pages (free) | 20,000 files per site, 25 MiB per file, 500 builds/month | developers.cloudflare.com/pages/platform/limits |
| Cloudflare R2 | 10 GB-month free storage, no egress fees | developers.cloudflare.com/r2/pricing |
| Vercel Hobby | non-commercial personal use only | vercel.com/docs/plans/hobby |
| Netlify (free, credit plan) | credit-metered, pauses sites when spent | third-party summaries only; flagged as unverified in the post |
| GitHub releases | under 2 GiB per asset | docs.github.com, "About releases" |

The threaded-assistant figures (37.7 s on one thread, 10.7 s on four, for a
100-word answer) are copied from
[`2026-10-21-wasm-on-the-site.md`](2026-10-21-wasm-on-the-site.md), not
re-measured.

## Recommendation, and what it would take

1. Move podcast audio to GitHub release assets and rewrite the three feeds'
   enclosure URLs. Site drops to ≈ 324 MB. No new account.
2. Add a total-size check to `check.mjs` (fail well before 1 GB).
3. Custom domain: owner action, already `pages-custom-domain` in
   `portfolio/ledger/asks.yaml`.
4. Threaded assistant: scoped experiment on one Cloudflare-served page.

None of these was built in this run; the post is the deliverable asked for.

## Not measured

Bandwidth (the counter was only just switched on), logged-out reachability,
and real deploy behaviour on any alternative host.
