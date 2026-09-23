# Source map leak checker

Scored 2026-09-23, same session as `supabase-rls-check`. Composite 6.125 ·
floor 1 (ai_leverage). Same deterministic-checker shape: whether a script's
source map is publicly readable is decided by an HTTP status and the map's
own JSON, not a model in the loop.

A developer shipping a JavaScript build to production runs a well-documented,
evergreen bundler-configuration footgun: most bundlers (webpack, Vite,
esbuild, Rollup) can generate a full source map -- including `sourcesContent`,
the complete original, unminified source text of every file -- and reference
it from the shipped script with a trailing `//# sourceMappingURL=` comment.
That is exactly the right thing for a developer's own local devtools session
and exactly the wrong thing to leave reachable on a live deployment: anyone
who requests the `.map` URL gets the same readable code, not just the site's
own team.

This is not a hypothetical niche, and it is not tied to a single incident the
way `supabase-rls-check` is tied to CVE-2025-48757. It is durable, ongoing
evidence embedded in the tooling itself: webpack's own `devtool` documentation
explicitly warns against shipping a plain `source-map` build to production and
recommends `hidden-source-map` instead; Vite's `build.sourcemap` docs carry
the same caution; error-tracking vendors that ingest source maps for real
stack traces (Sentry and others) document and recommend an upload-only,
non-referenced mode for exactly this reason. A documented "hidden" mode exists
specifically because the mistake it works around is common enough to need
one. Security write-ups and bug-bounty methodologies commonly list "check for
exposed source maps" as a standard low-effort reconnaissance step against any
target running a modern JS bundler.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator`, and this portfolio
already has a family of "read what's actually there, name the exact evidence"
checkers (`cors-misconfig-check`, `security-headers-check`,
`docker-build-secrets-check`, `supabase-rls-check`, and others).
`duplicate_check.py`, run against a description naming exactly this mechanism
(reading each script's own sourceMappingURL comment, then fetching the
referenced map to check whether it is publicly readable and whether it embeds
full source text), scored every existing venture at 0.15 or below --
well under the 0.45 read-this-first bar. Nothing in `screened-out.md` covers
source maps, JavaScript build artifacts, or client-side code exposure.

**Lower liability than the rest of this checker family, in a specific,
structural way.** Every prior checker in this family that reads live data
(`supabase-rls-check`) has to attempt a real query against the user's own
application data. This one never does: a script and its source map are, by
construction, already public static files the target's own server serves to
any anonymous visitor who loads the page -- the tool never crosses a
privilege boundary the target didn't already cross first by shipping the
file. What it adds over a person reading devtools by hand is coverage (every
script tag, not just the one you're looking at, including vendor bundles and
inline `data:` URI maps) and repeatability (a CLI exit code a CI pipeline can
gate on).

**Where the browser half can, and can't, complete the real check --
opposite split from `cors-misconfig-check`, same split as
`supabase-rls-check` but for a different reason.** `cors-misconfig-check`
needs a CLI because `Origin` is a forbidden request header a browser tab can
never set, whatever the target's CORS policy is. This tool sets no forbidden
header, so whether the browser half completes depends entirely on the
target's own CORS policy for a plain cross-origin GET -- which is mixed in
practice: most sites do not send permissive CORS on their main HTML document,
but static JS/CSS assets on many CDNs and static-site hosts commonly are
served with it (needed for cross-origin `<script type="module" crossorigin>`
and Web Worker imports elsewhere on the web). So the page supports both a
page-URL mode (discovers scripts, works when the target allows it) and a
paste-explicit-script-URLs mode (better odds, since static assets are more
often CORS-permissive than the HTML document), and is honest in its copy
about the limitation either way. The CLI, run from a machine rather than a
browser tab, is the one path guaranteed to complete regardless.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: a fixed decision table against the script's own sourceMappingURL comment and the map's own JSON structure; no model in the loop |
| Autonomous ops | 10 | Zero-dependency browser tool + CLI, no server, no queue, no ops |
| Time to revenue | 5 | Donations only; discovery via search is plausible but not tied to a single dated incident the way supabase-rls-check is, so scored a point below it |
| Gross margin | 10 | Zero marginal cost per user; every request runs from the visitor's own browser (when CORS allows) or machine (for the CLI) against a site of their choosing |
| Defensibility | 2 | Transparent, narrow probe-and-classify tool with no data moat, easily reimplemented by anyone who reads the source map spec; no named hosted competitor identified |
| Distribution | 5 | Real, durable channel (bundler docs, error-tracking vendor docs, and standard bug-bounty/security-audit methodology all name this check), but evergreen rather than tied to a dated, named 2026 incident -- scored a point below supabase-rls-check for that reason |
| Liability containment | 8 | Read-only by construction and structurally lower-risk than a live-data checker: every file this tool reads (a script, its map) is already a public static asset the target's own server serves to any anonymous visitor before this tool ever runs -- there is no private application data in scope to begin with. Every request is GET, byte-capped, never writes/submits/modifies anything. Explicit "only test a site you own or are authorised to test" caution on every page and in the README |
| Ethical robustness | 8 | Gets more protective as adopted -- exists to let an owner find their own exposure before an outsider does by scripting a check any developer could already run manually via devtools, and the tool cannot be used to *cause* the exposure, only to reveal one that already exists. A false "clean" report costs the user a false sense of security about one specific check, which the "evidence, not a determination" disclaimer names directly on every page |

Composite: (1+10+5+10+2+5+8+8)/8 = **6.125**. Floor: **1** (ai_leverage).

**Mitigation (floor <= 4):** Keep every request GET-only and read the map's
own JSON only for structural fields (`sources`, whether `sourcesContent` is
present, counts) -- never render or store the actual decoded source text
server-side (this is a client-side/CLI tool with no server-side storage at
all), and never write, submit, or otherwise modify anything on the target.
Cap the number of bytes read per script/map file (5 MB) so a run cannot be
turned into an unbounded download against a target. A response this tool
cannot classify (a network error, a browser CORS block, an unexpected HTTP
status) is reported as an `error`, never silently folded into either
`exposed` or `safe` -- guessing in either direction would be worse than an
honest "could not confirm."

Not affiliated with, endorsed by, or sponsored by any bundler project, CDN,
or error-tracking vendor named in the tool's own guidance pages; each is
named only to describe the well-documented deployment mistake this checker
looks for.

**Verdict: graduate as a venture.** Both gates clear (liability_containment
8, ethical_robustness 8, both >= 5), the floor (1, ai_leverage) carries the
same "deterministic by design" reasoning as every sibling checker, and the
one dimension where this venture is structurally *safer* than its closest
sibling (liability, since no live application data is ever queried) is
scored and explained rather than inherited. Graduated the same session as
`ventures/source-map-leak-check`; distribution and organic search demand are
unmeasured.
