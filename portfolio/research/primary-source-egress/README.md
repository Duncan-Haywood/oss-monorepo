# What this environment can actually read, and what that costs the pipeline

Added 2026-08-20 by the thirteenth firing of the screening brief.

*Relocated from `portfolio/pipeline/primary-source-egress.md` when the
measurement passes were consolidated into `portfolio/research/`; the content is
unchanged apart from link paths.*

**This document adds no candidate and changes no score.** It hit the intake gate
in [CLAUDE.md](../../../CLAUDE.md), accepted it, and then measured one thing the
previous twelve runs asserted without testing: *which hosts this environment can
reach.* The answer changes how two items on the account owner's decision queue
should be stated, and it identifies a blocker that gates the whole directory
rather than one measurement.

## Why this was worth measuring

[channel-inventory.md](../../pipeline/channel-inventory.md) and issue #139's Ask 7 both rest on
the same observation, reported independently by four sessions:

> `api.wordpress.org`/`wordpress.org` both still return
> `CONNECT tunnel failed, response 403` at the proxy (re-confirmed this session)

That observation is accurate. The inference drawn from it — that WordPress.org is
*specifically* denied, and that unblocking it is "one read-only allowlist entry,
no account, no credential, no spend" — does not follow, because **nobody ran a
control.**

Running one takes a single command:

```
$ curl -sS -o /dev/null https://example.com
curl: (56) CONNECT tunnel failed, response 403
```

`example.com` produces a byte-identical signature. The 403 is not evidence about
WordPress.org. It is evidence that this environment denies general web egress,
and every host outside one allowed category returns it.

## The measurement

Method matters here, because the two outcomes look similar and mean opposite
things. `curl` reporting exit 56 with `http_code=000` means the proxy refused the
CONNECT — a policy denial, the host was never contacted. An actual HTTP status
means the tunnel succeeded and the origin answered, whatever it answered.

**Reachable — CONNECT succeeded, origin answered:**

| Host | Origin status | Note |
|---|---|---|
| `registry.npmjs.org` | 200 | in the proxy's `noProxy` list — bypasses the proxy entirely |
| `pypi.org` | 200 | `noProxy` |
| `index.crates.io` | 200 | `noProxy` |
| `proxy.golang.org` | 200 | `noProxy` |
| `jsr.io` | 403 | `noProxy`; 403 is the origin's own |
| `rubygems.org` | 200 | allowed by policy |
| `packagist.org` | 200 | allowed by policy |
| `hex.pm` | 200 | allowed by policy |
| `nuget.org` | 301 | allowed by policy |
| `api.github.com` | 200 | allowed by policy |
| `cocoapods.org` | 200 | allowed by policy |
| `pub.dev` | 200 | allowed by policy |
| `metacpan.org` | 200 | allowed by policy |
| `sourceforge.net` | 403 | tunnel opened; 403 is the origin's own (bot protection) |
| `anaconda.org` | 403 | tunnel opened; 403 is the origin's own |

**Denied — `CONNECT tunnel failed, response 403`:**

| Host | Why it was on the list |
|---|---|
| `example.com` | **the control** |
| `wordpress.org`, `api.wordpress.org`, `downloads.wordpress.org` | Ask 7 |
| `formulae.brew.sh`, `www.raycast.com`, `obsidian.md`, `zed.dev` | Ask 3, all four |
| `open-vsx.org`, `marketplace.visualstudio.com` | listed as agent-listable channels in [channel-inventory.md](../../pipeline/channel-inventory.md) |
| `docs.github.com` | the GitHub Marketplace requirements page channel-inventory.md flags as unread |
| `shopify.dev`, `developer.chrome.com` | channel terms cited in this directory |
| `libraries.io`, `deps.dev` | cross-registry adoption data |
| `eur-lex.europa.eu`, `ec.europa.eu`, `www.ftc.gov`, `www.w3.org`, `www.federalregister.gov` | the primary sources README.md requires before graduation |

`WebFetch` is denied on the same hosts with an explicit
`EGRESS_BLOCKED` error, so this is not a `curl` configuration artifact. Per
`/root/.ccr/README.md`, a 403 at the proxy is an organization egress-policy
denial and is not to be retried or routed around — so nothing here was.

## What the shape of that list means

The allowed set is not an ad-hoc collection of hosts. It is **package registries,
as a category** — thirteen of them, across every major language ecosystem,
including several no document here has ever asked for. Everything else is denied,
including marketplaces, vendor documentation, regulators, and the open web.

Three consequences follow, in increasing order of importance.

### 1. Ask 7 is real, but it is not the shape it is written in

The conclusion stands: WordPress.org cannot be read from here. What changes is the
ask. It has been put to the owner as adding one host to an allowlist that
presumably already contains similar hosts. It is actually a request to **admit a
category the policy currently excludes** — the first non-registry host. That may
still be cheap and it may still be the right call, but the owner should price it
as a policy exception, not as an increment.

The four independent "confirmations" of Ask 7 were four observations of the same
non-diagnostic signature, which is worth recording as a method note: a session
re-confirming a blocked host without a reachable control has not confirmed
anything about that host.

### 2. Ask 3 and Ask 7 are one ask

Ask 3 requests read-only egress for four public websites; Ask 7 requests it for
one. All five are denied by the same rule, for the same reason, and would be
granted by the same decision. They sit on the queue as separate items priced
separately — Ask 7 as "cheapest on the table," Ask 3 several rows below it.
Merging them costs the owner nothing and removes a row.

### 3. The directory's own graduation criterion is currently unsatisfiable

This is the finding worth the session. [README.md](../../pipeline/README.md) sets an explicit
gate on every candidate here:

> Before any candidate graduates to a venture, the specific obligation dates it
> depends on must be checked against the actual legislation, and any claim that
> would appear in customer-facing copy must be verified independently.

`eur-lex.europa.eu`, `ec.europa.eu`, `www.ftc.gov`, `www.w3.org`, and
`www.federalregister.gov` are all denied. The two highest-ranked candidates in
this directory — [eaa-remediation-pipeline](../../pipeline/candidates/eaa-remediation-pipeline.md)
and [cra-evidence-desk](../../pipeline/candidates/cra-evidence-desk.md) — are built on EU
obligation dates that can only be verified at exactly those hosts.

So the "unverified against primary sources" disclaimer that every document in
this directory carries is not a backlog item that a future session will clear.
**It is structural.** Under the current policy no session can ever clear it, and
therefore no candidate here can ever pass its own graduation gate, regardless of
how it scores or how many probes advance.

`WebSearch` does work, and returns summaries of pages on denied hosts — that is
how this directory's sources were gathered, and it is why every write-up is
sourced to vendor blogs and search snippets rather than to legislation. Summaries
are good enough to rank candidates against each other. The README already says
they are not good enough to act on, which is precisely the standard graduation
requires.

## What this does not claim

- **It does not claim the policy is wrong.** Denying general egress to unattended
  agent sessions that can push commits and spend budget is a defensible default,
  and it is the same boundary
  [channel-inventory.md](../../pipeline/channel-inventory.md) endorses for payment rails.
- **It does not re-open screening**, add a candidate, change a score, or revisit
  any verdict. The intake gate applies to this run and was followed.
- **It is measured in this session's environment.** The remote execution
  environment's network policy is chosen per-environment by the account owner, so
  the correct claim is about this configuration, not about the repo. It is
  consistent with what four prior sessions reported, and with
  channel-inventory.md's note that `docs.github.com` was unreadable.
- **It does not change Ask 7's expected value.** #219's modeled ≈$980/month for
  WordPress.org is untouched here; only the cost side of that ask is restated.

## Recommended restatement of the queue

Replace Asks 3 and 7 with one item:

> **Egress: admit non-registry read-only hosts.** Currently the policy allows
> package registries only. Granting a read-only set — WordPress.org (Ask 7's
> measurement), the four category-sizing sites (Ask 3), and the regulator and
> standards bodies (`eur-lex.europa.eu`, `ec.europa.eu`, `www.ftc.gov`,
> `www.w3.org`) — costs no account, no credential, and no spend. It buys the
> adopter-rate observation Ask 7 was for, *and* it is the precondition for any
> candidate in this directory ever clearing its own graduation gate.

The second half of that is new. Every prior cycle has treated primary-source
verification as deferred work. It is not deferred; it is blocked, by the same
decision that blocks the measurement.

## Status of the claims

Unlike the rest of this directory, the claims here are **primary
observations, not secondary sources** — every row in both tables above was
produced by running the request from this session. They are reproducible with
`curl -sS -o /dev/null -w '%{http_code}' https://<host>/` and should be
re-measured rather than trusted if the environment's network policy has since
changed.
