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

## Two more things found while landing it

- **The deploy has been skipped on every run.** The `deploy` job is gated on
  `vars.PAGES_ENABLED == 'true'`. PR #8776, another session's, found that the
  variable was never set: today's two green runs on `main`, 39392058290 and
  39396110224, both show `deploy: skipped`. So no trigger change alone puts
  anything live. #8776 flips the gate to opt-out (`!= 'false'`) and moves the
  13–15 minute test suites into a parallel job, so the deploy waits only on
  build and check. The owner can also just set `PAGES_ENABLED=true` under
  Settings → Secrets and variables → Actions → Variables.
- **`main`'s site build was red.** The feedback page from #8723 was held to a
  product's contract by `check.mjs`, which reported 7 problems and blocked
  both publishing routes. The fix (`feedback/` joins `SITE_OWN_DIRS`, and
  the page gets og and twitter tags) landed on `main` while this PR was
  open. This PR carried the same change until then.

- **`main` had more red checks.** This PR carried fixes for them until
  `main` fixed them itself. Only the `writing.mjs` custom-domain rewrite is
  still this PR's:
  - `gitops`: 17 tests in `gitops/tests/test_publish_branch.py`. The stub
    did not know the daily brief builder added by #8717.
  - The Pages `build` job: 3 site tests from #8747. Two named entities were
    missing from `entities.mjs` (three entities in all), the FAQ JSON-LD
    quoting on changepoint-detector did not match the visible answer, and a
    post linked the github.io origin. That last one is now rewritten under a
    custom domain by `writing.mjs`.

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
- After the final merge with `main`, `node build.mjs` then `node check.mjs`
  gave "publishable: 1307 products, 3841 pages, no dead links". The
  custom-domain, entities, faq-visible, writing, feedback-page and check
  test files passed 127/127. `gitops/tests/test_ci_runner.py` passed 24/24.
- `pages_state.py` reads `publish-pages-branch.yml`'s filter, not this
  workflow's, so it is unaffected.

## Next steps for a later agent

0. **Make the deploy actually run.** Land PR #8776, or have the owner set
   `PAGES_ENABLED=true`. Then confirm in the next `Portfolio Pages` run on
   `main` that `deploy` ran rather than being skipped. #8776 keeps a push
   `paths:` list and this PR removes it. When merging `main` into #8776,
   keep the trigger with no filter, which is the owner's request, and keep
   its gate and parallel-test changes.
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

## Update, 2026-10-24: a more natural voice

The owner found the Piper voice robotic and asked for a more human, expressive
one, rendered once with a high-quality model and then distributed as a file.
`platform/pages/podcast_tts.py` now runs **Kokoro-82M**
(`hexgrad/Kokoro-82M`, Apache-2.0 open weights, voice `af_heart`). It still
runs only on the machine that makes an episode. The MP3 is committed, so
Pages, the feeds and the listener never run a model, and nothing costs money
per listen.

- **What changed in the render:** pauses between paragraphs (0.55 s, and
  0.9 s after the intro and before the sign-off), acronyms respelled so they
  are read letter by letter (A.I., C.I., P.R., A.P.I., …), a 70 Hz high-pass,
  and loudness set to −16 LUFS (true peak −1.5 dB). Output is mono 48 kbps at
  24 kHz, up from 40 kbps at 22.05 kHz.
- **Re-voicing:** a manifest entry whose `voice` is not the current
  `VOICE_ID` (`kokoro-82m-af_heart`) counts as stale, so changing the voice
  re-renders everything on the next run.
- **Cost:** 34 episodes (2 h 24 min of audio) took about 75 minutes on four
  CPU cores, roughly 2× real time while Whisper shared the CPU. The audio
  directory grew from 43 MB to 52 MB.
- **Backlog P044:** huggingface.co answered 200 from this cloud session, and
  `typeof-localstorage-throws` (the script P044 names) already had audio on
  `main`, so P044 looks stale. The one script that had never been voiced,
  `2026-10-20-can-you-predict-divorce`, now has audio, and
  `podcast_tts.py --check` exits 0.

### Measured

"Sounds more human" is a listening judgment that no file here can prove. What
can be measured is intelligibility. Each episode, old and new, was
transcribed with Whisper `base.en` (int8, greedy), and the transcript was
scored against the script by word error rate after lower-casing and removing
punctuation. All 33 Piper episodes came from the same script bytes that were
re-voiced, so the pairs are like for like.

| | mean WER | median WER |
|---|---|---|
| Piper `en_US-ljspeech-high` (before) | 0.100 | 0.101 |
| Kokoro-82M `af_heart` (after) | 0.082 | 0.081 |

Kokoro scored lower on all 33 of 33 paired episodes. Part of the remaining
error is scoring noise, not misreading: the scripts spell out numbers and
Whisper writes digits ("nine hundred and ninety" against "990"), so neither
voice can reach zero.

A pitch-spread proxy (the standard deviation of f0 in semitones over the
first 90 s) did **not** separate the voices: 3.28 for a Piper episode against
2.99 for a Kokoro one. Piper's robotic sound is in its timbre and its
sentence-final contours, not in its pitch range. So this file makes no
numeric claim about expressiveness. The listening test is the real one.

### Next

- Kokoro's other voices (`am_michael`, `bf_emma`, …) or a second voice for the
  two-host scripts are one constant away. Try a couple of episodes with
  `--only` before re-voicing everything.
- `ventures/hearth-and-horizon/render_audio.py` (stories) still uses Piper.
  The same switch would apply there, but that venture's audio licence note
  (CC BY-SA, based on LJ Speech being public domain) needs re-checking
  against Kokoro's training-data statement first.
