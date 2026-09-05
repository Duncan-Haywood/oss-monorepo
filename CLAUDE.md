# Working in this repo

**Read [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) and [`AGENTS.md`](AGENTS.md)
first.** The portfolio's job is to ship products people use — not to debate
policy, re-verify old PRs, or maintain admin queues.

[`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md) is how to build one: niche
selection, product shapes with ~$0 marginal cost, the API-key switch, the
disclaimer text, the SEO/AI-discovery checklist, and the definition of done.
Usage — the metric while everything is free — is specified in
[`portfolio/usage/`](portfolio/usage/README.md).

`README.md` covers repo layout.

Four agent families (GitHub Actions, Kilo, Cursor, Claude) also run an
automated cross-review layer — see `.github/prompts/review-open-prs-first.md`
and `platform/ci/agent_review/README.md`. It posts APPROVE/REQUEST_CHANGES
reviews via dedicated reviewer GitHub Apps and can auto-merge internal
(non-`ventures/*`) PRs once two of them approve and CI is green. It assists
the "Duplicate PRs" workflow below; it does not replace the judgment calls in
"Ship without review ceremony".

## Product-first default

Every session should move a venture closer to something strangers can use for
free, with usage tracked and disclaimers in place. Features, fixes, landing
pages, SEO, integrations (behind env vars), and VM-runnable apps beat ledger
entries and analysis documents.

**Deploy-first.** Products already on `main` with no public URL outrank new
candidates. Prepare a GitHub Pages artifact or a Hetzner product-box
deploy; do not clone another undeployed calculator. The host is decided
([`portfolio/hosting/`](portfolio/hosting/README.md)). The owner flip is
`deploy-settings` — do not add a second ask. See `portfolio/DIRECTION.md`.

Target super-niches where users have money and a real problem — especially
tools that help them earn more. Low variable cost, traditional software, AI
only where it clearly helps. Payment and payout rails stay off; GitHub
Sponsors/donations are fine.

## Session gate (generic briefs only)

```
python3 portfolio/ledger/session_gate.py
```

Run this when the brief is vague ("continue work", "improve the process",
"research new projects"). **BUILD** → ship product value (gate names a
`build-now` candidate if one exists). **PROCEED** → keep building. The gate
never means stop.

Named tasks, venture work, red CI, and PRs you are driving skip the gate.

## Ship without review ceremony

**Merge when CI is green.** No human code review. Fix forward. Rely on the
owner as little as possible. Product PRs are the work — merge them.

Before merge: run or read CI; scope stays in-bounds; new user-facing surfaces
have disclaimers and usage tracking.

**While runners are starved, "run or read CI" means run it here, and this is
the set.** Measured 2026-09-05: `main` was red on four tests across #3324,
#3325 and #3326 — three sibling comparison-page PRs that each merged the same
afternoon. Three failures were `front-door-tools.test.mjs` reporting a page
`missing from the commit` (the venture page landed, `regen.mjs` never ran, so
the apex would have 404'd on a page the sitemap advertises — the same defect
CLAUDE.md already records costing live product in #3256–#3258), and the fourth
was `ink.test.mjs` on links below WCAG AA. Nobody was careless: every check on
those PRs came back red in ~3 seconds with `runner_id: 0`, which is
indistinguishable at a glance from the failure it was hiding.

So when `ci_starvation.py` says starvation, run these before merging, and say
in the PR what they said:

```
node platform/marketing/regen.mjs        # then commit whatever it rewrites
node --test platform/marketing/*.test.mjs platform/pages/*.test.mjs
node --test platform/proposal/*.test.mjs
node --test ventures/<slug>/*.test.mjs
python3 -m pytest gitops/tests -q        # only if you touched gitops/ or platform/ci/
```

The first line is the one that keeps being skipped, and it is the one that
decides whether a page you shipped is reachable. A red check you have
classified as starvation still leaves the repo's own tests unrun — that is
what "absent CI is not failed CI" asks you to make up for, not a reason to
merge unverified.

**`platform/proposal/` was added to that list on 2026-09-05, and the reason is
the sharper half of this section.** The set above was written as the checks
that matter and then used as *the* checks that get run — so a guard outside it
fails into silence, which is the same defect as a starved check, arrived at
from the other direction. `platform/proposal/term-ids.test.mjs` exists
precisely to catch a proposal panel whose deposit and terms do not survive the
venture's own share link; it had been red on `main` for days, naming five
ventures, while five separate sessions shipped that exact bug one after
another and each recorded a clean local verification. Every one of those runs
was honest: they ran the list. The list was wrong.

So treat the block above as a floor that ages, not as a fixture. If you add a
guard, add the directory it lives in here in the same commit — a test nobody
runs is worth less than no test, because it also tells the next session the
ground is covered.

**Merge yourself after CI is green:**

- `platform/`, `portfolio/`, docs, tests, CI
- Usage tracking, disclaimers, free-tier features, GitHub Sponsors links
- `ventures/*` product code (calculators, apps, CLIs). Do not wait. Do not
  open a queue row asking whether a product PR may merge.

Answered 2026-08-25: yes, agents merge product PRs. That question is closed.
Do not re-ask it.

**Only flag the owner when you cannot finish without them:**

- Taking or moving money (billing, payout rails, live Stripe)
- Registering accounts needing card, government ID, domain, or bank
- Publishing under the portfolio's public name (store listing, npm publish,
  production domain) — building the artifact privately is always allowed
- Enabling unattended automation that spends paid API budget
- Pasting a secret they hold (Pages enable, deploy tokens, a GitHub PAT)

`python3 portfolio/ledger/decision_queue.py` lists owner decisions already
queued. Do not add duplicate asks. Do not expand the queue with items that
do not block shipping. Do not add "should we merge this product PR?"

If a prior verification exists, run
`python3 portfolio/ledger/verification_status.py` before re-running tests —
do not re-verify unchanged PRs.

## Pipeline and new ventures

Screening is done — see `portfolio/pipeline/README.md`. Do not produce another
candidate list. Either:

1. Deploy a product that is already on `main` and still has no public URL, or
2. Build a `build-now` candidate (`session_gate.py` names the top one), or
3. Graduate and build a new niche not in `screened-out.md`.

> **MEASURED 2026-09-04: nothing is served. Read this before anything below.**
>
> Every claim in this section was derived from the manifests. On 2026-09-04 the
> hostnames were asked directly, from a GitHub runner, over real DNS and real
> TLS — the first time in this repository's life that anything did
> ([`Public surface check`](.github/workflows/public-surface-check.yml), run
> 33887885219):
>
> ```
> https://marisstella.dev/         unreachable: [Errno 111] Connection refused
> https://www.marisstella.dev/     unreachable: [Errno 111] Connection refused
> https://tools.marisstella.dev/   unreachable: [Errno 111] Connection refused
> Sitemap sample: 0/24 served
> ```
>
> **Connection refused, not a timeout.** DNS resolves, the IP answers, and
> nothing is listening on 443. That rules out the firewall (a drop times out),
> the TLS certificate (no handshake was reached) and a routing mistake in the
> Ingress (nginx would answer 404). Something upstream of all three is not
> running: ingress-nginx, k3s, or the node.
>
> So **the catalogue is dark, and every sentence below saying otherwise is
> wrong.** Not one of the ~184 finished products is reachable by anybody. The
> error was structural rather than careless: `gitops/prod` deploys through Argo
> CD, so a merge to `main` *is* the deploy, and the repo slid from "shipped" to
> "served" with nothing able to contradict it —
> `bootstrap/preflight.sh` needs `HETZNERSSHKEY`, and that secret holds a
> public key (run 33884253173).
>
> **What this changes for you.** Deploy-first is not one priority among
> several; it is the only one that matters until a hostname answers. Do not
> ship a 185th tool into a catalogue nobody can open, and do not rank the
> `portfolio-site-repo` seal first — sealing a clone token for a cluster that
> is not serving changes nothing. The blocking ask is now
> `hetzner-ssh-key-is-a-public-key`. Re-run `Public surface check` (it needs
> no secret) before trusting any statement here; it is cheap and it is the
> only ground truth about whether a hostname answers.
>
> **Corrected the same day (#3188): "no credential-free check can tell you
> why" was too strong, and believing it would have cost the next session the
> whole diagnosis.** That is what this paragraph said, and `Outage triage`
> (`.github/workflows/outage-triage.yml`, run 33889983086) then answered most
> of "why" without shell on anything. Dispatch it before escalating:
>
> ```
>   both servers                       running   (Hetzner read-only API)
>   marisstella.dev / www / tools  →  89.167.29.39   (ours)
>   :22    open      on both boxes
>   :80    refused   on both boxes
>   :443   refused   on both boxes
>   :6443  refused   on both boxes
> ```
>
> So it is **not** power, **not** DNS, **not** the firewall (a drop times out;
> an RST means the host is up and nothing is bound), and **not** TLS. `:6443`
> refused is the sharp end: the k3s API server itself is not listening, so
> this is a dead or absent cluster rather than a crashed ingress, and no pods
> exist to serve 80 or 443.
>
> Two lessons, and the second is the reusable one. First, the SSH ask is
> **confirmed rather than assumed**: sshd is up, so a rotated key will get in.
> Second, nobody had checked whether it was — and had port 22 been refused
> alongside 443, the top-ranked ask would have been the *wrong credential*,
> costing the owner a day while the surface stayed down. An outage row should
> say which action ends it, and that is a claim to measure, not to reason to.

(1) comes first while a product on `main` still has no public route at all. As
of 2026-09-02 `publish_surface.py` reports two hostnames serving content and
one still waiting on `portfolio-site-repo` — but the apex serves all 169
tools itself, so "the catalogue is dark" is not the right reading. See the
correction below before ranking the seal against shipping.
**(Superseded by the measurement above: `publish_surface.py` reports what the
manifests would publish, never what a host returns. Both halves of that
sentence are manifest-derived and the second is now known false.)**

**That tool now reads `gitops/` as well as `.github/workflows/`** (changed
2026-08-31). It used to answer "what does a merge to `main` publish?" from the
workflow files alone, which stopped being the whole answer when the site moved
to Argo CD — a manifest merged to `main` *is* the deploy there, and no workflow
runs. So it reported "nothing publishes" while `gitops/prod` carried three
public hostnames, and would have gone on saying so on the day the site went up.
It now prints the Argo surface too, per hostname, and for the portfolio site
that reads:

```
    prod  (gitops/prod)
      + https://marisstella.dev/            (would serve content once synced)
      - https://tools.marisstella.dev/      (would serve content once synced,
                                             waiting on Secret
                                             portfolio-site-repo)
      + https://www.marisstella.dev/        (would serve content once synced)
```

**Changed 2026-09-02 (#2723): "nothing live" is no longer true.** The apex and
`www` used to be annotation-only 301s into `tools.marisstella.dev`, which
serves nothing until the clone token is sealed — so the two hosts that
answered handed every visitor a dead end, and `--check` printed that as a
note. They now serve `gitops/prod/portfolio-front.yaml`: a generated
front-door page held in a kustomize ConfigMap, needing no clone token, no
Actions runner and no Pages flip. A merge to `main` is the deploy.

So the standing reading has two halves now, and they differ:

- **The portfolio has a public surface.** A stranger typing the domain gets
  positioning, one card per category, and the §5b clauses.
- **1 of the 169 tools, and the canonical host, are one seal away**:
  `portfolio-site-repo`, via `./bootstrap/scripts/seal-owner-secrets.sh site`.
  It is queued.

**Both bullets are false as of the 2026-09-04 measurement at the top of this
section.** A stranger typing the domain gets a refused connection, not
positioning; and the distance to a working catalogue is not one seal but
whatever is stopping :443 from being served at all. They are kept rather than
deleted because the reasoning that produced them is the thing to avoid
repeating: each is a correct statement about `gitops/prod/portfolio-front.yaml`
— the manifest really does mount a front-door page needing no clone token —
restated as a statement about what a visitor receives. Argo CD makes those two
look identical right up until the cluster is not running, at which point every
manifest-derived claim in this file goes quietly wrong at once and no amount of
re-reading the manifests can notice.

**Corrected 2026-09-02.** This section used to say the tools were *all* one
seal away and that "every category card on the front door links into that
host, so the seal is what turns the front door into a working funnel." That
is not what the manifests do, and a session reading it mis-ranks its whole
run. What is actually served today:

- `portfolio-front.yaml` mounts the tool mirror into the apex pods as a
  projected volume of eleven ConfigMap shards, and
  `gitops/prod/front-door/default.conf` routes `^/tools/<slug>/` at it. So
  `https://marisstella.dev/tools/<slug>/` serves the tool itself.
- `front-door/index.html` carries **169 user-facing `/tools/…` links** and
  exactly **one** href to `tools.marisstella.dev` — in fine print, honestly
  labelled "goes live when its access token is sealed". Its primary CTA is
  "Open one of the 169 tools running here now". The category cards link to
  same-page anchors, not to the dark host.

So the front door is already a working funnel, and the seal now buys **no
tool a stranger cannot already reach** — only the canonical hostname and
indexability. Worth doing, and further than ever from being the difference
between a dead end and a product. Do not describe the catalogue as dark, and
do not rank the seal above shipping.

**Changed 2026-09-03, twice: 162 became 168, then 169.** The mirror generator resolved a
venture's entry point as a root `index.html` only, while
`platform/pages/build.mjs` — the canonical build — had always tried
`site/index.html` too. Five ventures keeping a flat static site in `site/`
(`quote-margin-check`, `tender-radar`, `equipment-rental-break-even`,
`mcp-supply-chain-watch`, `shopify-permission-drift`) were therefore filed as
"apps with a build step, not a gap the mirror can close", and
`delivery-app-margin-calculator` dropped as collateral for linking to one of
them. `venturePageRoot` now applies the same two candidates in the same
order.

**168 became 169 the same day, and the second half is the lesson.** Fixing
the first half by *copying* `build.mjs`'s candidate list into the mirror
froze the other half of the rule in place: `build.mjs` also carries
`ENTRY_OVERRIDES`, for ventures whose surface is at neither standard path,
and a copied constant cannot know that. `ai-engineering-academy` declares
`tools`, so the canonical build published its hub page and six complete,
tested electronics calculators while the mirror filed the venture as "not a
static page". Since the canonical host serves nothing, those seven pages
were public nowhere — and this file recorded that as the one tool the seal
would deliver. `venturePageRoot` now **imports** both lists from `build.mjs`
rather than restating either, and a test walks the venture tree asserting
the two agree. If you are ever tempted to restate a rule that lives in
`build.mjs`, this is the second time that cost live product.

The remaining 15 exclusions really are CLIs, servers and apps.

(Read from the manifests and the generated page, not from a live fetch:
outbound HTTPS to arbitrary hosts is refused by the agent egress proxy
with `CONNECT tunnel failed, response 403`, so no session running under it
can verify the public surface directly. That limit is why this line went
stale unchallenged for as long as it did.)

**Corrected 2026-09-04: you cannot fetch it, but you can have it fetched.**
The sentence above is true of a *session sandbox* and the repo had been
reading it as true of the *portfolio* — which is how "nothing is live" stood
for five days with nothing able to contradict it. A GitHub Actions runner is
not behind that proxy. Dispatch `Public surface check`
(`.github/workflows/public-surface-check.yml`) and read its step summary:
`platform/ci/public_surface.py` asks every hostname in the manifests what it
serves, over real DNS and real TLS, and compares the answer to what
`publish_surface.py` says we shipped. It uses **no secret** — every request is
one a stranger could make — and it samples the published sitemap too, so a
`<loc>` that 404s shows up as the SEO defect it is.

Prefer that reading to anything this file asserts. And do not reach for
`bootstrap/preflight.sh` instead: it needs `HETZNERSSHKEY`, which holds a
public key and so has never once opened a session (measured 2026-09-04, run
33884253173). Rotating it is queued as an owner ask; it gates cluster-level
diagnosis, not the public surface.

Neither half is a reason to build a twelfth calculator.

A candidate becomes routable when it has `ventures/<slug>/VENTURE.yaml` or a
`product_lines` entry on its host venture.

## Duplicate PRs

Scheduled sessions often overlap. Before opening a PR, check open PRs and
recent commits. Extend or consolidate instead of duplicating. If the backlog
is large, merge the strongest and close the rest with a pointer.

**A close that names a survivor must verify the survivor is still open —
immediately before closing, and again after.** Two sessions can each close
their PR pointing at the other's as the one to keep; both pointers then aim
at something closed and nothing ships. This happened on 2026-08-24: a bot
closed #948 as "superseded by #953" at 16:04:20, and 38 seconds later
another session closed #953 "in favour of #948". Two complete
implementations of the same browser calculator, zero shipped, until #948
was reopened.

If you find the PR you deferred to already closed, **reopen one of them**
rather than opening a third implementation — the work is already written
and re-deriving it is how a duplicate becomes a triplicate. Prefer
reopening the one a reasoned merits comparison picked over one closed on
arrival order alone.

**Never close a PR as "already on main" without running:**

```
python3 portfolio/ledger/supersede_check.py <pr-number>
```

Exit 0 means the branch adds nothing `main` lacks and the close is safe.
Exit 1 prints the lines the close would destroy. The rule above covers a
survivor that is *another PR*; this covers a survivor that is *`main`
itself*, which is the claim that has actually been wrong.

Exit 0 now comes from either of two proofs, and the report names which:
the original line scan, or an **identical-merge proof** — replaying the
branch on `main` with `main` winning every conflict produces `main`'s tree
exactly. The second exists because the first went silent: on 2026-08-27 it
said NOT SUPERSEDED for 65 of 66 open PRs, none of which were mergeable
either, because `main` keeps absorbing the same feature from a sibling
branch under a different filename. A gate that never opens is a gate
nobody uses.

A **NOT SUPERSEDED** verdict may now carry a **RENAME SUSPECTED** section.
It fires when most of a file's unmatched lines have a close twin already in
`main` under different identifiers, and it prints each pair with the file
the twin lives in:

```
  branch  export function largestCostComponent(result) {
  base    export function largestCostDriver(result) {
          ↳ ventures/3pl-quote-normalizer/calc.mjs  (85% alike)
```

This is the case neither proof above catches: the branch spells the feature
`largestCostComponent`, `main` spells it `largestCostDriver`, so no line
matches and no merge replay is clean, yet the work is shipped. Merging such
a branch adds a second button, a second storage key, or a weaker copy of a
live function.

**It does not license a close, and the exit code stays 1.** Similarity is
evidence to read, not a verdict: the one word that differs between two
93%-alike lines can be the fix the branch exists to make. Read the pairs.
If they are the same feature, close naming the *twin's file* — the rename
report is what you looked at, not what decided it. If the branch changes
what the twin does, that difference is the work and it still has to merge.

A verdict may also carry a **STALE DRAFT SUSPECTED** section (added
2026-09-04). It fires when `main` has committed to effectively every file the
branch carries *more recently than the branch did*, and the unmatched lines
have close twins **in those same files** on `main`. It prints each pair:

```
  ventures/moving-bid-calculator/vs-smartmoving.html — 38 unmatched, 10 with a later twin
  branch  <tr><td>How does the math behind a per-job moving price actually work?
  base    <tr><td>How does the math behind a local moving bid actually work?
          ↳ 95% alike
```

This is the third shape, and it is the opposite of the rename above: there
the work shipped *elsewhere* under another name; here `main` has a **later
draft of these very lines, in these very files**. The branch is not ahead of
`main`, it is behind it. Both existing proofs read it as unshipped work — an
earlier draft's wording is genuinely absent from `main`, and a branch
carrying one file `main` has since renamed does not replay into `main`'s
tree — so it lands as a clean NOT SUPERSEDED and invites a merge that
*reverts* the better copy. The revert then looks like a feature in the diff.

Measured on `marketing/vs-smartmoving-moving-bid-calculator`: 67 lines
"nowhere in `main`", every one an older wording `main` has replaced,
including a mirror comment that would have put all 169 mirrored tools back
to `noindex` and a shard filename from before the mirror was gzipped.

**It does not license a close either, and the exit code stays 1.** Read the
pairs and decide which wording is better. If `main`'s is later and fuller
throughout, the branch is spent — close it naming the file. If any branch
line says something `main`'s does not, that difference is the work. And note
the direction it protects: a branch whose files `main` has *not* moved past,
or whose lines have no twin, is not flagged — genuinely new work still reads
as work.

**Your clone is shallow.** `git fetch --unshallow` before any of this.
Without it there is no merge base with `main`, so `git merge` refuses with
"unrelated histories" and `git diff origin/main <branch>` reports thousands
of files. That is the clone, not the branch — do not read it as a conflict
or as a reason to close anything.

On 2026-08-24 between 17:24 and 17:25, two sessions closed finished,
tested features minutes apart — #1006 ("superseded by the merged eBay
calculator follow-up work") and #1016 ("already represented on main"). In
both cases `main` did not contain the feature: no `share.mjs`, no
`compareFeeScenarios`. #1006 had to be reopened and #1016 recovered as
#1022, spending two more sessions to get back to work that was already
written. Run against those two commits the check exits 1 and names
`share.mjs` and `compareFeeScenarios` as absent from the base.

Overlap is not supersession. A branch touching the same venture, the same
file, or the same feature area as recent work on `main` is the normal case
here, not evidence that its work already landed.

There was a third close in that same five seconds — #1014, at 17:24:48,
"superseded by the repricing/sensitivity improvements already present in
the eBay calculator workstream". `main` had no `calculatePriceScenarios`
and no sensitivity UI. It is on `main` now only because the close was
reversed. Two of the three closes also gave a second reason, and both of
those reasons are wrong on their own terms:

**"The branch is conflicted" is not a reason to close.** It is a reason to
merge `main` into the branch and resolve it. A conflict means the work is
still wanted where someone else is editing — the opposite of redundant. All
three of these branches conflicted; all three resolved in minutes, and one
resolution turned up a live bug (`share.mjs` carried its own field
allowlist, so a shared link silently dropped `quantity` and `targetMargin`
and the recipient computed a different profit than the sender saw).

**Absent CI is not failed CI** — but "most PRs here show zero checks" is no
longer the default to expect, and this paragraph used to say it was. #1006
(2026-08-24) was triaged as "not merge-ready because Portfolio validate and
agent-permission-harness checks are failing" when neither check had ever
run on it, and the reason given was "PRs opened by bots using `GITHUB_TOKEN`
do not trigger Actions." That named the wrong mechanism: an agent PR here
authenticates with a fine-grained PAT (`GH_TOKEN`, the agents identity in
`infra/OWNER_CHECKLIST.md`), not the in-workflow `secrets.GITHUB_TOKEN` that
GitHub's no-recursion rule actually applies to — a PAT is a full credential
and triggers `pull_request` workflows the same as a human opening one would.
**Verified 2026-09-02:** #2856, opened the ordinary way, created 13 check
runs; 11 executed on real runners and passed. So a blank check list on a PR
here is a thing to go verify (the checks tab or the `check-runs` endpoint,
never the bare status call — see below), not the state to assume by
default. If a PR genuinely shows no checks, verify locally (`node --test`,
the venture's suite, a browser pass) and record what you ran; do not read
the blank as a failure either way.

**Runners came back on 2026-09-01. Read a red check as a real failure again.**
From 2026-08-26 to 2026-09-01 every workflow in the repo failed without a
runner, so checks arrived *red* rather than absent, and the standing advice was
to discount them. **That window is closed.** Actions started assigning real
runners again at **2026-09-01T00:00:53Z**, and #2601 that evening was the first
PR in five days to go green on merit: `check`, `gitops`, `duplicate-symbols`,
`scripts`, `hcloud-scope` and `tofu` all passing, on runner ids in the
`1000040xxx` range, with `gitops` actually executing `kustomize build`,
`kubeconform` and 193 pytest cases.

So the dangerous mistake has **inverted**. It used to be treating starvation as
your regression and "fixing" green code. It is now the reverse: waving a
genuine failure through because this file told you red means nothing. Do not
discount a red check by reputation — check it.

**Do not read this as "it is fixed forever" either.** Earlier revisions of this
file swung too far the other way, insisting "this is not an outage and it will
not pass on its own"; it did pass on its own, which is the correction this
paragraph exists to make. But the recovery landed at 00:00:53Z on the first of
the month, which is what an Actions minute allowance resetting looks like, so
the honest reading is that the ceiling **cycles** rather than that it is gone.
Expect it to recur when the allowance is spent again. The repository is private
and owned by a user account, so Actions minutes here are metered.

For history: the 2026-08-26 cliff was clean rather than a degradation, and hit
all 218 workflows at once including ones that touch no code, which is what
placed it at the account level rather than anywhere in this repo.

**When a starvation window does recur, its sub-cause is not knowable from a
session** — exhausted included minutes, a spending limit, a payment problem, or
Actions switched off all look identical from here. Do not try to measure it:
the run-timing API (`/actions/runs/<id>/timing`) reports a billable
`total_ms` of 0 for this repo even on a *pre-cliff run that genuinely occupied
a runner for 99 seconds*, so it cannot attribute burn per workflow, and any
minute or dollar figure derived from it is fiction. The cost note inside
`.github/workflows/claude-routine-trigger.yml` is likewise an estimate its
author wrote, not a reading. Only the owner's billing page settles the
sub-cause.

**The self-hosted path is now insurance, not an emergency.** While CI was dark
this section told sessions to report one unblock above all others: seal the
runner PAT and set `CI_RUNNER` = `self-hosted`. That is still built and still
waiting in [`gitops/ci/`](gitops/ci/README.md) — all 218 workflows already read
`runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}`, so one repository variable
still moves every one of them at once, and self-hosted runners are not metered,
so they are what makes the next cycle a non-event.

**Starvation recurred on 2026-09-04 and this paragraph used to say runners
worked.** Measured, not inferred: run 33925827289 (`Portfolio validate`,
22:30:52Z) took real runner 1000054728 and passed in 196s; by 22:39:33Z runs
33926434774 and 33926436491 both came back `runner_id: 0` with no steps, and a
third dispatch starved too. So the signature does fire again, and the advice
to "read a red check as a real failure" now needs `ci_starvation.py` run
first rather than assumed — which is what that tool is for.

**The sharp part is what this does to the self-hosted fallback.** That stack
runs as pods *in the k3s cluster*, and the cluster is dead (`:6443` refused,
`Outage triage` run 33889983086). So flipping `CI_RUNNER` today schedules
pods onto an API server that is not listening: the insurance against metered
CI is downstream of the cluster whose repair needs CI. All three routes to a
public surface now converge on infrastructure that is down —

- GitHub Pages (`deploy-settings`) needs a runner to build and deploy it;
- self-hosted runners need the cluster;
- the cluster needs SSH, and `HETZNERSSHKEY` holds a public key.

— which makes `hetzner-ssh-key-is-a-public-key` the only one of them that
depends on neither a runner nor the cluster (port 22 answers on both boxes).
The decision queue used to rank `deploy-settings` first as the cheapest; it
now measures viability and sinks a route whose prerequisite is down. See
`portfolio/ledger/infra_state.yaml` for the dated readings and how to
re-measure each; prefer re-running them to trusting these sentences, and
expect the Actions ceiling to lift on 2026-10-01 if it behaves as it did in
August.

**This tool matters more now, not less.** While every check was red it was a
formality — the answer was always starvation. Now that runners are back, it is
the thing that stops you dismissing a real failure as a ghost of the outage.
Run it before you debug anything, and before you discount any red check:

```
python3 platform/ci/ci_starvation.py --run <run_id>   # or a bare <job_id>
```

Exit 0 means every job ran on a real runner, so a failure there is a real
result and yours to fix — which, since 2026-09-01, is the expected answer.
Exit 1 means at least one job never got one.

**It no longer needs the `gh` CLI** (changed 2026-08-31). It did until then,
which meant it exited 2 with "the gh CLI is not installed" in the web sessions
that run these routines — the one environment where a session is most likely to
reach for it and least able to check by hand. It now falls back to
`api.github.com` with `GH_TOKEN`/`GITHUB_TOKEN`, and `--from-json <file>` will
classify a jobs payload you fetched some other way (the MCP
`list_workflow_jobs` tool, say) with no credential of its own.

**The one field that settles it is `runner_id`**, and that is the only thing
the tool votes on. A starved job carries `"runner_id": 0` and
`"runner_name": ""` — no runner was ever assigned, so no step ever ran. It also
runs 3-6 seconds, has empty `output.title/summary/text`, and 404s on log
download, but each of those has a benign explanation on its own: a real job
*can* fail in three seconds, which is how a genuine failure gets waved through
as "the outage". An unassigned runner cannot be anything else. Verified against
both live cases on 2026-08-31 — today's `validate` job (`runner_id: 0`, 4s,
no steps) and the last green one before the cliff (`runner_id: 1000027517`,
95s, 38 steps).

If it reports starvation, the failure is not yours: verify locally, say what
you ran, and give the unblock above — do not "fix" green code, and do not
spend the session re-establishing the signature. If it reports a real runner,
the failure **is** yours, however much this section's history invites you to
assume otherwise: fix it and push, exactly as you would in a repo that had
never had an outage.

**And check for `check_runs`, not just statuses.** The commit-status API
(`/commits/<sha>/status`, and the `get_status` method of the GitHub MCP tools)
returns only *legacy commit statuses*. This repo's checks are **check runs**, so
that call reports `total_count: 0` on a PR whose checks are running or already
red. On 2026-08-28 that read as "no checks ran — absent CI" on four PRs that
each had six to eight red check runs. Absent CI and red CI call for different
handling under the rules above, so confirming which one you are looking at
needs the check-runs endpoint (`/commits/<sha>/check-runs`) or the PR's own
checks tab — never the bare status call.

## Ledger (minimal)

**A ledger entry is never a deliverable on its own.** Run this before pushing:

```
python3 portfolio/ledger/check_ledger_only.py
```

Exit 1 means your branch is ledger prose and nothing else. That is not a
session's output — it is a footnote to output that does not exist. In the
seven days to 2026-09-02 the fleet landed **381 such commits, 34.6% of the
1,102 that reached `main`**, while `portfolio/usage/usage.yaml` still recorded
zero observed users across all 184 products. The rule that was supposed to
prevent that ("do not open ledger-only PRs that re-state known blockers") had
an escape hatch, and every session used it.

So: record outcomes per `portfolio/ledger/README.md` when you **shipped
something**, in the same commit or PR as the thing you shipped. If you found a
blocker instead, say so in your reply and leave `main` alone — an unshipped
session is a real outcome and does not need a commit to be true. Never bundle
a ledger entry into a PR waiting on the owner.

`git fetch origin main` before appending; skip if the latest entry already
covers your finding. The ledger *tooling* (`.py` under `portfolio/ledger/`) is
ordinary platform code, exempt from the check and mergeable on its own.

## Automation

Do not add or re-enable unattended workflows that push commits or call paid
APIs without owner approval.

## Never write `fixes #N` / `closes #N` about someone else's PR

GitHub closes the referenced PR **unmerged** when that commit hits `main`.
Refer as "#109" or "PR #109". Rephrase "fixed #109's conflict" → "resolved
the merge conflict on #109".

When intentionally closing a PR, comment why and point to what supersedes it.
