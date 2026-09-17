# Redirect chain checker

Scored 2026-09-11. Composite 6.25 · floor 1 (ai_leverage). The floor is the
point, same as this portfolio's other deterministic checker ventures: whether
a hop is a redirect loop, whether the chain is longer than recommended,
whether a hop downgrades HTTPS to HTTP, and whether a same-path scheme/host
normalization used a temporary status code instead of a permanent one are
all decided by exact comparison against the hop data itself — not a model in
the loop — which is what keeps the per-user cost at zero and every finding
traceable to the exact hop that proves it.

A developer or technical SEO practitioner debugging a "too many redirects"
browser error, or auditing a site migration's SEO impact, hits one of a
handful of well-documented, mechanically checkable patterns: does the chain
revisit a URL it already visited (a loop that never terminates); is the
chain longer than the single hop [Google's own Search Central documentation
on redirects](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
recommends, since search engines may not follow a very long one and every
hop adds latency for every visitor; does a hop send a visitor who already
reached HTTPS back to HTTP; does a same-path scheme or `www` normalization —
the classic shape of a one-time site move — use a temporary 302/303/307
instead of a permanent 301/308, which delays exactly the ranking-signal
consolidation the move was meant to achieve; and does the chain either
dead-end in a 4xx/5xx error or run out of data while still redirecting.

Google's own documentation stating the "keep it short" guidance and the
301-vs-302 permanence distinction explicitly is real, sourced channel
evidence, the same shape `sitemap-lastmod-freshness-check`'s channel
argument used for the freshness-faking rule. Established free competitor
tooling exists for the adjacent category — raw redirect-chain/header
inspectors such as httpstatus.io and redirect-checker.org — which is
evidence of real, sustained "check my redirect" search demand, though this
specific claim is recorded at screening-time confidence (general knowledge,
not verified against a live fetch this session — see "Status of these
write-ups" in `portfolio/pipeline/README.md`; egress to arbitrary hosts is
proxy-denied in this environment, the same standing limitation recorded
against every other competitor citation in this directory).

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over another `<trade>-bid-calculator` (141 of 200 venture
directories already share that shape with zero measured traffic across all
141), and this portfolio already has a family of these "read what's actually
there, fetch or paste what's named, report the exact evidence" ventures —
`sitemap-lastmod-freshness-check` and `hreflang-reciprocity-check` (a real
network fetch the browser can't fully do itself, paired with a paste-based
browser mode) and `cors-misconfig-check` (real network probing plus a
browser report-viewer that cannot itself probe). `duplicate_check.py`, run
against a description naming exactly this mechanism (redirect-chain
walking, loop detection, chain-length, protocol-downgrade, and
temporary-vs-permanent status classification), topped out at **0.26**
against `sitemap-lastmod-freshness-check` — the nearest structural sibling
(a similar CLI-does-the-network-the-browser-can't split with a shared pure
engine) but checking an entirely different evidence class — with every
other match at 0.19 or below. 0.26 is well under the 0.45 read-this-first
bar. Nothing in `screened-out.md` mentions redirects, 301s/302s, or
redirect chains.

**This venture sits at the same structural point in the family as
`cors-misconfig-check`, for a related but distinct reason.** A browser
tab's `fetch()` to a different origin, with the default `redirect: "follow"`,
follows the whole chain silently and hides every intermediate hop and
status code — exactly the information this tool needs. Asking for
`redirect: "manual"` instead makes the response **opaque**, so JavaScript
cannot read the status or the `Location` header of even the first hop.
Either way, a page running in a visitor's browser cannot reliably inspect a
cross-origin redirect chain, so the browser page works from a hop list the
visitor pastes in themselves (read off their own DevTools Network panel, or
a `curl -sI` trace) rather than probing live. This is a different mechanism
from the restriction `sitemap-lastmod-freshness-check` documents (that one
is about reading a fetched response's *headers*, given a `fetch()` the page
can make at all; here even attempting the request in a mode that would
reveal the chain is blocked by the Fetch spec itself) and from
`cors-misconfig-check`'s restriction (there, Origin is a forbidden request
header the page cannot set; here, the browser can request the URL but
cannot read what it does along the way) — but the shape is the same: the
CLI, which makes one real request per hop and reads each response directly,
is not a convenience alternative, it is the only surface that can run the
live version of this check at all. `engine.mjs`, the shared classification
module, is tested independently of the network layer (`fetch-chain.mjs`,
tested against a local loopback HTTP server, never the real internet), so
the CLI and the browser view can never silently disagree about what a given
chain means.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: loop detection by exact URL comparison, hop counting, scheme/host string comparison, and exact status-code set membership; no model in the loop |
| Autonomous ops | 10 | Zero-dependency CLI + static browser page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a developer or technical SEO practitioner finding and using a free checker inside weeks is plausible via search and community discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user; the CLI's HTTP requests run on the user's own machine, and the browser page needs no network at all |
| Defensibility | 3 | A transparent, narrow probe-and-classify tool with no data moat; easy to reimplement once the rule is known, same as this portfolio's other deterministic checkers |
| Distribution | 5 | Named channel: Google's own Search Central redirect documentation as a search-term anchor ("redirect chain checker", "too many redirects"), plus general-knowledge evidence of adjacent-category demand (established free raw-chain-inspector tooling) -- narrower and less directly evidenced than a dedicated by-name competitor comparison would be, since no equivalent free tool specifically classifying these five patterns (rather than only displaying the raw chain) was identified at screening time |
| Liability containment | 7 | Sends only ordinary, unauthenticated GET requests (CLI) to URLs the user explicitly names, following only the Location headers that URL's own server sends back -- never our infrastructure touching a third party, never bypassing authentication or reading protected data, no different in kind from `curl` or opening a URL in a tab. Every finding is evidence tied to a specific hop in a specific fetched/pasted chain, never a compliance or ranking determination |
| Ethical robustness | 8 | Gets more useful to a developer or SEO practitioner as they check more of their own redirects; the tool exists to make a misconfiguration visible to its owner before it silently costs crawl budget, ranking signal, or a visitor to a dead page, and there is no direction in which the user profits from the tool being wrong -- a false "clean" result only costs the user a false sense of confidence, which the "evidence, not a determination" disclaimer and FAQ both name directly, and a hop whose request failed is reported as incomplete rather than guessed at as clean |

Composite 6.25 (mean of eight). Both gates clear the floor of 5 with room:
`liability_containment` (7) and `ethical_robustness` (8). The only
dimensions at or below 4 are `ai_leverage` (1) and `defensibility` (3),
matching the deliberate floor pattern of this portfolio's other deterministic
checker ventures rather than a defect needing mitigation.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 3):**
keep the chain-walking and classification deterministic and conservative — a
hop whose URL cannot be parsed, or a request that fails outright, is named
as such rather than guessed at, and nothing past a fetch failure is reported
as confirmed-clean; the "temporary code for a permanent move" check only
fires on an exact same-path scheme/host normalization, never a path change,
so it cannot mistake an ordinary content redirect for a misconfigured one;
never claim a full technical-SEO audit or a ranking guarantee; measure real
user reports before adding any AI-assisted feature or expanding into a
whole-site crawl, which would raise both the liability and the
implementation surface into territory an established crawler-based tool
(Screaming Frog) already covers.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `sitemap-lastmod-freshness-check` (a different
evidence class — sitemap `<lastmod>` truthfulness, not HTTP redirect
behaviour — though built on the same "CLI does the network part the browser
can't" structural shape); not `hreflang-reciprocity-check` (a different
tag entirely — `<link rel=alternate hreflang>` reciprocity — not redirects);
not `canonical-tag-check` or `security-headers-check` (a page's own
`<head>` tag and response-header posture, unrelated evidence classes); and
it does not appear anywhere in `screened-out.md`. `duplicate_check.py`
returned no match above the read-this-first threshold against the final
description.

## Verdict

**Build now.** Graduated 2026-09-11 as `ventures/redirect-chain-check` — a
zero-dependency Node CLI (`fetch-chain.mjs` for the real network layer,
modeled on `sitemap-lastmod-freshness-check/fetch-url.mjs` and
`cors-misconfig-check/probe.mjs` with explicit timeout and headers-only
handling, deliberately never auto-following a redirect so every hop is
visible; `engine.mjs` for the shared, independently-tested
classification logic; `check.mjs` as the CLI entry point) that walks a
starting URL's real redirect chain one hop at a time, plus a browser page
that works entirely from a pasted `<status> <url>` hop list, a secondary
doc page explaining why redirect chains matter and the common ways they
break, a nominative-fair-use comparison page against httpstatus.io (a
different job: raw chain/header inspection, not misconfiguration
classification), usage counting, and the standard disclaimer/privacy/sponsor
copy. 64 `node --test` assertions cover the classification logic (including
loop detection, chain-length, protocol-downgrade, temporary-vs-permanent
status, and the paste-format parser), the network layer (against a local
loopback server, never the real internet, including a never-auto-follow
guarantee and a hang-proof timeout), the CLI's orchestration, the usage
counter, and all three pages' structure and disclaimers. A reciprocal
sibling link was added to and from `canonical-tag-check`. Repeat usage,
organic search demand, and distribution remain unmeasured, same as every
other checker at graduation.
