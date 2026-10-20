# How this repository is organised, how it got that way, and what to do about it: brief for an agent reader

**Date:** 2026-10-20. **Reader:** an LLM agent about to add, move or retire a
top-level area, fold in another repository, or start a new sub-project
("sub-repo") here. **Human version:** the blog post
[`docs/posts/2026-10-20-when-goals-move-faster-than-folders.md`](../posts/2026-10-20-when-goals-move-faster-than-folders.md).
**Data and code:** [`assets/repo-organization/`](assets/repo-organization/).
**Asked by:** the owner ("a critique and history of development agent doc of
the organization of the repo ... improvement and fix suggestions and the
downsides ... any learning for future sub repos").

## Answer

The layout was laid down for one goal and then had eight more goals added on
top of it in under six months. Areas were added for each new goal and almost
never removed when the goal changed. So the tree is a geological record:
reading it tells you what the project wanted in August as loudly as what it
wants now. The costs are concrete. A retired hosting route still takes about
one commit in five. Root documents describe a portfolio a fortieth of today's
size. Names collide across portfolios. And one directory per product is the
cheapest unit of work, so the tree pays out for breadth after the goal turned
to depth.

Fix the cheap, high-friction items first: stop regenerating output for dead
consumers, archive stale root docs, and rename the colliding directories. Don't
regroup `ventures/`. For new sub-repos, give every top-level area a stated
purpose, a consumer and a retirement condition on the day it is created.

## History (verified 2026-10-20 from `origin/main`, 13,514 commits)

Counts are from the first-parent tree at the start of each date
(`analyze.py`, "Snapshots"). "Guidance" means `CLAUDE.md`/`AGENTS.md` anywhere,
`prompt.md`, `prompts/**/*.md` and `.github/prompts/*`.

| Date | Goal that arrived | What it added to the tree | Files | Root entries | Guidance files | Ventures | Research |
|---|---|---|---|---|---|---|---|
| 05-06 → 07-28 | One product: a safe media ingest and automation app | `src/`, `apps/`, `convex/`, `docs-site/` (2,999 commits) | n/a | n/a | n/a | 0 | 0 |
| 07-29 | A portfolio of ventures | `ventures/`, `platform/`, `portfolio/` scaffold (`eab5fc485`); four product repos merged as subtrees | 1,191 | 6 | 8 | 11 | 0 |
| 08-18 → 08-19 | An unattended agent fleet (20 workers an hour) | `.github/prompts/`, `CLAUDE.md` (router v1, PR #31) | | | | | |
| 08-21 → 08-24 | Product quality, then "product-first, ship value" | `DEVELOPMENT_QUALITY.md`, `QUALITY_QUICK_START.md`, `VENTURE_QUALITY_STATUS.md`, `AGENTS.md`, `PRODUCT_PLAYBOOK.md` at the root | | | | | |
| 08-25 | Self-hosted infrastructure | `gitops/`, `infra/`, `bootstrap/` (Hetzner k3s + Argo, PR #1486) | 2,351 | 14 | 11 | 31 | 0 |
| 08-24 → 09-06 | Breadth: new ventures get first call | 1,000+ venture directories over six weeks (see [calculator glut](2026-10-16-calculator-glut.md)) | 9,830 (09-15) | 18 | 13 | 282 | 0 |
| 10-01 | Hetzner deleted; GitHub Pages is the host; a standing brief | `prompt.md` | 15,719 | 19 | 14 | 558 | 0 |
| 10-14 | Research as a peer portfolio; a self-improving prompt system | `research/` folded in from `oss-research-monorepo` with a history mirror (PR #6832), `prompts/` | 30,705 (10-15) | 23 | 41 | 1,243 | 414 |
| 10-15 → 10-16 | Writing and a one-pass organisation review | `docs/posts/`; backlog P013 to P017 | 27,918 (10-17, mirror removed) | 25 | 59 | 1,280 | 523 |
| 10-20 | Judgment over rules; depth over breadth (six flagships) | `prompts/system.json` layers; `portfolio/flagships.yaml` | 33,403 | 27 | 78 | 1,307 | 765 |

`CLAUDE.md` went 0 → 174 → 1,265 → 1,566 lines between August and 14 October,
then 453 → 155 after two cuts (P003 on 10-14, "cut the deadweight" on 10-20).
Guidance files went from 15 to 78 in the week after research was folded in.

## Critique: seven findings, each with a fix and its downside

Each finding has a measurement, a proposed fix, and what the fix would cost.
"Friction" counts are keyword matches over the `doc_friction` field of 1,622
run records (`analyze.py`, last section). That gives an upper bound per theme,
not a hand classification.

### 1. Retired infrastructure is still live work

- **Evidence.** The Hetzner servers were deleted on 2026-10-01. `gitops/`,
  `infra/` and `bootstrap/` (210 files) still sit at the top level.
  `gitops/prod/front-door/` holds 73 committed, generated files (1.4 MB of
  gzipped HTML). `platform/marketing/front-door.mjs` says they are committed
  "because Argo CD ... is what delivers it", and Argo is gone. Even so,
  **845 of the 4,267 commits since 2026-10-02 touched
  `gitops/prod/front-door`**, because a test regenerates the files and fails
  when they are stale. 47 runs' friction mentions gitops, infra, k3s or
  Hetzner. `CLAUDE.md` spends a paragraph warning runs not to trust the
  tree.
- **History.** P013 (archive the cluster) was dropped on 2026-10-16 because
  about 40 files reference it, with the note "revisit only after P014 removes
  the mirror". P014 and P024 then removed the 5.8k-file `front-door-tools`
  mirror. The `front-door` tree remains, so P013's precondition is half met.
- **Fix.** Stop committing `gitops/prod/front-door`: drop it from the
  regenerate-and-compare test, and point `platform/ci/public_surface.py`'s
  apex probe at the `gh-pages` sitemap it already reads. Then move
  `bootstrap/`, `infra/`, `gitops/prod/host` and `hetzner-gitops-ci.yml` under
  `archive/hetzner-2026-10/` with one README, or delete them, since git keeps
  them.
- **Downside.** It touches about 40 files and their tests, and every open PR
  that regenerated the front door will conflict once. It loses the fastest
  path back to k3s if the owner re-hosts processes there. The README's
  "processes need a new host decision" is still open, and the manifests are
  the best record of the old setup. An archive directory keeps the record but
  leaves 210 files in every grep. Deleting removes them from greps but needs
  `git log` to recover.

### 2. Root documents speak for a portfolio a fortieth of today's size

- **Evidence.** There are 8 Markdown files at the root. Three of them
  (`DEVELOPMENT_QUALITY.md`, `QUALITY_QUICK_START.md` and
  `VENTURE_QUALITY_STATUS.md`, 985 lines together) were last edited on 24 and
  25 August, when there were 31 ventures. There are 1,307 now.
  `README.md` still says "**Current priority:** deploy what is already on
  `main`", while `CLAUDE.md` makes the top flagship the default as of
  2026-10-20. `portfolio/DIRECTION.md` is 875 lines. Some of its headings are
  "Before rewriting this brief again, read this", "Owner direction, relayed
  again" and "What changes now that distribution is solved". Directions are
  appended, not replaced. 95 runs' friction uses "stale", "out of date" or "no
  longer".
- **Fix.** Move the three quality docs to `docs/history/` with a one-line
  pointer. Generate the README's priority line from `flagships.yaml`, or delete
  it. Give each `DIRECTION.md` section a date and a "superseded by" field, and
  move superseded sections to `docs/history/`.
- **Downside.** 5 files link `DEVELOPMENT_QUALITY.md`, and a link checker will
  want them all fixed in the same PR. Deciding which parts of an 875-line
  brief still hold takes judgment. Done carelessly, it deletes the reason
  behind a rule that still matters ("Chesterton's fence",
  [cut-the-deadweight](../posts/2026-10-20-cut-the-deadweight.md)). History in
  `docs/history/` is read less, which is the point and also the risk.

### 3. The same name means different things in different places

- **Evidence.**
  - `portfolio/research/` holds 34 measurement studies about the portfolio,
    while `research/` holds the 765-project research portfolio.
  - `platform/distribution/` is code that publishes to channels, while
    `portfolio/distribution/` is two files of channel state.
  - Runbooks live in `.github/prompts/`, while the rest of the prompt system
    lives in `prompts/`.
  - Write-ups are spread over `docs/reports/`, `docs/history/`,
    `docs/posts/`, `portfolio/research/` and `research/swe-*`.

  Friction mentioning these directly is low (1 run names
  `portfolio/research`). The cost shows up as searches and wrong first
  guesses that runs don't report.
- **Fix.** Rename `portfolio/research/` to `portfolio/studies/`. Move
  `.github/prompts/*.md` to `prompts/runbooks/`, or leave them, since
  `system.json` already maps them. Write one line in `docs/README.md` saying
  which of reports, history and posts a write-up belongs in.
- **Downside.** Renames break links in 1,622 run records. Those records are
  history and should not be rewritten, so old records will point at dead
  paths. About 16 sessions an hour means every rename conflicts with
  in-flight PRs. `.github/prompts/` is referenced by name in `CLAUDE.md`,
  `prompt.md` and many runbooks. The low measured friction says this is the
  least urgent finding.

### 4. One directory per product made breadth the cheapest move

- **Evidence.** `ventures/` holds 1,307 flat directories with a median of
  **12 files** (p10 11, p90 22). Six ventures have more than 140 files. The
  [calculator glut](2026-10-16-calculator-glut.md) report found 619 sharing an
  identical 11-file layout, and `usage.mjs` identical in 927 of 1,222. The
  goal moved to depth on 2026-10-20 (six flagships), but nothing in the tree
  shows which six. The largest venture, `local-site-studio` (658 files), was
  passed over as "bloated".
- **Fix.** Don't regroup into `ventures/<niche>/<slug>/`. P015 already found
  that `build.mjs`, the workflows, `VENTURE.yaml` routing, published URLs and
  coverage checks all assume `ventures/<slug>`. Make depth visible instead:
  - keep `flagships.yaml` as the routing source (done);
  - keep folding families into one engine, as `bid-price-engine` did for 120+
    trades, and mark the folded ventures consolidated so the router skips
    them (done, PRs #8181 and #8335);
  - generate `usage.mjs` and check it for drift rather than copying it.
- **Downside.** Not regrouping leaves the shape that rewards one more
  directory, so the router has to keep pushing against it. Regrouping costs
  1,307 moves, redirects for every published URL, and some SEO loss.
  Generating shared files couples ventures that are meant to be deployable on
  their own (the self-host files assume a self-contained directory).

### 5. Two repositories' conventions were merged without one map

- **Evidence.** The research fold-in on 2026-10-14 brought its own
  `CLAUDE.md`, per-project Python packages and a history mirror. Ventures are
  mostly static JS. Guidance files went from 15 to 78 in a week. Run records
  named `CLAUDE.md` as friction 222 times before the layer map
  ([`prompts/SYSTEM.md`](../../prompts/SYSTEM.md)) said which file wins.
- **Fix.** Already landed on 2026-10-20: `system.json` layers, with CI failing
  any unmapped guidance file. What remains: per-project `CLAUDE.md` files in
  `research/` and `ventures/` should hold only what is true of that one
  project.
- **Downside.** The map is one more file every new guide must register in.
  That's friction by design, but it is still friction. A layer system also
  invites rules about layers.

### 6. Generated output in the tree

- **Evidence.**
  - The `front-door-tools` mirror was about 5.8k files before P024 removed
    it.
  - About 869 per-venture `*-ci.yml` workflows were cut to 490 by P016. 475
    remain, matching a venture name, out of 543 workflow files.
  - `gitops/prod/front-door` (finding 1) is still committed.

  Every regenerated file is a merge conflict waiting for the next of about 16
  sessions an hour.
- **Fix.** Build generated output at publish time. Commit it only for a
  consumer that can't build, name that consumer in the generator's header,
  and delete the output when the consumer goes.
- **Downside.** Build-time generation moves failures from review time (a diff
  you can read) to deploy time (a red publish job). Some per-venture workflows
  carry steps a matrix can't express cheaply.

### 7. Goals are recorded as additions, never as replacements

This is the root cause of the other six. Each new goal was stated in prose and
given a new place in the tree. The old goal's place was left in case it still
mattered. Nothing in the process asked "what does this goal make obsolete?",
so the tree only grows. The guidance had the same problem, and its fix was a
standing rule: every review run removes at least one rule
([cut-the-deadweight](../posts/2026-10-20-cut-the-deadweight.md)). The tree has
no such rule.

- **Fix.** When a goal changes (a new `goals.md` line, a new flagship list, a
  host retired), the same PR lists the areas the old goal created and marks
  each one kept, archived or deleted, with a reason.
- **Downside.** It slows down goal changes, which the owner makes often and
  quickly, and agents may archive things too eagerly to look tidy. "Kept, and
  why" has to stay a respectable answer.

## Order of work if you pick one up

1. **Finding 1** (front door, then archive the cluster). It has the highest
   measured cost: about 20% of commits, 47 friction runs and a `CLAUDE.md`
   paragraph. Start with `platform/marketing/regen.mjs` and
   `platform/ci/public_surface.py`.
2. **Finding 2** (stale root docs, the README priority line). It is cheap,
   mostly moves and links.
3. **Finding 7** as a one-line rule in the review track's sub-prompt, not in
   `CLAUDE.md`.
4. **Findings 3, 4 and 6** only when a run is already in those files.

## Lessons for future sub-repos and top-level areas

1. **A new top-level area states its purpose, consumer and retirement
   condition** in its README on day one ("exists for the k3s cluster; delete
   when the cluster is gone"). Then finding 1 is a lookup, not an
   investigation.
2. **Retiring something is not done until the tree, CI and generators stop.**
   Deleting servers is step one of five.
3. **Don't commit generated output** unless a named consumer can't build it,
   and delete it when that consumer goes.
4. **Pick the unit of work to match the goal.** If one directory is one unit
   and the goal is depth, the tree will pay out for breadth anyway. A new
   sub-repo aimed at depth should be one directory with internal structure,
   not many siblings.
5. **Name things after what they are, not the portfolio they came from.** Run
   `ls -d */<name>` across the tree before choosing a directory name.
6. **When folding a repository in, write the conventions map on the same
   day**: which guide wins, which toolchain, where its write-ups go. Also
   decide whether a history mirror is needed or whether
   `git subtree`/`git log --follow` is enough. The mirror here was removed
   within three days.
7. **Directions are dated and supersede each other.** Keep one current
   direction and move the old ones to `docs/history/`. Never append "relayed
   again".
8. **Measure before reorganising.** Run records name the files that cost
   time. Reorganise where friction concentrates (finding 1). Leave alone what
   only looks untidy (finding 3).

## Limits

- Friction counts are keyword matches, not hand-coded, and runs under-report
  layout friction, because a wrong first guess that is quickly corrected is
  rarely written down.
- The pre-07-29 history comes from separate product repositories merged as
  subtrees, so the snapshot table starts at the scaffold.
- The downsides are judgments, not measurements. None of the fixes has been
  tried here except those marked done.
- Reproduce: `git fetch --unshallow --filter=blob:none origin main && python3
  docs/reports/assets/repo-organization/analyze.py`. Output as of this report:
  [`results.txt`](assets/repo-organization/results.txt).
