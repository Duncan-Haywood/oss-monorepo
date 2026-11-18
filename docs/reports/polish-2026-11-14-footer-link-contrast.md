---
kind: polish
topics: [design, accessibility]
date: 2026-11-14
---
# Polish 2026-11-14: the footer band colours every link (research pages' repo link 2.24:1 → 10:1)

The last nine polish runs all worked on venture tool pages, so this run screenshotted the other
surfaces the track names (hub, research index, a research project page, Stories, the blog index and
a post) at 390 and 1,280 px before choosing. No open PR touched the footer (searched open PRs).

## What was wrong

On a research project page in light mode, the first footer link ("github.com/Duncan-Haywood/oss-monorepo")
was #1f47b0 on the band's #0b1626: **2.24:1**. Cause: the research page template's
`a{color:var(--accent-ink)}`. The band (`SITE_FOOTER_CSS` in `platform/pages/site-nav.mjs`)
redefines `--accent` and `--pfs-accent`, not `--accent-ink`. The sponsor and footer-menu links have
their own `.pfs-support a` / `.pfs-foot a` rule, so only the credit line failed.

## Measured (Chromium on the built `dist/`, JavaScript off, 1,280 px)

Every page with `footer:has(.pfs-foot)` (1,221 pages), light and dark scheme, every `footer a` against
its nearest opaque background:

| | light | dark |
|---|---|---|
| before: links under 4.5:1 | 1,046 pages at 2.24:1 (+65 more research pages, see note) | 0 |
| after | 0 | 0 |

Note: the before sweep waited for `domcontentloaded` and on 65 research pages read styles before
`pf-site.css` had applied (every link 2.59:1 against a transparent, read-as-black band). Those 65
use the same template, so they had the same 2.24:1 credit link: 1,111 research pages in all. The
after sweep waited for `load`.

Screenshots (390 px, light): `img/polish-2026-11-14-footer-link-before.png`, `-after.png`.

## What changed

- `site-nav.mjs`: `footer:has(.pfs-foot) a{color:var(--pfs-accent)}`, specificity (0,1,2). No footer
  link on any of the 1,221 pages carries a class (grepped), so it overrides nothing designed.
  Redefining `--accent-ink` instead was rejected: on lab and showcase pages it means ink *on* an accent
  fill.
- `site-nav.test.mjs`: the rule must be present and the band's link colour must clear 4.5:1 on its
  fill. Fails without the rule.

The sweep script is in the run's scratchpad, not the repo: `contrast.mjs` already covers contrast
with axe-core, which is not installed in cloud sessions (`/opt/node-tools/node_modules` has no
`axe-core`), which is probably why this was never caught.

## Still weakest, and what I would do next

1. **Related-project cards on research pages show raw markup**: e.g. "Eliciting drift \*variance\*"
   with literal asterisks and `m^{-1/2}` as source text (abstention-scoring's "more in this topic"
   list). The summaries come from each project's README first line; the research builder could
   render `*x*` as `<em>` and leave the TeX in a `code` span, or the summaries could be rewritten.
2. **Make `contrast.mjs` runnable here**: fall back to a built-in luminance check (like the sweep
   above) when axe-core is missing, so cloud runs can measure contrast on every page.
3. Blog post meta row at 1,280 px: the category pill, date and "Source" link run together with
   uneven gaps, and the tags wrap onto a second line under it. Small, but it's on every post.
4. Carried over: answer leads on ~22 high-intent tools; lead cap 100 → 90; `MAX_LINKS` 8 → 6.
