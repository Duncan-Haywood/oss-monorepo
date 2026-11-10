# Quality audits: is the work finished, and is it expert-grade?

A standing programme, started 2026-11-07 at the owner's request: "a category in
the blog for measuring objective quality of the work of this repo in general
like correctness and quality. On the things it attempts what is actually
getting finished and accomplished to a high senior expert professional level
or higher. This should be ongoing and very thorough."

Other measurements here answer narrower questions:
[`research/_audit/`](../../research/_audit/README.md) asks whether research
numbers reproduce, and
[`platform/ci/post_merge_review.py`](../../platform/ci/post_merge_review.py)
picks the *riskiest* recent PRs to read for bugs. Neither asks the question
this one does: **of the things this repository attempts, what fraction is
finished, correct, and at the level a senior professional in that field would
sign off on?** That needs a random sample (so the answer is not chosen by the
auditor), a fixed rubric (so two rounds are comparable), and evidence for
every score (so a reader can check it).

Posts go in `docs/posts/` tagged `quality-audit`; the blog files them under
the topic "Quality audits" (`platform/pages/writing.mjs`, `TOPICS`).

## Four modes

The owner, 2026-11-10: "direct a lot more work to quality audits. more detail
in it. and also reflections on what parts of the process seem to make the
quality drop off and suggested fixes to the process. ongoing thing full repo
quality reviews. detailed metrics on quality and correctness."

A quality session runs one of four modes. `python3
platform/ci/quality_audit.py mode` picks it: `reflect` whenever no reflection
has been written for seven days, otherwise a draw seeded by the date (sample
35%, census 30%, fix 25%, reflect 10%; `fix` doubles while high-severity
defects are open). Software decides the routine; the session's time goes to
the audit.

| mode | what it does | command |
|---|---|---|
| `sample` | the stratified random round below: the unbiased share meeting the bar | `sample` |
| `census` | the full-repository sweep: never-audited subjects first, so every venture, research project and platform directory gets a first audit | `census --n 6` |
| `fix` | work the open-defect queue: fix, add the test that would have caught it, record the PR in the audit's `fix_prs`, then re-audit the subject in a new file | `queue --severity high` |
| `reflect` | read the corpus and the process, write `reflections/<date>-<slug>.md`: where quality drops, why, and process fixes with the metric each should move | `metrics --md` |

Census audits use stratum `venture`, `research` or `platform` like sampled
ones, and the full rubric, and set `"drawn_by": "census"` (a fix-mode
re-audit sets `"fix"`). They are not uniform draws, so `summary` shows them in
the per-stratum rows but leaves them out of the sampled share and its
interval, which stays an estimate from `sample` rounds alone; the
`metrics` coverage table tracks the sweep (159 of 2,423 subjects audited by
2026-11-10).

## One round

```
python3 platform/ci/quality_audit.py sample            # today's subjects, seeded by the date
python3 platform/ci/quality_audit.py sample --k 6 --seed 2026-11-07
# ... audit each subject (below), write portfolio/quality/audits/<date>-<subject>.json
python3 platform/ci/quality_audit.py validate          # schema and score checks
python3 platform/ci/quality_audit.py summary           # the scoreboard, all rounds
python3 platform/ci/quality_audit.py summary --md      # the same as Markdown, for the post
```

`sample` draws, without replacement and reproducibly from the seed:

| stratum | population | how many | why |
|---|---|---|---|
| `flagship` | `portfolio/flagships.yaml` | 1, the least recently audited, if not audited in the last 7 days | the work the owner most wants deep; every flagship gets audited in rotation |
| `venture` | every `ventures/<name>/` | 2 by default, uniform | the typical product, not the best one |
| `research` | every `research/<name>/` not starting `_` | 2 by default, uniform | the typical research project |
| `platform` | every `platform/<name>/` | 1, uniform | the shared tooling everything else stands on |

A venture, research or platform subject audited in the last 90 days is skipped,
so rounds spread over the population and re-running the same seed after
audits have landed draws different subjects (that is expected; the seed only
fixes the draw for a given set of audits). The flagship is never skipped: the
least recently audited one is drawn, so the same flagship under every seed is
the rotation working, not a bug. From 2026-11-10 a flagship audited in the last
7 days is not drawn (`FLAGSHIP_REAUDIT_DAYS`): daily re-audits of unchanged
flagships were returning identical scores. Two rounds in flight at once
can draw the same subjects; add a `-b`, `-c` suffix to the seed when an open
`quality:` PR lists a subject you drew. Because the non-flagship strata are uniform random, the share of
them that meets the bar is an unbiased estimate for that stratum, and
`summary` reports it with a Wilson 95% interval. Flagships are reported apart:
they are chosen, not sampled.

Do not swap a drawn subject for a more interesting one. If a draw is
genuinely unauditable (an empty directory), record it with
`"status": "unauditable"` and the reason: that is a finding about the
repository too.

## The rubric

Seven dimensions, each scored 0 to 4 against these anchors. **3 is the bar the
owner set: a senior professional in the subject's own field** (a framer for
framing takeoff, a CPA for bookkeeping, a statistician for an inference
method), not a senior *software* engineer only.

| score | anchor |
|---|---|
| 0 | broken, misleading, or empty: it claims something it does not do |
| 1 | a prototype or demo: the idea is visible, a user cannot rely on it |
| 2 | works on the happy path, gaps a professional would hit in the first hour |
| 3 | **senior professional**: a practitioner would use it or sign it off, with the stated limits |
| 4 | expert or beyond: matches the best available tool or a publishable standard |

| dimension | the question | evidence required (at least) |
|---|---|---|
| `correctness` | Are its outputs right? | 3 or more outputs recomputed independently: by hand, from a cited standard (code table, IRS publication, textbook), or against another tool. Say which. |
| `completeness` | Of what its README, ROADMAP or page says is done, how much works end to end? | list each claimed feature checked and whether it worked; stubs, TODOs, dead links counted |
| `verification` | Would its tests catch a real bug? | the test command run and its result; one hand-seeded mutation in core logic and whether a test failed |
| `craft` | Would a senior reviewer in this language accept the code? | named files read; concrete defects (dead code, copied engines, unhandled input, silent fallbacks) |
| `claims` | Is every claim on its page and README backed by a file, with limits and disclaimer? | each checked claim and the file that backs it, or does not |
| `fitness` | Could the intended user finish their real job with it (product), or could a researcher build on it (research)? | the job walked through; for research, the nearest prior work and whether the result is new and sound |
| `domain` | Would a senior practitioner in the field sign off on the method? | the standard or practice compared against, and where it departs |

**Meets the bar** (computed by `summary`, not chosen by the auditor):
`correctness`, `claims` and `verification` all 3 or more, and the median of
the seven 3 or more. A wrong number or an unbacked claim cannot be outweighed
by good code.

**Finished** (also computed): `completeness` 3 or more. A subject can be
finished and not meet the bar (it does all it says, at a junior level), or
meet most of the bar and not be finished.

## How to be thorough, not generous

The auditor is usually the same kind of agent that wrote the work, and the
easy failure is grading the README instead of the thing. So:

- **Run it.** Every score above 1 needs a command you ran or a page you
  loaded, quoted in `evidence`. Reading code alone caps `correctness` at 2.
- **Recompute, don't re-read.** A test that the author wrote checks what the
  author believed. Check at least one output against a source the author did
  not write.
- **Seed one bug.** Change one comparison or constant in the core logic,
  run the tests, record whether they caught it, revert.
- **Name the professional.** Write who the senior reviewer is ("a licensed
  structural engineer", "a payroll specialist") and what they would check
  first, then check that.
- **Score the gap, not the effort.** A 40-file project that is wrong scores
  below a 3-file one that is right.
- **Fix forward, separately.** A defect you find gets its own fix PR (or a
  line in the subject's ROADMAP if it is large); the audit records the
  score *before* the fix, and `fix_prs` lists the fixes. Re-auditing after a
  fix is a new audit file, so the trend is honest.

- **Check what ships, not only the source.** The Pages build rewrites hosts
  in `llms.txt`, sitemaps and canonical links at deploy
  (`platform/ci/build_pages_site.py`, `rewrite_base_urls`). Before you file a
  defect about a URL in those files, load the served page at
  `https://marisstella.app/<slug>/`. On 2026-11-10 about 8% of all recorded
  defects were of this kind and none were on the served page (category
  `source-only` below).
- **Don't re-audit what nobody changed.** A re-audit is worth its cost after a
  fix or a substantial change. Before re-auditing a subject, check `git log`
  for commits under it since the last audit; with none, take the next subject.

## The audit file

One file per subject per round, `audits/<YYYY-MM-DD>-<subject>.json`, so
parallel sessions never conflict:

```json
{
  "date": "2026-11-07",
  "subject": "ventures/ai-bookkeeper",
  "stratum": "flagship",
  "seed": "2026-11-07",
  "auditor": "agent session (Claude), see run record",
  "status": "audited",
  "professional": "a CPA who closes books for small businesses",
  "scores": {"correctness": 3, "completeness": 3, "verification": 3, "craft": 3,
             "claims": 3, "fitness": 2, "domain": 3},
  "evidence": {"correctness": "...", "completeness": "...", "verification": "...",
               "craft": "...", "claims": "...", "fitness": "...", "domain": "..."},
  "defects": [{"severity": "high", "what": "...", "where": "path:line"}],
  "fix_prs": [],
  "verdict": "one paragraph a reader can check"
}
```

`severity` is `high` (a wrong number or claim a user would act on), `medium`
(a gap a professional would hit), or `low`. `validate` checks the shape;
`summary` aggregates every file.

### Detailed fields (required from 2026-11-11)

Prose evidence cannot be counted. From 2026-11-11 `validate` also requires,
for an audited subject:

```json
  "checks": [
    {"dimension": "correctness", "what": "Section 179 cap for an $80k SUV at 90% business use",
     "method": "IRS Pub 946 (2025), ch. 2, heavy-SUV limit", "command": "node cli.mjs --cost 80000 --biz 0.9",
     "expected": "39,440", "observed": "36,936", "result": "fail"}
  ],
  "mutations": [
    {"where": "calc.mjs:212", "change": "cap * biz -> cap", "caught": false, "test_cmd": "node --test '*.test.mjs'"}
  ],
  "defects": [{"severity": "high", "what": "...", "where": "calc.mjs:212",
               "category": "domain-rule", "origin": "spec"}]
```

- `checks`: one row per thing checked, at least 8, of which at least 3 are
  `correctness` checks recomputed against a source the author did not write.
  `result` is `pass`, `fail` or `partial`. These rows give the pass rate of
  recomputed outputs and of checked claims per subject, not only a score.
- `mutations`: at least 2 hand-seeded bugs in core logic, each with whether a
  test failed. Their survival rate is the verification metric.
- Every defect carries `where` (path:line), `category` and `origin` from the
  taxonomy below.

### Defect taxonomy

Each category names the process stage that should have stopped the defect.
`metrics` classifies older defects with keyword rules
(`platform/ci/quality_metrics.py`, `CATEGORIES`); on 60 hand-labelled
defects (`taxonomy-labels.json`) the rules agree about 75% of the time, so the
older counts are approximate. An auditor's own `category` always wins.

| category | origin (stage) | example |
|---|---|---|
| `untested-core` | tests | a seeded change to a threshold leaves every test green |
| `tests-check-a-copy` | tests | the test exercises a re-implementation, not the shipped code |
| `not-built-or-run` | build | the Swift or Monkey C was never compiled |
| `input-handling` | implementation | `1,200` splits on the comma; a blank field silently becomes the example value |
| `logic-error` | implementation | the fee applied to gross instead of collected rent |
| `code-craft` | implementation | dead code, copied engines, 3,000-line modules |
| `domain-rule` | spec | a rule departs from the standard (IRS publication, RFC, vendor docs) |
| `source-data` | spec | an invented or stale rate card, uncited constants |
| `scope-gap` | spec | a case the professional needs is not modelled |
| `research-design` | design | no baseline, a confound, prior work not cited, novelty overstated |
| `overclaim` | claims | the README or page says more than a file backs |
| `stale-docs` | maintenance | test counts, runtimes or tables that drifted after later work |
| `repo-hygiene` | build | undeclared dependencies, a shell `or true` hiding a failure |
| `source-only` | audit | about a source file the build fixes at deploy; not a defect in what ships |
| `other` | audit | none of the above |

## Metrics

`python3 platform/ci/quality_audit.py metrics --md` prints, from the latest
audit of each subject unless noted:

- **why subjects miss the bar**: how many fail each gate, which gate alone
  binds, and how many would clear the bar with +1 on one dimension;
- **score histograms** per dimension;
- **defects** by category, severity and origin stage, with the classifier's
  agreement with the hand labels;
- **seeded mutations**: in how many audits at least one survived, with a Wilson
  interval (from `mutations` when present, otherwise parsed from the text);
- **fixes and persistence**: audits with a fix PR, open high-severity defects,
  and the share of defects that reappear in the next audit of the subject;
- **re-audit agreement**: identical and within-one scores, and bar verdicts,
  between consecutive audits of a subject with no fix between (an upper bound
  on blind agreement, since a later auditor can read the earlier file);
- **audit detail**: evidence length, dimensions that quote a command, and how
  many audits carry structured `checks` and `mutations`;
- **coverage** of the whole repository and the days a first full pass would
  take at the current pace;
- the **weekly trend**.

`queue` lists open defects worst first (source-only left out); `census`
draws the sweep; `coverage` prints the coverage table as JSON.

## Reflections

`reflections/<date>-<slug>.md`, at least weekly (`mode` forces one after
seven days). A reflection reads the metrics and asks where in the process
quality drops off: at which stage the defects originate, which gate binds,
what the fixes did. Each proposed process fix names the metric it should move
and its value now, so the next reflection can say whether it worked. Fixes to
files under `.github/CODEOWNERS` (prompts, CI) go in their own small PR.

## Results so far

The scoreboard is generated: `python3 platform/ci/quality_audit.py summary`;
the detail is `metrics --md`; the reflections are in `reflections/`.
Each round's post is listed under "Quality audits" on the blog.
