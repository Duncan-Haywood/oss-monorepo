# Demand-signal reachability: publishing is not measuring

Another firing of the recurring *"research and evaluate potential software
business projects that aren't already here"* brief.

**No new candidate is proposed, and no score is changed.** PR #79's intake gate
says screening is closed; `convergence.md` already priced what another archetype
list is worth. This run does what the gate names as the first useful move —
advance a probe already specified — by testing the load-bearing claim of the
*newest* ask on the account owner's desk, the same way PR #137 tested the claim
before it.

> **PR #137's "Ask 0" says one registry account is "sufficient for a free
> artifact to be published *and its installs counted*." The first half holds.
> The second half fails on three of the eight channels it was scoped against —
> including the one #137 singled out as needing no account at all.**

27 targets across 13 channels, each channel probed on the surface that actually
decides it.

## What was being tested and why it is load-bearing

The portfolio has wanted one number since its first screening pass: *does a
listing this portfolio publishes get found at all?* Four cycles escalated it as
blocked. `channel-inventory.md` (#79) split the ask in two — demand measurement
vs. revenue capture — and argued only the second needs a payout rail. #137 then
measured the first and found the nominated channels network-denied, and proposed
a cheaper replacement:

> **Ask 0 — one account on one already-reachable registry.** No egress change.
> No payment rail. […] That is sufficient for a free artifact to be published
> and its installs counted — the demand measurement five cycles have now asked
> for.

#137 measured `register` and `publish`. It did not measure the surface where the
count is read. That omission is the same shape as the one #137 itself corrected
in #126 — scoring a channel on the surface you happened to probe — moved one
gate further out:

| Gate | What it is | Measured before this run |
|---|---|---|
| `read` | what a consumer of the package hits | #126, #130 |
| `register` | where an account is created | #137 |
| `publish` | where the artifact is uploaded | #137 |
| `stats` | **where the resulting install count is read back** | **No** |

A channel produces a demand measurement only if `publish` **and** `stats`
answer. Ask 0 is scoped on `publish` alone.

## Method

One paced, read-only GET per target, stdlib only, no credentials sent to any
third party, against packages this portfolio does not own. Nothing was
published, registered, uploaded, or signed up for. Verdicts are #126/#130/#137's
vocabulary unchanged, so all four result sets read side by side; the
`SCOPE_DENIED` classifier is #126's, matched on the GitHub gateway's own
message.

Two controls run in every pass — `pypi.org` (known `REACHABLE` in #130/#137) and
`wordpress.org` (known `EGRESS_DENIED` in #137) — and both reproduced their
prior verdict, so this run's classifier is comparable to those runs' rather than
merely internally consistent.

One convention this run adds, because the distinction changed the conclusion:
each channel carries a declared `public_count` — *does this channel publish a
per-artifact install number to the public at all?* — recorded independently of
any probe. Without it, "no number" gets attributed to this environment's egress
policy when the real reason is that the channel never published one. Two of the
eight channels fail for that second reason, and they fail permanently: no
credential, egress change, or account fixes them.

## Finding 1 — three of Ask 0's eight channels cannot produce the number

| Channel | `publish` | `stats` | Count exists? | Count read from here | Usable for Ask 0 |
|---|---|---|---|---|---|
| **crates.io** | `REACHABLE` | `REACHABLE` | Yes | **1,285,150,567** | **Yes** |
| **RubyGems** | `REACHABLE` (401) | `REACHABLE` | Yes | **777,219,828** | **Yes** |
| **Packagist** | `REACHABLE` | `REACHABLE` | Yes | **1,044,168,410** | **Yes** |
| **Hex** | `REACHABLE` | `REACHABLE` | Yes | **153,773,175** | **Yes** |
| **Docker Hub** | `REACHABLE` (404 on bare root) | `REACHABLE` | Yes | **12,136,695,239** | **Yes** |
| **NuGet** | `REACHABLE` | `EGRESS_DENIED` | Yes | — | **No** |
| **ghcr.io** | `REACHABLE` (401) | `NO_SUCH_SURFACE` | **No** | — | **No** |
| **Go module proxy** | `REACHABLE` | `NO_SUCH_SURFACE` | **No** | — | **No** |

Counts are live totals for third-party packages (`serde`, `rails`,
`monolog/monolog`, `phoenix`, `library/alpine`), read to prove the endpoint
returns a real number rather than merely answering.

Three of the eight fail, in two distinct ways that need to be kept apart:

**NuGet fails on this environment.** `api.nuget.org` — where a package is pushed
— is `REACHABLE`. `azuresearch-usnc.nuget.org` — the only public download-count
surface NuGet exposes — is `EGRESS_DENIED`, the identical tunnel refusal the
known-denied control produces. Publish host permitted, statistics host refused,
same channel. This is #137's own `upload.pypi.org`-beside-`pypi.org` pattern
reappearing on the gate #137 did not probe.

**ghcr.io and the Go module proxy fail on the channel itself.** GitHub Packages
publishes no public per-image pull count, and the Go module proxy publishes
version lists and new-version events, not downloads — `index.golang.org` answers
and what it returns carries no count. No account, token, or egress change
changes this. The number does not exist to be read.

**The Go row is the consequential one.** It is the channel #137 named as the
single best case in the whole inventory:

> Go is the special case worth naming: a module is published by tagging a public
> git repository and letting the proxy fetch it, so it has **no `register` gate
> at all**. It is the only channel measured here that an agent could publish to
> today with no account of any kind.

That is correct and it is still true. But Ask 0 offers it as an alternative that
costs the owner nothing at all — *"or confirm a Go-module route where no account
is needed."* Taking that option satisfies Ask 0's letter and produces no
measurement whatsoever. It is the cheapest-looking item on the queue and the
only one guaranteed to return nothing.

## Finding 2 — a channel class nobody enumerated, blocked at a third gate

Every channel in #79's inventory and #137's probe is a marketplace with an
upload form or a registry with a publish API. There is a third publication
route: **channels whose submission is a git repository or a pull request to a
public one** — Homebrew taps and formulae, Raycast extensions, Obsidian plugins,
Zed extensions, winget manifests, Home Assistant community stores.

This class matters because of the empty cell #137 drew. Its conclusion was that
*"the channels this environment can publish to are exactly the channels whose
searcher does not hold a budget."* Every one of the eight publishable channels
in Finding 1 is a package registry whose searcher is a developer resolving a
dependency. The git-based class is the first one measured here whose searcher is
**not** a developer — Raycast and Obsidian users are knowledge workers, Homebrew
sits between the two.

Measured, the class does not rescue the position, and it fails at a gate neither
#130 nor #137 has on file:

| Channel | Surface probed | Verdict |
|---|---|---|
| Homebrew | `formulae.brew.sh` install analytics + catalogue | `EGRESS_DENIED` |
| Raycast | `www.raycast.com/store` | `EGRESS_DENIED` |
| Obsidian | `obsidian.md/plugins` | `EGRESS_DENIED` |
| Zed | `zed.dev/extensions` | `EGRESS_DENIED` |
| GitHub (`api.github.com`) | API root | `REACHABLE` |
| GitHub (`raw.githubusercontent.com`) | bare non-repo path | `REACHABLE` (origin 404) |
| GitHub (`codeload.github.com`) | bare non-repo path | **`SCOPE_DENIED`** |

`codeload.github.com` answers with the gateway's own words:

> `This GitHub API path is not available: sessions are bound to their configured
> repositories. Use repository-scoped endpoints (repos/{owner}/{repo}/...).`

So the git-based class is blocked twice over, and the two blocks are different
kinds of thing:

- **Submitting** to any of these channels means opening a pull request against a
  repository this portfolio does not own. This session is bound to
  `Duncan-Haywood/monorepo-projects`; that is a **credential scope**, in the same
  category as #130's Ask 1, not an egress policy.
- **Reading** any of these storefronts is `EGRESS_DENIED`. This is the sharper
  half, because reading a storefront needs no account, no submission, and no
  permission from anyone: it is how you would size the category *before*
  building anything. Public install counts on competing extensions are the
  cheapest demand evidence that exists, and they are unreadable from here.

No probe was made against any third-party repository — the two GitHub rows use
bare non-repo paths deliberately, and the scope boundary above is quoted from
the gateway's response to one of them, not discovered by testing what it
forbids.

One honest limit on this class, so it is not oversold as a way around #137's
conclusion: Raycast, Obsidian, and Zed extensions are free, and those platforms
monetize their own products rather than paying extension authors. A listing
there yields a *demand number from a non-developer audience* — better evidence
than a registry download count for most of `portfolio/pipeline/`'s candidates —
and still no revenue. #137's empty top-right cell stands.

## Finding 3 — the numbers Ask 0 does buy are noisier than the ask implies

Recorded because the five working channels should not be oversold either.
Package-registry download totals count CI runs, mirror syncs, container
rebuilds, and dependency resolution by other packages. They do not distinguish a
human who chose the artifact from a build robot that resolved it. For a
portfolio whose actual question is *"does a buyer with this problem find and
adopt this?"*, a registry download count is a weak proxy, and it is weakest
exactly where a new package is small enough for a handful of automated fetches
to dominate the total.

#130 already priced the ceiling — its median outcome for the only executable
candidate was "tens-to-low-hundreds of downloads." Finding 3 is the companion
point: at that magnitude the signal-to-noise is poor enough that the number may
not distinguish "nobody wants this" from "twelve robots fetched it." That is not
a reason to skip the measurement. It is a reason to write down in advance what
result would count as demand, before the number exists and becomes arguable.

## Consequence: Ask 0 needs one word changed, and one new ask is cheaper than it looks

Ask 0 is sound. It is scoped one channel too wide and offers a free option that
returns nothing.

> **Ask 0, amended.** Create an account and issue a scoped publish token on one
> of **crates.io, RubyGems, Packagist, Hex, or Docker Hub** — the five channels
> whose install count is both published and readable from this environment.
> **Not** NuGet (publish host reachable, statistics host egress-denied), and
> **not** the Go-module route (no download count exists to read, at any
> permission level).

Against the queue already in front of the account owner:

| Ask | What it costs | What it buys |
|---|---|---|
| **0, amended** — account on one of five named registries | One account signup. No egress change | The demand measurement, on a developer-buyer channel, at the noise level in Finding 3 |
| ~~0, as written — "or a Go-module route, no account needed"~~ | Nothing | **Nothing — no count exists on that channel** |
| **3 — egress for four storefront hosts** *(new)* | One narrow allowlist entry: `formulae.brew.sh`, `www.raycast.com`, `obsidian.md`, `zed.dev` | Read-only category sizing from public install counts on a **non-developer** audience, with no account, no submission, and nothing published |
| 1 — widen GitHub app scope *(#130)* | One permission change | GitHub-native monetization; **also** unblocks PR-based submission to the Finding 2 channels |
| 2 — merchant-of-record + egress entry *(#130)* | Two switches that must land together | The ability to charge for anything, anywhere |

Ask 3 is new and is the cheapest item ever added to this queue: it grants no
write access anywhere, publishes nothing under the portfolio's name, creates no
account, and cannot spend money. It is a read permission for four public
websites. It is also the only ask on the list that produces evidence about a
buyer who is not a developer.

Ask 1's scope is worth re-reading in light of Finding 2. #130 scoped it as
GitHub-native monetization. It is also, incidentally, what would let this
portfolio submit to Homebrew, Raycast, Obsidian, Zed, winget, and HACS at all —
a considerably larger return on the same permission change than #130 credited it
with.

**None of these is a decision an unattended session should make.** Nothing was
published, registered, submitted, or signed up for in producing this document,
and the decision to publish under this portfolio's name remains the account
owner's.

## Amendments to the pipeline (no scores changed)

Recorded in `distribution-first.md`'s amendment style, as input for whenever the
intake gate reopens. **No candidate is added, removed, or re-scored** — that is
not this run's call.

| Candidate | Amendment |
|---|---|
| `mcp-supply-chain-watch` | #130 and #137 converged on this as the only end-to-end executable candidate, via npm. npm's account cannot be created from here; of its remaining routes, **crates.io and Docker Hub both publish and count**, and ghcr.io publishes but cannot be counted. If this candidate is run as the probe, ship it to crates.io or Docker Hub, not ghcr.io |
| `cra-evidence-desk` | #137 re-mapped it onto a container on ghcr.io or Docker Hub. Those two differ on this gate: **Docker Hub exposes a public pull count, ghcr.io does not.** Same artifact, same effort, and only one of the two produces a measurement |
| `eaa-remediation-pipeline`, `shopify-a11y-evidence` | Both lost their free validation channel to #137. Neither gains one here. The Finding 2 class is the closest fit either has to a non-developer audience, and it is scope- and egress-blocked |
| `public-record-watch`, `tender-radar`, `agent-permission-harness`, `einvoice-preflight` | Unaffected |

The general rule this run adds, extending #137's:

> **Score a channel on its `stats` surface, not only its `publish` surface — and
> check first that the count exists at all.** A channel you can publish to but
> cannot measure is a distribution channel, not a probe. Two of the eight
> channels the portfolio was ready to spend its measurement on publish no
> number, and no permission grant changes that.

---

# Amendment, 2026-08-24 — PyPI put through the same gate, and it fails at both

Another firing of the screening brief. **No candidate added, no score changed,
nothing in `portfolio/pipeline/` rewritten** — the `CLAUDE.md` intake gate
applies and was obeyed. This is the gate's first named move (*advance a probe
already specified*) applied to this directory's own probe, and it exists because
a run the day before put a channel on the board that this directory had only
ever used as a control.

[`artifact-channel-match`](../artifact-channel-match/) (2026-08-24) measured the
other half of the publishing join and found that the **only two publishable
packages in this repository are Python** — the `eaa-wcag-triage` and
`npm-reachability-triage` probes. That makes PyPI the one channel where an
artifact already exists, and it reopened the ranking of the "PyPI route" against
Ask 0. Its own closing section named what it had not done:

> **Also unaddressed:** whether a published probe could be *measured.* […] PyPI's
> JSON API returns `-1` for every download field, so the PyPI route as described
> here publishes into a channel this portfolio cannot read a count from either.
> That objection applies to the PyPI route and to parts of Ask 0 alike, and
> neither this run nor the cost table above resolves it.

That was a confident reading, not a measurement. This run measures it. PyPI is
now a first-class channel in `TARGETS` (9 surfaces) rather than a control row,
and the 27 original targets were re-run alongside it as a drift check.

## Finding 4 — the PyPI route is blocked at `publish` *and* at `stats`

| Surface | Gate | Verdict | What came back |
|---|---|---|---|
| `upload.pypi.org/legacy/` | `publish` | **`EGRESS_DENIED`** | HTTP 403: *"Host not in allowlist: upload.pypi.org. Add this host to your network egress settings to allow access."* |
| `pypi.org/pypi/requests/json` → `info.downloads.last_month` | `stats` | `REACHABLE` | **`-1`** |
| `pypi.org/pypi/black/json` → `info.downloads.last_week` | `stats` | `REACHABLE` | **`-1`** |
| `pypi.org/stats/` | `stats` | `REACHABLE` | top-N projects by **stored size**; no download count for any project |
| `pypistats.org/api/packages/requests/recent` | `stats` | **`EGRESS_DENIED`** | tunnel refused |
| `api.pepy.tech/api/v2/projects/requests` | `stats` | **`EGRESS_DENIED`** | tunnel refused |
| `clickpy-api.clickhouse.com` | `stats` | **`EGRESS_DENIED`** | tunnel refused |
| `www.piwheels.org/project/requests/json/` | `stats` | **`EGRESS_DENIED`** | tunnel refused |
| `bigquery.googleapis.com` (the `bigquery-public-data.pypi.file_downloads` route) | `stats` | `REACHABLE` | discovery document — **but querying it needs a billing-enabled Google Cloud project** |

Read against this directory's own rule — *a channel produces a demand
measurement only if `publish` and `stats` both answer* — PyPI passes neither:

- **`publish` fails on this environment**, exactly as
  [`publish-endpoint-reachability`](../publish-endpoint-reachability/) recorded.
  One owner-controlled allowlist entry fixes it.
- **`stats` fails on a second, independent thing.** Warehouse still serves a
  `downloads` object and it is a sentinel: `-1` on both projects probed, on two
  different windows. Every zero-credential surface that *does* publish the real
  numbers — the three community aggregators and the piwheels mirror — is
  egress-denied. The one count route that answers is PyPI's own documented one,
  BigQuery, and reading it needs a cloud account with billing attached.

So PyPI reproduces **the NuGet shape** this directory named in Finding 1 —
publish host and statistics host judged separately, with different verdicts —
and then goes one worse: NuGet's statistics host merely needs an allowlist entry,
while PyPI's needs an allowlist entry *or* a credential heavier than any ask
currently on the queue.

## Finding 5 — the cost correction of 2026-08-24 was one-sided

`artifact-channel-match` corrected a ranking on `main` by pricing a line item the
original had omitted (the port into a language this portfolio has never used).
That correction stands. It was, however, priced on one side only: it counted
Ask 0's missing port and did not count the PyPI route's missing `stats` gate.
Both sides, measured:

| | Ask 0 (Packagist / RubyGems / crates.io / Hex) | PyPI route |
|---|---|---|
| Account signup | 1 | 1 |
| Egress change to publish | 0 | **1** (`upload.pypi.org`) |
| Egress change (or credential) to read a count | 0 | **1** (`pypistats.org`, or a billing-enabled cloud account) |
| Port an artifact into an unused language | **1** | 0 |
| Artifact exists today | no | **yes** (two probes, 272 + 289 tests green) |
| Count readable today | **yes — measured, four of four channels** | **no** |

The honest statement is that **neither route is one action away**, and the two
are not comparable on a single axis: Ask 0 spends agent time on a port and buys a
channel whose count this directory has read a live number from four times; the
PyPI route spends two owner-controlled settings and buys a channel with an
artifact already sitting in it. Which is cheaper depends on how the account owner
prices their own settings against agent time — that is their call and this run
does not make it. What is now on the record is that the version of the comparison
sitting on `main` as of yesterday undercounted the PyPI side by two gates.

One thing that is *not* uncertain: the four registries on Ask 0's amended menu
each returned a real, live download total again in this run, five days after the
first reading. The measurement Ask 0 buys is real. It is the artifact behind it
that is missing.

## Finding 6 — this probe's classifier had a blind spot, now closed

`upload.pypi.org` refused **in band**: a real HTTP 403 from the enforcement layer,
naming the host and the remedy, rather than the CONNECT-time tunnel failure every
other denied host in the original 27 produced. This signature is not a discovery
— [`publish-endpoint-reachability`](../publish-endpoint-reachability/) found it
and named it (`x-deny-reason: host_not_allowed`), and corrected two readings that
had mistaken it for an origin answer. The finding here is narrower and is about
*this* directory: **its classifier never learned that lesson**, because none of
the original 27 targets hit the in-band shape. It would have coded this
`HTTP_403` — indistinguishable in the results file from PyPI itself refusing an
unauthenticated upload, which is what a reader would reasonably assume a 403 from
an upload endpoint means. A correction that lands in one directory does not
propagate to the tool in the next one.

Two refusal shapes, one policy, one remedy. The classifier now matches on the
filter's own wording and both are `EGRESS_DENIED`; a plain 403 with any other
body is still `HTTP_403`, pinned by a test. No verdict in the original 27 changes.

The general rule, extending the one this directory already added:

> **A reachable statistics host is not a readable number.** Score the `stats`
> gate on whether a count comes back *without a credential this portfolio does
> not have* — a sentinel value, a top-N page, and an endpoint that answers only
> for billing-enabled accounts all pass a naive reachability check and none of
> them measures anything.

## Drift check — zero, over five days

All 27 targets from the 2026-08-19 pass were re-run in the same invocation.
**Every verdict reproduced exactly**, diffed programmatically rather than by eye.
The only values that moved are the five live download totals, all upward by the
amount five days of real traffic would add (crates.io +16.6M, Docker Hub +14.6M,
Packagist +2.9M, RubyGems +1.6M, Hex +0.25M). Both controls held.

That is the fourth independent confirmation of this environment's egress
posture, and it is worth stating as its own result: the denials in this
directory are stable policy, not transient failures.

## What this does and does not establish

**Does:** PyPI fails both gates from here; the sentinel is a property of the API
rather than of one project or one window; the only reachable PyPI count route is
credential-gated; and yesterday's cost correction, while right about the port,
undercounted the PyPI side by two gates.

**Does not:** say which route the owner should pick, or that either produces
*demand*. Finding 3 above still applies to every number in this document. And
predicting that an allowlist entry for `pypistats.org` *would* make it readable
is a prediction, not a measurement — the same class of claim as `NO_SUCH_SURFACE`
in Finding 1, and it should be re-probed after any egress change rather than
assumed.

Nothing was published, registered, uploaded, or signed up for. Read-only GETs
against public endpoints, for packages this portfolio does not own; no credential
was sent anywhere.

## Files

- `probe_demand_signals.py` — the probe. Read-only, stdlib only, no credentials.
  `--recompute-from` re-derives the summary from saved results with no network
  access.
- `test_probe_demand_signals.py` — 19 offline tests over the classifier, the
  sentinel rule, the credential bucket, and both committed result files. Added
  2026-08-24.
- `results-2026-08-19.json` — 27 targets: per-target verdict, HTTP status,
  response snippet, the count value where one was read, and the declared
  `public_count` for each channel.
- `results-2026-08-24.json` — 36 targets: the same 27 re-run, plus PyPI's 9
  surfaces. Rows added this pass also carry `count_is_sentinel` and
  `count_needs_credential`.

Reproduce:

```
python3 portfolio/research/demand-signal-reachability/probe_demand_signals.py --out /tmp/run.json
python3 portfolio/research/demand-signal-reachability/probe_demand_signals.py --recompute-from /tmp/run.json
cd portfolio/research/demand-signal-reachability && python3 -m unittest discover   # 19 tests, offline
```

## Status of the claims

Findings 1–3 were measured 2026-08-19; Findings 4–6 on 2026-08-24, in a run that
re-ran the 2026-08-19 targets alongside them and reproduced every verdict. They
are primary observations of **this environment on those dates**, not statements
about the channels' own policies, and an egress allowlist can change without
notice.

Four limits worth stating plainly:

- A `REACHABLE` statistics endpoint proves the number can be read for a
  third-party package. It does not prove a *new* package's count appears
  promptly, or at all, on a free tier.
- `NO_SUCH_SURFACE` for ghcr.io and the Go proxy is a claim about those
  channels' public APIs as understood here, gathered without access to their
  documentation hosts — `docs.github.com` is egress-denied, as #137 also found.
  It is the confident reading, not a verified one, and it is exactly the kind of
  claim to re-check before acting on it.
- Finding 3 is an argument about measurement validity, not a measurement. It
  should be argued with, not cited.
- No third-party repository was read, and the Finding 2 scope boundary is quoted
  from the gateway's own refusal rather than established by probing what it
  forbids.
