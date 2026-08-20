# Does the `mcp-supply-chain-watch` archive accrue? A measurement of its floor

**Measured 2026-08-20. Primary sources, reproducible from this repo, no
credentials, nothing published, no spend.**

This directory does not add a candidate and does not re-screen anything — the
intake gate in [`CLAUDE.md`](../../../CLAUDE.md) applies and screening is closed.
It advances the probe that is already specified in
[`portfolio/pipeline/`](../../pipeline/), for the one candidate whose data
sources this environment can actually reach, by measuring the dimension that
both prior steps explicitly left untouched.

## The question, and why it is now the whole question

Steps 1 and 2 of the `mcp-supply-chain-watch` experiment have been run (see
[`../mcp-tool-drift/`](../mcp-tool-drift/)). Neither kill condition fired. Step 2
ended by moving the product's centre of gravity:

> **Archive is the durable value and the alert is the occasional event**, not
> the other way round.

That relocates the entire proposition onto the candidate's floor dimension.
Its scorecard reads:

```yaml
defensibility: 4
mitigation: Only the retained per-customer pin history accrues; the diffing
            mechanism is assumed copyable and is not the sale.
```

and the step-1 write-up closes: *"the pinned per-customer history is still the
only accruing asset."*

Both are assertions, and [`../../pipeline/README.md`](../../pipeline/README.md)
rule 2 requires a **named mitigation** for any dimension at 4 or below *before*
graduation. The named mitigation is the archive. So the candidate now rests on a
claim nobody has tested:

> Is the pinned declaration history a scarce asset that accrues with time — or
> is it public data that any entrant can reconstruct in full on their first day?

## Answer

**Both, on disjoint halves of the market — and the portfolio can only build the
half with no moat.**

| | Share of registry | Is a pin the only record? | Reachable from this environment? |
|---|---:|---|---|
| Remote endpoint (`remotes`) | **84.5%** | **Yes** — the declaration exists only at request time; nothing retains it | **No** — 0 of 8 sampled endpoints reachable |
| Package on npm/PyPI | 14.2% | **No** — 98.3% of published history is still public and re-downloadable | Yes |
| Package on OCI/mcpb/NuGet | 0.8% | Partly | No |
| Neither | 0.5% | — | — |

Three headline numbers behind that:

1. **The public half hands a cold entrant the incumbent's archive.** Across 40
   npm-distributed servers, public registries retain a median of **13 versions
   spanning 55 days** per package (max 344 versions / 293 days), and only
   **1.7% of published versions** (18 of 1,059) have ever been unpublished — the
   only slice a live pin captures and nobody can rebuild afterwards. On this
   half of the market, an archive that took an incumbent months to accrue is a
   download.
2. **The download takes minutes.** Rebuilding complete declaration archives
   using *this repo's own already-published extractor*
   ([`measure_drift.extract_tools`](../mcp-tool-drift/measure_drift.py)) ran at
   **0.39 s and 0.18 MB per version** — **673 server-days of declaration history
   recovered in 25 seconds**, a rate of roughly **95,000 server-days per wall
   hour** on one machine with no credentials. Extrapolated over all 214
   npm-distributed servers in the registry at the observed median depth:
   **≈2,800 version fetches, ≈18 minutes, ≈490 MB.** The entire
   assumed-defensible asset, for the entire reachable market, is an afternoon
   coffee's worth of bandwidth.
3. **The half where the pin genuinely is the only record is the half this
   environment cannot touch.** All 8 sampled remote endpoints returned
   `proxy-denied` at the egress proxy — the same signature #232 established is a
   general non-registry-egress policy, and the same wall #240 measured for
   runtime input data. There is no allowlist of finite length that fixes it:
   the endpoints are 1,453 distinct third-party hosts.

So the mitigation on file is not wrong — it is **true of 84.5% of the market and
false of the 14.2% the portfolio can build against**. And every piece of
evidence the candidate has accumulated so far (the 69% drift rate, the 152
classified changes, the 7.2% instruction-bearing share) was measured on the
14.2%, because that is the only half that is measurable from here.

## What this changes

**It does not kill the candidate.** It relocates it. The read is:

- The product that can be built from this environment — watch npm/PyPI-packaged
  MCP servers — is a **convenience business, not a moat business**. Customers
  will not rebuild 490 MB of tarballs themselves, and that is a real service;
  but any competitor who decides to, is at parity in eighteen minutes, and a
  buyer who cancels loses nothing they cannot re-fetch. Under
  [`../../pipeline/README.md`](../../pipeline/README.md)'s own scoring language
  ("*10 means: a copy of the product does not take the customers*"), that is a
  defensibility of **3, not 4** — the copy takes the customers *and* the
  history.
- The product with the moat — watch the 84.5% that lives behind remote
  endpoints — has a genuine time-accruing asset, because nothing else in the
  ecosystem is recording those declarations. It is also, as currently framed,
  unbuildable here.

### The named mitigation this measurement produces

Rule 2 wants a named mitigation rather than a rescore, so here is one the data
supports, and it is not "ask for more egress":

> **Ship the collector to the customer; keep the archive.**
>
> The polling that reaches a remote MCP endpoint does not have to run on the
> vendor's infrastructure. Shipped as something the customer runs inside their
> own network — an npm/PyPI package, a scheduled GitHub Action, a container in
> their cluster — the collector uses **their** egress and **their** approved
> connections, and posts back only the declaration snapshots. The vendor stores,
> diffs, classifies and retains.

This is not a workaround dressed up as strategy; it is better on four
independent axes, three of which are on the scorecard:

| | Vendor-side polling | Customer-side collector |
|---|---|---|
| Reaches the 84.5% remote slice | Needs arbitrary-host egress (#240: no finite allowlist grants this) | Runs where the servers are already reachable |
| Defensibility | Archive is public data for the reachable half | Archive is of endpoints **only that customer can see** — genuinely unreconstructible by any entrant, including the incumbent |
| Liability containment | Vendor connects to third-party servers on a customer's behalf | Nothing new leaves the customer's network on the vendor's initiative; the vendor never holds a credential to a customer's server |
| Distribution | Needs a sales motion | The collector **is** a free listing on npm/PyPI/GitHub Marketplace — the exact channels [`channel-inventory.md`](../../pipeline/channel-inventory.md) identifies as agent-listable at \$0 |

The fourth row is the one that matters operationally: this shape converts the
candidate from "blocked on egress the owner cannot reasonably grant" into
"blocked on Ask 5 only" — the free-listing publish approval that
`channel-inventory.md` already says costs nothing and is independent of the
payout rail.

**It does not remove the buyer question.** Step 3 — will two of ten teams pay —
is unchanged, still the deciding gate, and still not runnable by an unattended
agent.

## Honest limits

Every limit of [`../mcp-tool-drift/`](../mcp-tool-drift/) still applies (static
extraction, best-effort regexes, npm-packaged servers only for the drift rates).
Four more are specific to this measurement, and the first cuts hardest **against**
the conclusion above:

- **84.5% is a share of *listings*, not of *deployments*.** The registry is
  weighted by who bothers to list, and hosted vendors have every incentive to —
  213 of the remote entries point at a single host (`server.smithery.ai`).
  Weighted by what companies actually connect to their agents, the
  package-distributed share is very likely much higher than 14.2%: the widely
  used `@modelcontextprotocol/*` servers are npm packages. **If enterprise
  deployment is mostly package-distributed, then the no-moat half is the
  commercially relevant half, and the finding gets worse for the candidate, not
  better.** Nothing here measures deployment share, and no reachable source
  does.
- **1.7% unpublished is a floor on what is unrecoverable, measured on 40
  packages.** It is also concentrated: 2 of 40 packages account for all 18
  unpublished versions, and one (`@fouradata/mcp`) accounts for 17. A different
  sample could move this number materially; it should not be quoted as a
  population rate.
- **The copy-cost timing is a single machine on one network, and 2 of 6
  packages yielded no extractable tools at all** (bundled/minified — the known
  static-extraction failure). Rebuilding an archive that is *useful* is
  therefore slower than rebuilding one that is *complete*. The 18-minute
  extrapolation is a lower bound on the effort and an upper bound on the moat.
- **Defensibility is not only the archive.** Switching cost, alert routing,
  integration, and an attested approval-time snapshot are all plausible moats
  this measurement says nothing about. What it establishes is narrower and
  sufficient for rule 2: *the specific mitigation currently written on the
  scorecard* does not hold for the half of the market the portfolio can build
  against.

## Reproducing

Standard library only, no dependencies, no credentials, read-only against public
APIs. No MCP server is contacted for its tool list; the reachability control
issues a plain `GET` and records only whether the proxy allowed it.

```bash
python3 portfolio/research/mcp-archive-defensibility/measure_archive_defensibility.py \
    --pages 45 --retention-limit 40 --copy-limit 6 --out results.json

# re-derive the headline numbers from the committed corpus, fully offline:
python3 portfolio/research/mcp-archive-defensibility/measure_archive_defensibility.py \
    --recompute-from portfolio/research/mcp-archive-defensibility/results-2026-08-20.json
```

Raw rows, per package and per phase:
[`results-2026-08-20.json`](results-2026-08-20.json).

Re-run before acting on any of it. The population split is the volatile number —
if the registry's package share rises materially, finding 1 gets *worse* for the
vendor-side shape and the customer-side collector gets *more* attractive, not
less.

## Status

Research, not a venture. No `ventures/` directory, no `VENTURE.yaml`, no router
allocation, no account registered, no credential used, nothing published,
nothing sold. Graduation remains the account owner's decision per
[`../../pipeline/README.md`](../../pipeline/README.md).

These are internal research notes. The numbers are primary measurements with raw
rows committed, but they are **not customer-facing claims** and must not appear
in copy.

### Score change this implies, not applied here

This measurement supports lowering `mcp-supply-chain-watch`'s `defensibility`
from **4 to 3** and replacing its `mitigation:` line with the customer-side
collector above. That edit is **deliberately not made in this branch**: PR #207
is open against exactly those lines in
[`../../pipeline/candidates.yaml`](../../pipeline/candidates.yaml) and the
candidate write-up, and a second concurrent edit to the same block is how this
repo's PRs go stale before anyone reads them. Fold this in when #207 lands, or
whichever of the two settles first.

A composite of **6.875** with a floor of **3** (that is, on top of #207's
`ai_leverage` 7→6, which is itself unmerged; 7.0 if #207 does not land) does not,
by itself, change the candidate's verdict — the pipeline's gates are ethics and liability, and both
are comfortably clear. It changes what the product has to be.
