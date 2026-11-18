---
title: "Four bugs our red team found and nobody fixed"
seo_title: "Red team to purple team: closing the found-but-unfixed gap"
date: 2026-11-03
tags: [testing, mutation-testing, redteam, process]
description: "373 red-team runs logged 105 real defects and patched 101. The other four sat open for weeks. What they were, and why the red team now fixes what it finds."
---

Our repository runs a red team on about 7% of its agent sessions. Each run
seeds small bugs into one file with `prompts/redteam.py`, counts how many the
tests catch, and goes looking for real defects. Every finding goes into a run
record. Reading all 373 records on 2026-11-03 gives these numbers:

- 105 real defects found, 101 marked patched;
- 1,118 escaped mutants triaged as test gaps, 1,061 proven closed by a rerun.

So the red team mostly fixes what it finds already. The remaining four
defects show where that breaks down. Each was found, written up, and then
left open. No later run ever read them again.

| Found | Defect | Why it was left | State on 2026-11-03 |
|---|---|---|---|
| 10-21 | An unterminated CSV quote swallowed the rest of a bank file | not said | already fixed on `main`; the record never said so |
| 10-24 | About 190 venture files linked to the old `github.io/monorepo-projects/` host, which returns 404 | "too wide to patch in a mutation run" | still broken |
| 10-26 | The deploy build test was red on `main` | "unrelated to this PR" | still red |
| 10-26 | The stranded-work check read every orphan branch as landed | "may newly fail sweeps" | still silent |

Every reason in that table is about the size of a run. None of them says the
defect was unimportant. Each of the three live ones took well under an hour
to fix once someone started:

- **The dead links.** The site build rewrites the old host in the pages it
  serves. It can't reach what ships outside those pages: CLI user-agent
  strings, SARIF `helpUri` links that GitHub code scanning shows next to a
  finding, the footer a self-hosted estimate server puts in the emails it
  sends, plus READMEs and sitemaps. All 1,312 distinct top-level paths they named answer 200 on
  marisstella.app. A guard in `platform/ci/test_no_dead_pages_base.py` stops
  the old host from coming back. One venture keeps it on purpose:
  `subpath-robots-check` needs a site served from a subpath for its worked
  example.
- **The red test.** It assumed every venture with a Dockerfile runs
  `server.mjs`. 28 of them are static calculators served by nginx. The test
  now checks what matters, that every file a `COPY` line names ships in each
  deploy bundle. We confirmed it fails when a Dockerfile copies a missing file.
- **Orphan branches.** With no merge base, `git diff main...branch` errors and
  prints nothing, and the check took "nothing" to mean "already on main". It
  now compares the orphan's whole tree against `main`. It still stays quiet
  in a shallow clone, where it can't tell an orphan from cut-off history.

Running the touched ventures' suites turned up two more tests that were
already red on `main`. The Hungary e-invoicing page had no link to the new
Mauritius page, and Open House Plans' vendored copy of the Wall Framing Takeoff
engine had drifted from its source. Neither had anything to do with this
change. Both are fixed now, because leaving them is how the open list grows.

## The change: red team doubles as purple team

The owner's direction today was that a red team which finds something should
also work on fixing it. The track's prompt now says so, and a new command,
`python3 prompts/redteam.py open`, lists every defect a past record left
unpatched. Each red-team run starts with that list. It fixes what still
reproduces, and it marks the entry `patched_in` in the record that found it,
so the list only gets shorter through fixes. A run leaves a defect open only
when fixing it here would be unsafe: a product that needs a redesign, a
control-plane file that needs its own pull request, or someone else's open
pull request. When it does, it writes down what the fix needs.

## Guards that run when no red team does

A red-team run happens on about one session in fourteen. To catch security
errors on the other thirteen, each run now also leaves behind a check that
runs with no agent involved. The first one runs our own
[Workflow Audit](https://marisstella.app/workflow-audit/) over this
repository's 130 GitHub Actions workflows on every pull request that touches
them. It fails the PR on any high-severity finding, such as a
`pull_request_target` job that checks out untrusted code, script injection
from a PR title, or a `write-all` token. Today it reports 0 high, 11 medium
and 3 low, so it starts green and blocks regressions. Its first run over our
own tree also found a bug in the product: a finding that spans several
workflows printed `.github/workflows/` stacked once per file and dropped the
other file names. In SARIF that is the location GitHub code scanning shows. It
is fixed and has a test.

The catch rate said how often our tests notice a bug. The open list counts
bugs we noticed and then didn't fix. From today it starts at zero.
