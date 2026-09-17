# hreflang reciprocity checker

Scored 2026-09-11. Composite 6.375 · floor 1 (ai_leverage). The floor is the
point, same as this portfolio's other deterministic checker ventures: whether
an alternate page links back, and whether a language/region code is valid, is
decided by exact comparison against the full ISO 639-1 and ISO 3166-1 lists
and the target's own normalized URL — not a model in the loop — which is what
keeps the per-user cost at zero and every finding traceable to the exact tag
that proves it.

A developer or SEO practitioner auditing an international site's hreflang
setup, or responding to a Google Search Console International Targeting
report flagging a "no return tags" or "confusing" error, hits one of a
handful of well-documented, mechanically checkable patterns: does every
`<link rel="alternate" hreflang="...">` an alternate page names actually link
back (Google's own hreflang documentation states the reciprocity requirement
explicitly and names disregarding the annotation as the consequence of
violating it); is the language/region code actually valid (`en-uk` is the
single most common real-world mistake, because "UK" reads as an obviously
correct abbreviation and was never assigned an ISO 3166-1 code — the
United Kingdom's real code is `GB`); is there an `x-default` fallback when
more than one real variant exists; does the page reference itself; and are
there duplicate or conflicting declarations of the same code.

Two established free competitor tools prove real, sustained channel demand
for exactly this check: **Merkle's hreflang Tags Testing Tool**
(technicalseo.com/tools/hreflang/), a well-known single-URL hosted checker in
the technical-SEO community, and **Aleyda Solis's hreflang tools**
(aleydasolis.com), a well-known international-SEO consultant's own free
tooling. r/TechSEO and recurring Search Engine Land / Search Engine Journal
explainer articles on hreflang mistakes are further evidence this is a real,
recurring pain point rather than a hypothetical one.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over a 200-and-somethingth `<trade>-bid-calculator`, and
this portfolio already has a family of these "read what's actually there,
fetch or paste what's named, report the exact evidence" ventures —
`cors-misconfig-check` (real network probing plus a browser report-viewer
that cannot itself probe), `structured-data-drift-check` (deterministic
single-page markup-vs-visible-text comparison), `canonical-tag-check`,
`sri-check`, `security-headers-check`, and others. `duplicate_check.py`, run
against a description naming exactly this mechanism (hreflang reciprocity,
BCP 47/ISO 639-1/ISO 3166-1 code validation, x-default, self-reference,
duplicate/conflicting values), topped out at **0.16** against
`canonical-tag-check` — a different `<link>`-tag question entirely (which URL
a page's own `rel=canonical` names as authoritative, a single-page question
with no cross-page reciprocity to confirm) — with every other match at 0.13
or below. 0.16 is well under the 0.45 read-this-first bar. Nothing in
`screened-out.md` mentions hreflang, international SEO, or alternate-language
link tags.

**This venture sits at the same structural point in the family as
`cors-misconfig-check`, for a related but distinct reason.** Every
single-page checker in this portfolio (`structured-data-drift-check`,
`canonical-tag-check`, `sri-check`) can run its entire check inside one
browser tab on one pasted page, because everything it needs is already on
that page. This one cannot, for the same class of reason `cors-misconfig-check`
cannot probe from the browser — not a forbidden request header this time, but
the browser's Cross-Origin Resource Sharing read restriction: a page's
`fetch()` to another origin is usually allowed to *send*, but the calling
page can only *read* the response if the target opts in with an
`Access-Control-Allow-Origin` header naming this tool's origin, which
ordinary third-party sites have no reason to send. So the CLI — which fetches
the target and every alternate it names over real HTTP with no such
restriction — is not a convenience alternative to the browser tool here, it
is the only surface that can confirm reciprocity against a page the visitor
does not already have the source of. The browser page's job is honestly
narrower: check everything computable from one pasted page alone (validity,
self-reference, x-default, duplicates), attempt a best-effort automatic fetch
of each alternate that works when the target happens to allow it, and fall
back to a manual paste when it doesn't — rather than silently reporting a
reciprocity check that was never actually run. `engine.mjs`, the shared
classification module, is tested independently of the network layer
(`fetch-page.mjs`, tested against a local loopback HTTP server, never the
real internet), so the CLI and the browser view can never silently disagree
about what a given set of pages means.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: exact string/URL comparison against the full ISO 639-1/ISO 3166-1 lists and the target's own normalized URL; no model in the loop |
| Autonomous ops | 10 | Zero-dependency CLI + static browser page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a developer or SEO practitioner finding and using a free checker inside weeks is plausible via search and community discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user; the CLI's network requests run on the user's own machine, and the browser's automatic-fetch attempts run in the visitor's own tab |
| Defensibility | 3 | A transparent, narrow probe-and-classify tool with no data moat; Merkle's and Aleyda Solis's hreflang tools already exist, so this is not first-to-market, only a differently-shaped alternative (CI-usable CLI, paste-based browser mode needing no third-party server) |
| Distribution | 6 | Named channels: Google's own Search Central hreflang documentation as a search-term anchor, r/TechSEO, recurring Search Engine Land/Search Engine Journal hreflang-mistake explainer content — a real but narrower niche than a general security-checker audience (this portfolio's `cors-misconfig-check`), since it is specific to international SEO rather than web security broadly |
| Liability containment | 7 | Sends only ordinary, unauthenticated GET requests (CLI) or browser-native `fetch()` calls (browser tool) to URLs the user explicitly names — never our infrastructure touching a third party, never bypassing authentication or reading protected data, no different in kind from `curl` or opening a URL in a tab. Every finding is evidence tied to a specific tag on a specific fetched/pasted page, never a compliance or ranking determination |
| Ethical robustness | 8 | Gets more useful to a developer or SEO practitioner as they check more of their own site's pages; the tool exists to make a misconfiguration visible to its owner before it silently costs a search result, and there is no direction in which the user profits from the tool being wrong — a false "clean" result only costs the user a false sense of confidence, which the "evidence, not a determination" disclaimer and FAQ both name directly, and an unverified alternate is reported as unchecked rather than guessed at as clean |

Composite 6.375 (mean of eight). Both gates clear the floor of 5 with room:
`liability_containment` (7) and `ethical_robustness` (8). The only
dimensions at or below 4 are `ai_leverage` (1) and `defensibility` (3),
matching the deliberate floor pattern of this portfolio's other deterministic
checker ventures rather than a defect needing mitigation.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility` 3):**
keep the validation and classification deterministic and conservative — a
code this tool has no ISO 639-1/ISO 3166-1 entry for is named as invalid or
left unvalidated (a script subtag, a numeric UN M49 region) rather than
guessed at, and an alternate that could not be fetched or pasted is reported
as unverified, never as a confirmed-clean reciprocal link; never claim a full
international-SEO audit or a ranking guarantee; measure real user reports
before adding any AI-assisted feature or expanding into checking hreflang
across a whole crawled site, which would raise both the liability and the
implementation surface into the territory an established crawler-based tool
(Screaming Frog, Merkle's tool at scale) already covers.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not `canonical-tag-check` (a single page's own
`rel=canonical` target, no cross-page reciprocity); not
`structured-data-drift-check` (JSON-LD vs. visible text on one page, no
`<link>` tags or cross-page fetching); not `sri-check` or
`security-headers-check` (subresource-integrity hashes and response-header
posture, unrelated evidence classes); not `cors-misconfig-check` (a different
response-header evidence class — `Access-Control-Allow-Origin` reflecting a
crafted `Origin`, not `<link rel=alternate hreflang>` reciprocity — though
built on the same "browser cannot do the network part" structural shape);
and it does not appear anywhere in `screened-out.md`. `duplicate_check.py`
returned no match above the read-this-first threshold against the final
description.

## Verdict

**Build now.** Graduated 2026-09-11 as `ventures/hreflang-reciprocity-check`
— a zero-dependency Node CLI (`fetch-page.mjs` for the real network layer,
modeled on `cors-misconfig-check`'s `probe.mjs` with explicit timeout,
redirect, and byte-cap handling; `engine.mjs` for the shared,
independently-tested parsing/validation/reciprocity logic; `check.mjs` as the
CLI entry point) that fetches a target URL and every alternate its own
hreflang tags name over real HTTP, plus a browser page that works from pasted
HTML with an honest best-effort automatic-fetch-per-alternate attempt
(documenting, rather than hiding, why that usually fails for a third-party
origin), a secondary doc page explaining the reciprocity requirement and the
common ways it breaks, usage counting, and the standard disclaimer/privacy/
sponsor copy. 81 `node --test` assertions cover the classification and
BCP 47/ISO 639-1/ISO 3166-1 validation logic (including the full standard
lists and the `en-uk`→`en-GB` special case), the network layer (against a
local loopback server, never the real internet, including redirect,
timeout, and truncation handling), the CLI's orchestration and
deduplication, the usage counter, and all three pages' structure and
disclaimers. Repeat usage, organic search demand, and distribution remain
unmeasured, same as every other checker at graduation.
