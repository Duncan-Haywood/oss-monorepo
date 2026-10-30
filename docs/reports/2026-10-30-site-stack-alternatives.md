# The site's stack: what other languages and frameworks would buy (2026-10-30)

The owner asked what the repository is made of, and whether another language
or framework (Rust, TSX, Astro and the like) would improve the whole
dev-to-deploy-to-hosting lifecycle of the main site at its size and growth
rate. They added: "tbh I'm not super happy about things being in html or
vanilla js ... I feel some other things have more to offer."

This continues `docs/history/pages-build-perf-2026-10-20.md` and
`docs/history/pages-build-speed-2026-10-24.md`, which both answered "not a
rewrite" for *build speed*. This report re-measures with today's numbers and
takes the owner's second point seriously: the case for a framework is mostly
about **authoring and maintenance**, not speed, and that case is real.

## 1. What the repository is made of

`git ls-files`, 45,849 tracked files, 997 MB working tree:

| extension | files | | extension | files |
|---|---|---|---|---|
| `.mjs` | 10,089 | | `.toml` | 993 |
| `.py` | 7,142 | | `.svg` | 954 |
| `.json` | 5,567 | | `.ts` | 836 |
| `.md` | 5,247 | | `.csv` | 577 |
| `.txt` | 4,377 | | `.tsx` | 321 |
| `.html` | 3,280 | | `.yml` | 262 |
| `.yaml` | 1,463 | | `.v` (Coq/Verilog) | 230 |
| (none) | 1,442 | | `.png` | 226 |
| `.xml` | 1,363 | | `.js` / `.jsx` | 142 / 69 |

JavaScript as ES modules (`.mjs`) is the main language, then Python (mostly
`research/` and `platform/ci/`). TypeScript is a minority (836 `.ts` + 321
`.tsx`), concentrated in five ventures (`local-site-studio`, `print-atelier`,
`retail-pilot-intel`, `quick-pick-survey`, `photo-editing`). One venture has
Rust (`dupehound`).

## 2. How the site is built and shipped today

- **Tools:** 1,321 ventures ship a hand-written `index.html` (median 21.8 KB,
  33 MB in all) with inline CSS and vanilla JS. Only 16 load an external
  script.
- **Builder:** `platform/pages/`, a custom Node build: 38,849 lines of
  non-test `.mjs` (11,613 in `build.mjs` alone) plus 19,390 lines of tests.
  It copies the tools, generates the hub, posts, guides, research pages,
  sitemaps, share cards (PNG drawn in-process), an offline layer, and checks
  the result (`check.mjs`).
- **Host:** two free-plan Cloudflare Workers serving static assets, split
  because one free Worker holds at most 20,000 files
  (`platform/pages/cloudflare/README.md`).

### Measured today

Local build, this container (4 cores, Node 22, no card cache, without
`--audio-cdn`): **218 s**, **19,899 files, 899 MB, 5,835 HTML pages**.
Growth: 14,941 files on 2026-10-24, ~20,100 on 2026-10-29. About
**1,000 files a day**, from roughly 200 new posts a day (1,383 in
`docs/posts/`) plus tools and research.

CI, one passing `main` run (41118044966, 2026-10-30 19:47 UTC), seconds:

| job / step | s |
|---|---|
| build: checkout (depth 3000) | 112 |
| build: redraw stale Shed Designer pictures (installs Playwright) | 125 |
| build: `build.mjs` | 150 |
| build: `check.mjs` | 94 |
| build: upload for Cloudflare + Pages | 31 |
| deploy-cloudflare (both Workers via wrangler) | 69 |
| **merge to live** | **~10.5 min** |
| test job, "Test the site builder" (in parallel; does not gate deploy) | 426 |

The last 500 completed `main` runs (2026-10-29 05:30 to 2026-10-30 20:20 UTC):
340 cancelled (superseded by a newer merge, by design), 125 failed,
35 succeeded. The failures break down as:

- **Test job red, deploy fine.** From 11:10 UTC on 10-30 every
  non-cancelled run has `build`/`deploy-cloudflare` green and only "Test the
  site builder" red, so the site *is* updating but every run shows red. On
  one run the step took 28 minutes.
- **A malformed blog post blocks the deploy.** "Check blog post front matter
  before the long build" fails the whole build job (5 times in this window).
  Posts are the fastest-growing input, written by many concurrent sessions.

So the lifecycle's pain is **validation and test plumbing at ~150 merges a
day**, not the speed of the language doing the work, which agrees with the
two earlier reports.

## 3. Alternatives, judged on this site

The visitor side is already near the floor: static HTML, almost no JS, served
from Cloudflare's edge. No framework makes a 22 KB static page load faster.
What follows is about build, correctness and authoring.

| Option | What it would buy here | What it would cost | Verdict |
|---|---|---|---|
| **Astro** (TS, `.astro`/TSX components, zero JS by default, islands) | Shared components for the 1,321 tools; typed **content collections** (schema-checked post front matter, with errors that name the file); TS throughout; ships static HTML like today | Full rebuild of a ~6k-page site each merge (Astro has no general incremental build); the custom passes (share cards, offline layer, audio CDN, `check.mjs`) must become integrations; a migration of 1,300 tools is months of agent time | **Best fit if the goal is a framework.** Pilot it on `docs/posts/` + a handful of tools first |
| **Eleventy (11ty)** + WebC or JSX templates | Closest to today (Node, passthrough copy, data cascade), `--incremental`, small surface | Less type safety and component story than Astro; still a migration | Lowest-risk framework; less "more to offer" |
| **TypeScript in place** (`// @ts-check` + JSDoc, or `.ts` run by Node 22's type stripping) | Types across `platform/pages/` and tools without changing the build or output | Gradual typing work; `tsc --noEmit` in CI | **Do regardless.** Cheapest real gain |
| **TSX/JSX as a template language only** (Preact `render-to-string`, run at build time, no client JS) | Typed, composable templates instead of string concatenation inside an 11.6k-line `build.mjs` | Rewrite templates gradually | Good middle path; composes with Astro later |
| **Next.js / React SSG** | Large ecosystem | Client JS bundles on pages that need none, heavier builds, a server-first framework used for static export | Wrong fit |
| **Hugo** (Go) | Fastest SSG (thousands of pages a second) | Go templates; would not draw share cards or run the offline layer; full rewrite | Build speed is not the bottleneck; no |
| **Zola / custom Rust SSG** | Single binary, fast | No plugin system; JS work is ~7 s of a 110 s build (10-24 profile), so Rust speeds up the wrong part | No |
| **Rust/WASM hot spots** (e.g. `resvg` for cards) | Faster card drawing | Cards are already cached across runs | Low value now |
| **Bun as the test runner** | Possibly much faster `node --test` suite (426 s on CI) | Compatibility risk across ~19k lines of tests | Worth a measured trial |

### On "HTML and vanilla JS" specifically

The owner's instinct has evidence behind it, though the reason is
maintenance, not performance:

- 1,232 `<style>` blocks across the tools, 670 distinct. Most tools carry
  their own copy of near-identical CSS.
- The same functions are declared again and again: `run` in 691 tools,
  `download` in 303, and the quote-proposal helpers (`refreshProposal`,
  `printProposal`, `suggestScope`, `restoreCompany`, ...) in **121 tools
  each**. A bug fix there is 121 edits, or a build-time patch pass (several
  of `build.mjs`'s "repair" passes exist for exactly this).
- Nothing type-checks the tools.

A component framework (Astro, or TSX templates) turns those 121 copies into
one component that each tool imports, and that build prints as the same
static HTML. That is the real thing it offers. The cost is migration, and the
win shows only once the shared pieces are factored out.

## 4. Recommendations, ranked

1. **Make the pipeline robust to its own volume** (days, no stack change):
   - Find and fix the red "Test the site builder" job (red on every run since
     ~11:10 UTC 10-30), then shard the suite across a matrix so it does not
     take 7 to 28 minutes.
   - Make the front-matter pre-check skip a bad post with a warning on `main`
     (as `PAGES_SKIP_BAD_POSTS` already does inside `loadPosts`), and keep it
     strict on PRs.
   - Fetch git history only in the step that needs it (112 s checkout), and
     cache Playwright for the Shed Designer redraw (125 s).
2. **Decide on hosting headroom before it is forced:** at ~1,000 files a day
   the free 20k-file limit per Worker is a sharding chore every few weeks.
   Workers Paid ($5/month, 100k files) removes the shard. That spends money,
   so it is the owner's call (`portfolio/ledger/asks.yaml`).
3. **Adopt TypeScript checking in place** (`@ts-check` + `tsc --noEmit` on
   `platform/pages/` first).
4. **Pilot Astro on a bounded slice:** the blog (typed content collection for
   front matter) plus the 121-tool quote-proposal family as one shared
   component. Measure build time at the full site's size, how the custom
   passes port, and lines removed. Adopt more widely only if the pilot shows
   less code and no slower merge-to-live.
5. **Incremental builds** (content-hash each page's inputs, reuse the output,
   as the share-card cache already does). Matters more than the language as
   the site grows; Eleventy supports it, Astro does not natively, a custom
   builder can.

Not recommended: a Rust/Go rewrite or Next.js. They speed up or add parts
that are not where the time or the pain is.

## Reproducing

```sh
git ls-files | sed -E 's|.*/||; s|^[^.]*$|(no ext)|; s|.*\.||' | sort | uniq -c | sort -rn
node platform/pages/build.mjs --out=/tmp/dist && find /tmp/dist -type f | wc -l
# run outcomes: GET /repos/Duncan-Haywood/oss-monorepo/actions/workflows/portfolio-pages.yml/runs?branch=main&status=completed
```
