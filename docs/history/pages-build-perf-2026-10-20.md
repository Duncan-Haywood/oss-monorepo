# Performance pass on the frequently run tools (2026-10-20)

Question from the owner: is there performance engineering worth doing on the
tools that run a lot, for example rewriting them in Rust?

Answer: **not a rewrite.** Every slow tool measured here was slow because of a
setting or a library choice, and the hot code was already native (zlib,
libyaml). Two fixes landed in PR #8767. Three more are written up below, under
"For the next agent", with enough detail to pick up cold.

## How it was measured

- Container: the claude.ai cloud session, Node v22.22.0, Python 3 with PyYAML
  6.0.3 built with libyaml. These are wall-clock times from one machine, not
  CI runner times. Expect CI to differ by a constant factor.
- The Pages build was profiled with
  `node --cpu-prof build.mjs --out=<dir>`. Self time was then summed per
  function and attributed to the nearest caller under `platform/pages/`.
- Python tools were profiled with `python3 -m cProfile -s cumulative`.

## Findings

### 1. Pages build: share-card PNG compression (fixed)

`node platform/pages/build.mjs` took **182s**. Of that, **112s** was
`zlib.deflateSync`, called only from `encodeRaw` in
`platform/pages/offline.mjs`. That function encodes about 1,450 share cards at
1200×630, at deflate level 9. The other zlib caller, `gzipBytesOf` in
`build.mjs`, took 1.7s. Rendering the cards themselves (`renderSocialCard`
plus `cardtext.mjs`) took about 25s.

Each setting was run on one real card (`401k-loan-vs-withdrawal-calculator`,
3,024,630 raw bytes), averaged over 5 runs:

| Filter / setting | ms per card | bytes |
|---|---|---|
| none, level 9 (old) | 84.3 | 52,840 |
| **none, level 6 (new)** | **10.9** | **57,797** |
| none, level 1 | 3.3 | 78,408 |
| none, Z_RLE | 18.1 | 890,275 |
| Up filter, level 9 | 80.1 | 64,502 |
| Up filter, level 6 | 10.7 | 65,482 |
| Up filter, Z_RLE | 2.8 | 94,464 |

The PNG "Up" filter makes these flat-colour cards *larger*, so the filter
stays at none. Level 6 was the setting that shipped:

| | before | after |
|---|---|---|
| `node build.mjs` wall time | 3m02s | **1m21s** |
| all PNG bytes in the built site | 74,690,747 | 81,415,795 (+9.0%) |
| whole built site | 215,302,143 | 222,027,191 (+3.1%) |

A visitor who receives a shared link downloads one card, so they pay about
4.6 KB more.

**Any change to the encoder's output bytes needs `node
platform/marketing/regen.mjs`.** The apex's share card,
`gitops/prod/front-door/social-card.png`, is committed, and
`platform/marketing/front-door.test.mjs` compares it byte-for-byte with
`renderSocialCard()`. This PR's first push turned that test red, and
regenerating the card fixed it. Check `regen.mjs --verify`'s exit status
directly, not through a pipe. `node check.mjs dist` exits 0 on the new build. All 1,159 tests
in `node --test platform/pages/*.test.mjs` pass.

### 2. Router: merit scores parsed with pure-Python YAML (fixed)

`portfolio/router/allocate.py` already loaded the ~1,300 `VENTURE.yaml` files
through libyaml (`_load_yaml`). `load_merit_scores` still called
`yaml.safe_load`, which is pure Python, on the 1.4 MB
`portfolio/scoring/venture-scores.yaml`. It now calls `_load_yaml`. That
takes it from 1.36s to 0.12s, and the parsed dict is identical (checked with
`==`). All 73 tests in `test_allocate` pass.

### 3. Other tools timed (no change made)

| Command | Wall time | Note |
|---|---|---|
| `node --test platform/pages/*.test.mjs` | 8m54s (after fix 1) | See next-agent item A |
| `python3 portfolio/router/allocate.py` | 59s cold, 18s warm | The cold run was a `git fetch --deepen` of the shallow clone. Warm: 12.7s in `deepen_to_window`/`recent_commits`. See item C |
| `python3 portfolio/ledger/session_gate.py` | 6.9s | |
| `python3 platform/ci/validate_workflows.py` | 4.7s | |
| `python3 platform/ci/publish_surface.py --check` | 2.0s | |
| `python3 platform/ci/check_md_links.py` | 1.7s | |
| `node platform/pages/clauses.mjs` | 1.3s | Run by 281 workflows, see item B |
| `node platform/pages/surface-budget.mjs --check` | 1.0s | |
| `python3 prompts/promptctl.py route` | 0.4s | |

None of these is CPU-bound in a way that a compiled rewrite would fix more
cheaply than the items below.

## For the next agent

Each item is independent. Before starting one, search open PRs for its
keywords, as CLAUDE.md "Duplicate PRs" requires.

### A. Share full builds across the build.test.mjs tests (done, 2026-10-20)

**Outcome.** Done in a follow-up session the same day. See "Item A: result" at
the end of this file for the measurements. The steps below are kept as the
record of what was asked.

In the 2026-10-20 run, after fix 1, these four tests in
`platform/pages/build.test.mjs` took most of the suite's 8m54s:

| Test | ms |
|---|---|
| an identical build produces an identical cache name | 181,593 (two builds, lines ~3135-3136) |
| changing the worker itself changes the cache name | 99,263 |
| no test payload, CLI source, or repo bookkeeping is published | 90,452 |
| the worker can be withdrawn from devices that already have it | 88,093 (`disableWorker: true`, line ~3351) |

There is already one shared build in a `before` hook (`built = await
buildSite({ outDir, baseUrl: BASE })`, line ~129). Steps:

1. Find every `buildSite(` call in `build.test.mjs` (`grep -n "buildSite("`).
   For each one, note the options it passes.
2. Every call with the same options as the shared one (`{ outDir, baseUrl:
   BASE }`) should read the shared `built`/`outDir` instead. One exception:
   the determinism test needs a *second* independent build to compare
   against, so it keeps one build of its own and compares it to the shared
   one.
3. Calls with different options (`disableWorker`, a custom domain, an
   altered worker) still need their own build. Check whether any two of them
   can share one.
4. Never weaken an assertion to make this work. A test that mutates the
   output directory must keep its own copy (`fs.cp` of the shared dir is far
   cheaper than a rebuild).
5. Verify: run `node --test platform/pages/*.test.mjs` before and after, and
   report the totals and the per-test `duration_ms` above. Pass count must
   stay 1,159 or more.

Expected saving: roughly one full build (~80s locally) per test that switches
to the shared build.

### B. Stop running the same clause check from 281 workflows

`node platform/pages/clauses.mjs <slug>` appears in 281 workflow files under
`.github/workflows/` (the per-venture `venture-ci.yml` copies).
`portfolio-validate.yml` also runs it unscoped on any PR that touches
`ventures/**/*.html`. Each copy books a runner, checks out and installs for a
1.3s check. That is CI scheduling cost, and it matters more than script speed
while runners are starved.

This is a larger change than A, so start by reading the rationale comment at
the top of `platform/pages/clauses.mjs`. It explains why the check runs
per-venture. That reason is to tell the venture author, in their own CI, when
their page breaks the rule. A consolidated design has to keep that property,
for example one workflow that runs `clauses.mjs` for the slugs a PR changed.
Check `platform/ci/validate_workflows.py` and `test_validate_workflows` for
anything that expects every venture to carry the step. Do not remove a check
without replacing it.

### C. allocate.py's git deepen in shallow clones

On a shallow clone, `allocate.py` first deepens history to its commit window
(`deepen_to_window`, ~line 628). The first run here took 59s, and a warm run
spent 12.7s in git subprocesses. If CI calls it on a `fetch-depth: 1`
checkout, set an explicit `fetch-depth` or `shallow-since` in that workflow
instead. Measure with `python3 -m cProfile -s cumulative
portfolio/router/allocate.py | head -40` before changing anything.

### Not worth doing (measured)

- Rewriting the Pages build in Rust or Go. After fix 1, the largest pieces
  are card rasterising (~25s, plain JS loops) and file I/O. A rewrite would
  mean replacing a Node-builtins-only build that ~1,159 tests cover.
- Lower deflate levels or `Z_RLE`. These save a few more seconds but make
  cards 36% to 1,600% larger.

## Item A: result

Done on 2026-10-20 in session
`https://claude.ai/code/session_01EVCTBGxxTBZs7onco53Z3A`.

`build.test.mjs` called `buildSite(` six times. Two calls build small fixture
venture directories (`/compare/`, `/guides/`) and take under a second each, so
they were left alone. Of the four full builds:

- **an identical build produces an identical cache name** now compares the
  shared build from `site()` with one independent build in a fresh temp
  directory. It still compares two separate builds in two different paths
  (it now also asserts the paths differ), so the claim "the hash does not
  depend on build order or paths" is tested as before. The second build's
  directory is removed afterwards.
- **changing the worker itself changes the cache name** used to build the
  site again only to run `addOfflineSupport` over it with a different
  `codeVersion`. `addOfflineSupport` rewrites every page in place, so the test
  now runs it on an `fs.cp` copy of the shared build, which leaves the build
  the other tests read untouched. The assertion is unchanged.
- **no test payload, CLI source, or repo bookkeeping is published** never had
  a build of its own. It is the first test that calls `site()`, so the shared
  build is charged to it. Its time is the suite's one shared build and cannot
  be removed by sharing.
- **the worker can be withdrawn from devices that already have it** builds
  with `disableWorker: true`. That option reaches `addOfflineSupport` from
  inside `buildSiteInner`, so testing it on a copy would test a different code
  path from the real build. It keeps its own build. No other full build uses
  the same options, so there is nothing for it to share with.

No assertion was removed or loosened.

Measured on the same 4-core cloud container, Node v22.22.0,
`node --test --test-reporter=tap platform/pages/*.test.mjs`, one run each,
before and after the change:

| | before | after |
|---|---|---|
| suite wall time | 593.2s (9m53s) | **417.7s (6m58s)** |
| tests / pass / fail | 1162 / 1161 / 1* | 1162 / 1162 / 0 |

\* The one failure before was unrelated to this change. It was
`custom-domain.test.mjs`, "a custom-domain build leaves no reference to the
default origin". The post `docs/posts/2026-10-20-we-almost-rewrote-it-in-rust.md`
linked the catalogue by its literal `github.io` address, which the custom-domain
build then published. The link was removed in the same PR as this change.

Per-test `duration_ms`:

| Test | 2026-10-20, first run | before | after |
|---|---|---|---|
| an identical build produces an identical cache name | 181,593 | 196,599 | **103,176** |
| changing the worker itself changes the cache name | 99,263 | 110,056 | **26,734** |
| no test payload, CLI source, or repo bookkeeping is published | 90,452 | 102,301 | 98,807 (the shared build) |
| the worker can be withdrawn from devices that already have it | 88,093 | 99,513 | 105,308 (own build, kept) |

The "first run" column is the original measurement above. This container ran
about 10% slower than that one. The suite's test files run in parallel, so
`build.test.mjs` is the critical path and its savings show up almost one for
one in wall time: about 177s saved by the two tests, and 176s off the total.

What is left: the two builds that remain are the shared one and the
`disableWorker` one. Removing either would mean changing `buildSite` itself,
for example letting a test run the offline step on its own. That is a design
change, not test plumbing.

### Main was red when this landed

On the first merge of `main`, CI on PR #8789 failed on checks that also
failed on `main`: `custom-domain.test.mjs` (posts linking live tools by their
`github.io` address), `entities.test.mjs` (`&rho;`, `&lceil;`, `&rceil;`),
`faq-visible.test.mjs` (`changepoint-detector`'s FAQ JSON-LD quotes) and the
`platform/marketing` staleness tests. This PR fixed them. Before it merged,
`main` landed its own fixes for all of them, and PR #8767 merged on its own.
On the second merge this branch took `main`'s versions, so the PR's final diff
is item A only: `build.test.mjs`, this section and the run record.

Final check, on the tree with `main` at `f56d696e1` merged in: `node --test
platform/pages/*.test.mjs` passes 1182/1182 in 412.7s.
