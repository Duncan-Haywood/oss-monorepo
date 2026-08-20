# Egress reachability, consolidated

**Measured 2026-08-20. 92 hosts, one pass, first-hand. Read-only GETs; no
credential, no account, no publication, no spend.**

Reproduce:

```
python3 consolidate.py --ingest                                  # fold in every prior pass
python3 consolidate.py --probe  -o results-2026-08-20.json       # re-measure all 92 hosts
python3 consolidate.py --report -r results-2026-08-20.json       # diff the two, offline
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
- **Asks 3 and 7 are one decision, confirmed at 92 hosts.** `api.wordpress.org`
  and the government/standards publishers fail with the same signature as the
  `example.com` control. There is no host-specific denial to appeal; there is one
  policy, and 64 hosts sit behind it.
- **Ask 2 (a payout rail) needs the egress change to be worth anything.** All
  eleven payment and funding rails probed are denied. A merchant-of-record
  credential alone changes nothing from inside a session — which is what
  `agent-reachability/` first reported and is now confirmed against a wider set.

## Status of the claims

These are measurements of **this environment on 2026-08-20**, not facts about
the hosts. Several are network-policy verdicts the account owner can change with
a settings toggle. Nothing here was published, registered, signed up for, or
paid for, and no credential was sent anywhere.

Re-run `consolidate.py --probe` before citing any row; it takes about two
minutes and updates the whole table at once. **Do not write a new probe
directory** — add hosts to the inventory this one already builds.
