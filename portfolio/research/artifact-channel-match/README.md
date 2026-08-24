# Ask 0 buys a token for four registries this portfolio has never built for

Added 2026-08-24 by a firing of the screening brief
("research and evaluate potential software business projects that aren't
already here").

**No candidate added, no score changed, nothing in `portfolio/pipeline/`
rewritten.** The `CLAUDE.md` intake gate applies to this run and was obeyed:
this is step one of the gate's own list of useful moves — *advance a probe that
is already specified* — applied to
[`publish-endpoint-reachability`](../publish-endpoint-reachability/), whose own
"Status of the claims" section instructs re-running rather than trusting its
table.

Nothing was published, registered, or signed up for. Read-only requests only;
no credential was sent anywhere.

## The gap this closes

Every prior run in the reachability chain measured **channels**: which registry
hosts answer, which are proxy-blocked, which are one allowlist entry away.
Thirteen channels, thirty-two endpoints, six independent confirmations.

None of them measured the other side of the join — **whether this portfolio has
an artifact that could be published to the channel it is asking for.** The
question was never asked, so its answer was never on the record.

It turns out to matter, because the two sides do not line up.

## Result

`survey.py` walks the repository for build manifests, decides per manifest
whether it is a *publishable package* or an *application*, and joins that
against the per-endpoint verdicts. Raw output:
[results-2026-08-24.json](results-2026-08-24.json).

| ecosystem | channel | publish path (2026-08-24) | publishable pkgs | apps only | on Ask 0's menu |
|---|---|---|---:|---:|:---:|
| Python | PyPI | `BLOCKED_EGRESS_FILTER` | **2** | 4 | no |
| JavaScript/TypeScript | npm | `REACHED 401` | 0 | 18 | no |
| PHP | Packagist | `REACHED 405` | 0 | 0 | **yes** |
| Ruby | RubyGems | `REACHED 401` | 0 | 0 | **yes** |
| Rust | crates.io | `REACHED 404` | 0 | 0 | **yes** |
| Elixir | Hex | `REACHED 200` | 0 | 0 | **yes** |
| .NET | NuGet | `REACHED 404` | 0 | 0 | no |
| Swift | — | no central registry | 0 | 0 | — |
| Monkey C | — | no central registry | 0 | 0 | — |

Three sets, and the portfolio's whole publishing position is the fact that they
are disjoint:

- **Publishable today (artifact *and* open path): NONE.**
- **Built, but publish path blocked: Python.** The only two publishable packages
  in the repository are `eaa-wcag-triage` and `npm-reachability-triage` — both
  probes, both declaring a `[project] name`. PyPI's upload host is the one
  endpoint in the set the filter refuses by name.
- **Publish path open, nothing built: PHP, Ruby, Rust, Elixir, .NET,
  JavaScript/TypeScript.**

## What this means for Ask 0

> **Ask 0 (amended).** One free account signup and a scoped publish token on
> **Packagist or RubyGems** (preferred), or crates.io / Hex.

All four registries on that menu sit in the third set. The repository contains
**zero** `composer.json`, `Gemfile`, `*.gemspec`, `Cargo.toml`, and `mix.exs`
files — not one manifest in any of the four languages.

So: **if the account owner granted Ask 0 tomorrow, there would be nothing to
publish with it.** The token would be live and the shelf empty. Ask 0 is not
wrong about reachability — `publish-endpoint-reachability` measured that
correctly and this run reproduces it exactly, five days later, with no drift —
but it is *insufficient as written*, because it is one half of a join whose
other half is empty. Granting it does not produce a listing; it produces a
token plus a porting project.

That porting cost was never priced, because the join was never made.

## A correction to a claim on `main`

[`publish-endpoint-reachability/README.md`](../publish-endpoint-reachability/README.md)
closes with:

> If the owner would rather spend an egress change than an account signup, the
> `upload.pypi.org` allowlist entry is the single cheapest one on the board —
> but that is **strictly worse than Ask 0**, because PyPI publishing would still
> need a PyPI account and token on top of it.

**"Strictly worse" does not survive this join.** That comparison counted
credentials only:

| | Ask 0 (Packagist/RubyGems) | PyPI route |
|---|---|---|
| Account signup | 1 | 1 |
| Egress change | 0 | 1 |
| **Port an artifact into a language the portfolio has never used** | **1** | **0** |

The PyPI route costs one owner-controlled setting the enforcement layer names
in its own response, and then publishes an artifact **that already exists and is
already tested** — both suites were run green in this session:
`eaa-wcag-triage` **272 passed**, `npm-reachability-triage` **289 passed**.
(Both probe READMEs still quote lower counts, 144 and 282, from earlier passes;
the suites have grown since. Numbers above are this run's, not theirs.) Ask 0
costs one signup and then a reimplementation, in PHP or Ruby, of a probe
currently written in Python — the largest of the three line items and the one
neither route's original framing included.

Which is genuinely cheaper is the owner's call and depends on how they weigh an
egress setting against agent time. The point of this section is narrower and it
is a factual one: **the ranking on `main` was derived from an incomplete cost
model, and should not be read as settled.**

## The npm asymmetry, stated precisely

npm is the one case where an *open* path and a *large* body of code coexist, so
it is worth being exact about why it still yields nothing.

`registry.npmjs.org/-/npm/v1/user` answers `401` from npm itself — the write
path is open and needs only a token, no egress change. The repository holds 18
`package.json` files. **All 18 set `"private": true`,** which is not a
formality: npm refuses to publish such a package outright. They are
applications and internal workspace packages — Next.js sites, a pnpm monorepo's
internal `packages/*` — not libraries anyone was going to install.

This is a real constraint rather than a paperwork one. Making one publishable
means deciding that some slice of a venture is a library with an audience,
naming it, and carving it out. That is a product decision, not a config edit,
and nothing in the pipeline currently proposes it.

npm was excluded from Ask 0's menu on audience-match grounds (#111/#126/#155
found the `mcp` category thinnest there). This run does not contest that
finding and adds nothing to it. It adds only that the artifact-side objection
is *independent* and would apply even if the audience argument reversed.

## What this does and does not establish

**Does:** the four registries in Ask 0 have no artifact in this repository, so
Ask 0 as written cannot produce a listing without a port; and the "strictly
worse" ranking of the PyPI route omitted that port from its cost model.

**Does not:** say which route the owner should pick, or that either produces
*demand*. A publishable artifact plus an open endpoint is still not a customer.
[`registry-audience-match`](../registry-audience-match/) is where the audience
question lives, and this run neither re-measures nor contradicts it. Nor does
this establish that either of the two Python probes *should* be published —
that is a publish-approval decision reserved to the account owner under
`CLAUDE.md`, and this run does not pre-empt it.

**Also unaddressed:** whether a published probe could be *measured*. Two of
Ask 0's channels publish no download number at all (#150's finding, Ask 3).
PyPI's JSON API returns `-1` for every download field, so the PyPI route as
described here publishes into a channel this portfolio cannot read a count
from either. That objection applies to the PyPI route and to parts of Ask 0
alike, and neither this run nor the cost table above resolves it.

> **Resolved the same day, and it cuts against the cost table above.**
> [`demand-signal-reachability`](../demand-signal-reachability/) measured the
> `stats` gate this paragraph declined to. The `-1` is confirmed on two projects
> and two windows; every zero-credential PyPI count surface is egress-denied
> (pypistats.org, pepy.tech, clickpy, piwheels); and the one route that answers,
> BigQuery, needs a billing-enabled cloud account. The cost table above priced
> Ask 0's missing port and not the PyPI route's **two** missing gates, so it is
> one-sided in the opposite direction to the ranking it corrects. Both
> corrections stand, and the conclusion from the pair is that **neither route is
> one action away**.

## Reproducing

```
python3 survey.py                                       # survey + join, print
python3 survey.py --out results-YYYY-MM-DD.json         # ... and save
python3 survey.py --recompute-from results-2026-08-24.json   # offline re-derive
python3 -m unittest discover                            # 23 tests
```

`survey.py` is read-only, stdlib-only, and makes **no network calls at all** —
it reads verdicts from a saved `publish-endpoint-reachability` result rather
than re-probing, so the two halves of the join can drift independently and
visibly. Re-run that probe (`probe.py`) to refresh the channel side.

## Status of the claims

- The **artifact side** is a fact about this repository at commit time and will
  change the moment anyone adds a manifest. Re-run `survey.py`.
- The **channel side** was re-measured live on 2026-08-24 and reproduced
  `publish-endpoint-reachability`'s 2026-08-19 table endpoint for endpoint, with
  no drift in any of the 32 verdicts. Saved as
  [`results-2026-08-24.json`](../publish-endpoint-reachability/results-2026-08-24.json)
  alongside the original, which is left untouched as the 08-19 record.
- Every verdict remains **environment-scoped and time-scoped**: egress policy is
  a per-environment setting the owner controls and can change at any time.

## Ledger

This run's outcome is recorded in `portfolio/ledger/2026-08.yaml` in the same
pull request, which is self-merged as agent-decidable internal work under
`CLAUDE.md` — so the bundling hazard that rule exists to prevent (a
decision-pending PR going un-mergeable within the hour) does not apply here.
The Ask 0 correction is additionally recorded as a comment on issue #139, since
that is where the ask itself lives.
