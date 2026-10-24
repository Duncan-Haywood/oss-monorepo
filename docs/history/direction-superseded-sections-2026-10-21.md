# Sections cut from portfolio/DIRECTION.md (2026-10-21)

Verbatim, for the record (backlog P036 part 2). Both described a state that no longer holds: the deploy-first priority (GitHub Pages is live) and a Sept 2026 note about repeated direction-only PRs.

## Before rewriting this brief again, read this (added 2026-09-07)

If a session's brief is "set direction" or "help the fleet focus on viable
businesses, donations, and avoiding legal exposure" — the exact brief this
file already exists to answer — **check whether it's already been done
recently before writing another paragraph.** `git log -5 -- portfolio/DIRECTION.md`
shows three direction-only PRs landed inside about three hours right before
this note was added: #3542 ("durable new-venture priority + fast-scan
checklist"), #3551 ("sharpen new-venture and usage-signal direction"), and
#3571 ("consolidate the viable-business/donations/no-liability brief") — each
one restating the same north star (viable businesses, donations-only revenue,
happy customers from working/honest products, legal exposure as the one hard
stop, new ventures ranked first) in slightly different words. None of them
shipped a venture, fixed a defect, or moved a usage number; each read as a
complete session on its own.

That is the same failure this file's own "fleet-parity trap" section and
`CLAUDE.md`'s ledger-only-commit rule describe for product code, arrived at
from a different direction: a scheduled prompt that keeps re-firing "set
direction" gets a fresh session each time with no memory that the last one
already did it, and rewording an already-correct brief reads exactly like
progress from inside that session.

**So: if `git log -5 -- portfolio/DIRECTION.md AGENTS.md` shows this file
was substantively touched in the last few hours and the "North star" section
below still matches what you were about to write, don't rewrite it.** Spend
the session on the thing this file keeps telling sessions to do instead —
`python3 portfolio/router/allocate.py` for the highest-merit dispatchable
venture, or screening and graduating a fresh niche against
`portfolio/pipeline/screened-out.md` and its liability/ethics gates — and say
in your reply that direction was current and you built instead. A genuine
gap (a wrong number, a broken pointer, a rule this file doesn't yet cover) is
still worth a small, targeted fix in the same PR as real work; a full
restatement of the brief is not a gap.

**Added 2026-09-08: that warning didn't close the loop on its own.** A
session can only apply it after opening this file and reading this far —
and `git log` against `origin/main` on 2026-09-08 shows well over a dozen
more direction-only commits to these same two files landed across
2026-09-06 and 2026-09-07, several of them *after* this note already
existed in the version they were rewriting. Prose a session has to
remember to check is the same shape `CLAUDE.md`'s ledger-only-commit rule
already found didn't hold under its own soft wording (381 ledger-only
commits, 34.6% of a week's merges, before that rule became a script). So
this rule is now a script too: `python3 portfolio/ledger/check_direction_only.py`
exits 1 when every changed file in a branch is `portfolio/DIRECTION.md`
and/or `AGENTS.md` and nothing else — run it before pushing a "set
direction" session's work, the same way `check_ledger_only.py` already gets
run before a ledger entry. It does not judge content, only shape: a change
that also ships or fixes something else rides through clean, and a genuine
targeted correction folded into a PR with real work still passes, exactly
as the paragraph above already asks for.


## Current priority: deploy what is already built

> **Superseded 2026-09-06: the primary deploy is done, confirmed serving, and
> current.** Everything in this section was written between 2026-08-25 and
> 2026-09-02 on the premise that no built product had a public URL that
> mattered. That premise is now false. `python3 platform/ci/pages_state.py`
> reports `deployed: served` — GitHub's own managed builder ran the
> `gh-pages` branch (run 34013011002, 2026-09-06T05:03:36Z) — and
> `current` — the snapshot was built from `main`'s own tip (`d5f6709f`), not
> a stale commit. `deploy-settings` is granted. All ~175 finished products
> are reachable today at
> `https://duncan-haywood.github.io/monorepo-projects/`, no owner action
> pending. Stop naming that flip as a blocker and stop reading a built
> product with no *second* URL as undeployed.
>
> **2026-10-01: the owner deleted the Hetzner servers, so the paragraph
> below is history -- that route is retired, not down, its owner ask is
> removed, and GitHub Pages is the only host.**
>
> What is **not** fixed by the above: the separate `marisstella.dev` /
> Hetzner k3s route is still down (`CLAUDE.md`'s outage block has the
> measurements) and its recovery is a real owner action
> (`hetzner-ssh-key-is-a-public-key`, #3184) — a local SSH/Argo restore, not
> a Pages setting. Avoid conflating the two: a session that reads "the
> catalogue is dark" from that block and reads no further will re-derive
> the deploy-first urgency this note just retired. The Pages route needs
> nothing further to keep serving *except* the standing job below.
>
> The standing job that survives this correction: **a committed branch does
> not rebuild itself.** After any merge touching a served surface
> (`ventures/**`, `platform/pages/**`, `platform/marketing/**`), run
> `python3 platform/ci/pages_state.py`; if it reports `stale`, run
> `CONFIRM=publish-pages-branch PUSH=1 ./platform/pages/publish-branch.sh`.
> That is now the only thing standing between `main` and what a stranger
> sees.
>
> Read the rest of this section for *why* deploy-first was the right call
> while it was true — the reasoning generalizes to the next channel that
> isn't live yet. Then read
> "[What changes now that distribution is solved](#what-changes-now-that-distribution-is-solved)"
> below for what replaces it as the fleet's default job.

A product that only exists as `index.html` in this repo is not yet a product
people use. As of 2026-08-25 a cluster of calculators and CLIs is on `main`
(seller-fee tools, trade bids, quote-margin, retainage, e-invoice preflight,
and others) and **none of them have a public URL**. Every usage reading is
still a zero baseline. `python3 platform/ci/publish_surface.py` still
reports nothing live on a push to `main`.

That tool reads `gitops/` as well as the workflows since 2026-08-31, so
"nothing live" was a statement about both delivery paths rather than only
the one this paragraph was written about.

**Half of it stopped being true on 2026-09-02 (#2723).** `marisstella.dev`
and `www.marisstella.dev` had answered on merge since 2026-08-28, but only
as annotation-only 301s into `tools.marisstella.dev` — the host that serves
the 169 tools and fails closed on the unsealed Secret
`portfolio-site-repo`. Two hosts answering, nobody reaching content. Those
two names now serve a generated front-door page from a kustomize ConfigMap
(`gitops/prod/portfolio-front.yaml`), which needs no clone token, no
Actions runner and no Pages flip, so it deploys on merge with no owner
action at all. `publish_surface.py --check` reports **2 hostnames serving
content**.

What has not changed: the catalogue is still behind the seal.
`./bootstrap/scripts/seal-owner-secrets.sh site` is what makes the front
door's category links land on the tools they describe, and it remains the
highest-value owner action in the queue.

Until the already-built catalogue is reachable by a stranger, **deploy
beats another build**:

1. Get a live URL (or install command) in front of a niche user.
2. Record a usage reading that is not `null`.
3. Only then graduate a new candidate or clone another bid calculator.

The host is decided: GitHub Pages for static products. The Hetzner boxes
for processes were deleted 2026-10-01, so processes need a new host
decision — see [`hosting/README.md`](hosting/README.md).
~~The remaining owner flip is `deploy-settings` (enable GitHub Pages).~~
**No longer true — see the "Superseded 2026-09-06" note above: `deploy-settings`
is granted, and this line contradicted that note by still naming it as the
remaining blocker two paragraphs below it.** Prefer not to add Cloudflare or
Vercel as the way a product goes live. Agents prepare the deploy artifact;
they do not register a domain, store listing, or npm publish. Building
privately remains allowed. Cloning a twelfth undeployed calculator is
not.

**The artifact is prepared** (2026-08-26).
[`platform/pages/`](../platform/pages/README.md) assembles every static venture
surface — 33 tools at the time of writing — into the one Pages site this
repository gets, and `.github/workflows/portfolio-pages.yml` builds and tests it
on every push to `main`. Until then, the flip would have published only
`retail-pilot-intel`'s passcode-gated docs and left every calculator dark, so it
was worth far less than the queue implied; that workflow now reads its own
variable rather than racing for the origin. Two consequences for a session
picking work:

- **Nothing further is needed to publish.** A new calculator is discovered
  automatically on the next push — no manifest to update, no per-venture deploy
  workflow to write. If a venture needs to stay private, add its slug to
  `EXCLUDED_SLUGS` with a reason.
- **The deploy half of deploy-first is done.** What is still missing is the
  owner flip, and nothing an agent builds changes that. So the next unit of
  work is making the tools that will go live better — depth, correctness,
  onboarding, discoverability — not a thirty-fourth front page.

