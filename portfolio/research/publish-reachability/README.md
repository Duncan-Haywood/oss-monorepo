# Publish reachability: the free channel the portfolio planned to use is network-denied

Nineteenth firing of the recurring *"research and evaluate potential software
business projects that aren't already here"* brief.

**No new candidate is proposed.** PR #79's intake gate says screening is closed,
its `distribution-first.md` says *"do not generate more candidates"*, and its
`convergence.md` already measured what a twentieth archetype list is worth:
seven runs, thirty-six candidates, nine archetypes, no customer. Re-running that
is the failure mode `CLAUDE.md` exists to prevent, not work.

This run instead **tested the one claim the portfolio's current unblock plan
rests on**, and found it false for every channel that mattered.

> **The eight channels this environment can publish to are exactly the eight
> whose buyer is a developer with no budget. Every channel `channel-inventory.md`
> nominated to carry an actual candidate — WordPress.org, Open VSX, VS Code
> Marketplace, GitHub Marketplace — is denied at the network or scope layer
> before any credential question arises.**

44 targets, 24 distinct hosts, 14 channels, each probed on up to three separate
surfaces.

## What was being tested and why it is load-bearing

PR #79's `channel-inventory.md` makes the portfolio's most consequential
argument to date. Compressed:

1. "Run a probe to a real buyer" is two actions — **demand measurement** and
   **revenue capture** — and four cycles of escalation bundled them.
2. Only revenue capture needs a payout rail. Several channels are
   *agent-listable*: free, no card, no ID — WordPress.org, Open VSX, npm/PyPI,
   GitHub Marketplace's free tier.
3. Therefore **"the free half is not blocked at all"**, and the cheap ask to the
   account owner is merely *permission* to publish a free listing — an approval
   that "costs nothing" and produces the demand number this portfolio has wanted
   since its first screening pass.

Step 3 is what everything downstream depends on. It is also the only step never
measured. `channel-inventory.md` says so in its own status section — its sources
are vendor blogs and search summaries, and it flags that the load-bearing GitHub
Marketplace page "could not be read from this session." It establishes what each
marketplace's **policy** requires. It never established that this environment can
**reach the endpoint where an artifact is uploaded**.

PR #130 found the first counterexample without looking for it — `pypi.org`
REACHABLE, `upload.pypi.org` EGRESS_DENIED — and left the general case open:

> "That distinction was not tested for every registry above, and a channel whose
> upload host is denied is not a channel."

This run tests it for every registry above, and for the non-registry channels the
inventory marks agent-listable.

## Method

One small read-only GET per target, paced, stdlib only, no credentials sent.
Verdicts are PR #126's and PR #130's unchanged — `REACHABLE`, `EGRESS_DENIED`,
`SCOPE_DENIED`, `BOT_CHALLENGED`, `UNREACHABLE` — including the
`github api path is not available` classifier fix #130 made to #126, so all three
result sets read side by side.

### The decomposition this run adds

Prior runs probed one surface per channel and called the answer "the channel."
Publishing is **three surfaces, and they fail independently**:

| Gate | What it is | Measured before? |
|---|---|---|
| `read` | the surface a *consumer* of the package hits | Yes — this is all #126 and #130 measured |
| `register` | where an account is created or a publish token issued | **No** |
| `publish` | where the artifact is actually uploaded | **No**, except PyPI by accident |

A channel is usable end-to-end only if `register` **and** `publish` answer.
Scoring a channel on its `read` surface is the error this run corrects, and it is
the error the "Agent-listable" column inherits — that column asks whether a
*credential artifact* (card, ID, domain, bank account) is required, which is a
real gate, but an orthogonal one to whether the network permits the host at all.
Both must pass. The inventory measured one and assumed the other.

### What a verdict here does and does not prove

Stated up front because overstating exactly this is what #126 and #130 both
warned about:

- **`EGRESS_DENIED` on a publish host is conclusive.** No credential fixes it.
  This is the finding this run establishes firmly, and it is the one that changes
  the owner ask.
- **`REACHABLE` on a publish host is permission-to-hope, not proof.** It means
  the network path works and the remaining gate is credentials. It does not mean
  an authenticated `PUT`/`POST` would be accepted.
- Some probed paths are deliberately the *documented* publish route rather than
  the current one — `nuget`'s legacy v2 path and `hex`'s `/api/publish` both
  return origin 404s. Those rows establish that **the host answers**, not that
  the exact URL is right. `rubygems` (401 *"Please sign up for an account"*) and
  `packagist` (405 *Method Not Allowed* on a POST-only route) are the two
  cleanest positives: path exists, method or auth is the only thing missing.
- Account creation on a reachable registry still needs an email address and, on
  several, email verification. That is a **third** gate this run does not measure
  and nobody has costed.

## Finding 1 — every channel nominated to carry a candidate is denied

`channel-inventory.md` closes with a table mapping each pipeline candidate onto
"a free, agent-reachable channel," and concludes *"three of the eight have a
channel an agent can publish into this week for $0."* Measured:

| Channel | Inventory's claim | `read` | `register` | `publish` | Usable? |
|---|---|---|---|---|---|
| **WordPress.org** | Yes | `EGRESS_DENIED` | `EGRESS_DENIED` | `EGRESS_DENIED` | **No** |
| **Open VSX** | Yes | `EGRESS_DENIED` | `EGRESS_DENIED` | `EGRESS_DENIED` | **No** |
| **VS Code Marketplace** | Mostly | `EGRESS_DENIED` | `EGRESS_DENIED` | — | **No** |
| **GitHub Marketplace (free)** | Yes | — | `SCOPE_DENIED` | `SCOPE_DENIED` | **No** |
| **PyPI** | Yes | `REACHABLE` | `REACHABLE` | `EGRESS_DENIED` | **No** |
| **npm** | Yes | `REACHABLE` | `BOT_CHALLENGED` | `REACHABLE` | **Only with a pre-existing account** |

Every single one. Not a sample — the complete set of channels the document
nominated.

**WordPress.org is the most consequential.** All five of its surfaces are
egress-denied, including the SVN host every WP.org plugin is actually published
through. It was the inventory's flagship: the channel mapped onto
`eaa-remediation-pipeline` (the pipeline's top-ranked candidate), the proxy
measurement for `shopify-a11y-evidence`, and *the only agent-reachable channel
whose searcher is a business rather than a developer*. It cannot be reached from
here at all.

**npm is the interesting near-miss.** Its publish route answers (`401
Unauthorized` from `registry.npmjs.org/-/whoami`) but account creation sits on
`www.npmjs.com`, which serves a Cloudflare interstitial to non-browser clients —
confirming #130's `BOT_CHALLENGED` finding and showing why it matters: the
registry is publishable and the channel still is not, because the account cannot
be created from here. This is precisely the `register`/`publish` split that
one-surface probing hides.

## Finding 2 — eight channels *are* publishable, and every one has a developer buyer

The other half of the result, and the reason this is not purely a negative
finding:

| Channel | `register` | `publish` | Payment rail | Searcher holds a budget |
|---|---|---|---|---|
| crates.io | `REACHABLE` | `REACHABLE` | None | No — developers |
| RubyGems | `REACHABLE` | `REACHABLE` (401 *"please sign up"*) | None | No — developers |
| NuGet | `REACHABLE` | `REACHABLE` | None | No — developers |
| Packagist | `REACHABLE` | `REACHABLE` (405, POST-only) | None | No — developers |
| Hex | `REACHABLE` | `REACHABLE` | None | No — developers |
| Docker Hub | `REACHABLE` | `REACHABLE` (401 auth required) | None | No — developers |
| ghcr.io | — | `REACHABLE` (403 on a push-scoped token) | None | No — developers |
| Go module proxy | **not required** | `REACHABLE` | None | No — developers |

Eight of fourteen channels are publishable end-to-end at the network layer, and
**none of them needs an egress change** — the blocker on all eight is an account,
not a policy.

Go is the special case worth naming: a module is published by tagging a public
git repository and letting the proxy fetch it, so it has **no `register` gate at
all**. It is the only channel measured here that an agent could publish to today
with no account of any kind.

But cross-tabulating against `distribution-first.md`'s own test — *is there a
place where this buyer already searches for this category, with a payment method
already attached?* — the eight collapse to one sentence:

> **The channels this environment can publish to are exactly the channels whose
> searcher does not hold a budget, and the channels whose searcher holds a
> budget are exactly the ones it cannot reach.**

`channel-inventory.md` observed that its gradient had no top-right cell — no
channel lets an unattended agent take money — and called that "the correct design."
That still holds. This run finds a second empty cell nobody had drawn: **no
channel is both publishable from here and searched by someone with a budget.**

## Finding 3 — the egress policy is a dependency-install allowlist, not a publishing one

The pattern in the denials is coherent enough to be worth stating, because it
tells the account owner what kind of change is being requested.

`NO_PROXY` names, verbatim: `registry.npmjs.org`, `jsr.io`, `npm.jsr.io`,
`pypi.org`, `files.pythonhosted.org`, `index.crates.io`, `proxy.golang.org`.
Those are the hosts a **build** contacts to install dependencies. The publish
counterparts are absent, and the one whose publish host is a *different* hostname
— `upload.pypi.org` — is denied while `pypi.org` beside it is direct.

The same shape holds through the gateway: package ecosystems answer, general web
and non-package marketplaces do not (`wordpress.org`, `open-vsx.org`,
`marketplace.visualstudio.com`, `docs.github.com`, `developer.wordpress.org` all
egress-denied).

This environment is provisioned as a **build sandbox that can install
dependencies**, not as a station that publishes products. That is a reasonable
default and very likely deliberate. It is worth recording because it means the
denials above are not incidental gaps to route around — they are the policy
working — and any ask to change them should be made as an explicit, narrow,
reviewable request rather than treated as a misconfiguration.

It also **re-confirms `channel-inventory.md`'s own caveat rather than lifting
it**: `docs.github.com` is still egress-denied, so the GitHub Marketplace
free/paid split and the 100-installation minimum remain unverified against the
primary source. `developer.wordpress.org` is denied too, so the WordPress
publishing requirements are equally unverified — and now moot, since the channel
itself is unreachable.

## Finding 4 — two independent measurements converge on the same single candidate

PR #130 concluded that `mcp-supply-chain-watch` is the pipeline's only executable
candidate, on the grounds that the reachable *data sources* are package-registry
and vulnerability data. This run reaches the same place from the *channel* side:
the only publishable channels are package registries, so the only candidate that
can be distributed is one whose product is a package.

That convergence is worth something, and also worth not over-reading.
`convergence.md`'s own warning applies to it: agreement between two measurements
sharing an environment is evidence about the **constraints**, not about the
market. Both runs are measuring the same allowlist from different angles. What it
establishes is that the constraint is structural and consistent, not that
`mcp-supply-chain-watch` is a good business — #130 was explicit that its median
outcome is "tens-to-low-hundreds of downloads."

## Consequence: the "costs nothing" approval does not do what it was scoped to do

`channel-inventory.md`'s recommended next action lists two independent owner
decisions and notes that *"(2) alone is enough to produce the measurement, and
(2) costs nothing."* Ask (2) is permission for an agent session to publish a free
listing.

**Granting (2) as written now produces nothing.** Permission is not the binding
constraint on any channel it was scoped against — WordPress.org, Open VSX, and
VS Code Marketplace are egress-denied, GitHub Marketplace is scope-denied, and
npm's account cannot be created from here. The approval would be granted against
a set of channels that are all unreachable.

The ask that *would* produce the measurement is different, cheaper than either of
#130's two, and has not been put to the owner before:

> **Ask 0 — one account on one already-reachable registry.**
> No egress change. No payment rail. No company, card, or domain. Create an
> account on one of the eight channels in Finding 2 and provide a scoped publish
> token, or confirm a Go-module route where no account is needed at all. That is
> sufficient for a free artifact to be published and its installs counted — the
> demand measurement five cycles have now asked for.

Ordered against the asks already on the owner's list:

| Ask | What it costs | What it buys |
|---|---|---|
| **0 — registry account + publish token** *(new)* | One account signup. No egress change | The demand measurement, on a developer-buyer channel |
| 1 — widen GitHub app scope *(#130, narrow)* | One permission change | GitHub-native monetization only |
| 2 — merchant-of-record account **+** egress allowlist entry *(#130, broad)* | Two switches that must land together | The ability to charge for anything, anywhere |
| ~~permission to publish a free listing~~ *(#79)* | Nothing | **Nothing — superseded by this measurement** |

Asks 0, 1, and 2 are independent. Ask 0 is the only one that costs no policy
change, and it is the only one that produces a number rather than a capability.

**None of these is a decision an unattended session should make**, and nothing was
published, registered, or signed up for in producing this document. Per
`CLAUDE.md`'s rule on unattended spend and `channel-inventory.md`'s own "what this
does not license" section, the decision to publish under this portfolio's name at
all remains the account owner's.

## Amendments to the pipeline (no scores changed)

Recorded in the style of `distribution-first.md`'s amendment table, as input for
the next scoring pass. **No candidate is added, removed, or re-scored here** —
that is the intake gate's call, not this run's.

| Candidate | Amendment |
|---|---|
| `eaa-remediation-pipeline` | Its free-channel route (a WordPress.org accessibility-evidence plugin) is **network-unreachable from this environment**. Its distribution score of 8 already assumed a `local-site-studio` lead pipeline that does not exist; the fallback proposed to replace that assumption does not exist either |
| `shopify-a11y-evidence` | Its zero-cost proxy measurement was the same WordPress.org listing. Also unreachable. The candidate is unaffected on its merits; its cheap validation path is gone |
| `cra-evidence-desk` | Mapped onto a free GitHub Marketplace listing, which is `SCOPE_DENIED` on both the listing-creation and billing routes. **But** its natural artifact — an SBOM/CRA evidence scanner — ships perfectly well as a container on `ghcr.io` or Docker Hub, both publishable. Worth re-mapping rather than re-scoring |
| `mcp-supply-chain-watch` | Its npm route publishes but cannot be registered for from here. It has the same container and crate routes as above. Combined with #130's data-source finding, it remains the only candidate executable end-to-end — see Finding 4 for why that is a statement about the environment, not the business |
| `public-record-watch`, `tender-radar`, `agent-permission-harness`, `einvoice-preflight` | Unaffected. None had a free agent-reachable channel on file |

The general rule this run adds, for the next pass:

> **Score a channel on its `publish` surface, not its `read` surface.** A
> registry that answers a metadata query is not a channel. Verify the upload host
> and the account-creation host separately — they routinely differ, and in this
> environment they routinely differ in verdict.

## Files

- `probe_publish_endpoints.py` — the probe. Read-only, stdlib only, no
  credentials. `--recompute-from` re-derives the summary from saved results with
  no network access.
- `results-2026-08-19.json` — full results: 44 targets, per-target verdict, HTTP
  status, origin response snippet, and route (`DIRECT` vs `GATEWAY`).

Reproduce:

```
python3 portfolio/research/publish-reachability/probe_publish_endpoints.py --out /tmp/run.json
python3 portfolio/research/publish-reachability/probe_publish_endpoints.py --recompute-from /tmp/run.json
```

## Status of the claims

Measurements taken 2026-08-19 from this session's network environment. Unlike the
secondary-source material in `channel-inventory.md`, these are primary
observations of this environment — but they describe **this environment on this
date**, not the marketplaces' own policies. An egress allowlist can change
without notice, and a verdict here says nothing about whether a channel would
accept the portfolio's artifact on its merits.

The three limits worth repeating: a `REACHABLE` publish host is not a successful
upload; two probed publish paths (`nuget` v2, `hex`) are stale URLs whose rows
prove only that the host answers; and email-verified account creation is a third
gate nobody has measured.
