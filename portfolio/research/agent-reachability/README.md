# Agent reachability: which candidates can be executed from where the agent lives

Seventeenth firing of the recurring *"research and evaluate potential software
business projects that aren't already here"* brief. **No new candidate was
screened and PR #79 was not rebuilt** — its own intake gate asks future runs not
to, and the note at the end of its provenance section is explicit that
rebuilding is what sustained the loop through five cycles.

This run measured a constraint the pipeline has never scored and that two prior
runs each hit sideways without mapping: **an unattended agent can only build and
operate a business whose sources, channel, and daily inputs it can actually
reach.** PR #103 noticed nine candidate-critical domains were blocked while
trying to verify claims. PR #111 could only measure npm. Neither asked how far
that constraint extends, or what it does to the ranking.

It extends further than either assumed, and it re-orders the table.

## Method

`probe_reachability.py` issues one small read-only GET to each of 33 targets
across 31 distinct hosts, chosen because each is load-bearing for a *named*
candidate in `portfolio/pipeline/` (PR #79) in one of three roles:

| Role | Meaning | Why it decides |
|---|---|---|
| `premise` | the primary source establishing the candidate is real (a regulation, a spec, a standard) | unverifiable premise → the candidate cannot be de-risked from here at all |
| `channel` | where the product would be listed or sold | unreachable channel → it cannot be distributed or charged for |
| `operate` | the data the business must ingest to produce its output, continuously | unreachable input → it cannot *run* unattended, only be researched |

Verdicts separate causes that correspond to **different settings**, because
conflating them misprices the ask:

- **`REACHABLE`** — the origin answered.
- **`EGRESS_DENIED`** — the egress gateway refused. Two wire forms, one cause: a
  403 to the `CONNECT` tunnel, or an HTTP 403 whose body reads `Host not in
  allowlist`. Governed by the environment's **network egress settings**.
- **`SCOPE_DENIED`** — the host is reachable and answered, but this session's
  credentials are not scoped to the resource. Governed by the **GitHub app's
  repository scope**, not by network settings.
- **`UNREACHABLE`** — DNS/TLS/timeout failure that is not a policy denial.

The second wire form of `EGRESS_DENIED` is worth calling out: an in-band HTTP
403 is indistinguishable from an origin's own 403 unless the body is read. A
first version of this script scored `jsr.io` as reachable for exactly that
reason, and it is not. Anything relying on status codes alone will overcount
reachability.

Where two routes reach the *same* source (the MCP spec repository is available
both through the GitHub API and through `raw.githubusercontent.com`), they are
grouped by a `source` key and one working route is enough. Without that
grouping the scope-limited API route scores the premise unverifiable when it
demonstrably is not.

## Finding 1 — the environment reaches package registries and very little else

33 probes over 31 distinct hosts: **8 reachable, 24 egress-denied, 1
scope-denied** (`api.github.com` is probed twice and appears in two verdicts;
see Finding 4).

**Reachable (7 distinct hosts):** `registry.npmjs.org`, `pypi.org`, `crates.io`,
`index.crates.io`, `registry.modelcontextprotocol.io`,
`raw.githubusercontent.com`, `api.github.com`.

**Egress-denied (24 distinct hosts):** `eur-lex.europa.eu`, `www.w3.org`,
`www.etsi.org`, `api.wordpress.org`, `developer.wordpress.org`, `shopify.dev`,
`apps.shopify.com`, `api.osv.dev`, `services.nvd.nist.gov`, `openssf.org`,
`ted.europa.eu`, `docs.peppol.eu`, `www.sec.gov`, `data.gov`, `dev.to`,
`open-vsx.org`, `marketplace.visualstudio.com`, `chromewebstore.google.com`,
`api.stripe.com`, `api.lemonsqueezy.com`, `api.paddle.com`, `api.polar.sh`,
`pypistats.org`, `jsr.io`.

The shape is not a scatter of unlucky domains. The proxy's own `noProxy`
allowlist is, verbatim, package registries plus Anthropic — `registry.npmjs.org,
jsr.io, npm.jsr.io, pypi.org, files.pythonhosted.org, index.crates.io,
proxy.golang.org` — and the gateway denies essentially everything else. **Every
regulatory primary source probed is denied. Every listing channel except npm is
denied. Both payment rails are denied.**

## Finding 2 — one candidate of eight can be executed from here

Rolling the host verdicts up per candidate. A role the candidate does not use is
not held against it (`—`):

| # | Candidate | Premise verifiable | Channel reachable | Operable | **Agent-executable** |
|---|---|---|---|---|---|
| 1 | eaa-remediation-pipeline | **no** | **no** | — | **no** |
| 2 | shopify-a11y-evidence | **no** | **no** | — | **no** |
| 3 | mcp-supply-chain-watch | yes | — | yes | **yes** |
| 4 | cra-evidence-desk | **no** | — | **no** | **no** |
| 5 | public-record-watch | — | — | **no** | **no** |
| 6 | agent-permission-harness | — | **no** | — | **no** |
| 7 | tender-radar | — | — | **no** | **no** |
| 8 | einvoice-preflight | **no** | — | **no** | **no** |

`mcp-supply-chain-watch` is the only candidate in the pipeline that an
unattended agent in this environment can both establish as real and keep
running. Its premise is reachable over `raw.githubusercontent.com`, and both of
its operating inputs — `registry.npmjs.org` and
`registry.modelcontextprotocol.io` — answer.

This independently reproduces PR #103's choice by a different route. #103
selected that candidate because it was *"the only one whose thesis avoids
regulatory timing and whose primary sources are reachable."* The measurement
here says something stronger and less contingent: it is the only one that can be
**operated**, not merely researched. Every other candidate has at least one
egress-denied host in a load-bearing role.

## Finding 3 — this is a missing scoring dimension, not a piece of bad luck

The pipeline scores eight dimensions and gates on two. None of them asks whether
the entity that has to do the work can reach the market. The consequence is
visible in the current ranking: candidates 1, 2 and 4 carry verdicts of *"build
now"* or *"probe the channel"*, and all three are unexecutable from here — the
agent cannot verify their premises, cannot reach their channels, and in the case
of `cra-evidence-desk` cannot ingest the vulnerability data the product is made
of.

That is not an argument that those are bad businesses. It is an argument that
**"good candidate" and "candidate this portfolio can act on unattended" have
been treated as the same question and are not.** A candidate scoring 7.25 that
the agent cannot reach is, for this portfolio's stated operating model, worth
less than one scoring 7.125 that it can.

The natural repair is a ninth dimension — call it *agent reachability* — scored
from this probe rather than from judgement, and behaving like the existing two
gates rather than like a weight. Whether to add it is a change to PR #79's
rubric, which is why it is proposed here rather than applied: that file is not
on `main` and editing it would mean rebuilding the PR.

## Finding 4 — the standing payout-rail ask is under-specified

This is the practical result, and it bears on the request the pipeline has put
in front of the account owner in eight consecutive cycles.

`channel-inventory.md` asks for **one payout rail, established once**, described
as *"one owner artifact, established once, shared by all candidates"* and as the
single approval after which every candidate in the directory can charge. It
names four rails as interchangeable for that purpose. **All four are egress-denied
here:**

| Host | Verdict |
|---|---|
| `api.stripe.com` | `EGRESS_DENIED` |
| `api.lemonsqueezy.com` | `EGRESS_DENIED` |
| `api.paddle.com` | `EGRESS_DENIED` |
| `api.polar.sh` | `EGRESS_DENIED` |

So creating the account and issuing the agent a key **would not be sufficient**,
and switching rails does not route around it. The credential is necessary and
the environment would still refuse the connection. The ask as written buys
nothing on its own; it needs a matching egress-settings change, and the two have
to be approved together or the first one lands and nothing works.

The same correction applies in the other direction, and it is good news:
**several things previously reported as impossible are only unapproved.**
`EGRESS_DENIED` is a setting the account owner controls, per the environment's
network egress policy. Twenty-four of the thirty-one hosts here are one settings
change away, not blocked by anything structural.

Distinguishing the two switches also corrects a smaller claim. `api.github.com`
is network-reachable; what refuses is the session's repository scope, which is
limited to `duncan-haywood/monorepo-projects`. That is the GitHub app's scope
setting, a different knob from network egress, and it is why the MCP spec
repository has to be read over `raw.githubusercontent.com` instead of the API.

## Finding 5 — PR #111's main stated limit was an egress setting, and can be partly lifted

PR #111 measured listing demand on npm and named its own principal limit: npm
only, because *"WordPress.org, Open VSX, and GitHub Marketplace are the other
free agent-listable channels and none publishes a comparable per-listing figure
through an API reachable from here."*

Half of that is confirmed and half is corrected:

- **Confirmed, and the reason is now precise.** `api.wordpress.org`,
  `open-vsx.org` and `marketplace.visualstudio.com` are not missing an API —
  WordPress.org publishes `active_installs` per plugin and Open VSX publishes
  download counts. They are **egress-denied**. The limit was a network setting,
  not an absence of data.
- **Corrected.** `crates.io` *is* reachable and *does* expose per-crate
  `downloads` and `recent_downloads`. A second registry was available the whole
  time. `pypi.org` is reachable too but its API returns `-1` for every download
  field (the counts are disabled upstream), so it yields no demand signal.

Because crates.io is usable, `measure_crates_concentration.py` replicates #111's
analysis on a second registry to test whether its finding is a property of npm
or of open package registries generally. It largely is — see
[the crates.io replication](#cratesio-replication) below.

## crates.io replication

`measure_crates_concentration.py` applies #111's method to crates.io: population
restricted to **leaf** crates (zero reverse dependencies, so discovered directly
rather than pulled in by a parent), demand measured as trailing-90-day
`recent_downloads` converted to a monthly rate. Every row is in
`results-2026-08-19-crates.json`, and `--recompute-from` re-derives every
statistic from those rows without touching the network.

**One of the three categories did not survive contact with the data, and is
reported as a failure rather than as a result.**

| Category | n (leaf) | median monthly | p25 | p75 | p90 | Half of demand goes to |
|---|---:|---:|---:|---:|---:|---:|
| SBOM / CRA evidence | 92 | **41** | 6 | 100 | 314 | **1.1%** of listings |
| MCP supply chain | 42 | **331** | 281 | 491 | 937 | **2.4%** of listings |
| Accessibility evidence | 4 | — | — | — | — | *not measurable — see below* |

### The median listing is tiny here too

This is the half that replicates cleanly. On npm, #111 found median monthly
downloads of 68 (SBOM) and 2,399 (MCP). On crates.io the same categories give
**41** and **331**. Different registry, different language ecosystem, different
absolute scale — same conclusion: the modal outcome of publishing a cold listing
into these categories is a number in the tens or low hundreds.

### The concentration replicates in direction, but is weaker

Half of all demand in the SBOM category goes to **1.1%** of listings (npm:
0.25%), and in the MCP category to **2.4%** (npm: 0.41%). Both are extremely
concentrated distributions.

But the sensitivity check separates the two registries. Removing the five
largest listings, #111 reported half of npm demand still going to 1.0–3.3% of
listings. On crates.io the same removal moves it to **10.3%** (SBOM) and
**37.8%** (MCP) — still top-heavy, but an order of magnitude less so. On
crates.io a larger share of these categories' concentration rests on one or two
packages rather than being a property of the whole distribution.

**The top-1%/top-5% columns are deliberately omitted from the table above.** With
n of 92 and 42, "top 1%" rounds to a single listing, so the statistic silently
stops meaning "the top centile" and becomes "the largest listing" — not
comparable to #111's npm populations of 402–970. The script now emits
`top_1pct_is_single_listing` so the JSON says so rather than inviting the
comparison. `half_of_demand_goes_to` is scale-free and is the figure quoted here
for that reason.

### The accessibility category could not be measured

Of 150 crates matched by `accessibility`, `a11y` and `wcag`, only 4 were leaf
crates — and inspecting them shows the keyword filter, not the population, is
what produced that: the four are `twapi-v2` (a Twitter API client), `mmap-sync`,
`dtokenz` and `vfio-ioctls`. **None is an accessibility tool.** Rust does not
appear to have an accessibility-tooling package category at all, and the
statistics computed over those four rows are meaningless. They are left in the
JSON with `n_too_small_for_concentration: true` and are excluded from every
conclusion above.

This is worth stating plainly because it is the category the two highest-scored
candidates (`eaa-remediation-pipeline`, `shopify-a11y-evidence`) live in. Nothing
here measures them. Their channel — WordPress.org — remains egress-denied, and
crates.io is not a substitute for it.

### What this does and does not settle for #111

#111's finding was that a free-listing demand probe cannot discriminate between
"this category has reachable demand" and "it does not," because the modal listing
lands in the low hundreds either way. **That conclusion survives replication on a
second registry** for the two categories that could be measured, and it is now
supported by primary measurements on two independent channels rather than one.

What replication does *not* do is extend it to the channel that mattered most.
Both registries measured are developer-audience package registries with the same
publish-and-hope shape. #111 named WordPress.org as the important gap precisely
because its buyer is different — site owners, many of them businesses — and that
gap is unchanged, because the channel is unreachable rather than unmeasured.

## Honest limits

- **A probe is a snapshot of a policy, not of a market.** Everything here
  describes what *this* environment permitted on 2026-08-19. A different
  environment, or an amended egress policy, produces a different table — which
  is the point, and why the script is committed rather than only its output.
- **One host per source, mostly.** A candidate's premise is represented by one
  or two well-chosen hosts, not by an exhaustive enumeration of everything it
  might ever need. A candidate marked executable could still hit a denied host
  that was not probed. The converse is safer: a candidate marked unexecutable
  has a *demonstrated* denial on a load-bearing host.
- **Reachability is necessary, not sufficient.** `mcp-supply-chain-watch` being
  the only executable candidate says nothing about whether anyone will pay for
  it. PR #103 measured its drift base rate and explicitly left buyer willingness
  untested, calling it *"the failure mode to test first."* That remains true and
  is not addressed here.
- **Role assignment is a judgement.** Which host counts as `premise` versus
  `operate` for a given candidate was read off the write-ups in PR #79; someone
  who disagrees with a role assignment will get a different rollup from the same
  raw verdicts. The per-host rows are in the JSON so that is checkable.
- **The crates.io populations are small and keyword-defined.** 92 and 42 leaf
  crates are enough for a median and for the scale-free concentration figure,
  and not enough for the top-centile statistics #111 could compute over 402–970
  npm packages. The category that collapsed to n=4 is reported as a failure
  above rather than quietly averaged in; the same keyword-noise mechanism is
  present in the two surviving categories at lower severity (`katana-markdown-linter`
  and `tokensave` are in the MCP population and are probably incidental matches).
- **Downloads are not users and users are not payers**, exactly as #111 states.
  A crates.io download is as likely to be a CI run as a person. Nothing here is
  a pricing or willingness-to-pay signal.
- **`jsr.io` sits in the `noProxy` allowlist and is still egress-denied**, so
  the allowlist and the gateway's policy do not fully agree. Recorded as
  observed; the mechanism is not established here.
- **No claim about *why* any host is denied.** The policy's intent is not
  visible from inside it, and "denied" is not read here as "should be allowed."

## Scope

No `ventures/` directory, no `VENTURE.yaml`, no candidate added, no score
changed, no automation, no scheduled workflow, no spend. Nothing here is
rendered by any venture's site. Both scripts are read-only, stdlib-only, use no
credentials, and are paced inside the published rate limits of the APIs they
touch.

Unlike the candidate write-ups in `portfolio/pipeline/`, these are primary
measurements against live endpoints rather than secondary-source research, and
they are committed as re-runnable scripts so a change in policy shows up as a
diff in the output rather than as a stale claim.

## Reproducing

```
python3 portfolio/research/agent-reachability/probe_reachability.py \
    --out portfolio/research/agent-reachability/results-2026-08-19.json

python3 portfolio/research/agent-reachability/measure_crates_concentration.py \
    --per-category 150 \
    --out portfolio/research/agent-reachability/results-2026-08-19-crates.json
```
