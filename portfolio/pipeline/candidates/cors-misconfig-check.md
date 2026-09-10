# CORS misconfiguration checker

Scored 2026-09-10. Composite 6.5 · floor 1 (ai_leverage). The floor is the
point, same as the portfolio's other deterministic checker ventures: whether
a response header reflects a crafted `Origin` value is decided by exact
string comparison against the request that produced it, not a model in the
loop -- which is what keeps the per-user cost at zero and every finding
traceable to the one response header that proves it.

A web API developer or a security researcher who suspects (or is
deliberately testing for) a CORS misconfiguration hits one of a handful of
well-documented, mechanically checkable patterns: does
`Access-Control-Allow-Origin` reflect an origin that has no relationship to
the site at all; does it accept the literal string `null`, which a
sandboxed iframe or a `data:` URI can produce with no domain of the
attacker's own; and does the allow-list check pass for a domain built to
satisfy a naive `startsWith`/`endsWith` string comparison instead of an
exact or properly dot-anchored match. PortSwigger's Web Security Academy
treats CORS misconfiguration as a standalone topic for exactly these
reasons, and it is one of the more commonly reported web API findings in
public bug-bounty writeups.

No existing tool packages all of this behind one command with a
plain-English report naming the exact header that proves each pattern. The
open-source Python scanner **Corsy** (s0md3v/Corsy on GitHub, several
hundred stars) covers similar ground and is evidence the niche has real
demand, not evidence it is unserved -- but it is a heavier, install-a-Python-
tool proposition with no zero-install report-viewing path and none of this
portfolio's disclaimer/usage conventions. `test-cors.org` is a manual,
one-request-at-a-time page, not a checker that runs a fixed battery of
probes and classifies the result. Neither gives a developer "run one
command, get a report naming the exact response header" the way this
venture's CLI does.

## Why this venture, not another dev-tooling checker

`portfolio/pipeline/README.md`'s "archetype itself" section argues for the
checker/CLI shape over a 235th `<trade>-bid-calculator`, and this portfolio
already has six ventures in the `actions-*-check` GitHub Actions security
family plus `dependency-confusion-check`, `npm-lifecycle-script-check`,
`chrome-extension-permission-check`, `wordpress-plugin-review-check`, and
others in the same "read what's actually there, name the exact evidence"
shape. `duplicate_check.py`, run against a description naming exactly this
mechanism (reflected-origin, null-origin, and unanchored-allow-list CORS
probing over real HTTP requests), topped out at **0.31** against
`actions-injection-check` -- a different vulnerability class entirely
(script injection via unsanitized event-context interpolation in GitHub
Actions `run:` steps, not CORS response headers) that happens to share
security-checker vocabulary -- with every other match at 0.25 or below.
0.31 is well under the 0.45 read-this-first bar. Nothing in
`screened-out.md` covers CORS, cross-origin resource sharing, or API
response-header auditing. The audience (any web API developer or security
researcher, not a Chrome extension author or a GitHub Actions maintainer)
and the exact mechanism (live network probing with crafted headers, not
static source/manifest cross-referencing) are both disjoint from every
existing sibling.

**One structural difference from every sibling checker in this portfolio is
worth stating plainly: this is the first one where the browser page cannot
do the actual check.** Every other browser-plus-CLI checker here runs the
identical detection logic client-side on files the visitor selects with the
File API. This one can't: `Origin` is a forbidden request-header name under
the WHATWG Fetch spec, so no page running in a browser tab -- including this
one -- can ever set it to anything but its own real origin. That is not a
shortcoming of this implementation; it is the same browser security
boundary CORS itself depends on. The CLI is therefore not a convenience
alternative to the browser tool, it is the only thing that can ever produce
a real result, and the browser page's job is narrower and honestly named:
render a report from JSON the CLI already produced (the same "paste the
JSON you already fetched" shape `actions-runner-starvation-check` uses for
the same underlying reason -- a browser page cannot see a GitHub Actions
API token either). `analyze.mjs`, the classification module, is shared
between both surfaces and tested independently of the network layer
(`probe.mjs`, tested against a local loopback HTTP server, never the real
internet) so the CLI and the browser view can never silently disagree about
what a given set of response headers means.

## Scoring

| Dimension | Score | Note |
|---|---|---|
| AI leverage | 1 | Pure deterministic classification: exact string comparison of a response header against the request origin that produced it; no model in the loop |
| Autonomous ops | 10 | Zero-dependency CLI + static report-viewer page, no queue, no server, no ops |
| Time to revenue | 6 | Donations only; a developer or security researcher finding and using a free checker inside weeks is plausible via search and community discovery, no paid acquisition |
| Gross margin | 10 | Zero marginal cost per user; the CLI's network requests run on the user's own machine against a target of their choosing |
| Defensibility | 3 | A transparent, narrow probe-and-classify tool with no data moat; Corsy and similar open-source scanners already exist, so this is not first-to-market, only a lower-friction, more narrowly-scoped alternative |
| Distribution | 7 | Named channels: r/netsec, r/websecurity, the bug-bounty community (HackerOne/Bugcrowd forums and Discords), Hacker News, and PortSwigger's own CORS material as a search-term anchor ("CORS misconfiguration checker", "reflected origin CORS vulnerability", "test for null origin CORS") -- a broader, more security-general audience than the platform-specific review-rejection niches (Chrome Web Store, wordpress.org) this portfolio has already built for |
| Liability containment | 7 | Sends only ordinary, unauthenticated GET requests from the user's own machine to a URL the user chooses -- never our infrastructure touching a third party, never bypassing authentication or reading protected data, no different in kind from `curl` with a custom header. Explicit "only test systems you own or are authorised to test" caution on every page and in the README, same posture as any request-based security tool (nmap, testssl.sh, Corsy itself) |
| Ethical robustness | 8 | Gets more useful to a developer or security team as they check more of their own APIs; the tool exists to make a misconfiguration visible to its owner before someone else finds it adversarially, and there is no direction in which the user profits from the tool being wrong -- a false "clean" report only costs the user a false sense of security, which the "evidence, not a determination" disclaimer on every page and the FAQ both name directly |

Composite 6.5 (mean of eight). Both gates clear the floor of 5 with room:
`liability_containment` (7) and `ethical_robustness` (8). The only
dimensions at or below 4 are `ai_leverage` (1) and `defensibility` (3),
matching the deliberate floor pattern of this portfolio's other
deterministic checker ventures rather than a defect needing mitigation.

**Mitigation for the sub-5 dimensions (`ai_leverage` 1, `defensibility`
3):** keep the probe set and classification deterministic and conservative
-- a probe that fails at the network level is reported as incomplete rather
than silently skipped or guessed at, and a finding is only ever raised from
a header this tool actually observed, never inferred; never claim a full
security assessment or penetration test; measure real user reports before
adding any AI-assisted feature (e.g. drafting a remediation PR, per the
API-key-switch pattern) or expanding the probe set into authenticated or
stateful requests, which would raise both the liability and the
implementation surface.

**Distinct from existing ventures and candidates**, per the pipeline's
overlap check: it is not any of `actions-injection-check`,
`actions-permissions-check`, `actions-cache-poisoning-check`,
`actions-artifact-poisoning-check`, `actions-self-hosted-exposure-check`,
or `pinned-actions-check` (all GitHub Actions workflow-file security
patterns, not HTTP response headers); it is not `dns-configuration-evidence`
(DNS delegation and record evidence, not CORS); it is not
`chrome-extension-permission-check`, `wordpress-plugin-review-check`, or
`affiliate-disclosure-checker` (static source/manifest/content
cross-referencing with no live network probing); it is not
`mcp-supply-chain-watch` or `dependency-confusion-check` (package
supply-chain trust, unrelated to CORS); and it does not appear anywhere in
`screened-out.md`. `duplicate_check.py` returned no match above the
read-this-first threshold against the final description.

## Verdict

**Build now.** Graduated 2026-09-10 as `ventures/cors-misconfig-check` -- a
zero-dependency Node CLI (`probe.mjs` for the real network layer,
`analyze.mjs` for the shared, independently-tested classification logic,
`check.mjs` as the CLI entry point) that sends five real GET requests with
distinct `Origin` headers to a URL the user names, plus a static
report-viewer browser page that renders a pasted CLI report (never
performs network probing itself, since a browser cannot set the `Origin`
header), a secondary doc page explaining the reflected-origin exploit
mechanism directly, usage counting, and the standard disclaimer/privacy/
sponsor copy including an explicit authorised-testing caution. 53
`node --test` assertions cover the classification logic, the network layer
(against a local loopback server, never the real internet), the CLI's
orchestration, the usage counter, and both pages' structure and
disclaimers. Repeat usage, organic search demand, and distribution remain
unmeasured, same as every other checker at graduation.
