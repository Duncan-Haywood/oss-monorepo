# The public site now redeploys on every merge; where the podcasts stand

**Date:** 2026-10-20. **Asked by:** the owner ("i want the podcast episodes to
be hosted on the ghp site … and the blog, and I want the ghp site to be
updated on most merges to main … automatically too with gha").
**Shipped in:** PR #8748. **Method:** read the workflow and the site builder,
counted from `git log` on `main`, and built the site locally. Nothing here was
read from the live site: sessions cannot fetch `github.io` (the egress proxy
returns 403).

## What changed

`.github/workflows/portfolio-pages.yml` builds the site and, while
`vars.PAGES_ENABLED` is `true`, deploys it to GitHub Pages. Its `push` trigger
on `main` used to carry a `paths:` filter, a hand-kept list of the site's
inputs. That filter is gone. Every merge to `main` now rebuilds and deploys
the site. Pull-request builds keep their filter and add `docs/podcast/**`.

## Why the filter had to go

The list kept missing site inputs, and a missing input means a page that
silently stops updating.

- **`docs/podcast/`** was not on it. The episode scripts and MP3s in PR #8711
  live there, so merging them would not have triggered a deploy. They would
  have waited for the next unrelated merge or the three-hourly scheduled run.
- **`research/<slug>/README.md`** was not on it either, although `build.mjs`
  reads it (`research/<slug>/` with a README is a research page). A research
  result merged on its own did not redeploy the site.
- **The list was edited 4 times since 2026-10-19**, 3 of those on 2026-10-20
  (#8514, #8664, #8670, #8717). Every edit added paths that a new feature
  needed. #8717 added `platform/daily/**` while this PR was open.
- **The site reports what landed on `main`**: the development dashboard and
  the changelog. Every merge changes those, whatever it touched.

## Cost and queueing

`main` took **341 first-parent merges on 2026-10-19**. The workflow's
concurrency group is per ref with `cancel-in-progress: false`. GitHub keeps at
most one *pending* run per group and cancels older pending ones when a newer
run queues. So a burst of merges collapses into one running build plus one
pending build, and the deploy always catches up to the newest `main`. The
build was measured at 173 s on a PR (the job's own comment). On a busy day the
`build` job will therefore run nearly back to back. This repository is public,
so GitHub-hosted runner minutes are not billed. Runner *starvation* has
happened before (`platform/ci/ci_starvation.py`). If Pages runs start to
starve other CI, see "Next steps" below.

## Where the podcasts stand (on `main` as of this report)

| Podcast | Where | State |
|---|---|---|
| hearth-and-horizon (sci-fi, stories for agents, Little Lamps) | `ventures/hearth-and-horizon/` | On `main` (#8683): 3 MP3s plus RSS feeds, served at `/hearth-and-horizon/` |
| saints-by-candlelight (bedtime saints) | `ventures/saints-by-candlelight/` | On `main` (#8718): 3 MP3s plus `feed.xml`. The two ventures hold 6 MP3s, 59 MB, in all |
| Writing podcast (one episode per blog post) | `docs/podcast/`, served at `/writing/podcast/` | **Open in #8711**: 15 episodes, 87.5 min, 26 MB. CI was green before `main` moved; its author merged `main` again at `b92afdf` |
| Hand-written two-host scripts | `docs/podcast/2026-10-20-briefing-the-machines.md`, `…-cut-the-deadweight.md` | Markdown scripts with no front matter and no audio. #8711's loader skips them rather than failing the build |

`.mp3` became a servable extension in `platform/pages/check.mjs` with the
ventures above, so the site's checker publishes the audio.

## Verification

- `python3 platform/ci/validate_workflows.py`: all 538 workflow files valid.
- `python3 platform/ci/publish_surface.py --check`: matches the snapshot.
- pytest over `test_validate_workflows`, `test_publish_pages_branch`,
  `test_publish_surface` and `test_run_workflow_locally`: 274 passed.
  `gitops/tests/test_ci_runner.py` has 2 README-count failures that fail the
  same way on `main` without this change.
- #8711 merged with `main` locally, plus a fix for the scripts without front
  matter (the same fix its author then pushed):
  - `node build.mjs` then `node check.mjs` gave "publishable: 1300 products,
    3810 pages, no dead links".
  - `writing/podcast/` held 15 MP3s, and `feed.xml` had 15 `<item>`s.
- `pages_state.py` reads `publish-pages-branch.yml`'s filter, not this
  workflow's, so it is unaffected.

## Next steps for a later agent

1. **Land #8711** if it is still open. Merge `main` into
   `claude/jolly-planck-pfieac` (a merge commit, never a rebase: the branch
   is another session's). Conflicts so far were in the extension list in
   `platform/pages/check.mjs`, where both sides are kept. Then run
   `node --test platform/pages/podcast.test.mjs`, then
   `node platform/pages/build.mjs --out=dist && node platform/pages/check.mjs dist`,
   and merge once CI is green. Once it lands, the post-merge deploy publishes
   `/writing/podcast/` with no further step.
2. **Voice the two hand-written scripts** (`briefing-the-machines`,
   `cut-the-deadweight`):
   - Give each the front matter `podcast.mjs` requires (`title`,
     `description` ≤160 characters, `post` naming a `docs/posts/` slug).
   - Rewrite each body as plain spoken prose: no `**`, links or headings,
     which the loader rejects.
   - Run `platform/pages/podcast_tts.py` to render them with Piper, commit
     the MP3s and `manifest.json`, and merge.
3. **Confirm the live site** needs the owner, or a runner with egress. Load
   `https://duncan-haywood.github.io/monorepo-projects/writing/podcast/` and
   one feed enclosure logged out. Until then `github-pages-origin` in
   `portfolio/ledger/infra_state.yaml` stays `unknown`. The deploy job's own
   "Verify the published site answers" step is the reading to check in the
   Actions log.
4. **If Pages runs starve other CI**, add a `paths-ignore:` to the push trigger
   for bookkeeping that never reaches the site, instead of bringing back an
   allow-list.
   - Check what the site reads before excluding anything. `prompts/runs/` is
     read by `platform/devstats/` for the dashboard, so it must stay a
     trigger. `docs/history/**` is a likelier candidate.
   - Measure first with `ci_starvation.py --run <id>`.
