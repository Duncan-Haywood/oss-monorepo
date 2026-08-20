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

## Files

- `probe_demand_signals.py` — the probe. Read-only, stdlib only, no credentials.
  `--recompute-from` re-derives the summary from saved results with no network
  access.
- `results-2026-08-19.json` — 27 targets: per-target verdict, HTTP status,
  response snippet, the count value where one was read, and the declared
  `public_count` for each channel.

Reproduce:

```
python3 portfolio/research/demand-signal-reachability/probe_demand_signals.py --out /tmp/run.json
python3 portfolio/research/demand-signal-reachability/probe_demand_signals.py --recompute-from /tmp/run.json
```

## Status of the claims

Measurements taken 2026-08-19 from this session's network environment. They are
primary observations of **this environment on this date**, not statements about
the channels' own policies, and an egress allowlist can change without notice.

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
