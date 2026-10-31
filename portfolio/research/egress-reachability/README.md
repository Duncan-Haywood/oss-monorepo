# Egress reachability, consolidated

**Measured 2026-08-20, re-measured 2026-08-23: all 92 hosts unchanged. One
pass each, first-hand. Read-only GETs; no credential, no account, no
publication, no spend.**

**2026-08-24: the table is 98 hosts.** Six were measured and never folded in —
four by a sibling pass this ingest could see and nobody ran, two it structurally
could not see at all, one of which the account owner is being asked to
allowlist. See [the 2026-08-24 amendment](#amendment-2026-08-24--the-table-had-drifted-six-hosts-and-nothing-was-checking).

Reproduce:

```
python3 consolidate.py --check                                   # is the table current? (offline)
python3 check_ask_hosts.py                                       # is every host in an ask measured?
python3 consolidate.py --ingest                                  # fold in every prior pass
python3 consolidate.py --probe  -o results-2026-08-23.json       # re-measure all 92 hosts
python3 consolidate.py --report -r results-2026-08-23.json       # diff the two, offline
```

`--report` needs no network. It re-derives every claim below from the committed
JSON, which is how a reviewer checks this without re-running the probe.

## Why a ninth reachability measurement exists

There should not be one. There are nine already, and this directory is not a
tenth opinion — it is the nine folded into one verified table, plus the reason
they kept disagreeing.

Between 2026-08-19 and 2026-08-20, nine scheduled sessions each measured which
hosts this environment can reach. Eight of them left machine-readable results —
**232 probe records over 92 distinct hosts, in seven different JSON schemas**:

| Pass | Directory | Probe records folded in |
|---|---|---|
| #126/#130/#137/#150 (consolidated by #166) | `agent-reachability/` | 33 |
| " | `demand-signal-reachability/` | 26 |
| " | `monetization-reachability/` | 45 |
| " | `publish-reachability/` | 44 |
| #177 | `publish-endpoint-reachability/` | 22 |
| #218 | `publisher-audience/` | 10 |
| #232 | `primary-source-egress/` | prose only — 23 hosts, no results file |
| #240 | `runtime-data-reachability/` | 24 |
| #253 | `data-reachability/` | 28 |

**None of those measurements is on `main`.** Every one sat in an open pull
request, so each new session started from a checkout where the previous
measurement did not exist, re-probed an overlapping host set, and wrote its
result into another branch that also did not land. `portfolio/pipeline/README.md`
already records this exact mechanism costing thirteen screening cycles —
*research that never lands leaves the next run no way to know the question was
answered*. It has since repeated one layer down, at the measurement layer, nine
times in about sixteen hours.

This directory is that loop's fixed point: one host table, one script, one file
to update, landed with no `portfolio/ledger/` hunk so it stays mergeable.

## The measurement

92 hosts, probed 2026-08-20T07:23Z. Any verdict differing from the prior
consensus was probed a second time before being recorded.

| Verdict | Count | Means |
|---|---|---|
| `reachable` | 25 | The request reached the origin, which answered. `200`, `401`, `403`, `404`, `405` are all the origin's own opinion |
| `egress_denied` | 64 | The environment's egress filter refused. The origin was never contacted. Only the account owner can change this |
| `scope_denied` | 3 | Host reachable; this session is not scoped to the data. GitHub only |

**Reachable (25).** Package registries and their read APIs — `registry.npmjs.org`,
`www.npmjs.com`, `pypi.org`, `files.pythonhosted.org`, `crates.io`,
`index.crates.io`, `rubygems.org`, `packagist.org`, `repo.packagist.org`,
`hex.pm`, `api.nuget.org`, `www.nuget.org`, `proxy.golang.org`,
`index.golang.org`, `pkg.go.dev`, `hub.docker.com`, `registry-1.docker.io`,
`ghcr.io`, `registry.modelcontextprotocol.io`. Code and object storage —
`raw.githubusercontent.com`, `gitlab.com`, `s3.amazonaws.com`,
`storage.googleapis.com`, `osv-vulnerabilities.storage.googleapis.com`. Plus
`api.anthropic.com`.

**Denied (64).** Every payment rail probed (`api.stripe.com`, `api.paddle.com`,
`api.polar.sh`, `api.lemonsqueezy.com`, `api.paypal.com`, `api.gumroad.com`,
`ko-fi.com`, `liberapay.com`, `opencollective.com`, `thanks.dev`,
`tidelift.com`). Every free listing channel `portfolio/pipeline/channel-inventory.md`
called agent-listable (`wordpress.org`, `api.wordpress.org`,
`plugins.svn.wordpress.org`, `open-vsx.org`, `marketplace.visualstudio.com`,
`docs.github.com`). Every primary legal or standards source (`eur-lex.europa.eu`,
`ec.europa.eu`, `publications.europa.eu`, `ted.europa.eu`,
`euvd.enisa.europa.eu`, `www.federalregister.gov`, `www.w3.org`, `www.cisa.gov`,
`services.nvd.nist.gov`, `www.etsi.org`, `www.sec.gov`, `www.gov.uk`,
`data.gov`). And **`upload.pypi.org`** — PyPI is readable but not publishable,
the two being different hosts with different verdicts.

**Scope-denied (3).** `github.com`, `api.github.com`, `codeload.github.com` all
complete the connection and then return GitHub's own scope message. That is this
session's repository scoping, not the network policy, and no egress change
affects it. `raw.githubusercontent.com` is *not* scoped this way and served
unrelated public repositories at `200` — it is the working route to any dataset
published in a public git repository.

**Amendment, 2026-08-20 — those three verdicts are about the HTTP surface, and
git's transport is a fourth surface that is not scoped.** Every pass folded into
the table above probed GitHub with an HTTPS GET, so the table says nothing about
git.

[`cra-advisory-reachability/`](../cra-advisory-reachability/) found the gap
first and stated the general rule — *"where a dataset is published as a public
repository, egress policy aimed at APIs does not necessarily block it"* — after
cloning `github/advisory-database` with `--depth 1 --filter=blob:none --sparse`.
That finding never reached this table, which is the failure this directory
exists to stop, so it is recorded here as a row-level amendment rather than left
in one candidate's write-up. What this pass adds to it is the **depth**: a
`--depth 1` clone proves the transport carries current records, and full history
is a different claim, which is the one a change-rate measurement needs.

Asked over git's smart-HTTP transport, the same hosts answer for repositories
this session has no scope over:

| Surface | `cisagov/kev-data` (unrelated public repo) |
|---|---|
| `https://github.com/<repo>` (web) | **403**, GitHub scope message — as recorded |
| `https://api.github.com/repos/<repo>` (REST) | **403**, GitHub scope message — as recorded |
| `https://codeload.github.com/<repo>/tar.gz/…` (archive) | **403**, GitHub scope message — as recorded |
| `git ls-remote https://github.com/<repo>.git` | **reachable**, 2 refs |
| `git ls-remote https://codeload.github.com/<repo>.git` | **reachable**, 2 refs |
| `git clone --filter=blob:none` | **reachable**, 388 commits of history fetched |

Reproduce: `python3 consolidate.py --git-surface -o git-surface-2026-08-20.json`
(read-only `ls-remote` plus one blobless clone; nothing is written to any
remote). Raw output:
[git-surface-2026-08-20.json](git-surface-2026-08-20.json). Confirmed against a
second unrelated org (`openstates/people`, 1,593 refs), so it is not one repo's
setting.

This does not overturn a row. `github.com` over HTTP is scope-denied, exactly as
recorded; the table's verdicts stand for the surface they were measured on. What
it adds is a route the table did not carry, and the distinction that makes the
route worth more than "another way to read a file" is **history**:
`raw.githubusercontent.com` serves a file's current bytes, and only the git
transport serves the commits behind it. Any question of the form *"how often
does this actually change"* needs the second, and every answer in this repo so
far assumed it had to be gathered by polling forward. It can be read backwards
instead, for free. [`register-change-rate/`](../register-change-rate/) is the
first measurement to use it.

It also generalises methodological rule 1 below. A channel was said to have
three surfaces — publish, read, stats — that fail independently. Git is a
fourth, it failed *open* where the others failed closed, and the general form of
the rule is that a verdict belongs to a surface and never to a host.

Full per-host detail, with which passes probed each host and what they found:
[results-2026-08-20.json](results-2026-08-20.json) and
[prior-verdicts.json](prior-verdicts.json).

## The finding: this environment denies egress three different ways, and one of them is intermittent

This is the part that is new, and it explains the disagreements rather than
just recording them.

| # | Signature | How it presents |
|---|---|---|
| 1 | **CONNECT refused** | `curl` exit 56, `http_code 000`; urllib raises `URLError("Tunnel connection failed: 403 Forbidden")`. No HTTP status ever exists |
| 2 | **In-band, allowlist** | A real HTTP **403** whose body is `Host not in allowlist: <host>. Add this host to your network egress settings to allow access.` |
| 3 | **In-band, no-rule** | A real HTTP **403** whose body is `request blocked: no rule allows host "<host>"` |

Signatures 2 and 3 are **indistinguishable from an origin-side 403 by status
code alone.** `www.npmjs.com` genuinely answers 403 (Cloudflare) and is
reachable; `upload.pypi.org` appears to answer 403 and was never contacted. Only
the response body separates them.

#177 found signature 2 and attributed it to hosts in the proxy's `noProxy` list,
which bypass the proxy and meet the filter directly. That is right for
`upload.pypi.org` and `jsr.io`. It is not the whole rule:

> **Signature 3 fires on ordinary proxied hosts, and it fires intermittently.**
>
> 50 consecutive probes across five hosts that are unambiguously denied
> (`example.com`, `api.wordpress.org`, `opencollective.com`,
> `eur-lex.europa.eu`, `open-vsx.org`), none of them in `noProxy`:
> **47 presented as signature 1, and 3 — about 6% — presented as signature 3.**
> Same host, same URL, same session, minutes apart.
> ([denial-signature-stability-2026-08-20.json](denial-signature-stability-2026-08-20.json))

The consequence is the reason this directory exists:

> A probe that classifies *any HTTP status* as an origin answer reports a
> **false `reachable`** on roughly 6% of denied hosts per run — and a **different
> 6% every run.** Across the 64 denied hosts here, that is ~4 spurious
> "reachable" verdicts per pass, none reproducible by the next pass.

`runtime-data-reachability/README.md` states the rule that this breaks — *"A
403/404 here is an origin-side answer (auth, path, user-agent), **not** a network
denial"* — and it is wrong in this environment about 6% of the time. So does any
pass that recorded a bare status code. Two of the three cross-pass disagreements
folded in here resolve to exactly this, and the third (`codeload.github.com`) is
the GitHub scope/network confusion.

**The rule for any future probe in this repo:** classify on the response body,
never the status code; treat `Tunnel connection failed`, `Host not in allowlist`,
and `no rule allows host` as one verdict; and re-probe anything that would
overturn a recorded verdict before recording it. `consolidate.py` does all three.

## What this changes for the account owner's decision queue (issue #139)

No ask is added and no score is changed. Three are re-stated more precisely:

- **Ask 0 (one registry account, "no egress change needed") holds, and is now
  measured rather than assumed.** `rubygems.org`, `packagist.org`,
  `repo.packagist.org`, `crates.io` and `hex.pm` all answer. The caveat is
  PyPI-shaped and worth keeping: a registry's read host and its *publish* host
  can have different verdicts, and for PyPI they do.
- **Asks 3 and 7 are one decision, confirmed at 92 hosts** (98 as of
  2026-08-24). `api.wordpress.org` and the government/standards publishers fail
  with the same signature as the `example.com` control. There is no
  host-specific denial to appeal; there is one policy, and 64 hosts sit behind
  it — 69 after the 2026-08-24 amendment below, which also corrects the ask to
  name the host that actually serves the EUVD API.
- **Ask 2 (a payout rail) needs the egress change to be worth anything.** All
  eleven payment and funding rails probed are denied. A merchant-of-record
  credential alone changes nothing from inside a session — which is what
  `agent-reachability/` first reported and is now confirmed against a wider set.

## Status of the claims

These are measurements of **this environment**, not facts about the hosts.
Several are network-policy verdicts the account owner can change with a
settings toggle. Nothing here was published, registered, signed up for, or
paid for, and no credential was sent anywhere.

**Amendment, 2026-08-23 — the table is stable across time and across
containers.** The header above used to date the whole table to a single pass,
which left open whether the 64 denials were a durable policy or one container's
transient configuration. Re-probing all 92 hosts on 2026-08-23 returns
**verdict-for-verdict identical results** — 64 `egress_denied`, 25 `reachable`,
3 `scope_denied`, zero hosts changed
([results-2026-08-23.json](results-2026-08-23.json); diff the two files
directly, since the aggregate counts alone would not have caught a
compensating swap). Sessions run in fresh, ephemeral containers, so this is two
independent instantiations three days apart, not one machine re-asked.

What that does and does not license. It **does** retire "the measurement might
be stale" as a reason to re-probe: a third pass on an unchanged policy buys
nothing, and this amendment exists so the next session can cite a date instead
of spending a pass to re-earn one. It does **not** make any verdict permanent —
the policy is still a settings toggle, so a row is worth re-probing when
something suggests the toggle moved (the owner says so, or a host that should
be denied answers). Absent such a signal, cite the table.

**Amendment, 2026-10-31 — the policy moved.** The owner granted the
read-only allowlist ask (`asks.yaml`, `egress-policy`: "absolutely fine") and
a full re-probe the same day found **94 of 98 hosts reachable**
([results-2026-10-31.json](results-2026-10-31.json)). 68 hosts changed from
the prior consensus, all from denied to reachable; none went the other way.
Still blocked: `api.ecosyste.ms` and `clickpy-api.clickhouse.com` (proxy 502,
denied) and `github.com` / `codeload.github.com` (scope-denied by the GitHub
proxy, by design: use the MCP tools or `add_repo`). `www.ftc.gov` counts as
reachable but answers 403 from its own Akamai bot screen; that is the site's
choice, not our proxy, and is not something to work around. The four
merchant-of-record and payment APIs (`api.polar.sh`, `api.lemonsqueezy.com`,
`api.paddle.com`, `api.stripe.com`) now answer too.

Re-run `consolidate.py --probe` before citing any row; it takes about two
minutes and updates the whole table at once. **Do not write a new probe
directory** — add hosts to the inventory this one already builds.

## Amendment, 2026-08-24 — the table had drifted six hosts, and nothing was checking

The line above says to add hosts to this inventory rather than write a new
probe. Four days later the inventory was six hosts short, and the two failures
that produced the shortfall are different from each other.

**Four hosts this ingest could see and nobody folded in.** `--ingest` is a
command someone has to remember to run. `demand-signal-reachability/` measured
`api.pepy.tech`, `bigquery.googleapis.com`, `clickpy-api.clickhouse.com` and
`www.piwheels.org` on 2026-08-24 and left a proper results file, and the
committed table still said 92 while a fresh ingest said 96. That matters beyond
tidiness: **`--probe` iterates the committed table**, so a host the table does
not carry is never re-measured, and the next session that wants its verdict
starts from nothing. All four were re-probed here and agree with that pass
(three denied; `bigquery.googleapis.com` answers `200`).

**Two hosts this ingest structurally could not see.** The walk reads
machine-readable results *under `portfolio/research/`*. A pass that recorded its
hosts in prose is invisible to it, and so is a pass living anywhere else in the
repository. Both cases were live:

| Host | Measured by | Why the table could not see it |
|---|---|---|
| `www.ftc.gov` | `primary-source-egress/` (#232) | 23 hosts recorded in prose; no results file |
| `euvdservices.enisa.europa.eu` | `../pipeline/probes/README.md` (2026-08-23) | outside `portfolio/research/` entirely |

Both are now measured first-hand — denied, twice each, alongside a reachable
control — and folded in through
[unindexed-hosts.json](unindexed-hosts.json), which is the "add hosts to the
inventory" mechanism this README asked for and did not have.

**The cost was about to land on the account owner.** `www.ftc.gov` has been
named in `portfolio/ledger/asks.yaml`'s egress ask since 2026-08-19 with no
verdict in this table at all: the owner was being asked to allowlist a host the
portfolio had not, on its own canonical record, measured. Worse, the same ask
named `euvd.enisa.europa.eu` and claimed granting it would unlock
`cra-evidence-desk`'s EUVD wedge — but that host serves the website and the API
is served from `euvdservices.enisa.europa.eu`. **Granted exactly as written, the
one decision would have been spent and the wedge would still have been
blocked.** The ask now names both hosts, and
[check_ask_hosts.py](check_ask_hosts.py) fails CI if any decision in
`asks.yaml` ever again names a host with no verdict here. Run against the table
as it stood on `main`, that check fails on `www.ftc.gov` — it catches the real
defect, not a synthetic one.

**And a third defect, found on the way.** `prior_consensus` was a bare
`Counter.most_common(1)`, which breaks a tie by whichever order the walk read
the files in. Two hosts were decided that way with nothing in the output
showing it: `api.github.com` stood at 6 `reachable` / 6 `scope_denied`, and
`codeload.github.com` at 1 / 1 — landing on `reachable`, **contradicting the
"Scope-denied (3)" section of this very README**, which records all three GitHub
hosts answering 403 with GitHub's scope message. Ties now resolve by the rule
`probe()` already states — *denials are authoritative and reachability is not* —
and `codeload.github.com` reads `scope_denied`, agreeing with the prose it
shipped beside.

That fix is not sufficient on its own, because a vote over observations is a
vote over *methods*, and the methods folded in here are not equally good: the
passes that record GitHub as `reachable` read the status code without the body,
which is the error [the central finding](#the-finding-this-environment-denies-egress-three-different-ways-and-one-of-them-is-intermittent)
above is about. Folding in the newer passes would have overturned
`api.github.com` to `reachable` on an 8–6 vote. The three GitHub hosts are
therefore **pinned** in `consolidate.CURATED`, each with its reason and each
pointing at a first-hand measurement in this README; `prior_verdicts` and
`vote_consensus` stay in the output so the disagreement is visible rather than
hidden. Pinning is deliberately hard to reach for — three entries, all of them
the same finding.

**What is checked now, and what still is not.** The ingest-equality check
asserts the committed table equals a fresh ingest, offline; the ask-host
checker asserts every host named in an owner ask has a verdict here; both run
in `portfolio-validate.yml`, with unit tests in
[test_consolidate.py](test_consolidate.py). What none of them catches is the
defect that would have cost the most — an ask naming a *real, measured, denied*
host that is simply the wrong host for the thing it claims to unlock. No schema
check sees that, because the record is well-formed and every sentence in it is
individually true. What surfaced it was probing the hosts the ask names, which
is the weaker mechanical property the checker now forces.

Counts after this pass: 69 `egress_denied`, 26 `reachable`, 3 `scope_denied`.
No verdict on any previously-carried host changed except the
`codeload.github.com` tie-break correction, and **no conclusion in this
directory moves**: every host added is denied but for `bigquery.googleapis.com`,
whose discovery document answers `200` while — per
`demand-signal-reachability/` — actually querying
`bigquery-public-data.pypi.file_downloads` needs a billing-enabled Google Cloud
project, which is a credential the portfolio does not have and a spend it will
not make unattended. The egress ask is still one decision, still the
highest-leverage item with no legal exposure, and still unanswered.
