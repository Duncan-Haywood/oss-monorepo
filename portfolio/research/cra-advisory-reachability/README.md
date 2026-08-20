# CRA evidence desk: the feed is reachable, the wedge is not, and the triage is worth more than both

**Measured 2026-08-20. Primary sources, reproducible from this repo.**

This directory advances step 1 of the first experiment
[`cra-evidence-desk`](../../pipeline/candidates/cra-evidence-desk.md) specifies
for itself, which had never been run:

> Take three real open-source-heavy products, produce the inventory, and match
> against EUVD. **Measure false-positive rate against manual review — this is the
> only number that matters.**

It was not run because the candidate was recorded as blocked. That turns out to
be half right, and the half that is wrong is the half everyone assumed.

## 1. Correction: the vulnerability feed is reachable

PR #240 measured which pipeline candidates can fetch their own runtime input
data, and concluded that `cra-evidence-desk` "can generate SBOMs but has no
reachable vulnerability feed (OSV/NVD proxy-denied, GitHub advisories
scope-denied to this repo)." That conclusion is now recorded in §2d of issue
#139 and is load-bearing for the claim that only `mcp-supply-chain-watch` has a
reachable feed.

Both denials are real. But they do not exhaust the feeds, and three others
answer: run [`probe_feeds.py`](probe_feeds.py).

| Feed | Result |
|---|---|
| `registry.npmjs.org/-/npm/v1/security/advisories/bulk` — the endpoint `npm audit` itself uses | **200** |
| `github/advisory-database` via `raw.githubusercontent.com` — the full GitHub Advisory Database, OSV format | **200** |
| `pypa/advisory-database` via `raw.githubusercontent.com` — PyPI ecosystem | **200** |
| `api.github.com` | **200** |
| `pypi.org` JSON API | **200** |
| `api.osv.dev` | denied |
| `services.nvd.nist.gov` (NVD) | denied |
| `api.first.org` (EPSS) | denied |
| `euvd.enisa.europa.eu`, `www.enisa.europa.eu` | denied |
| control: `example.com` (per #232) | denied |

The GitHub Advisory Database is not only readable, it is **clonable**:
`git clone --depth 1 --filter=blob:none --sparse` succeeds, and the
`advisories/github-reviewed/2026` slice alone carries 9,275 OSV records. The
same advisory content that `api.osv.dev` would have served is distributed as a
git repository on a host this environment already allows for package installs.

The reason four sessions recorded this as blocked is that they tested the
*API endpoints* for vulnerability data and not the *git distribution* of the
same data. Where a dataset is published as a public repository, egress policy
aimed at APIs does not necessarily block it — worth checking for the other
candidates before accepting any "feed unreachable" verdict.

## 2. The honest counterweight: the differentiator is still blocked

This is not a green light, and reporting it as one would repeat the pattern
[`distribution-first.md`](../../pipeline/distribution-first.md) exists to stop.

The candidate's write-up names its own wedge explicitly:

> Dependency-Track — the common open-source choice — does not natively integrate
> the EU Vulnerability Database, which is the register the CRA regime points at.
> **That last item is the wedge.** The generic answer ("generate an SBOM") is
> crowded and partly free.

**EUVD is denied.** So is ENISA, so is NVD, so is EPSS. What became reachable is
precisely the part the candidate itself calls "crowded and partly free" — the
commodity half. The claimed differentiator remains unbuildable here, and it is
blocked by the same general non-registry-egress policy behind Asks 3 and 7, not
by anything specific to ENISA.

So the correct status change is narrow: **not "unblocked", but "the experiment
that measures its real value is now runnable."** Which is what follows.

## 3. The measurement

Inventory built from npm lockfiles directly, no install
([`sbom_match.py`](sbom_match.py)), matched against the npm bulk advisory feed,
then every finding reviewed for reachability ([`review.py`](review.py)).

**9 real products · 3,573 components · 144 version-range findings.**

| Verdict | Findings |
|---|---|
| Reachable in the shipped artifact | 49 |
| False positive | 93 |
| Arguable | 2 |

> ### **False-positive rate: 64.6% – 66.0%**

Causes, which matter more than the headline:

| Cause | Findings |
|---|---|
| A — vulnerable version exists only on a **dev-only path** | 41 |
| B — advisory describes a **server-runtime feature** in a statically-exported product | 40 |
| B — package is **build-time only**, absent from the static artifact | 12 |
| B? — needs per-request CSP nonces; rests on config, counted both ways | 2 |

Cause A is a multi-version artifact and is why name-level matching misleads: in
`print-atelier`, `glob` is installed at both `10.3.10` and `7.2.3`, the advisory
range `>=10.2.0 <10.5.0` matches the former, and the only path carrying it is a
dev dependency. Matching on package name plus range says "vulnerable." Matching
on the dependency *path* says the shipped product never contains it.

## 4. The finding that was not expected: the false-positive rate is bimodal

Per product, the rate does not vary — it switches.

| Product | Findings | True | False | Rate |
|---|---|---|---|---|
| `ai-first-markets` | 5 | 5 | 0 | 0% |
| `local-site-studio` | 14 | 14 | 0 | 0% |
| `photo-editing/docs-site` | 5 | 5 | 0 | 0% |
| `print-atelier` | 26 | 25 | 1 | 4% |
| `real-estate-agent-photo-app/docs-site` | 55 | 0 | 54 (+1 arguable) | ~98% |
| `real-estate-agent-photo-app/research` | 39 | 0 | 38 (+1 arguable) | ~97% |

The split is exactly the deployment mode. The two products at ~98% set
`output: "export"` and `images: { unoptimized: true }` in `next.config.js`:
they ship pre-rendered HTML to a CDN and run no Next.js server at all. Every
`next` advisory that matched them — all 21 distinct ones — describes request
handling: Server Actions, Middleware, the Image Optimizer, rewrites, cache
poisoning, request smuggling, Server Function disclosure. None of that code
path exists in the artifact the customer ships. The other four products run
`next start`, so their findings are genuine and were left as true positives.

**The discriminating input is not the advisory feed. It is one fact about how
the product is deployed** — a fact the customer knows for free and the scanner
cannot see. Two lines of `next.config.js` move a product's noise from 4% to 98%.

This reframes the candidate's weakest score. Defensibility is scored 4, on the
reasoning that "SBOM generation is commodity and partly open source; the durable
part is the archive and the EUVD mapping." The archive is public data (see
PR #245 for the same conclusion reached about `mcp-supply-chain-watch`) and the
EUVD mapping is unreachable — so both stated defensibility sources are weaker
than scored. But the measured triage above is neither commodity nor blocked, it
needs no egress grant, and it is the difference between a report a customer acts
on and one they stop opening. Whether that is *defensible* is a separate
question this measurement does not answer; it is at least the first candidate
attribute in this directory that was measured rather than asserted.

## 5. Limits

- **npm only.** The PyPA feed is reachable but was not run; the repo's two
  Python surfaces are `requirements.txt` without pinned transitive closure, so
  the inventory step is not comparable. The candidate's own risk register
  already flags partial ecosystem coverage as worse than none.
- **The products are this portfolio's own.** They are real, open-source-heavy,
  and were not selected for the result, but they are not customer products and
  four of nine are documentation sites. A customer sample would likely have a
  lower static-export share and so a lower false-positive rate.
- **Reachability was judged from advisory titles and deployment config, not
  from call-graph analysis.** For the static-export cases the judgement is
  structural — no server, no server code path — but "reachable" here means
  "the vulnerable feature is shipped," not "an exploit exists."
- **`in_range()` is a minimal semver comparator**, not `node-semver`. It covers
  the operators the npm bulk feed emits in this dataset; cross-checked against
  `npm audit --omit=dev`, which reports 3 and 2 vulnerable *packages* for the
  two products spot-checked, consistent with this tool's per-advisory counts.
- **Not verified against primary regulatory sources.** The CRA obligation dates
  in the candidate write-up remain unverifiable from here (§2c of #139). Nothing
  in this directory changes that.

## 6. Reproduce

```
python3 portfolio/research/cra-advisory-reachability/probe_feeds.py
python3 portfolio/research/cra-advisory-reachability/sbom_match.py /tmp/findings.json
python3 portfolio/research/cra-advisory-reachability/review.py
```

`results-2026-08-20-findings.json` and `results-2026-08-20-reviewed.json` are the
outputs as measured on 2026-08-20. Advisory feeds change daily; re-running will
not reproduce the counts exactly, and the reachability table should be re-probed
rather than trusted.
