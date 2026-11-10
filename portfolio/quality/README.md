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

## One round

```
python3 platform/ci/quality_audit.py sample            # today's subjects, seeded by the date
python3 platform/ci/quality_audit.py sample --k 6 --seed 2026-11-07
# ... audit each subject (below), write portfolio/quality/audits/<date>-<subject>.json
python3 platform/ci/quality_audit.py validate          # schema and score checks
python3 platform/ci/quality_audit.py summary           # the scoreboard, all rounds
python3 platform/ci/quality_audit.py summary --md      # the same as Markdown, for the post
python3 platform/ci/quality_audit.py history --md      # did audits change anything? fix follow-through, re-audit trends
```

`sample` draws, without replacement and reproducibly from the seed:

| stratum | population | how many | why |
|---|---|---|---|
| `flagship` | `portfolio/flagships.yaml` | 1, the least recently audited | the work the owner most wants deep; every flagship gets audited in rotation |
| `venture` | every `ventures/<name>/` | 2 by default, uniform | the typical product, not the best one |
| `research` | every `research/<name>/` not starting `_` | 2 by default, uniform | the typical research project |
| `platform` | every `platform/<name>/` | 1, uniform | the shared tooling everything else stands on |

A venture, research or platform subject audited in the last 90 days is skipped,
so rounds spread over the population and re-running the same seed after
audits have landed draws different subjects (that is expected; the seed only
fixes the draw for a given set of audits). The flagship is never skipped: the
least recently audited one is drawn every time, so the same flagship under
every seed is the rotation working, not a bug. Two rounds in flight at once
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
- **Judge what is served, not only the source file.** The site build
  (`platform/pages/build.mjs`, `rewriteOrigin` and `renderVentureSitemap`)
  rewrites the placeholder and old github.io origins in every `.html`,
  `.txt`, `.xml` and `.json` it publishes, regenerates each product's
  `sitemap.xml` with absolute URLs, and does not publish a product's own
  `robots.txt`. So a source `llms.txt` naming `duncan-haywood.github.io`, a
  relative `sitemap.xml` or `robots.txt` line, or `rel="canonical"
  href="./index.html"` is *not* a defect a user or crawler sees. Fetch the
  served file (`curl -s https://marisstella.app/<slug>/llms.txt`, likewise
  `sitemap.xml` and the page's canonical) before you report one. Rounds 1 to
  33 reported this non-defect about 90 times (round 34's post,
  `docs/posts/2026-11-10-quality-audit-round-34.md`). Text outside the build,
  such as npm or PyPI metadata and READMEs, is not rewritten, so a stale host
  there is still real.
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

## Results so far

The scoreboard is generated: `python3 platform/ci/quality_audit.py summary`.
Each round's post is listed under "Quality audits" on the blog.
