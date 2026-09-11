# Sitemap lastmod freshness checker

Scored 2026-09-11. Composite 6.25 · floor 1 (ai_leverage). The floor is the
point, same as this portfolio's other deterministic checker ventures: whether
a `<lastmod>` value is a valid W3C Datetime, whether it names a calendar date
that exists, and whether it is chronologically after "now" is decided by
exact comparison against the sitemap protocol's own format rule and the
target's own clock — not a model in the loop — which is what keeps the
per-user cost at zero and every finding traceable to the exact `<lastmod>`
value that proves it.

A developer or technical SEO practitioner auditing a site's crawl efficiency,
or who has read that Google may stop trusting an unreliable `<lastmod>`
signal, hits one of a handful of well-documented, mechanically checkable
patterns: is the `<lastmod>` value actually a valid
[W3C Datetime](https://www.sitemaps.org/protocol.html) the sitemap protocol
requires (a bare time with no timezone, a slash-separated date, or a
two-digit year are all common mistakes); does it name a calendar date that
actually exists (`Date.parse` silently rolls `2026-02-30` over to March 1
rather than rejecting it, which is exactly the kind of bug that survives
undetected); is it dated in the future (never legitimate — a page cannot have
been modified after "now"); do two entries for the same URL disagree; and,
most distinctively, does a build step stamp **every** URL with the exact same
date on every deploy regardless of whether the page actually changed — the
"freshness faking" anti-pattern Google's own sitemap documentation names as a
reason it may discount the field for a site going forward.

Google's own documentation stating the accuracy requirement and naming the
consequence (a site whose `<lastmod>` values don't hold up may have the
signal discounted, hurting recrawl prioritization for every URL in the file,
not just the wrong ones) is real, sourced channel evidence, the same shape
`hreflang-reciprocity-check`'s channel argument used for the reciprocity
rule. Established free competitor tooling exists for the adjacent category —
sitemap *structural* validation (e.g. XML-Sitemaps.com's Sitemap Validator) —
which is evidence of real, sustained "check my sitemap" search demand, though
this specific claim is recorded at screening-time confidence (general
knowledge, not verified against a live fetch this session — see "Status of
these write-ups" in `portfolio/pipeline/README.md`; egress to arbitrary hosts
is proxy-denied in this environment, the same standing limitation recorded
against every other competitor citation in this directory).

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over a 249-and-somethingth `<trade>-bid-calculator`, and
this portfolio already has a family of these "read what's actually there,
fetch or paste what's named, report the exact evidence" ventures —
`hreflang-reciprocity-check` (real network fetch the browser can't fully do
itself, paired with a paste-based browser mode), `cors-misconfig-check` (real
network probing plus a browser report-viewer that cannot itself probe), and
`structured-data-drift-check` (deterministic single-page markup-vs-visible-
text comparison). `duplicate_check.py`, run against a description naming
exactly this mechanism (sitemap `<lastmod>` freshness, W3C-Datetime format
validation, future-dating, duplicate-conflict detection, the uniform-pattern
statistic, a live `Last-Modified` header cross-check), topped out at **0.16**
against `hreflang-reciprocity-check` — the nearest structural sibling (a
similar CLI-does-the-network-the-browser-can't split, over an entirely
different XML/HTML tag and rule) — with every other match at 0.12 or below.
0.16 is well under the 0.45 read-this-first bar. Nothing in `screened-out.md`
mentions sitemaps, `<lastmod>`, or freshness signals.

**This venture sits at the same structural point in the family as
`cors-misconfig-check` and `hreflang-reciprocity-check`, for a related but
distinct reason.** The format, future-dating, duplicate-conflict, and
uniform-pattern checks need nothing but the sitemap text itself, so the
browser page runs all four entirely from pasted XML. The fifth check — does
the live page's own HTTP `Last-Modified` response header confirm the
sitemap's claim — needs a real cross-origin HTTP response, and a browser tab
cannot read one reliably: a `fetch()` in the default `cors` mode fails
outright unless the target sends `Access-Control-Allow-Origin`, and even a
`no-cors` request that succeeds returns an **opaque** response whose headers
(including `Last-Modified`) are unreadable by JavaScript, by design. This is
a different mechanism from the restriction `hreflang-reciprocity-check`
documents (that one is about reading a fetched response *body*; here even a
"successful" request hides every header), but the shape is the same: the CLI
— which reads headers directly with no such restriction — is not a
convenience alternative here, it is the only surface that can run this
particular check at all. `engine.mjs`, the shared classification module, is
tested independently of the network layer (`fetch-url.mjs`, tested against a
local loopback HTTP server, never the real internet), so the CLI and the
browser view can never silently disagree about what a given sitemap means.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: W3C-Datetime format/calendar validation, exact date comparison, and exact URL/date-string comparison; no model in the loop |
| Autonomous ops | 10 | Zero-dependency CLI + static browser page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a developer or technical SEO practitioner finding and using a free checker inside weeks is plausible via search and community discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user; the CLI's network requests run on the user's own machine, and the browser page needs no network at all for four of its five checks |
| Defensibility | 3 | A transparent, narrow probe-and-classify tool with no data moat; easy to reimplement once the rule is known, same as this portfolio's other deterministic checkers |
| Distribution | 5 | Named channel: Google's own sitemap documentation as a search-term anchor ("sitemap lastmod checker", "sitemap freshness faking"), plus general-knowledge evidence of adjacent-category demand (established free sitemap-structural-validator tooling) -- narrower and less directly evidenced than `hreflang-reciprocity-check`'s two dedicated, by-name competitor tools, since no equivalent free tool specifically doing this lastmod-truthfulness cross-check was identified at screening time |
| Liability containment | 7 | Sends only ordinary, unauthenticated GET requests (CLI, headers-only reads) to URLs the user explicitly names -- never our infrastructure touching a third party, never bypassing authentication or reading protected data, no different in kind from `curl` or opening a URL in a tab. Every finding is evidence tied to a specific `<lastmod>` value on a specific fetched/pasted sitemap, never a compliance or ranking determination |
| Ethical robustness | 8 | Gets more useful to a developer or SEO practitioner as they check more of their own sitemaps; the tool exists to make a misconfiguration visible to its owner before it silently costs crawl-prioritization signal, and there is no direction in which the user profits from the tool being wrong -- a false "clean" result only costs the user a false sense of confidence, which the "evidence, not a determination" disclaimer and FAQ both name directly, and a URL whose live headers could not be fetched is reported as unverified rather than guessed at as clean |

Composite 6.25 (mean of eight). Both gates clear the floor of 5 with room:
`liability_containment` (7) and `ethical_robustness` (8). The only
dimensions at or below 4 are `ai_leverage` (1) and `defensibility` (3),
matching the deliberate floor pattern of this portfolio's other deterministic
checker ventures rather than a defect needing mitigation.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 3):**
keep the validation and classification deterministic and conservative — a
`<lastmod>` the sitemap protocol's W3C-Datetime rule cannot parse, or a
calendar date that does not exist, is named as invalid rather than guessed
at; the uniform-pattern check is disclosed as a statistical signal (the exact
share and count are named) rather than a certainty, since a genuine one-time
site migration produces the same shape; a URL whose live headers could not
be fetched is reported as unverified, never as confirmed-wrong or
confirmed-clean; never claim a full technical-SEO audit or a ranking
guarantee; measure real user reports before adding any AI-assisted feature
or expanding into a whole-site crawl, which would raise both the liability
and the implementation surface into territory an established crawler-based
tool (Screaming Frog, and large-scale sitemap monitoring services) already
covers.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `hreflang-reciprocity-check` (a different tag —
`<link rel=alternate hreflang>` reciprocity and BCP-47 code validity, not
sitemap `<lastmod>` truthfulness — though built on the same "CLI does the
network part the browser can't" structural shape); not `merchant-feed-check`
(a different XML/CSV feed format's own field-level rules — GTIN/MPN,
price/availability formatting — not sitemap `<lastmod>`); not `sri-check` or
`security-headers-check` (subresource-integrity hashes and response-header
posture, unrelated evidence classes); and it does not appear anywhere in
`screened-out.md`. `duplicate_check.py` returned no match above the
read-this-first threshold against the final description.

## Verdict

**Build now.** Graduated 2026-09-11 as `ventures/sitemap-lastmod-freshness-check`
— a zero-dependency Node CLI (`fetch-url.mjs` for the real network layer,
modeled on `hreflang-reciprocity-check/fetch-page.mjs` and
`cors-misconfig-check/probe.mjs` with explicit timeout, redirect, byte-cap,
and headers-only handling; `engine.mjs` for the shared, independently-tested
parsing/validation/classification logic; `check.mjs` as the CLI entry point)
that fetches a sitemap URL and reads (headers only, never the body) every
`<loc>` its own `<lastmod>` entries name over real HTTP, plus a browser page
that works entirely from pasted sitemap XML for the four checks that need no
live fetch, a secondary doc page explaining why lastmod freshness matters and
the common ways it breaks, a nominative-fair-use comparison page against
XML-Sitemaps.com's Sitemap Validator (a different job: XML schema validation,
not lastmod truthfulness), usage counting, and the standard
disclaimer/privacy/sponsor copy. 88 `node --test` assertions cover the
classification and W3C-Datetime format/calendar validation logic (including
leap-year handling and the uniform-pattern statistic), the network layer
(against a local loopback server, never the real internet, including
redirect, timeout, byte-cap, and headers-only-never-body handling), the
CLI's orchestration and deduplication, the usage counter, and all three
pages' structure and disclaimers. Repeat usage, organic search demand, and
distribution remain unmeasured, same as every other checker at graduation.
