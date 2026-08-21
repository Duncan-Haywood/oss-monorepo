# Forge surface reachability

**Measured 2026-08-21. 20 code forges plus a control, each surface probed
separately. Anonymous read-only requests; no credential sent, no account, no
publication, no spend.**

Reproduce:

```
python3 probe_forges.py --probe --as-of 2026-08-21 -o results-2026-08-21.json
python3 search_registers.py --search --as-of 2026-08-21 -o register-search-2026-08-21.json
```

Re-derive every table below with no network at all:

```
python3 probe_forges.py     --recompute-from results-2026-08-21.json
python3 search_registers.py --recompute-from register-search-2026-08-21.json
python3 -m unittest discover -s portfolio/research/forge-surface-reachability   # 22 tests
```

## The question

[`egress-reachability/`](../egress-reachability/) closed with a methodological
rule and an amendment that found a new surface:

> A verdict belongs to a surface and never to a host, and a recorded denial is
> only as broad as the surface it was measured on.
>
> **Amended 2026-08-20:** the three GitHub scope-denials are verdicts about the
> *HTTP* surface. Git's smart-HTTP transport is a fourth surface and is not
> scoped — full-history `git clone` of repositories this session has no scope
> over succeeds.

That amendment was measured on **one forge**: its results file
([`git-surface-2026-08-20.json`](../egress-reachability/git-surface-2026-08-20.json))
holds three targets, all `github.com` or `codeload.github.com`. It is correct
about GitHub and it is one sentence away from being read as *"git works"* — and
[`register-change-rate/`](../register-change-rate/) had already begun building on
it, correctly, by cloning nine GitHub mirrors.

Whether git is a *transport the environment permits* or a *surface that happens
to be allowed on one host* is not a detail. It decides which primary sources a
product built here can read, and it is one command to check. Nobody had.

## Result: git is allowlisted host-by-host, exactly like HTTP

| | count |
|---|---:|
| forges probed | 20 |
| git surface **reachable** | **4** |
| git surface **egress-denied** | **16** |
| hosts whose surfaces disagree with each other | 1 (GitHub) |
| control (`example.com`) denied on every surface | yes |

| Host | Forge | `git` | `api` | `raw` |
|---|---|---|---|---|
| `github.com` | GitHub | reachable | **scope_denied** | reachable |
| `codeload.github.com` | GitHub archive | reachable | — | — |
| `gitlab.com` | GitLab.com | reachable | **reachable** | **reachable** |
| `bitbucket.org` | Bitbucket Cloud | reachable | reachable | reachable |
| `codeberg.org` | Codeberg (Forgejo) | egress_denied | egress_denied | — |
| `gitea.com` | Gitea | egress_denied | egress_denied | — |
| `git.sr.ht` | SourceHut | egress_denied | — | — |
| `salsa.debian.org` | Debian Salsa | egress_denied | egress_denied | — |
| `gitlab.gnome.org` | GNOME | egress_denied | egress_denied | — |
| `gitlab.freedesktop.org` | freedesktop.org | egress_denied | — | — |
| `framagit.org` | Framagit | egress_denied | — | — |
| `invent.kde.org` | KDE Invent | egress_denied | — | — |
| `opendev.org` | OpenDev | egress_denied | — | — |
| `git.kernel.org` | kernel.org cgit | egress_denied | — | — |
| `git.savannah.gnu.org` | GNU Savannah | egress_denied | — | — |
| `git.launchpad.net` | Launchpad | egress_denied | — | — |
| `git.code.sf.net` | SourceForge | egress_denied | — | — |
| `huggingface.co` | Hugging Face datasets | egress_denied | — | — |
| `android.googlesource.com` | Google Git | egress_denied | — | — |
| `go.googlesource.com` | Go (Gerrit) | egress_denied | — | — |
| `example.com` | **CONTROL** | egress_denied | egress_denied | — |

Four of five GitLab Community Edition instances are denied while `gitlab.com` is
reachable, so the allowance tracks **the host**, not the forge software and not
the protocol. `git` gets no special treatment; it is simply another surface, and
the four hosts where it answers are hosts this environment already allows.

**What this corrects.** Nothing in the prior finding was wrong. But "git is a
fourth surface and is not scoped" describes GitHub's *scope* gate, not the
*egress* gate, and the two are different mechanisms — the sixteen denials above
are all egress, at CONNECT, identical to the control. A session that reads the
amendment as licence to reach arbitrary git hosts will be wrong sixteen times
out of twenty. Three of the denied hosts are ones a data-hungry candidate would
reach for first: `huggingface.co` (whose datasets are git repositories, and
which the 92-host table records as HTTP-denied — now confirmed denied on git
too), `git.kernel.org`, and the Google Gerrit hosts.

## The one genuinely new capability: GitLab.com is fully reachable

`gitlab.com` sits in the 92-host table as `reachable`, measured against
`https://gitlab.com/` — the bare root, and nothing below it. No surface beneath
it had ever been probed, and no conclusion was ever drawn from the row.

All three of its surfaces answer:

- **git** — anonymous `ls-remote` and blobless `clone` of unrelated public
  repositories.
- **`/api/v4/`** — answers `200` anonymously, with **no token**, including
  full-text project search over public projects.
- **raw file** — `200`.

That makes GitLab.com **the only forge in the table reachable on every surface.**
GitHub is the reverse case and the only host whose surfaces disagree: reachable
on git, scope-denied on its REST and archive surfaces.

### Applying it: a named open question in `register-change-rate`, retired

That directory ends by naming its own weakest claim and the reason it could not
be fixed:

> The finding that no licensing, permitting, or safety register mirrors to git is
> the weakest claim here and is stated as "none found by hand" throughout. **A
> real answer needs repository search, which is scope-denied from this session**
> — if that is ever granted, this probe takes a longer target list unchanged.

Repository search is scope-denied *on GitHub*. It is not denied on GitLab.com.
`search_registers.py` runs 22 terms across the three verticals
[`public-record-watch`](../../pipeline/candidates/public-record-watch.md) names,
plus three control terms on the software-security vertical where
`register-change-rate` *did* find live mirrors:

| Vertical | terms | raw hits | keyword "data-like" | register mirrors, hand-read |
|---|---:|---:|---:|---:|
| **control** (software-security) | 3 | 40 | 38 | **yes — see below** |
| public-office | 5 | 35 | 5 | **0** |
| sanctions | 5 | 26 | 6 | **0** |
| device-safety | 5 | 32 | 0 | **0** |
| licensing / permitting | 4 | 34 | 10 | **0** |

Zero terms errored. **The control found real register data**, which is what
makes the four zeros evidence rather than a broken query.

**The `data-like` column over-counts badly and the hand-read column is the
answer.** It is a keyword filter (`data`, `registry`, `register`, `mirror`, …)
and on the licensing rows it matched ten projects that are all software-*licence*
collisions — `cryptavault` ("AGPL-3.0+ licensed"), `olm-converter-software` ("a
professional tool"), `brandfuzzysearch-llm`. The column is kept because it is
what the script computes and a reviewer should see the same number the code
produces, not a number the prose asserts.

Read by hand, the candidate-vertical hits are hobby projects and dead scrapers:
the newest sanctions hit is `tibhar940/ofac`, last touched **2022-03-14**; the
only topically-correct licensing hit is `crocokyle/HIState-ProLicense-Scraper`,
last touched **2021-01-16**; `github-mirroring-2021/bigger312--Sanctions-Lists`
is a mirror of a mirror that stopped in 2021. Not one is an official register,
and not one is live.

**So `register-change-rate`'s weakest claim survives the first real search
anybody has been able to give it.** That is worth landing precisely because it
is a negative result: the next session to notice that gap now finds it checked
rather than re-deriving the same search. The claim is *strengthened, not
settled* — GitLab.com is one corpus, GitHub's search is still scope-denied, and
sixteen forges cannot be searched at all. The honest form of the finding is now:

> No official licensing, permitting, safety, sanctions or public-office register
> mirrors to git — none found by hand on GitHub, and none found by **search** on
> GitLab.com.

### A second reachable advisory corpus, as a by-product

The control terms surfaced
[`gitlab-org/security-products/gemnasium-db`](https://gitlab.com/gitlab-org/security-products/gemnasium-db),
which is live and clonable from here: a blobless `--depth 400` clone lands in
seconds and carries per-CVE YAML sharded by ecosystem
(`go/github.com/axllent/mailpit/CVE-2026-67447.yml`), with changes on **at least
17 distinct days** in the trailing 180 (a floor, not a count — the clone was
depth-capped, so older commits inside the window were not fetched).
`gitlab-org/advisories-community` is a second, also live.

[`substitute-supply/`](../substitute-supply/) and the
[2026-08-20 rescore](../../pipeline/rescore-2026-08-20.md) both record
`cra-evidence-desk`'s archive half as "public advisory data." This is one more
independent, reachable instance of exactly that, on a host nobody had looked at
— which makes the *defensibility* reading stronger, not weaker, and is recorded
here for that reason rather than as an opportunity.

## What this does **not** change

**No score moves, and that is deliberate.** The 2026-08-20 rescore wrote down
the category error this directory could most easily commit, and it applies
verbatim:

> The egress policy constrains **what an agent session in this sandbox can build
> and measure**. It says nothing about what a deployed product could fetch from
> ordinary hosting. […] reachability belongs in `time_to_revenue` reasoning at
> most.

Everything above is a fact about this environment on 2026-08-21. A product
deployed on ordinary hosting reaches Codeberg and `huggingface.co` fine. Nothing
here is evidence about any candidate's market, and nothing here is a new
candidate — [CLAUDE.md](../../../CLAUDE.md)'s intake gate is closed and this pass
adds nothing to `portfolio/pipeline/candidates/`.

**No new ask for the account owner.** This is strictly a narrowing of what was
already believed, plus one surface that turned out to be open without anyone
granting anything. Issue #139's queue is unchanged by it.

## Status of these claims

Measurements of **these 20 hosts and 22 search terms on 2026-08-21**, from this
environment. Every request was an anonymous read. Nothing was published,
registered, signed up for, cloned with write access, or paid for; no credential
was sent — `probe_forges.py` sets `GIT_TERMINAL_PROMPT=0` and an empty credential
helper specifically so that an origin's auth demand is recorded as *reachable*
rather than answered.

The denial classifier is lifted verbatim from
[`egress-reachability/consolidate.py`](../egress-reachability/consolidate.py),
including its finding that an egress denial can arrive **as a real HTTP 403**
that a status code alone cannot distinguish from an origin's own 403. Five tests
pin that behaviour. The control (`example.com`) is denied on every surface, which
is the only reason any denial above is evidence about its host — per
[`primary-source-egress/`](../primary-source-egress/), whose whole finding was
that nobody had run one.

The weakest claim here is the register search: one corpus, one day, 22 terms
chosen by hand. A term this pass did not think of would not appear, and the
`data-like` filter demonstrably over-matches. It is stated as "none found by
search on GitLab.com" everywhere above, and never as "none exist."
