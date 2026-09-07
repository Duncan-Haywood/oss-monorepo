# Company direction

**Effective 2026-08-24.** This is the portfolio's operating strategy. When
instructions conflict, this document wins over older prose in `CLAUDE.md`, the
ledger, or session notes that still treat policy compliance as the primary job.

Two companion documents carry the parts this one only names:

- [`PRODUCT_PLAYBOOK.md`](../PRODUCT_PLAYBOOK.md) — how to actually build one of
    these products in a session: picking the niche, product shapes that cost $0
    per user, the API-key switch, the disclaimer text to copy, the SEO/AI-discovery
    checklist, and the definition of done.
- [`portfolio/hosting/`](hosting/README.md) — where a product goes live:
    GitHub Pages for static tools, the existing Hetzner boxes for
    processes. Not Cloudflare. Not Vercel.
- [`portfolio/usage/`](usage/README.md) — what may be counted (events, never
  people), which free signals already exist, and where readings land
  (`usage/usage.yaml`) so the next session and the router can see them.

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

## North star (read this first)

**Relayed 2026-09-06.** The fleet's job, in the owner's own words: find
*viable software businesses* — ones that reach real users, earn optional
donation revenue, keep those users happy, and create no legal exposure the
owner has to clean up personally. Everything else in this file is detail
and history; this section is the version a session can act on without first
reconstructing it from the corrections layered into the rest of the
document.

1. **Ship and deploy, not just build.** An `index.html` on `main` with no
   public URL is not a product yet. `python3 platform/ci/pages_state.py`
   says whether the live snapshot matches `main`; if it says `stale`, that
   refresh outranks new work (see "Current priority" below).
2. **New ventures get first call, right now, not the leftover slot — and the
   owner has a standing special interest in them, so raise the bar rather
   than the count.** `portfolio/pipeline/candidates.yaml` has **zero**
   `build-now` candidates left unbuilt, and the fleet has still gone on to
   graduate niche after niche anyway — 195 `ventures/` directories as of
   2026-09-06, up from 185 six days earlier, with **zero** nonzero
   `live_url_visitors`/`repo_views_14d`/`release_downloads_total` readings
   anywhere in `usage/usage.yaml` and $0 revenue across all 756 ledger
   entries. "Not in `screened-out.md`" is necessary but no longer
   sufficient on its own to graduate a 196th one. Before building a fresh
   niche, name in the ledger entry **where the first real visitor would
   come from** — a specific subreddit, trade forum, search phrase with
   demonstrable volume, or a competitor's own comparison-search traffic —
   the same evidence `PRODUCT_PLAYBOOK.md` §1 already asks a session to
   gather, just now stated as a graduation condition rather than a nice-to-
   have. This is not a slowdown: it is how "more viable" differs from "more
   businesses" when the count is already 195 and none of them has a
   confirmed visitor. New ventures still beat a parity feature on a product
   nobody has visited — see "The fleet-parity trap" below — and sourcing
   one is real product work, not meta-work to defer.

   **Added 2026-09-07: run `python3 portfolio/pipeline/duplicate_check.py
   "<one-line niche description>"` before writing a candidate up.** At 199
   ventures, most a `<trade>-bid-calculator` shape, eyeballing
   `screened-out.md` and the `ventures/` listing by hand is no longer
   reliable — that is the same failure this file's own duplicate-PR and
   fleet-parity sections describe for other lists, arrived at from the
   pipeline-intake side. It scores the proposed niche against every venture
   description, `screened-out.md` row, `ai-first-markets` idea, and pipeline
   candidate, and exits 1 with the closest matches when one clears the "read
   this first" bar. It is lexical overlap, not a channel check, so it
   doesn't replace the visitor-source requirement above — it just catches a
   near-duplicate before a session spends the rest of it writing one up.

   **Added 2026-09-07: weigh the archetype, not just the niche, before
   graduating a 143rd `<trade>-bid-calculator`.** `pipeline/README.md`
   measured that **141 of 200** `ventures/` directories share that one
   shape — a deterministic pricing calculator for one trade — and none of
   the 141 has ever recorded a nonzero visitor. Clearing
   `duplicate_check.py` and the liability/ethics gates proves the *niche*
   isn't a copy; it says nothing about whether the *shape* is still the
   right bet after 141 tries with nothing to show. A niche with no channel
   stronger than "searchable, like the other 141" should weigh a different
   product shape first — CLI/library, a GitHub Action or checker that runs
   in the user's own CI, a generator (`PRODUCT_PLAYBOOK.md` §2 already
   ranks these above the browser calculator on cost grounds; this is the
   same ranking, argued from zero traffic across 141 tries).
   `ventures/actions-runner-starvation-check` is a fresh instance of that
   alternative shape, not another calculator. A specific niche with an
   unusually strong, named channel is still worth building regardless of
   shape — this doesn't forbid the archetype, it raises the bar for
   choosing it by default. See `pipeline/README.md`'s "archetype itself"
   section for the full measurement; this paragraph exists so the same
   finding is visible from the file a session actually opens first.

   **Read "zero in `usage.yaml`" as "unmeasured," not "unwanted," on the
   route that is actually live (added 2026-09-06).** GitHub Pages is what a
   stranger reaches today, and it self-reports nothing; every per-venture
   counter in `usage.mjs` is `localStorage`-only and never leaves the
   visitor's browser (`usage/README.md`, "The published tool site counts
   itself" — the one route that did aggregate, nginx on the k3s cluster, has
   been down since 2026-09-04). So a fleet-wide zero right now is consistent
   with real, silent visitors and with zero, and this file's own "zero after
   a fair run, stop building" rule (`usage/README.md` "How to read it")
   cannot currently be applied to any product on this route — there is no
   fair-run reading to have. That is not licence to keep graduating on
   quantity alone (see the visitor-channel requirement just above, which
   does not depend on this counter), and it is not a problem for a session
   to go solve with a new script: every free option left (a hit-counter
   badge, a third-party analytics tag) is exactly the "no analytics vendor"
   line `usage/README.md` already forbids, and Search Console-style
   ownership verification ties a real Google identity to the repo, which
   reads as an account decision for the owner, not a build task — raise it
   on the decision queue if a session wants to pursue it, don't wire it
   unilaterally. Until the cluster or an owner-approved channel restores a
   real signal, weigh a venture's future by the discoverability checklist
   (`PRODUCT_PLAYBOOK.md` §5e) and the free public signals in
   `usage/README.md`'s table (stars, referrers, release downloads) — not by
   a `usage.yaml` field that cannot currently move either way.
3. **Donations only, and most of the mechanism already ships.** Every live
   venture carries a `github.com/sponsors/Duncan-Haywood` link (done, all
   185) and should carry the `sponsor_link_clicked` usage counter
   (`PRODUCT_PLAYBOOK.md` §6) — the one signal that will eventually say
   whether the ask works. No checkout, no card fields, no billing code, not
   even disabled behind an unset env var, anywhere outside the two flagged
   pre-existing exceptions (`local-site-studio`, `print-atelier`); this is
   enforced in CI by `platform/ci/check_no_payment_code.py`. A payout rail
   is owner-only and not close — see the decision queue.
4. **Happy customers come from the product working and being honest, not
   from a separate initiative.** Run the venture's own tests and the
   browser checks before calling something done; keep the
   no-advice-of-record / no-compliance-warranty disclaimer in front of the
   user (`PRODUCT_PLAYBOOK.md` §5b); fix a real defect a visitor hit before
   adding a feature nobody has asked for yet.
5. **Marketing is welcome and is not exempt from the legal guardrails.**
   Landing copy, SEO content, and comparison pages are how a niche product
   gets found without ad spend — keep building them. A page that names a
   specific competitor (`vs-<competitor>.html`) needs the
   nominative-fair-use disclaimer and sourced, non-derogatory facts only
   (`PRODUCT_PLAYBOOK.md` §5f, checked by `node platform/pages/clauses.mjs
   <slug>`) — get it wrong and the exposure is the owner's, not a session's.
   Preparing a listing artifact is always fine; publishing it under the
   portfolio's public name (a store listing, a production domain cutover)
   is still owner-only.
6. **Legal exposure is the one hard stop — never traded for speed.**
   Payment collection, a compliance warranty, scraped personal data, or a
   claim the product can't back up are not worth a faster ship regardless
   of how good the resulting numbers would look. See "Legal guardrails"
   below; it is not negotiable by session judgment.

**New ventures are the owner's standing preference, not a dated note.**
Every correction above about "new ventures rank first" was written against a
specific day's pipeline state and will go stale the way dated notes do; this
paragraph is meant not to. Finding the next viable business is the highest-
leverage bet this fleet makes — more valuable, session for session, than
another increment of depth on an existing product — because a portfolio of
185 unvisited calculators proves nothing on its own, while a new, gate-
cleared niche is a fresh shot at the thing the owner actually wants: a
business that reaches real users, earns donations, and keeps them happy.
Treat "screen and graduate a fresh niche" as always in bounds, every
session, not as a fallback for when the pipeline queue happens to be empty.

## Owner direction, relayed again: the standing brief in one place

This does not create new policy — every point below already exists somewhere
in this file. It exists because with 3-4 sessions committing concurrently
(`session_gate.py`'s collision signal), one paragraph that says the whole
brief at once is worth more than five sessions each reconstructing it from a
different part of a long document. In the owner's own words, relayed again
this session: **find viable software businesses — ones that reach real
users, earn optional donation revenue, keep those users happy, and create no
legal exposure the owner has to clean up personally.** Ship, deploy, and
market the products; new ventures get first call, not the leftover slot.

Concretely, as measured this session (`session_gate.py`, `allocate.py`,
`usage.yaml`):

1. **"Viable" is the operative word, not "more."** 196 `ventures/`
   directories exist, zero carry a confirmed visitor anywhere in
   `usage.yaml`, and `session_gate.py` reports $0 revenue across 756 ledger
   entries. A 197th calculator with no named channel moves none of those
   numbers. Before graduating a new niche, name the actual place its first
   visitor comes from (North star point 2, above) — that is what makes it a
   business bet instead of a repo entry.
2. **New ventures still rank first when a genuine one clears the gates.**
   This is the owner's standing preference, not a dated note (see above). A
   fresh, gate-cleared niche with a named channel outranks a parity feature
   or added depth on a product nobody has visited — the owner has said
   directly that new ventures get a special priority here.
3. **Picking which existing venture gets a session is a solved problem —
   use the tool, don't guess.** `python3 portfolio/router/allocate.py`
   ranks the dispatchable set by merit and names the specific untested
   hypothesis each one is waiting on (187 of 196 ventures dispatchable as of
   this session). Its top rows are the mechanical answer to "what is the
   most productive use of this session" on an existing product, ahead of a
   self-chosen parity feature.
4. **Marketing is part of the job, and the legal guardrails around it are
   automatic, not a reason to under-market.** Landing pages, SEO content,
   and named-competitor comparison pages are how a free niche product gets
   found without ad spend — keep writing them. `platform/pages/clauses.mjs`
   and `platform/ci/check_no_payment_code.py` already catch a missing
   disclaimer or a stray payment SDK fleet-wide in CI; follow
   `PRODUCT_PLAYBOOK.md` §5b/§5f when writing the copy and let CI be the
   backstop instead of re-deriving the rules by hand each time.
5. **Donations are the only revenue lever agents hold, and the mechanism is
   done.** Every venture ships a `github.com/sponsors/Duncan-Haywood` link
   and the click already counts itself fleet-wide (see "Revenue" below).
   There is no remaining per-venture donation task. The two changes that
   would actually move revenue off $0 — `payout-rail` and
   `funding-sponsors-live` — are both owner-only
   (`portfolio/ledger/decision_queue.py`); do not add a third ask about
   money.
6. **Legal exposure is the one place speed does not apply, and the list is
   short and fixed**: payment collection, a compliance warranty, scraped
   personal data, or a claim the product can't back up. Nothing else trades
   against speed — a session should never slow down to re-verify an
   already-verified PR, re-litigate this document, or grow the decision
   queue with an item that doesn't block a product from shipping.

Read this section as the five-minute version of the brief; the sections
above and below carry the reasoning and the incident history that produced
each rule, for whenever the five-minute version isn't enough.

**Fast scan for "what should this session do," in priority order:**

1. A live product is broken, or a fleet-wide guardrail is red
   (`check_no_payment_code.py`, `clauses.mjs`, the accessibility/contrast
   checks) — a defect or exposure on something a stranger can already reach
   outranks everything below.
2. The published snapshot is stale (`pages_state.py --require-current`) —
   refresh it; a merge nobody can see is not shipped.
3. `usage.yaml` shows a real, nonzero signal on some product — go remove
   that product's actual friction.
4. Screen and graduate a new venture (gates and process in
   `pipeline/README.md`, rejected ideas in `screened-out.md`) — see above;
   this is not the leftover slot.
5. Only then: parity features, comparison pages, or added depth on a
   product that has had a fair run and is still at zero.

**Marketing is encouraged at every step above, and it is not where the
legal risk this file guards against actually lives — the guardrails are
automatic, not a rule to re-derive by hand.** Landing copy, SEO content, and
`vs-<competitor>.html` comparison pages are a normal part of shipping any of
the five items above, not a separate, riskier track needing extra sign-off.
`platform/pages/clauses.mjs` runs with no arguments, over every venture at
once, from `portfolio-validate.yml` on any push or PR touching
`ventures/**/*.html` — so a comparison page missing its nominative-fair-use
disclaimer fails CI fleet-wide, not just in the venture's own workflow, the
day it's added. `platform/ci/check_no_payment_code.py` gives the same
fleet-wide backstop against payment-processor code. Write the copy, keep the
disclaimer wording from `PRODUCT_PLAYBOOK.md` §5b (every page) and §5f
(comparison pages), and let CI catch a slip — do not read "legal exposure is
the one hard stop" as a reason to under-market a product.

On a generic brief, `python3 portfolio/ledger/session_gate.py` already
encodes points 1 and 2 above in its verdict — run it and follow what it
says rather than re-deriving this from scratch.

## What we are doing

Build software products that create large amounts of value for real users.
Target super-niche markets where people have money and a concrete problem —
especially problems that help them earn more money. Ship traditional software;
add AI only where it clearly improves the product, not as a wrapper.

The starting point is **abundant free value**: full-feature products at no
charge while we learn what people actually use. Measure that with **usage
stats** (signups, active use, return visits, feature adoption, referral
traffic). What people come back to without paid acquisition is what we double
down on.

Revenue comes later. For now:

- Do **not** collect payment or wire payout rails.
- **Do** keep liability-limiting disclaimers in every user-facing product
  (see "Legal guardrails" below).
- **Do** add GitHub Sponsors or a donation link where it fits — optional
  support, not a paywall.

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
> What is **not** fixed by the above: the separate `marisstella.dev` /
> Hetzner k3s route is still down (`CLAUDE.md`'s outage block has the
> measurements) and its recovery is a real owner action
> (`hetzner-ssh-key-is-a-public-key`, #3184) — a local SSH/Argo restore, not
> a Pages setting. Don't conflate the two: a session that reads "the
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

The host is decided: GitHub Pages for static products, the existing
Hetzner boxes for processes — see [`hosting/README.md`](hosting/README.md).
~~The remaining owner flip is `deploy-settings` (enable GitHub Pages).~~
**No longer true — see the "Superseded 2026-09-06" note above: `deploy-settings`
is granted, and this line contradicted that note by still naming it as the
remaining blocker two paragraphs below it.** Do not add Cloudflare or
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
  workflow to write. If a venture must stay private, add its slug to
  `EXCLUDED_SLUGS` with a reason.
- **The deploy half of deploy-first is done.** What is still missing is the
  owner flip, and nothing an agent builds changes that. So the next unit of
  work is making the tools that will go live better — depth, correctness,
  onboarding, discoverability — not a thirty-fourth front page.

## What changes now that distribution is solved

Distribution was the fleet's bottleneck for two weeks and consumed most of
the direction-setting prose above. It no longer is: 175 products are one
click away from any stranger, indexed, and the deploy-and-forget loop
(`pages_state.py` → `publish-branch.sh`) closes it in under a minute. That
changes what "the next task" means. In order:

1. **Keep the snapshot current.** One command, above. Do this before
   anything else on a session that touched a served surface — a stale
   snapshot is a live regression nobody's CI will catch, because CI checks
   `main`, not the branch a visitor actually gets.
2. **Read `portfolio/usage/usage.yaml` before picking work.** As of
   2026-09-02 it recorded zero observed users across every one of ~184
   products — the fleet spent August building depth into calculators nobody
   had yet been able to reach. That excuse is gone. **Any product with a
   nonzero signal — a real visitor, a return visit, a completed export —
   now outranks every other candidate for this session's time.** Go make
   that one product better: fix the friction its actual visitor hit, not
   the friction a hypothetical one might.
3. **A product that has had a fair run and stayed at zero is not the next
   place to add a comparison page.** "Fair run" here means: live and
   reachable from the apex catalogue's own index/sitemap for a couple of
   weeks, discoverable in its niche search terms per the checklist in
   `PRODUCT_PLAYBOOK.md` §5e. If those are true and `usage.yaml`'s trend
   line for it is still flat zero, say so in one ledger line (the pattern
   `usage/README.md` already asks for — "listed for two weeks, still zero,
   stopping work on it") and spend the session elsewhere. This is not
   deletion: the product stays live, free, and disclaimed. It just stops
   being where build time goes until something changes the picture — a new
   channel, a rescoring, an actual piece of inbound interest. Ventures
   whose `VENTURE.yaml` carries a `stage` at or past `revenue` with $0 MRR
   already surface this in `python3 portfolio/router/allocate.py`'s review
   list — check a venture's own `kill_criteria` there before deciding
   whether "stop adding features" should become "stop routing this venture
   any budget at all."
4. **Only then does a new venture compete for the same time.** New ventures
   are still wanted — they are how the portfolio finds the business that
   actually works, and a catalogue of untested calculators proves nothing
   on its own. But "graduate a new candidate" is not free just because
   distribution is solved: prefer a `build-now` candidate from
   `portfolio/pipeline/` that already clears both gates
   (`liability_containment` ≥ 5, `ethical_robustness` ≥ 5, per
   `pipeline/README.md`'s scoring) and names a real distribution channel,
   over inventing a 176th niche calculator with no such evidence. A strong,
   non-duplicative idea is never blocked — but "strong" now means
   evidence-backed, because for the first time the fleet has a real
   audience to measure it against instead of a hypothetical one.

   **Added 2026-09-06: "only then" orders the queue, it is not a demotion.**
   New ventures are the portfolio's actual bet — every existing product,
   `ai-first-markets` included, started as one — and the owner's standing
   interest is in finding the *next* viable business, not in polishing the
   174th calculator forever. Reordering the list above put deploy-and-measure
   first because a genuinely new idea competing against an untested backlog
   was the failure mode actually observed (36 candidates from six sessions in
   one day, most never built); it was never meant to read as "ventures are
   the leftover slot." A candidate that clears both pipeline gates and names
   a real channel is exactly as welcome on a session with a fresh, sharp niche
   idea as a `build-now` candidate from the queue — screen it against
   `screened-out.md`, score it honestly (the gates are not negotiable; the
   composite is not a formality), and graduate it the same day. What still
   isn't wanted is a niche calculator that duplicates an existing venture's
   shape with no new mechanism and no evidence anyone asked for it — that is
   the "176th" this item warns against, not novelty itself.
5. **Every live product should carry a working, honest donation ask.** See
   the next section — this lever is now live on all 185 ventures (the last 4
   were closed 2026-09-06; see the correction below), not waiting on an owner
   decision.

## The fleet-parity trap, and where new ventures actually stand (added 2026-09-06)

Measured this session: **55 of 185 ventures** now carry a `share.mjs`
shareable-link module, added one venture at a time across dozens of sessions
in the days since distribution was solved — a mechanical feature-parity
pattern, not a response to anything a user asked for. `portfolio/ledger/2026-09.yaml`
already records **274 per-venture entries** in the first six days of the
month. In that same window `portfolio/usage/usage.yaml` has not recorded a
single nonzero visitor count anywhere, and `session_gate.py` still reports
**revenue recorded this month: none (0 of 756 entries)**.

That is not a coincidence of timing — it is what "ship something every
session" turns into once the two intended default candidates fill up first.
The priority order above says step 2 is "read `usage.yaml`, work on what has
a signal" and a product stuck at zero is supposed to fall out of rotation —
but in practice it doesn't, because there is almost always a sibling venture
missing a convenience feature its neighbor already has, and copying it over
is real code, passes CI, and reads as shipped. It genuinely is real code.
It is also not what a stranger who has never visited the product is waiting
on, and every one of the 55 additions had zero usage signal to test it
against — the fleet cannot know these features matter, because it does not
yet know these products have visitors.

**So, effective now: parity-for-its-own-sake is not the default job.** Before
adding a feature to a venture *because a sibling venture already has it* (a
share link, a save slot, an export format — anything copied fleet-wide
rather than requested by that specific product's own users or friction),
check that venture's row in `usage.yaml` first. Zero usage after a fair run
(`PRODUCT_PLAYBOOK.md` §8) means spend the session on one of these instead:

1. **A new venture.** Graduate a `build-now` pipeline candidate, or a strong
   fresh niche not in `screened-out.md`. This is not the fourth-place, do-it-
   last item the numbered list above might read as — it is where a
   disproportionate share of session time should go, because a 56th share
   link on an unvisited calculator teaches the portfolio nothing new, while a
   new venture is a new shot at finding the business that actually works.
   Score it honestly against the pipeline's liability/ethics gates and ship
   it with the same disclaimers and usage tracking as every other product —
   "new" buys no exception from "Legal guardrails" below — but do not let
   "we already have 185" be a reason to defer one. New ventures compete for
   session time on equal footing with deploy-and-measure work, not behind it.
2. **A real discoverability defect, not a discoverability feature.** Confirm
   a venture's sitemap entry actually resolves, its JSON-LD matches its
   visible copy, and it is reachable from the apex catalogue's own index —
   the kind of break `platform/ci/public_surface.py` and the browser checks
   in `AGENTS.md` catch, which a share-link addition does nothing about and
   which is a more plausible reason a product sits at zero than "it lacked a
   share button."
3. **A real correctness or accessibility defect on an already-live product,
   not a defect on the product you happen to be adding a feature to.**
   Added 2026-09-06: this is not hypothetical. #3530, opened the same day
   this section was last touched, fixes 48 critical axe-detected label
   violations across three tools already serving on the published site —
   introduced during the same fast-build cadence this section describes,
   never caught because nothing routes session time toward *checking* a
   shipped product once its own PR merges. `AGENTS.md`'s browser checks
   (`browser_checks.py`) and `ink.test.mjs`'s WCAG AA contrast check run
   against a single venture when that venture is being edited; nothing
   fleet-wide asks "of the ~193 already live, which ones would fail these
   checks today." With zero traffic to any of them, this is also the one
   quality problem an agent can find and fix *before* it costs a real
   visitor rather than after — pick a handful of already-shipped ventures a
   session isn't otherwise touching, run their own `node --test` suite plus
   the browser/contrast checks, and fix what's red. This is not a call for a
   dedicated audit initiative or a tracking spreadsheet (that is exactly the
   meta-work this file elsewhere warns against) — it is a legitimate answer
   to "what do I do with this session" that ranks above a parity feature,
   the same as the two items above it.
4. **Donation-readiness housekeeping** (next section) — so the day
   `funding-sponsors-live` is decided, every product's footer is already
   correct and nothing needs revisiting. **Corrected 2026-09-06:** the
   `sponsor_link_clicked` counter is no longer a per-venture task to wire —
   see the correction in "Revenue: donations, and keeping customers happy"
   below — it already fires fleet-wide from the published-site build. The
   housekeeping that remains here is the ordinary kind: a venture's footer
   actually has the link, the disclaimer, and nothing that reads as a
   paywall.

This does not forbid fleet-parity work outright — a share link genuinely
requested by, or built for, a product that already has visitors is exactly
the friction-driven improvement §8 asks for. What changes is the default: a
convenience feature copied onto a zero-usage product because a sibling has
one is no longer, by itself, a sufficient reason to call a session's job
done.

## Revenue: donations, and keeping customers happy

The portfolio's revenue model is, and stays, **donations only** — GitHub
Sponsors, nothing else. No payment collection, no payout rails, no merchant
account: that is unchanged and is not up for a rescore by any session (see
"Legal guardrails" below and `PRODUCT_PLAYBOOK.md` §6).

**Corrected 2026-09-06: donations are not blocked on an owner decision, and
this section previously read as if they were.** `PRODUCT_PLAYBOOK.md` §6 has
the full detail; the short version is that a per-product `github.com/sponsors`
link is agent-decidable and now ships on **all 185 ventures** (closed 2026-09-06,
#3481) — that mechanism has been live since before distribution was
even solved. What actually is owner-only is a second, separate thing: the
*native* repo-level GitHub "Sponsor" button, gated behind:

- **`funding-sponsors-live` (#839 in `portfolio/ledger/decision_queue.py`)**
  is a yes/no on re-landing `.github/FUNDING.yml` (15 lines, `github:
  [Duncan-Haywood]`) pointing at the owner's own GitHub Sponsors profile.
  It was merged once and reverted the same day (#862); the safe state — no
  funding surface — is what's on `main` today. This is an
  account-ownership decision an agent cannot make (it ties a real legal
  person's Sponsors profile to the repo), so it stays owner-only. It adds
  one more entry point on top of links that already work; it is not what
  turns donations on.

**Closed 2026-09-06.** The four app-shaped ventures named above —
`local-site-studio`, `photo-editing`, `quick-pick-survey`,
`retail-pilot-intel` — each now carry the link in the app's own
layout/footer component (not a static HTML footer a build script injects):
`site-footer.tsx`, the docs `DocsLayout.tsx`, `ProfileView.tsx`'s account
section, and (retail-pilot-intel has two independent apps) both
`PortalShell.tsx` and `apps/docs`' `DocLayout.tsx`. **All 185 ventures** now
ship a working `github.com/sponsors/Duncan-Haywood` link. There is no
remaining gap for a session to close here — see the next section for what
replaces it.

- Every user-facing product still ships the optional Sponsors/donate line
  from `PRODUCT_PLAYBOOK.md` §6 — footer or about section only, never in
  front of a feature, never phrased as payment for using the tool. A
  donation ask that reads like a paywall is a legal-exposure regression,
  not a revenue win; keep it exactly as optional as the free tier it sits
  next to.

**Corrected 2026-09-06, same day: the link rollout is done and so is the
default click instrumentation.** This paragraph said zero of 185 ventures
recorded a sponsor-link click and asked each session to wire
`sponsor_link_clicked` into a venture's own `usage.mjs` one footer at a time.
That was overtaken a commit later (#3511): the click is now counted once, in
the build, for every published page at once — `markSponsorLinksIn` in
`platform/pages/build.mjs` tags every Sponsors anchor across all 186 ventures'
tool, hub, category, and comparison pages, and the shared `pf-site.js` chrome
those pages already load counts a click into `portfolio-hub-usage` under the
literal event `sponsor_link_clicked`. See
[`portfolio/usage/README.md`](usage/README.md#the-published-tool-site-counts-itself)
"Wired the same day, on the published site, in one place rather than 186" for
the full mechanism. **Do not hand-wire this per venture** — the build already
covers the published site, and a mechanical pass adding a second, redundant
listener to 185 footers is exactly the fleet-parity trap below, not progress.
The one case worth an individual venture's own `usage.mjs` wiring it too:
someone opens that venture's `index.html` locally rather than through the
published build (a clone, an offline copy) — optional, not a fleet task.
What is still genuinely open: like every other counter here, this one is
`localStorage`-only and never transmits, so nobody can read the aggregate back
yet — the click is now *countable*, not yet *counted for us*. That gap closes
with the rest of "the published tool site counts itself" (`usage/README.md`),
not with more per-venture code.

**Keeping customers happy is not a separate initiative — it's what makes a
donation ask credible, and it's cheap to check for:**

- **The page has to actually work.** `PLAYWRIGHT=$(npm root -g)/playwright/index.js python3 platform/ci/browser_checks.py`
  and the venture's own tests are what catch a page that renders and
  computes nothing — see `AGENTS.md`. A visitor who hits a broken
  calculator does not come back, let alone donate.
- **Accessible.** `ink.test.mjs` and the WCAG AA link-contrast check exist
  because a tool that fails them is unusable for part of its own audience —
  treat that red the same as any other correctness bug, not as
  optional polish.
- **Honest about what it is and isn't** (the disclaimer in
  `PRODUCT_PLAYBOOK.md` §5b): evidence and drafts, never a determination
  made on the user's behalf, never an uptime promise this portfolio can't
  keep. A customer who was told the truth about a free, best-effort tool is
  a happy one even when something breaks; a customer who was oversold is
  not, however good the tool actually is.
- **Fix reported defects fast, and don't let a defect ship twice.** A bug a
  real visitor hit and a session can reproduce is not "meta-work" or a
  ledger entry to defer — it's the single highest-signal piece of product
  feedback this portfolio currently has, because it's the only kind that
  didn't have to be imagined.

## Owner direction, 2026-09-06: new ventures get first call, legal exposure is the one hard stop

The owner's own framing, relayed this session: the fleet's job is viable
software businesses — ones that reach real users, earn optional donation
revenue, keep those users happy, and never create legal exposure the owner
has to clean up personally. Every section above already says a version of
this; what this section changes is the ranking, and it corrects a real bug
in the tool that was supposed to enforce it.

**New ventures rank first, not last, when a genuine one is available.**
"Only then does a new venture compete for the same time" (above) is easy to
read as "new ventures are the leftover slot" — that section already flagged
the same misreading once. Read it as: build the venture when one clears the
gates, ahead of a parity feature or a deeper feature on a product nobody has
visited. This portfolio exists to find the businesses that work; a fleet
that spends its time evenly re-polishing 185 unvisited products never finds
one.

**The pipeline's own bookkeeping was hiding whether a candidate was
available, so this session fixed it before pointing anyone at it.**
`portfolio/pipeline/candidates.yaml` had **five `build-now` candidates still
marked unbuilt while all five were already shipped**:
`quote-margin-check`, `consent-change-record`, and
`shopify-permission-drift` are live `ventures/` directories with no
`initiated`/`initiated_path` recorded; `eaa-remediation-pipeline` and
`mls-photo-spec-preflight` had graduated as `product_lines` on
`local-site-studio` and `real-estate-agent-photo-app` on 2026-08-24 —
`portfolio/pipeline/README.md` has said so since that date — but
`candidates.yaml` still read `verdict: build-now` for both. `session_gate.py`
reads exactly this field to name the next unbuilt candidate for a session in
`BUILD` regime, so this bug's failure mode was a session being sent to
rebuild a venture that already exists. All five are now `verdict: graduated`
with `initiated`/`initiated_path` set, matching the schema every other
graduated candidate already uses, and re-verified against
`validate_candidates.py` and `validate_doc_consistency.py` (still 22/22
consistent). **The result: the pipeline's `build-now` queue is genuinely
empty right now** — not because nothing is worth building, but because
everything that was scored and ready has already been built. The five
`probe`-verdict candidates that also have a `ventures/` directory
(`mcp-supply-chain-watch`, `shopify-a11y-evidence`, `public-record-watch`,
`dns-configuration-evidence`, `backup-verification-evidence`) are not a
second version of this bug — each write-up deliberately keeps its verdict at
`probe` pending an owner-gated buyer test, per `pipeline/README.md`'s
`graduate_as` rules; do not "fix" those to `graduated`.

**So the next new-venture session screens a fresh niche, not the queue.**
Pick one not in `screened-out.md`, score it honestly against the
`liability_containment` and `ethical_robustness` gates in
`pipeline/README.md`, and graduate it the same session if it clears them —
exactly the standing process, just with the confidence that "check the
pipeline first" no longer means picking up stale, already-shipped work. If
you add or graduate a candidate, flip its `candidates.yaml` verdict in the
same PR: a tracker that never learns a candidate was built is worse than no
tracker, for the reason CLAUDE.md's "Duplicate PRs" section gives for any
other stale status — it actively misdirects the next session instead of
staying silent.

**Donation revenue is the other lever agents actually control, and as of
this session it is fully done.** All 185 ventures now carry a working
`github.com/sponsors/Duncan-Haywood` link (see the Revenue section above and
`PRODUCT_PLAYBOOK.md` §6, closed today by #3481). The two things that would
actually move the revenue ceiling off $0 — `payout-rail` and
`funding-sponsors-live` — are
both owner-only (`python3 portfolio/ledger/decision_queue.py`); that does
not make everything donation-adjacent an agent can do less worth doing.

**Legal exposure is the one place "build more, faster" does not apply.**
`ventures/local-site-studio` still carries a full Stripe checkout
integration behind unset env vars, gated on the still-open
`local-site-studio-subtree-gate-crossing` decision (PR #731) — see "Legal
guardrails" below. A new venture that reaches for payment collection, a
compliance warranty, or scraped personal data to move faster is not a
viable business here no matter how good its numbers look — it is exposure
the owner has to resolve personally, the same way #731 still is. Donations
only, disclaimed, evidence-not-advice: those are not friction to build
around, they are what keeps a fast-shipping fleet an asset instead of a
liability.

**Customer happiness is still measured at zero, fleet-wide, as of this
session** — every `usage.yaml` field that reports a nonzero number today is
a build-time artifact count (pages written, local reports generated), never
a stranger; every field that actually measures one (`live_url_visitors`,
`repo_views_14d`, `release_downloads_total`) is `None` or `0` across all 185
products. That is the real argument for ranking a new venture above another
parity feature: the fleet cannot yet tell which existing product a happy
customer would come from, so the higher-value session either puts a new,
gate-cleared bet in front of a real audience, or fixes a concrete reason an
existing one isn't reaching theirs (see "The fleet-parity trap" above) —
not one that adds a feature nobody visiting the product has asked for.

## What a good product looks like here

| Criterion | Why it matters |
|---|---|
| Runs on this VM / GitHub / agents | No new infra spend to try an idea |
| Useful without a human in the loop | Matches how the fleet ships |
| Low variable cost per user | Inference, storage, and egress must not scale linearly with usage at launch |
| Turnkey with API keys | A product blocked only on an owner-supplied key is a win — build it, document the one key, move on |
| Niche + searchable | SEO and AI discovery can carry early growth without ad spend |
| High value per user | Tools that help someone make or save real money beat vanity metrics |

Products that need a marketplace listing, a merchant account, or a paid ad
budget before anyone can use them are **second priority**. Build the thing
people can use from a URL or install command first; unblock distribution when
the owner decides.

## How agents should spend time

**Default job: ship product value.** Features, landing pages, docs, onboarding,
usage tracking, bug fixes, performance, SEO content, integrations behind
env vars. Every session should leave a venture closer to something a stranger
could use and benefit from.

**Rely on the owner as little as possible.** Merge product PRs. Do not
ask whether product code may land. Flag only when the session cannot
finish without a secret, a legal-person account, taking money, publishing
under the public name, or turning on unattended paid spend.

**Not the default job:**

- Re-verifying pull requests another session already verified
- Writing ledger entries that record looking but not building
- Debating whether a prior rule was followed
- Opening analysis documents when code could ship instead
- Expanding the owner decision queue with items that do not block product work
- Asking whether a green product PR may merge — that is yes

Run `python3 portfolio/ledger/session_gate.py` on a generic brief ("continue
work", "improve the process", etc.). If it says **BUILD**, build — and if
anything already on `main` still has no public URL, that deploy is the
build. Do not meta-work. If it says **PROCEED**, keep building what you
were building.

## Development flow

**Speed over review ceremony.** Code that passes the venture's CI and stays
within scope merges without waiting for human review. Iterate in production
(on preview URLs or the VM) rather than in comment threads.

Still required before merge:

- Relevant tests and builds green (read CI; do not hand-rebuild what CI already ran)
- No payment collection, no new legal exposure beyond documented disclaimers
- Usage instrumentation included for new user-facing features

Still **owner-only** (flag on issue #139 / `portfolio/ledger/asks.yaml` only
when product work is actually blocked):

- Taking or moving money (Stripe live keys, payout rails, billing)
- Registering accounts that need a card, ID, domain, or bank account
- **Publishing** under the portfolio's public name (store listing, npm publish,
  production domain cutover) — building privately is always allowed
- Enabling unattended automation that spends paid API budget
- Pasting a secret they hold (Pages enable, deploy tokens, a GitHub PAT)

Internal surfaces and `ventures/*` product code are **agent-decidable**:
verify, merge, ship. Answered 2026-08-25: yes, merge product PRs. Do not
re-ask. `python3 platform/ci/publish_surface.py` still tells you whether a
merge publishes anything live; it does not block the merge.

## Graduating new products

The portfolio may expand beyond its current venture list when a candidate is
genuinely new, addresses a narrow painful problem, and can ship a useful free
slice with the safeguards below. Existing ventures remain the default home for
adjacent features, but historical limits on the number of ventures are not a
reason to defer a strong, non-duplicative product.

1. Pick a niche from `portfolio/pipeline/` or invent one that is **not** in
   `screened-out.md`.
2. Graduate it matching its `graduate_as` field:
   - `graduate_as: venture` — create `ventures/<slug>/` with `VENTURE.yaml`,
     a runnable app, disclaimers, and basic usage tracking.
   - `graduate_as: product-line` — add the slug under `product_lines` in
     its host venture's `VENTURE.yaml` (the host must already be routable).
     Do not open a second venture directory.
3. Ship on GitHub Pages or the Hetzner product box; record usage, not opinions.
4. If the product is already on `main` and still has no public URL, **that
   deploy is the next task** — not a second product in the same niche.
5. Let organic traffic and return usage decide what gets more investment.

Pipeline candidates with a `build-now` verdict are pre-researched starting
points — graduate and build them instead of re-screening.

## Legal guardrails (non-negotiable)

These stay in every product regardless of the speed mandate:

- **No advice-of-record.** Not legal, tax, medical, or filing-on-behalf-of.
  Produce evidence, drafts, and monitoring; the user decides and signs.
- **No "you are compliant" warranties.** Report what was tested and when.
- **No scraping personal data or bought lead lists.**
- **Terms/disclaimers** on user-facing surfaces limiting liability,
  including the no-SLA hosting clause in `PRODUCT_PLAYBOOK.md` §5b.
- **Comparison pages that name a competitor** (`vs-<competitor>.html`, and
  173 of them exist) carry a nominative-fair-use disclaimer and stick to
  sourced facts, never disparagement — `PRODUCT_PLAYBOOK.md` §5f, enforced by
  `node platform/pages/clauses.mjs <slug>`. This is marketing copy that names
  someone else's trademark; get it wrong and the exposure is the owner's, not
  the session's.

Payment is deferred, not disclaimers.

**Two existing exceptions need an owner decision, not agent judgment.**
`ventures/local-site-studio` carries a full, working Stripe checkout/webhook
integration (`src/app/api/stripe/`, ~2,300 lines) — real checkout sessions,
recurring upgrades, and dispute handling — gated only by unset
`STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` env vars. That is exactly what
`PRODUCT_PLAYBOOK.md` §6 forbids everywhere else in the fleet ("no checkout,
no card fields, no billing code... not even disabled"), and it arrived
through a still-open gate-crossing (`local-site-studio-subtree-gate-crossing`,
PR #731, in `portfolio/ledger/asks.yaml`): a self-merged 1,405-commit subtree
the owner has not yet said accept-or-revert on.

**A second, previously-undocumented instance was found 2026-09-06:**
`ventures/print-atelier` carries real Stripe checkout, Connect-payout, and
webhook code (`src/app/api/stripe/`, `src/lib/stripe-checkout-server.ts`,
`src/lib/commerce/stripe-connect.ts`) with the same unset-key gating and the
same never-been-live status — but no decision-queue row existed until this
session added one (`print-atelier-stripe-checkout`,
`portfolio/ledger/asks.yaml`). Unlike `local-site-studio`'s bot self-merge,
this one arrived by the owner's own direct subtree merge on 2026-07-29, four
weeks before this donations-only policy was first written — so it is not a
process violation, just a pre-existing venture nobody reconciled against the
policy once it existed. That distinction does not change what an agent does
with it: **do not extend either Stripe integration, do not supply or wire
live keys, and do not copy this pattern into any other venture** — the
donations-only model above governs everywhere else in the fleet regardless
of these two unresolved cases.

**This is now enforced, not just stated.**
`platform/ci/check_no_payment_code.py` (added 2026-09-06, wired into
`portfolio-validate.yml`) fails CI if any `ventures/*` directory outside its
`ALLOWED_EXCEPTIONS` (currently exactly these two, each pointing at its
decision row) imports a payment-processor SDK — Stripe, Braintree, Square,
PayPal's server SDK, Adyen, Checkout.com, Razorpay, Klarna — or lists one as
a dependency. Two instances existing before any check did is the reason it
exists: the policy sentence above was already accurate reading of
`PRODUCT_PLAYBOOK.md`, and a second venture still slipped past it undetected
for six weeks. Run `python3 platform/ci/check_no_payment_code.py` before
adding a payment-adjacent dependency to anything.

## Success signals

Track and prefer work that moves these:

- Weekly active users (or equivalent usage events)
- Return usage within 7 days
- Organic landing traffic (referrer + search)
- Time-to-first-value for a new visitor
- GitHub stars, sponsors, or unsolicited feedback

Deprioritize work that only moves internal metrics (ledger entries, open PR
count, decision-queue rows) unless it directly unblocks a product.

Write the readings down in [`usage/usage.yaml`](usage/usage.yaml) — a number
that only ever existed in a running process is not a signal, and a reading of
zero after a fair run is a result worth recording, not a failure to hide.
[`usage/README.md`](usage/README.md) has the rules: count events, never people;
no PII, no IPs, no content, no analytics vendor; prefer free signals that
already exist (release downloads, package downloads, repo traffic) over
instrumenting anything new.

## What this replaces

The portfolio spent August 2026 on meta-work: re-verification, policy
debates, and decision-queue maintenance while **zero ventures had production
URLs and zero revenue was recorded**. That ends here. The router, ledger, and
pipeline remain as **tools** — not as the work itself.
