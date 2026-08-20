# Data reachability: what this environment can actually fetch

Measured 2026-08-20 by a scheduled run of the screening brief, which per
`CLAUDE.md`'s intake gate added no candidate. Reproduce with
`python3 probe_reachability.py`; raw output in
[results-2026-08-20.json](results-2026-08-20.json).

## Why this was run

Four prior passes measured egress by probing a feed's **canonical host** — its
API endpoint or its human-facing website — and marking the feed unreachable
when that host was denied. #232 characterised the result as "a general
non-registry-egress policy". #240 concluded that only `mcp-supply-chain-watch`
could fetch its own runtime input data. Issue #139 §2d turned that into a
strategy question for the account owner: *general read-only outbound HTTP, or a
portfolio that only builds registry-data businesses.*

#250 then found a counter-example — npm advisory data is reachable as bulk and
git distribution even though the OSV API is denied — and recorded the lesson as
"prior passes tested API endpoints, not the git distribution of the same data."
It applied that lesson to one candidate and stopped.

This pass tests it as a **rule**: for each feed, probe every distribution
channel it publishes, not just the canonical one. A feed is reachable if any
channel carrying the same data answers. That found two more reachable feeds and
a materially different description of the policy.

## The policy shape

The denial is not "non-registry". It is **general-web hosts denied,
code/package/object-storage infrastructure allowed**:

| Reachable (CONNECT succeeds) | Denied at CONNECT |
|---|---|
| `registry.npmjs.org`, `pypi.org`, `index.crates.io`, `proxy.golang.org` (these bypass the proxy entirely — see `noProxy` in `$HTTPS_PROXY/__agentproxy/status`) | `example.com` — the control |
| `storage.googleapis.com`, `s3.amazonaws.com` | `eur-lex.europa.eu`, `ec.europa.eu`, `publications.europa.eu`, `data.europa.eu`, `ted.europa.eu`, `euvd.enisa.europa.eu` |
| `raw.githubusercontent.com`, `api.github.com`, `github.com`, `codeload.github.com` | `www.w3.org`, `www.cisa.gov`, `www.federalregister.gov`, `services.nvd.nist.gov` |
| `gitlab.com` | `api.wordpress.org`, `epss.empiricalsecurity.com`, `huggingface.co` |

Two distinctions that earlier passes conflated, and that matter:

- **A `403` from GitHub is not an egress denial.** `github.com`,
  `api.github.com`, and `codeload.github.com` complete the CONNECT
  (`HTTP/1.1 200 Connection Established`) and then return a GitHub-side scope
  message: *"GitHub access to this repository is not enabled for this
  session."* That is this session's repo scoping, not the network policy.
  Genuine egress denials never complete the CONNECT and are logged as
  `connect_rejected` at `$HTTPS_PROXY/__agentproxy/status`, which is the
  authoritative way to tell the two apart.
- **`raw.githubusercontent.com` is not repo-scoped.** It served
  `w3c/wcag`, `cisagov/kev-data`, and `pypa/advisory-database` — all public
  repos unrelated to this one — at `200`, while `api.github.com` refused the
  same repos. Any dataset published to a public git repository is therefore
  readable here, which is the single widest door in the current policy.
- **A redirect is an answer.** An earlier version of this script followed
  redirects and so reported `s3.amazonaws.com` and `gitlab.com` as unreachable
  when both in fact answered — with a redirect to a host that is itself denied.
  The committed script no longer follows redirects.

## `WebFetch` is governed by the same policy

Untested until now, and worth closing because issue #139 §2c rests on it: the
harness's own `WebFetch` tool is subject to the identical policy, not a
separate route. `WebFetch` on `eur-lex.europa.eu` returns
`{"error_type":"EGRESS_BLOCKED"}`; the same tool on
`raw.githubusercontent.com` succeeds, so the failure is policy, not a broken
tool. §2c's conclusion — that the pipeline's own graduation gate (verifying EU
obligation dates against primary sources) is unsatisfiable under the current
policy — holds through **every** route available to a session, not just `curl`.

## Feeds that turned out to be reachable

### OSV, at canonical scope — not just the npm slice

`api.osv.dev` is denied, but the canonical bulk distribution at
`osv-vulnerabilities.storage.googleapis.com` answers, and it carries the whole
database: **102 ecosystem prefixes**, including all eight that matter to this
portfolio.

| Ecosystem | `all.zip` | Last modified (UTC) |
|---|---|---|
| npm | 219.97 MB | 2026-08-20 04:34 |
| PyPI | 33.61 MB | 2026-08-20 04:19 |
| Go | 11.24 MB | 2026-08-20 03:49 |
| Packagist | 10.32 MB | 2026-08-19 20:08 |
| Maven | 10.06 MB | 2026-08-19 21:48 |
| RubyGems | 4.36 MB | 2026-08-18 20:34 |
| crates.io | 3.38 MB | 2026-08-20 04:19 |
| NuGet | 2.51 MB | 2026-08-18 18:19 |

Refreshed hours before this measurement, not a stale dump. Content checked
rather than assumed — the npm archive holds **227,118 advisory records**, and
of a 400-record sample **399 carry a severity** and **393 carry structured
fixed-version ranges**, which is the field SBOM matching actually needs. This
is a materially richer feed than the `registry.npmjs.org` advisories-bulk
endpoint #250 found, which is npm-only and returns a flat `vulnerable_versions`
string with no cross-ecosystem coverage.

### CISA KEV, via its git mirror

`www.cisa.gov` is denied; `cisagov/kev-data` on `raw.githubusercontent.com`
answers with catalog version **2026.08.19**, **1,671 entries**, most recent
addition dated the day before this run. That is the actively-exploited signal
the CRA's Article 14 clock is keyed to, and nothing prior recorded it as
available.

### WCAG and axe-core rule definitions, via git

`www.w3.org` is denied; `w3c/wcag` and `dequelabs/axe-core` both serve over
`raw.githubusercontent.com`.

## Feeds still unreachable by any channel tested

EUVD/ENISA, EUR-Lex and every other EU institutional host, the US Federal
Register, NVD, EPSS, TED, and `api.wordpress.org`. Each publishes only to its
own website or API; none distributes to package, git, or object-storage
infrastructure. No allowlist-free route exists for these, and searching for one
is now a closed question rather than an open task.

## Honest limits of this result

- It measures **reachability, not value**. Nothing here produces a customer, a
  price, or a dollar. The portfolio's bottleneck is still distribution and
  customer contact, exactly as `portfolio/pipeline/distribution-first.md` says.
- The sampled OSV field statistics are from 400 of 227,118 npm records, chosen
  as the archive's first entries rather than at random. They are strong enough
  to establish the fields exist and are populated, and not a quality audit.
- Reachability today is not a guarantee for tomorrow. The policy is the account
  owner's to change, and these hosts are allowed by it rather than by promise.
