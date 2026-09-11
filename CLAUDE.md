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
python3 platform/ci/checklist_coverage.py  # fails if a line below is missing
node platform/marketing/regen.mjs        # then commit whatever it rewrites
node --test platform/marketing/*.test.mjs platform/pages/*.test.mjs
node --test platform/proposal/*.test.mjs
node --test platform/privacy/*.test.mjs platform/webcheck/*.test.mjs
node --test ventures/<slug>/*.test.mjs
python3 -m pytest gitops/tests -q        # gitops/, platform/ci/, or ANY new venture
(cd platform/ci && for m in test_*.py; do python3 -m unittest "${m%.py}" || break; done)
(cd platform/ci/agent_review && python3 -m unittest test_review)
python3 -m pytest portfolio/ledger portfolio/scoring portfolio/router portfolio/usage portfolio/pipeline infra/tests -q
python3 -m pytest portfolio/research/<probe> -q          # one at a time: 4 share a test_measure.py basename
python3 -m pytest portfolio/pipeline/probes/<probe> -q   # one at a time: root pytest --ignore's this tree
python3 platform/ci/run_workflow_locally.py --for-changes  # the validators no pytest line reaches
python3 platform/ci/run_workflow_locally.py --tree          # and: is main itself green right now?
```

**That last line is not optional, and it is the one this block was missing
until 2026-09-07.** Every line above it runs *tests*. `portfolio-validate.yml`
also runs eight **validators** that no test file imports — `router/validate.py`,
`front-door-tools.mjs --headroom`, `pipeline/validate_doc_consistency.py`,
`pipeline/validate_candidates.py`, `probes/validate_probe_index.py`,
`pipeline/score_sensitivity.py`, `scoring/score_ventures.py --check`,
`usage/validate_usage.py` — and they check the thing tests cannot: whether the
*committed data* still agrees with itself across files.

Measured 2026-09-07: `main` was red on `validate_doc_consistency.py` and had
been for at least a day. Two real inconsistencies, one of them a README row
whose own cell said `Appended out of composite order ... to avoid renumbering
the table`. Nothing caught it because Actions was starved, so CI never ran the
validator, and this block — the list a session actually follows during a
starvation window — ran every test in the repo and not one validator. The
guard was correct, current, and shouting into an empty room.

Prefer `run_workflow_locally.py` to pasting those eight commands here. It reads
the workflow files and runs their `run:` steps, so it cannot go stale the way a
hand-copied list does — which is the same import-don't-restate lesson this file
records twice against the front-door mirror, and once already against
`platform/proposal/`.

**`--tree` was added 2026-09-07, and the reason is that `--for-changes` cannot
answer the question this section is actually about.** It selects workflows by
your *diff*, so on a clean checkout of `main` it prints `No files differ from
origin/main; nothing to verify` and exits 0 — correct for "is my change sound?"
and useless for "is `main` green?". Every guard in this file was therefore
still, in one specific sense, only ever run by someone who happened to be
changing something.

Measured the same day: `scoring/score_ventures.py --check` was red on `main`
and had been across five merges. #3615 graduated
`actions-runner-starvation-check` without a row in `venture-scores.yaml`, and
`--check` fails by design when the scored set and the set of `VENTURE.yaml`
files disagree. Actions has been starved since 2026-09-04
(`ci_starvation.py --run 34089278449`: `runner_id: 0`, 3s, no steps), so CI
never ran it; four later merges each verified their own diff, correctly, and
none of those diffs touched scoring. That is the third instance of this exact
shape in ten days — 2026-08-29's two red steps, 2026-09-07's
`validate_doc_consistency.py`, now this — and all three were found by a session
that happened to look rather than by anything that asks.

`--tree` asks. It ignores the diff and runs every workflow in
`VERIFICATION_ONLY` against the checkout as it stands, so a red `main` is one
command rather than a coincidence. It sweeps that list and not the whole
directory on purpose: a sweep is the mode most likely to be run unattended,
which is exactly where a deploying or branch-deleting step would arrive
unnoticed. Run it after `git fetch origin main && git reset --hard origin/main`
to read `main` itself, or on your branch to check the tree you are about to
push. An empty selection exits 1 — "nothing ran" must never read as a pass.

(`pip install pytest` first in a web session — the image has Python but not
pytest, so that `gitops/tests` line exits `No module named pytest` rather than
failing any test. Do not read that as a clean run. The `platform/ci` line needs
no pytest — those suites are `unittest`.)

**And when `pip` itself cannot reach PyPI, use apt (measured 2026-09-11).**
The line above assumes `pip install pytest` works. In this web session it did
not, twice, and not quickly: it spent its timeout and ended in

```
pip._vendor.urllib3.exceptions.ReadTimeoutError: HTTPSConnectionPool(
  host='files.pythonhosted.org', port=443): Read timed out.
```

`files.pythonhosted.org` is in the egress proxy's `noProxy` list, so this is a
reachability failure rather than a policy denial — which makes it the kind that
can recur on one session and not the next, with nothing in the tree to say so.
The distribution's own package works and is one line:

```
apt-get install -y --no-install-recommends python3-pytest   # pytest 7.4.4
```

That is enough for every `pytest` line in this checklist. Recorded here for the
same reason the `apt-get update &&` paragraph below exists: a session that
follows this block exactly and hits a failing install has to choose between
reporting the tree green with `gitops/tests` unrun and spending the session
rediscovering a one-line workaround, and this file already knows which one gets
picked.

**`pip install pytest` is not the whole barrier, and the rest of it has been
invisible since it was written (added 2026-09-10).** That parenthesis warns
about the run that fails loudly. The run that *succeeds* needs two more lines:

```
apt-get update && apt-get install -y --no-install-recommends nginx-light openssh-client
python3 platform/ci/guard_state.py --require-runnable   # what still is not running
```

**`apt-get update &&` is load-bearing, and this line was missing it for a day
(measured 2026-09-10).** Without it, in a web session, that install does not
merely warn — it fails outright:

```
Failed to fetch .../nginx-light_1.24.0-2ubuntu7.6_all.deb  404  Not Found
```

The image ships a package index pinned to versions the mirror has already
superseded (`7.6` → `7.17`), so apt requests a `.deb` that no longer exists.
With `apt-get update` first the same install succeeds and all 24 assertions
run. The failure matters more than its size: a session that followed this
block exactly still could not clear a skip `guard_state.py` had just labelled
**FIXABLE**, and the honest next move from there is to report the tree green
with 24 guards unrun — the precise outcome `--require-runnable` was added to
prevent. This is the same defect the rest of this section keeps recording, one
layer further in: not a missing guard, and not even a missing install line, but
an install line that does not work. A fix instruction that fails costs more
than none, because it also spends the reader's trust in the next one.

Measured that day on a clean checkout of `main`, with pytest already
installed, the `gitops/tests` line read `533 passed, 25 skipped` — which is
what a clean run looks like, and is why the sessions reporting the tree green
off it were not being careless. **Seventeen of those 25 were
`test_front_door_serving.py`**: the only check in this tree that boots a real
nginx over the front door's own built ConfigMaps and asks it for a tool page.
Its own docstring says why it is the one worth having — both ways the gz-only
mirror can go dark (`try_files` on an absent uncompressed name, a positional
capture in a `rewrite`) are *textually clean*, so every other check on the
apex passes while the entire product surface 404s. Six more were
`test_load_ssh_key.py`, guarding the loader for `HETZNERSSHKEY`, the one
credential every route to the Hetzner boxes is blocked on.

Both skipped for a missing binary, both installed in one `apt-get`, and both
then passed — 19 and 11. Nothing was broken. That is the point: the session
could not have known that, and neither could the ones before it. The CI
workflow had already learned this (`hetzner-gitops-ci.yml` installs
`nginx-light` and carries a comment explaining why); only the list a session
follows during a starvation window had not — which is precisely the window in
which CI running them is the same as nothing running them.

This is the same defect as the Playwright block below, reached from a sixth
direction, and the arithmetic is identical: one install line was the entire
barrier between a correct guard and a guard nobody runs. `guard_state.py` is
that command turned into a check — it runs the checklist's pytest suites,
reads what actually skipped, and sorts each reason into **FIXABLE** (names a
tool, prints the install line), **ENVIRONMENTAL** (wants a GitHub-hosted
runner; genuinely not about this tree) or **UNCLASSIFIED**, which it prints
loudest because an unrecognised reason is how its own table would go stale.
`--require-runnable` exits 1 while a fixable skip stands, for the same reason
`pages_state.py --require-current` does: a reminder competes with everything
else in a long file, and an exit code does not.

It reads what skipped rather than scanning the sources for skip predicates,
deliberately — a static scan would miss every guard whose condition is
computed (`test_front_door_serving.py` resolves nginx from a candidate list,
not a literal) while inventing guards from `shutil.which` calls that skip
nothing. Same import-don't-restate rule this file records three times over.

**A skip is a green that means nothing ran.** `run_workflow_locally.py` closed
this hole at the *step* level on 2026-09-07 by reporting `UNRUN` rather than
`FAILED`, on the stated grounds that a red meaning "nothing ran" wearing the
costume of a red meaning "your code is broken" trains a reader to ignore the
result. A skip is that costume worn the other way round, and it is worse,
because nobody investigates a pass.

**The same shape had a third instance, in `node --test` rather than pytest, and
it is closed (2026-09-07).** `platform/webcheck/page-integrity.test.mjs` pins
its checker against the exact `index.html` blobs from the commits where two
products shipped dead — the suite's most valuable test, because it is proven
against the real defect and not an approximation of it. It reads them with
`git show <sha>:<path>`, and a web session's clone is **shallow** (50 commits),
so both history-pinned tests failed with `fatal: invalid object name '1a8feb3'`
on a clean checkout of `main`. Measured that day: a session running the block
above sees `# fail 2` and must choose between "the checker regressed" (burn the
run chasing nothing) and "ignore it" (learn to ignore a suite that also catches
real regressions). `platform/webcheck/history-blob.mjs` now makes the one
discrimination that matters — object absent **and** clone shallow is a SKIP
naming `git fetch --unshallow`; object absent in a **full** clone still fails,
because a test pinned to a sha that a complete history lacks has gone stale and
must go red. Verified both ways: 20 pass / 2 skip shallow, 22 pass / 0 skip
after unshallowing. If you want those two to actually run, `git fetch
--unshallow` first — which `CLAUDE.md` already tells you to do before any
supersession check, for the same underlying reason.

**That parenthesis is no longer the only thing standing between a session and
a wrong reading of `main` (changed 2026-09-07).** It warns about the raw
`node --test`/`pytest` lines above, and `run_workflow_locally.py` — the line
this block tells you to prefer, precisely because a hand-copied list goes
stale — had the same hole and no warning at all. Measured that day, twice on
the same clean checkout of `main` minutes apart, with nothing between the two
runs but `pip install pytest`:

```
portfolio-validate.yml: 55/60 run: step(s) passed, 5 failed
portfolio-validate.yml: 60/60 run: step(s) passed
```

All five said `No module named pytest`; `main` was green both times. The tool
already exempted a failing *install* step from the verdict, on the stated
grounds that reporting it as a failure "trains a reader to ignore the result"
— and then rendered the five steps downstream of that install as ordinary
`FAILED`, indistinguishable from an assertion failure in the repository. This
is the same shape as the starvation signature the section above describes: a
red that means "nothing ran" wearing the costume of a red that means "your
code is broken."

A step that cannot find its interpreter, module, or binary is now reported as
**`UNRUN`** — named, counted as not run, listed with what to install, and
never left reading as green. It does not fail the sweep, because a sandbox
without pytest is not a defect in `main`. What it is *not* is a licence to
ignore the line: an `UNRUN` step still owes an answer, and the summary says
so. Install what it names and re-run before you claim the tree is green.

The one discrimination that matters: a module the repository itself supplies
(`No module named pages_state`) stays `FAILED`. That is not a missing tool —
it is the documented `platform/ci` working-directory trap, and calling it
"toolchain missing" would bury the defect the check exists to surface.

**If your change touches markup a user types into, run the browser checks too —
one `npm install` is the whole barrier, and sessions have been treating it as
impossible** (added 2026-09-06):

```
python3 platform/ci/browser_state.py               # has anyone run these lately?
npm install --no-save playwright@1.56.0 axe-core   # both in ONE command
python3 platform/ci/browser_checks.py --only <slug>
```

**Ask the first line before you decide the other two are someone else's job**
(added 2026-09-07). A whole-site run takes 20-30 minutes and printed its
verdict to a terminal that then went away, so nothing in the tree said whether
it had ever happened — which left every session choosing between spending the
30 minutes again and skipping, and this file already records which one gets
picked. `browser_state.py` reports, per check, the date and commit it last
passed at, and whether anything under `ventures/`, `platform/pages/` or
`platform/marketing/` has moved since. A docs or ledger merge does not stale a
reading; a change to a rendered surface does. Add `--record` to a full
`browser_checks.py` run to write the reading — it refuses a `--only` run and a
run with skips, because a reading that laundered either into "the catalogue
passed" would be worse than no reading at all.

`platform/ci/browser_checks.py` already does the hard parts — it builds into a
temp dir, proves with a sentinel token that the port is not answering a stale
build, and finds the Chromium the image ships at `/opt/pw-browsers` on its own.
What no session had, and what kept every one of them writing *"no Playwright in
this environment, so the browser-only checks were not run"* in its limitations
section (PR #3525 included), is the install line above. Two traps in it:
`playwright@1.56.0` is the release matching the preinstalled build 1194 — 1.55
wants 1187 and 1.57 wants 1200, and either fails at launch and invites you to
run `npx playwright install`, which downloads a second browser tree and can
exhaust a session's disk allowance. And `npm install --no-save X` prunes a
package a previous `--no-save` added, so installing the two separately
uninstalls the first and the next run fails with `ERR_MODULE_NOT_FOUND` for a
package you watched install.

This is not a nice-to-have. The first full `contrast.mjs` run in this
repository's history, on 2026-09-06, found **48 critical axe `label` violations
across three live products** — 24 route-table inputs with no accessible name,
announced to a screen reader as `edit, number` and nothing else.
`checklist_coverage`, `guide-coverage`, `clauses`, `check.mjs` and 1139 passing
`node --test` assertions were all green at the time, because not one of them
looks at accessible names. The checks had been in the tree, correct and unrun,
for the whole life of the catalogue — the same "a guard nobody runs is worth
less than no guard" defect recorded above for `platform/proposal/`, reached
from a fifth direction, and the only one of them that was shipping a live
accessibility failure to real users the entire time.

**The first line was added 2026-09-06, to stop the second block from going
stale the same way three times.** `platform/proposal/`, then
`platform/privacy/` and `platform/webcheck/`, were each added to this list only
after a guard in an un-enumerated directory had already gone unrun — most
sharply `platform/proposal/term-ids.test.mjs`, red on `main` for days while
five sessions each shipped the bug it exists to catch and each recorded a
clean local run, because the list they ran did not name it. The lines above
name each directory literally rather than with a glob that would auto-discover
a new one, so a sixth `platform/<new-thing>/*.test.mjs` directory is exactly
as invisible to this checklist as the third one was, until someone thinks to
run `find . -name '*.test.mjs' -not -path './ventures/*'` by hand and notices.
`checklist_coverage.py` is that command turned into a check: it fails, naming
the missing line, the moment a new test directory outruns this list, instead
of waiting for the bug the missing line would have caught. If it fails, add
the line it prints in the same commit that added the tests.

**The `gitops/tests` condition was widened on 2026-09-05, because "only if you
touched `gitops/`" reads as "only if you meant to".** Giving a venture a public
page touches nothing under `gitops/` by hand — but `regen.mjs` then rewrites
several hundred files there, and `test_manifests.py` carries the mirrored-tool
count typed out in four places (`infra/OWNER_CHECKLIST.md`,
`gitops/prod/usage/aggregate.py`, and twice in
`gitops/prod/front-door/default.conf`). So **every venture that gains a browser
surface fails that suite until those four are updated**, and #3407 merged red
on it: the two traps compounded, the condition read as not-applicable and the
missing pytest made the check look clean. Fixed forward in #3408. If you ship a
venture page, run this line — the condition is about what your commit contains,
never about what you edited on purpose.

**The `platform/ci` line was added 2026-09-05, and it is the same defect as
`platform/proposal/`, arrived at from a third direction.** The line above it
already said "only if you touched `gitops/` or **`platform/ci/`**" — so the
list *named* the directory and then sent you to run a different one's tests.
`platform/ci/` holds 15 `unittest` modules, and they guard the tools every
session here leans on to decide what is true: `ci_starvation.py` (is this red
check real?), `pages_state.py` and `publish_surface.py` (is there a route to
a user?), `public_surface.py` (does a hostname answer?). A session that edits
one of those and follows the list runs `gitops/tests` and never executes a
single guard on the thing it just changed.

CI does run all 15 (`portfolio-validate.yml` and four sibling workflows, one
`python3 -m unittest <module>` step each), which is why this stayed invisible
— and is exactly why it matters *now*: while runners are starved, CI running
them is the same as nothing running them.

Two traps, both measured rather than recalled. `python3 -m pytest platform/ci`
from the repo root **fails collection** — these modules `import pages_state`,
`import review` and so on by bare name, so they only resolve with
`platform/ci` as the working directory, which is why the line above `cd`s.
And grepping the workflows for `test_foo.py` finds nothing, because the steps
invoke the *module* (`python3 -m unittest test_foo`); a coverage check by
filename reports all 15 unrun, which is wrong. Verified 2026-09-05: all 15
pass locally.

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

**`platform/privacy/` and `platform/webcheck/` were added the same day, by
enumerating instead of remembering.** Not because either was red — both pass,
31 assertions between them — but because the paragraph above had just been
written about `platform/proposal/` and the obvious next question, *what else is
outside the list?*, had not been asked. `find . -name '*.test.mjs' -not -path
'./ventures/*'` answers it in one command and returned five directories against
the three the list named. The privacy suite is the one that matters: it guards
the claim every tool's page makes about the visitor's data never leaving the
device, which is the portfolio's central promise and the one whose quiet
breakage would be least visible in a diff.

That is the cheap version of this lesson, and it generalises past this list. A
guard going unrun is not usually discovered by a session noticing it is
missing — nobody notices an absence — it is discovered by the bug it should
have caught, months later. Enumerate the ground instead of recalling it; the
command is faster than the recollection and it cannot be honestly wrong.

**After you merge a change that touches a served surface, refresh the
published snapshot** (added 2026-09-05):

```
python3 platform/ci/pages_state.py --require-current   # exits 1 if it is stale
CONFIRM=publish-pages-branch PUSH=1 ./platform/pages/publish-branch.sh
python3 platform/ci/pages_state.py --require-current   # and 0 once you have
python3 platform/ci/indexnow_state.py                  # and: was any of it announced?
```

**That last line was added 2026-09-11, and the answer it returned on the day
it was written was `never` — for all 964 published pages.** The publish script
announces to IndexNow in `announce_to_indexnow`, right after the push above,
and that call has never once reached the API. Both routes are individually
correct and between them they cover every publish and announce none of it: the
by-hand route (this block) pushes and so does reach the call, from a sandbox
whose egress proxy 403s `api.indexnow.org`; the runner route has real egress
but, with `vars.PAGES_BRANCH_PUBLISH` unset, takes its `PUSH=0` step and never
reaches the call at all.

It matters more here than it would on an ordinary site. `pages_state.py`'s
`indexing` row measured that sitemap auto-discovery *cannot happen* from a
project-Pages subpath — crawlers read `robots.txt` at the host root, which
belongs to someone else's site — so IndexNow is the only page-enumeration
route this catalogue has that does not need the owner's login. Zero observed
visitors across 248 products is consistent with never having asked.

`publish-pages-branch.yml` now carries an announce step gated on the exact
complement of its publish gate, so precisely one of the two paths fires and
the announcement happens the moment a runner is available again. Until then
`indexnow_state.py` is how you tell "announced" from "nobody ever asked" —
a distinction that leaves no trace in the tree, since a submission writes no
artifact and IndexNow has no confirmation API. It reports `never` only with a
named reason, and `unknown` rather than `never` when it cannot read.

**If that middle line refuses with "publishing backwards", another session
published while you were building** (added 2026-09-06). Do exactly what it
says — `git fetch origin main && git reset --hard origin/main`, then re-run —
and do not reach for `ALLOW_REGRESSION=1`, which exists for a deliberate
rollback and nothing else. The refusal is new because the failure it catches
was measured that day: two sessions overlapped, one published the merge that
had just landed, and the other, still holding the previous commit, force-pushed
a second later and took a just-shipped venture off the live site. Nothing went
red — `pages_state.py` reported `stale` afterwards, which reads as "nobody has
published yet", not "somebody undid a publish". With up to 4 distinct sessions
inside a 15-minute window here (`session_gate.py`), that overlap is the
ordinary case.

**`--require-current` was added 2026-09-06, and the reason is that the
paragraph you are reading did not work.** This section has said "refresh the
snapshot" since 2026-09-05, and on 2026-09-06 the snapshot was found stale
anyway — built from `1afe50c5` while `main` was at `565cc635` — by a session
that had read it. A reminder competes with everything else in a long file; an
exit code does not. The flag prints the same report and then fails, naming the
one command that fixes it, so a stale snapshot stops being something you have
to remember to look for. Bare `pages_state.py` is unchanged and still exits 0
on a stale snapshot: that answers "is this route worth having?", which is a
different question, and folding the two together would make a green run mean
two things.

It never publishes for you. Publishing rewrites a branch, which is not
something a check should do as a side effect — so the gate reports and you run
the second line.

The runner-free deploy route serves the `gh-pages` branch, which is a
committed artifact rather than a build: **nothing rebuilds it when `main`
moves.** That is the one real cost of being downstream of neither a runner
nor the cluster, and until now nothing in this file said so, so every merge
quietly widened the gap between what `main` contains and what the route
would publish. `pages_state.py` reports `current` or `stale` against the tip
of `main`, so the question is one command rather than a judgement.

This matters most on the day it stops being theoretical. If the owner has
flipped Settings → Pages → `gh-pages`, a stale snapshot is not a staging
detail — it is the live site silently lagging `main`, with no error anywhere
to say so. Refreshing costs about a minute and needs no credential.

**Keep doing it by hand while runners are starved, but it is no longer the
only thing standing between `main` and the branch** (added 2026-09-06).
`.github/workflows/publish-pages-branch.yml` runs exactly the command above on
every push to `main` that touches `ventures/**` or `platform/pages/**`. Two
things to know about it, because both are deliberate:

- **It pushes nothing until the owner sets `PAGES_BRANCH_PUBLISH` to `true`.**
  CLAUDE.md's "Automation" rule forbids adding an unattended workflow that
  pushes commits without owner approval, so the gate is the approval, exactly
  as `PAGES_ENABLED` gates the `deploy-pages` route in `portfolio-pages.yml`.
  With it unset the workflow still builds the site and runs `check.mjs`
  against the artifact, so a dead link the copy step introduces turns a merge
  red instead of reaching a crawler.
- **It needs a runner**, so during a starvation window it does nothing at all
  and the manual command above is still the only route. That is the honest
  limit: this closes the drift hole from the day runners return, not today.

The snapshot was found stale again on 2026-09-06 (built from `1afe50c5` while
`main` was at `565cc635`) — one merge behind, by a session that had read this
section. That is the argument for automating it rather than restating it.

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

> **SUPERSEDED IN PART, 2026-09-06: the catalogue IS served. Read this first.**
>
> All 175 products are built, deployed and being served by GitHub Pages at
> **https://duncan-haywood.github.io/monorepo-projects/** — Pages serves the
> `gh-pages` branch that `platform/pages/publish-branch.sh` writes.
> Proof rather than inference: GitHub's own managed builder
> `dynamic/pages/pages-build-deployment` ran on that branch and concluded
> `success` (runs 34011996382 and 34012041708), and a managed Pages build is
> triggered *only* by a push to the configured source. Both completed while
> Actions runners were starved, so this route does not spend the metered
> allowance. `deploy-settings` is granted; do not rank it, and do not describe
> the portfolio as having no public URL.
>
> **Stated exactly, because the failure being corrected here is overclaiming.**
> What is measured is that GitHub *deployed* the branch. What is not measured
> is an unauthenticated HTTP 200: no session can fetch it — the agent egress
> proxy answers `403 to CONNECT` for `github.io` — and a Pages site can in
> principle be access-controlled rather than public. That last step is one
> logged-out page load by the owner, and `github-pages-origin` in
> `infra_state.yaml` stays `unknown` until someone takes it. "Deployed" is a
> great deal more than the "dark" this file has been asserting, and it is not
> the same as "a stranger has read it".
>
> **What is still down is `marisstella.dev`** — the k3s cluster, everything in
> the block below, and it is all still accurate about *that* origin. The two
> were run together because the repository assumed a single origin; they are
> two, and only one of them is dark.
>
> **The standing job this creates.** A committed artifact does not rebuild
> itself and nothing refreshes it while runners are down, so after any merge
> that touches a served surface, run
> `CONFIRM=publish-pages-branch PUSH=1 ./platform/pages/publish-branch.sh`.
> That command is now the difference between the live site and `main`.
>
> **And the lesson, which is why the block below is kept rather than deleted.**
> Every sentence in it was a correct reading of the manifests and the API on
> the day it was taken, restated as a claim about what a visitor receives —
> and then nothing re-ran when the world changed. The 2026-09-05 Pages reading
> made it worse by reasoning from an *absence* (no `dynamic/pages/` workflow
> listed), and an absence goes stale in silence. Prefer a reading taken from
> something *present*: a run has an id, a conclusion and a date. Ask
> `python3 platform/ci/pages_state.py` and read its `deployed` row rather than
> trusting any prose here, this correction included.
>
> ---
>
> **MEASURED 2026-09-04 (about `marisstella.dev`): nothing is served.**
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
1,102 that reached `main`**, while `portfolio/usage/usage.yaml` still carried
no visitor measurement at all for any of the 184 products. The rule that was
supposed to prevent that ("do not open ledger-only PRs that re-state known
blockers") had an escape hatch, and every session used it.

**That sentence used to end "still recorded zero observed users", and the
correction is worth more than the sentence (2026-09-11).** The file has never
recorded a zero. It carries `live_url_visitors: null` — 399 readings, not one
of them a number — because GitHub Pages exposes no server-side analytics, this
portfolio adds no third-party one, and the local counters are opt-in and off by
default. Eleven places in the tree had turned that `null` into "zero observed
users", which is the same absence-read-as-measurement error this file records
against the 2026-09-05 Pages reading and `infra_state.yaml` records against a
stale row — running the other way, and worse, because an absence reading as a
*negative result* is evidence, and it licenses retiring a product or declaring
an archetype saturated. "Never measured" licenses exactly one thing: go get a
reading. `python3 platform/ci/usage_state.py --require-honest` fails while a
steering document calls the null a zero, and goes quiet the moment either the
sentence or the data changes.

So: record outcomes per `portfolio/ledger/README.md` when you **shipped
something**, in the same commit or PR as the thing you shipped. If you found a
blocker instead, say so in your reply and leave `main` alone — an unshipped
session is a real outcome and does not need a commit to be true. Never bundle
a ledger entry into a PR waiting on the owner.

`git fetch origin main` before appending; skip if the latest entry already
covers your finding. The ledger *tooling* (`.py` under `portfolio/ledger/`) is
ordinary platform code, exempt from the check and mergeable on its own.

**A "set direction" brief has the same failure mode, and it now has the same
kind of check.** `portfolio/DIRECTION.md`'s "Before rewriting this brief
again" section asked sessions to check recent history before restating the
north star; well over a dozen direction-only commits to `DIRECTION.md` and
`AGENTS.md` landed anyway across 2026-09-06/07, because the check lived in
prose a session only sees after opening the file. Run this before pushing a
direction-setting session's work:

```
python3 portfolio/ledger/check_direction_only.py
```

Exit 1 means every file in your branch is `portfolio/DIRECTION.md` and/or
`AGENTS.md` and nothing else — restate nothing; instead check
`git log -5 -- portfolio/DIRECTION.md AGENTS.md`, and if the brief is
already current, spend the session on `portfolio/router/allocate.py`'s top
candidate or a fresh venture screened against `screened-out.md`. A genuine,
targeted correction to either file still passes as long as it rides with
real work in the same PR.

## Automation

Do not add or re-enable unattended workflows that push commits or call paid
APIs without owner approval.

## Never write `fixes #N` / `closes #N` about someone else's PR

GitHub closes the referenced PR **unmerged** when that commit hits `main`.
Refer as "#109" or "PR #109". Rephrase "fixed #109's conflict" → "resolved
the merge conflict on #109".

When intentionally closing a PR, comment why and point to what supersedes it.
