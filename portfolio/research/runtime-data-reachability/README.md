# Runtime data reachability

**Measured 2026-08-20. No credential, no account, no spend — read-only GETs.**

Reproduce: `python3 probe_reachability.py --json results-2026-08-20.json`
Raw output: [results-2026-08-20.json](results-2026-08-20.json).

## The question this asks, and why it is a third question

Three different reachability questions have now been asked about this
environment. They are not the same question and they do not have the same
answer:

| | Question | Asked by | Answer |
|---|---|---|---|
| 1 | Can we **publish** to a channel? | #166, #177 | Yes — eight registries, publish endpoints answer |
| 2 | Can we **verify a claim** against its primary source? | #232, #139 §2c | No — legal/standards hosts denied |
| 3 | Can the product **fetch its own input data**? | *this note* | Only for one of eight candidates |

Question 3 was never asked. It decides something the other two do not: whether
an agent session can build and test the thing at all. A candidate can be
publishable (1) and still be impossible to develop, because the data it
operates on cannot be fetched.

## Method

Every probe distinguishes three outcomes, and the distinction is the whole
measurement:

- **`origin_answered`** — any HTTP status came back from the host itself. The
  host is permitted. A 403/404 here is an origin-side answer (auth, path,
  user-agent), **not** a network denial.
- **`proxy_denied`** — `CONNECT tunnel failed, response 403`. The egress
  gateway refused the tunnel. No credential changes this from inside a session.
- **`scope_denied`** — the host answered, but the session's GitHub proxy
  refused the path: *"sessions are bound to their configured repositories."*
  Reachable host, unreachable data.

The user-agent matters and is a live trap for this measurement: **crates.io
answers `403` to curl's default UA**, which reads identically to a policy
denial if you only look at the status code. An earlier pass in this session
recorded crates.io as blocked for exactly that reason before re-probing with a
descriptive UA returned `200`. Any future probe should assume a bare status
code is not sufficient evidence of a denial.

## Result: the allowlist is "package registries, plus this repo"

24 targets probed — **7 reachable, 16 denied by egress policy, 1 scope-denied.**

Reachable (`origin_answered`): `registry.npmjs.org`, `pypi.org`,
`api.github.com` (this repo only), `crates.io`, `rubygems.org`,
`repo.packagist.org`.

Denied, in full: `example.com`, `www.wikipedia.org`, `www.gov.uk`,
`www.shopify.com`, `shopify.dev`, `wordpress.org`, `api.wordpress.org`,
`api.osv.dev`, `services.nvd.nist.gov`, `www.w3.org`, `www.etsi.org`,
`ted.europa.eu`, `api.sam.gov`, `docs.peppol.eu`, `www.courtlistener.com`,
`eur-lex.europa.eu`, `www.federalregister.gov`.

The gateway's own status endpoint (`$HTTPS_PROXY/__agentproxy/status`) reports
these as `connect_rejected` / *"gateway answered 403 to CONNECT (policy denial
or upstream failure)"*, and lists a direct-connect bypass set that is itself
entirely package registries: npm, jsr, PyPI, files.pythonhosted.org,
index.crates.io, proxy.golang.org.

So the policy is not "a few hosts happen to be missing." It is an allowlist
whose shape is **package registries and this repository**. Wikipedia is denied.
`gov.uk` is denied. There is no category of general web access.

**`WebFetch` is not a way around it.** Tested this session against
`eur-lex.europa.eu` and `example.com`: both return `EGRESS_BLOCKED` from the
same policy. Prior sessions established the block with `curl` only; the tool
path is now tested too and behaves identically. `WebSearch` still works, but
`portfolio/pipeline/README.md`'s own graduation standard explicitly does not
accept search summaries as primary-source verification.

## What this means per candidate

Each candidate's **runtime input feed** — the data the product reads in order
to produce what the customer pays for — classified against the measurement.

| # | Candidate | Runtime feed it needs | Reachable? |
|---|---|---|---|
| 1 | eaa-remediation-pipeline | the customer's own pages (arbitrary hosts) + WCAG/EN 301 549 | **No** |
| 2 | shopify-a11y-evidence | merchant storefronts (arbitrary hosts) + Shopify APIs | **No** |
| 3 | mcp-supply-chain-watch | npm, PyPI, GitHub repos | **Yes** |
| 4 | cra-evidence-desk | manifests (yes) + vulnerability feed (OSV/NVD/GH advisories) | **Partial — no vuln feed** |
| 5 | public-record-watch | court/permit portals | **No** |
| 6 | agent-permission-harness | local; parked | n/a |
| 7 | tender-radar | TED, SAM.gov | **No** |
| 8 | einvoice-preflight | Peppol / EN 16931 rules | **No** |

Two details are worth stating rather than leaving inside the table:

- **Candidates 1 and 2 need arbitrary-host fetching**, which is the one thing
  an allowlist categorically cannot provide. They are not blocked on a missing
  host that could be added; scanning customer sites means fetching hosts nobody
  can enumerate in advance. This is a different and harder blocker than Asks
  3/7, which each name a finite host list.
- **Candidate 4 has no reachable vulnerability feed at all.** OSV and NVD are
  proxy-denied, and GitHub's global advisories endpoint is scope-denied because
  sessions are bound to this repository. SBOM *generation* works; the CRA
  evidence record's other half does not.

## The retrospective test, which is what makes this more than an inventory

If this constraint is real, it should already have shaped the repo's history
without anyone naming it. It did.

Of the eight candidates, **exactly one has ever had a probe actually advance
on measured data: `mcp-supply-chain-watch`** (#207 — 152 real tool-description
changes classified, alert volume measured, AI-leverage rescored 7→6 *by
measurement*). That is also the only candidate whose runtime feed is fully
reachable.

Every other probe in this directory's history stalled into an owner ask.
The pipeline recorded that as a distribution and credential problem. Part of it
was: the data the work needed could not be fetched. The one candidate that
progressed is the one whose data was on the allowlist — and nobody noticed the
correlation because nobody had measured the allowlist.

## Scope: what this does and does not claim

**Does not claim these are bad businesses.** Reachability here is a fact about
*this execution environment*, not about the market, the margin, or the idea. A
production deployment on ordinary hosting would have unrestricted egress and
could scan customer sites normally. Nothing above rescores any candidate on the
pipeline's eight dimensions, and no score is changed.

**Does claim there is currently no environment in this portfolio where five of
these eight can be built or run.** Agent sessions cannot reach the data
(measured above), and there is no working deployed environment either — the
Cloudflare Pages deploy fails on a missing `CLOUDFLARE_API_TOKEN` (#139 Ask 4)
and GitHub Pages has no source configured (Ask 6). Both halves are currently
true at once. That is a statement about the portfolio's build capability today,
and it is fixable, not a permanent property of the candidates.

**Does not propose new automation** and adds no candidate — the `CLAUDE.md`
intake gate applies and was followed.

## Consequence for the ask queue on #139

This does not add an ask. It reprioritises the ones already there, on evidence
rather than on the revenue model that currently orders them.

Ask 7 (`api.wordpress.org`) is listed as the cheapest ask, justified by #219's
modelled ≈$980/mo — which #225 has since revised downward pending an actual
WordPress.org measurement. It buys **one demand measurement**.

The same policy decision, taken one step wider, buys the ability to *build*
five candidates instead of one. Asks 3 and 7 are already known to be the same
underlying policy rule (#232). This measurement shows that rule is also what
blocks: the graduation gate (§2c), `cra-evidence-desk`'s vulnerability feed,
and — for candidates 1 and 2 — the product's core loop.

So the question worth putting to the account owner is not "may we add
`api.wordpress.org`" but:

> **Should agent sessions get general read-only outbound HTTP, or does the
> portfolio accept that it can only build businesses whose input data is a
> package registry?**

Both answers are legitimate. The narrow allowlist is a real security posture
with a real benefit, and "we only build registry-data businesses" is a coherent
strategy — it happens to describe the one candidate that has actually
progressed. What is not sustainable is the current state, where five candidates
sit ranked "build now" or "probe" in a directory whose own environment cannot
fetch a single byte of what they operate on, and each cycle re-derives a
distribution explanation for it.

If the answer is the narrow allowlist, then the honest consequence is that
candidates 1, 2, 5, 7 and 8 should be re-marked as blocked-by-environment
rather than left at "build now" — and the pipeline's ranking should be led by
`mcp-supply-chain-watch` and the reachable half of `cra-evidence-desk`.

## Status of these claims

Unlike the rest of `portfolio/pipeline/`, **this note is a direct measurement,
not secondary-source research.** Every row is reproducible in this environment
by running the script. The caveats are:

- Egress policy can change without notice; re-run the script rather than
  trusting this file's date.
- Reachability was tested at one endpoint per host. A host that answers on one
  path may be rate-limited or auth-walled on the path a real product needs.
- `origin_answered` proves the network path, not that the data is usable,
  licensed, or permitted by the host's terms for a commercial product. That is
  a separate check every candidate still owes.
