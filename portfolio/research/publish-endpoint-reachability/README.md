# Publish-endpoint reachability: what "denied" actually means, per endpoint

Added 2026-08-19 by the eighteenth firing of the screening brief.

**No candidate added, no score changed, nothing in `portfolio/pipeline/` touched.**
The `CLAUDE.md` intake gate applies to this run and was obeyed. This is step
one of the gate's own list of useful moves — *advance a probe that is already
specified* — applied to **Ask 0**, the demand measurement six cycles have
escalated to the account owner.

Nothing here was published, registered, or signed up for. Read-only requests
only; no credential was sent anywhere.

## The claim this tests

Ask 0 (tracked in #139, narrowed by #155) asks the owner for one free account
signup and a scoped publish token on **Packagist or RubyGems** — preferred over
crates.io and Hex, with Docker Hub struck off — on the stated basis that it
needs **no egress change**.

That "no egress change" is a load-bearing assumption and it had never been
tested against the endpoints a publish actually uses. Every reachability
measurement in the chain so far probed *read* surfaces: registry search APIs,
package metadata, download counts. A registry can serve its search API from a
CDN that policy allows while its upload host sits behind a different name that
policy does not — which is exactly what PyPI turns out to do here.

## Method: three outcomes, not two

The chain's earlier probes recorded a binary — reachable or `EGRESS_DENIED`.
There are three distinguishable states, and the difference decides who can fix
what:

| Verdict | How it presents | Who can change it |
|---|---|---|
| `BLOCKED_PROXY_CONNECT` | `curl` reports `CONNECT tunnel failed, response 403`; no origin response exists | Account owner, via the environment's network egress policy |
| `BLOCKED_EGRESS_FILTER` | An HTTP 403 carrying `x-deny-reason: host_not_allowed` | Account owner, same setting — these are hosts in the proxy's `noProxy` list, so they bypass the proxy and meet the filter directly |
| `REACHED` | The origin answered. `200`, `401`, `403`, `404`, `405`, `410` are all the *origin's* opinion | Nobody — the network path is already open |

The two blocked forms look identical if you only record a status code, and
`REACHED 403` looks identical to a denial if you only record a status code.
Conflating them is what produced the chain's "npm account uncreatable" and
"crates.io blocked" readings, both of which are corrected below.

**A cheap oracle nobody had used.** The proxy publishes its own configuration:

```
curl -sS "$HTTPS_PROXY/__agentproxy/status"
```

Its `noProxy` field lists the hosts exempted from policy — on this environment:
`registry.npmjs.org`, `jsr.io`, `npm.jsr.io`, `pypi.org`,
`files.pythonhosted.org`, `index.crates.io`, `proxy.golang.org`. That is the
dependency-installation allowlist, and reading it costs one call rather than
probing hosts one at a time. Note that exemption from the *proxy* is not the
same as reachable: `jsr.io` is in `noProxy` and is still refused, by the filter
behind it.

`probe.py` in this directory implements the classification. It re-derives its
summary offline from saved output:

```
python3 probe.py                                  # probe live, write results.json
python3 probe.py --recompute-from results.json    # offline, no network
```

## Result

32 endpoints across 13 channels. Raw output: [results.json](results.json).

### Ask 0's menu, at the endpoint a publish would use

| Menu item | Write/auth endpoint | Verdict | Reading |
|---|---|---|---|
| **Packagist** | `packagist.org/api/create-package` | `REACHED 405` | Endpoint exists and rejects `GET` on a `POST`-only route. Network path open |
| **RubyGems** | `rubygems.org/api/v1/gems` | `REACHED 401` | Origin answers *"Access Denied. Please sign up for an account at https://rubygems.org"*. A missing credential is the only thing in the way |
| **crates.io** | `crates.io/api/v1/crates/new` | `REACHED 404` | `404` is `GET` on a `PUT` route. Open — see the correction below |
| **Hex** | `hex.pm/api/packages` | `REACHED 200` | API open, **but `repo.hex.pm` is `BLOCKED_PROXY_CONNECT`** |

**Ask 0's two preferred targets are confirmed at the layer that matters.** The
"no egress change" claim holds for Packagist and RubyGems. That is the finding
this run was after: the ask in front of the owner is correctly specified and
does not need widening.

### Two corrections to readings on the record

**crates.io was never network-blocked.** A request without a descriptive
`User-Agent` gets `403 {"errors":[{"detail":"We are unable to process your
request at this time..."}]}` — crates.io's documented crawler policy. The same
request with a `User-Agent` set returns `404`, the ordinary method mismatch.
Any probe that read the bare `403` as an egress denial misattributed it. `probe.py`
sets a `User-Agent` for this reason.

**Hex belongs on the menu with a caveat.** `hex.pm`'s API is reachable, but the
tarball host `repo.hex.pm` is proxy-blocked, so a package published to Hex could
not be fetched back and verified from this environment. That is a weaker problem
than Docker Hub's closed namespace (#155) — it does not corrupt the measurement,
it only means the publish could not be self-verified from here. Prefer Packagist
or RubyGems, which have neither issue.

### PyPI: install allowed, publish denied, and the fix is named in the response

`pypi.org` and `files.pythonhosted.org` are both exempted and reachable.
`upload.pypi.org` is not, and the filter says so in as many words:

> `Host not in allowlist: upload.pypi.org. Add this host to your network egress
> settings to allow access.`

This is the concrete form of the chain's inference that *"24 of 31 hosts are one
allowlist entry away."* The enforcement layer names the remedy and the setting.
The asymmetry is not an accident: this environment is provisioned to **install**
dependencies, not to **publish** them, and PyPI is the clearest case because it
splits those two functions across different hostnames.

### npm: write path open, audience question untouched

`registry.npmjs.org` is in `noProxy` and answers its authenticated surface —
`/-/whoami` and `/-/npm/v1/user` both return `401 {"error":"Unauthorized"}` from
npm itself. That is the same host `npm publish` writes to. So npm's publish path
is open from here and would need only a token, no egress change.

Recording this as a fact, **not** as a proposal to add npm to Ask 0's menu.
npm is off that menu for a separate, measured reason — #111, #126 and #155 found
the category thinnest on npm and crates.io, which is an audience-match argument
this run did not re-measure and does not contest. Reachability is necessary,
not sufficient, and the two objections are independent.

Separately: `www.npmjs.com/signup` returns `REACHED 403` — the origin's bot
protection, not a network denial. The practical consequence is unchanged (an
agent cannot self-serve an npm account from here, and should not), but the
earlier reading that this was an egress block is wrong, and the distinction
matters because one is the owner's setting and the other is npm's.

### Channels confirmed blocked, no change

`wordpress.org`, `plugins.svn.wordpress.org`, `login.wordpress.org`,
`open-vsx.org`, `api.open-vsx.org`, `marketplace.visualstudio.com` — all
`BLOCKED_PROXY_CONNECT`. This **reproduces** the refutation in #126/#137/#166 of
`channel-inventory.md`'s "free, agent-listable: Yes" ratings, by a different
method. Those three channels remain unreachable, and they are unreachable by
owner-controlled policy rather than by anything structural.

## What this does and does not establish

**Does:** the network path to Packagist's and RubyGems' publish endpoints is
open, so Ask 0 as currently written is executable the moment a token exists, and
needs no egress change bundled with it.

**Does not:** a reachable endpoint is not a completed publish. A real publish
sends a token and an artifact and can still fail on account age, publish-time
2FA, name policy, or rate limits — none of which can be tested without an
account, and testing them is not this session's to do. Treat this as *"the
network is not the blocker"*, which is the specific thing that was uncertain,
and nothing more.

Also unaddressed here: whether a listing on Packagist or RubyGems would draw
enough traffic to separate demand from noise. That is #155's question, its
answer favours these same two registries, and this run adds nothing to it.

## Net effect on the owner's queue

**No new ask. Ask 0 is unchanged and now better evidenced.** The one substantive
change is to a caveat: Hex should carry the `repo.hex.pm` note if it is ever
chosen, and crates.io's earlier "blocked" reading should not count against it.

If the owner would rather spend an egress change than an account signup, the
`upload.pypi.org` allowlist entry is the single cheapest one on the board — but
that is strictly worse than Ask 0, because PyPI publishing would still need a
PyPI account and token on top of it. Noted only so the option is visible, not
recommended.

## Status of the claims

Measured from this environment on 2026-08-19, against live hosts, with raw
output saved in [results.json](results.json). Two limits:

- **Every verdict is environment-scoped and time-scoped.** Egress policy is a
  per-environment setting the owner controls and can change at any time; a
  future session may measure differently without anything having "broken."
  Re-run `probe.py` rather than trusting this table.
- **Origin-side status codes drift.** Bot-protection rules, retired endpoints,
  and CDN behaviour change without notice. `rubygems.org/api/v1/api_key`
  already answers `410 This endpoint has been retired`, which is a reminder that
  the endpoint inventory ages faster than the verdicts do.

## Ledger

Deliberately **no `portfolio/ledger/2026-08.yaml` hunk**, per `CLAUDE.md` — a
bundled ledger entry is what made five consecutive decision-pending PRs
un-mergeable within the hour. Following #155's precedent, this session is
constrained to a single designated branch and so cannot ship the entry on a
second branch; **this run's ledger entry is therefore not recorded anywhere.**
Flagged rather than bundled, so the gap is visible instead of being paid for
with this document's mergeability.
