# Distribution hub and Interview Content Studio: report and handoff (2026-10-20)

**Owner request, 2026-10-20:** output to most platforms (Substack,
Instagram, Facebook, Threads, X, TikTok, YouTube, email, Google search, AI
assistants); one tool that works all of them and measures what does best;
then "creation for all the platforms, can be AI-generated", in two forms:
one for this repository and one for businesses and individuals building a
brand, starting from one or more interviews about the topic.

Shipped in PR #8741. This file is the record: what exists, what was
verified, what was not, and the next steps for a future agent.

## What shipped

### 1. Distribution hub, for this repository

`node platform/distribution/hub.mjs platforms | plan | pack --out <dir> | publish | score`

| Part | File | What it does |
|---|---|---|
| Registry | `platform/distribution/hub/platforms.mjs` | 18 platforms, each with limits, a mode, the reason for that mode and the day it was checked |
| Composer | `platform/distribution/hub/compose.mjs` | One fitted variant per platform for each new tool (`launched.json`) and post (`docs/posts/`), with a `?ref=<platform>` link back and rotating copy templates |
| Adapters | `platform/distribution/hub/adapters.mjs` | Live publishing to Threads, Facebook Page, Instagram and Buttondown email; each is off until `DISTRIBUTE_<PLATFORM>=true` and its secrets are set |
| Scoreboard | `platform/distribution/hub/metrics.mjs` | Reads each post's numbers back where the platform allows it and joins them with the counter's `ref:` arrivals. Ranks platforms and copy templates with shrinkage toward the mean, and ranks nothing with fewer than 5 posts |
| Workflow | `.github/workflows/distribute-hub.yml` | Runs daily. It is a dry run unless enabled, uploads the drafts pack and `scoreboard.json` as an artifact, and pushes no commits |

Modes on 2026-10-20:

| Mode | Platforms | Why |
|---|---|---|
| `api` (4) | Threads, Facebook Page, Instagram, email (Buttondown) | A free, documented publishing API exists and automated posting is allowed for your own account or Page |
| `delegated` (4) | Bluesky, Mastodon, dev.to, Hashnode | Already automated by the existing per-channel scripts |
| `draft` (8) | X, LinkedIn, Substack, Medium, TikTok, YouTube, Reddit, Hacker News | No free and compliant way to automate them; the reasons follow |
| `discovery` (2) | Google and other search engines, AI assistants | Nothing to post: sitemaps, JSON-LD, IndexNow, `llms.txt` and the MCP server already cover them |

Why the `draft` platforms are drafts:

| Platform | Reason |
|---|---|
| X | API became pay-per-use for new developers on 2026-02-06, and the spec forbids paid channels |
| LinkedIn | Reading our own posts back (needed for de-duplication) and analytics need partner-gated scopes |
| Substack | No publishing API; its 2026 developer API is only a profile lookup |
| Medium | No longer issues integration tokens |
| TikTok | Unaudited API clients can only post privately (`SELF_ONLY`) from private accounts, and every post needs a video |
| YouTube | Every post needs a video, and uploads from unverified API projects are private |
| Reddit and Hacker News | Automated posting is forbidden, and Reddit Data API access needs approval |

Each draft carries the reason and a paste-ready text whose link is tagged.

Twelve `?ref=` tags were added to the counter's closed list:
`threads`, `facebook`, `instagram`, `email`, `x`, `linkedin`, `substack`,
`medium`, `tiktok`, `youtube`, `reddit`, `hn`.

### 2. Interview Content Studio, for businesses and individuals

`ventures/interview-content-studio/`, live at
`https://duncan-haywood.github.io/monorepo-projects/interview-content-studio/`
once the site rebuilds.

- **Interview:** a guided interview of 17 questions. Several interviews can be kept side by side, and each can be downloaded and imported as JSON.
- **Plan:** per-platform posting amounts, scaled to the hours a week you have, across 14 platforms and 18 formats. The amounts are the tool's starting assumptions, and the page says so.
- **Calendar and drafts:** a 4-week calendar with a draft for every slot, fitted to each platform's limits. X counts a link as 23 characters; Bluesky counts graphemes (what a reader sees as one character).
- **Two engines:**
  - **No key:** built only from your own answers.
  - **AI on your own key:** Anthropic, OpenAI, Gemini, OpenAI-compatible, or a local model. The output is checked: a draft that adds a number not in the interview is discarded, and on any failure the template draft stays.
- **Export:** Markdown, CSV for scheduler import, and JSON. The tool posts nothing.

## Verification (what was run, and what was not)

Run in the session (outputs are summarised in the PR and the run record
`prompts/runs/2026-10-20-session_011qeNDjbbcRjGKFaqPtt5pY.json`):

- `node --test platform/distribution/*.test.mjs platform/counter/*.test.mjs platform/pages/siblings.test.mjs`: 173 pass, 0 fail.
- Venture tests 40/40; `venture-preflight.mjs interview-content-studio` (site build plus `check.mjs`): clean. The subagent also drove the page in headless Chromium at 1280 px (light) and 375 px (dark).
- `gitops/tests/test_manifests.py` and `gitops/tests/test_ci_runner.py`: 108 pass. `publish_surface.py --check`, `validate_workflows.py`, `check_venture_regression.py` and `siblings.mjs` (0 orphans): clean.

Not verified:

- **No live API call to any platform.** There were no credentials, and the session's network cannot reach these hosts. Request shapes follow each platform's public documentation as read on 2026-10-20. The first enabled run is the first live check.
- **The scoreboard has no data.** Nothing has been posted, and the site counter is off (`platform/counter/site.json` has an empty `url`). It prints "unmeasured, not zero" until both change.
- **The posting amounts are not measured benchmarks.** The studio's cadence numbers are assumptions; the scoreboard exists to replace them with readings.

## Fixes to `main` carried in this PR

- `.github/workflows/portfolio-pages.yml`: the `build` job runs `decision_queue.py` but had no `actions/setup-python` step. On `main` this failed `test_every_job_that_runs_python_or_node_sets_it_up`.
- `gitops/tests/test_publish_branch.py`: the stub `node` did not know `platform/daily/build.mjs` (added by #8717), so 16 publish-branch tests failed on `main`.

Still broken on `main` and not touched here:
`ventures/activecampaign-import-csv-check/VENTURE.yaml` has a hypothesis with
no `evidence` kind. It fails `portfolio/router/validate.py` and
`test_allocate`.

## Handoff: what a future agent should do next

Work these roughly in order. Each is a whole contribution on its own.
`node platform/distribution/hub.mjs platforms` shows the current state.

1. **Get a reading.** Nothing ranks until the counter runs.
   - The counter needs an origin in `platform/counter/site.json`. That is an owner step (hosting), so check `python3 portfolio/ledger/decision_queue.py` before adding an ask.
   - Without it, the scoreboard can still use platform-native numbers: Bluesky and Mastodon need no login, so `BSKY_HANDLE` alone gives readings once `bluesky.mjs` is live.
2. **Owner switches, one per platform.** Each `hub-*` row in `portfolio/distribution/channels.yaml` lists the variable, the secrets and the terms to read on the day. File one owner ask per platform through `decision_queue.py`, never duplicates. Suggested order:
   - Threads (free, insights readable);
   - Facebook Page;
   - email (needs the owner to decide which postal address to show, per CAN-SPAM);
   - Instagram (needs item 3 first).
3. **Instagram images.** The adapter needs a public JPEG per item at `INSTAGRAM_IMAGE_BASE<slug>.jpg`, and nothing generates one yet. Build a 1080x1350 JPEG card generator alongside the site's social cards (`platform/pages/build.mjs`, `socialCardFileFor`), published with the Pages build. Do not reach for a paid image API.
4. **Consolidate with `ventures/ig-media-pipeline/`.** It landed on `main` concurrently (#6854) and turns a photo and video library into Instagram posts and reels. It is the owner's personal media pipeline (`NOT-A-VENTURE`), not the catalogue's. Keep the two separate unless the owner says otherwise, but reuse its caption and reel tooling if it helps item 6.
5. **The first live run of each adapter.** When a switch is set, read the workflow log of the first run. Fix the request shape from the platform's error if needed, and record in `channels.yaml` that the shape is now confirmed. Move the channel's rung `artifact` → `live`, and → `measured` once `node platform/distribution/attribution.mjs` shows a non-zero count.
6. **Video for TikTok and YouTube Shorts.** The hub writes 30-second scripts. Next:
   - a Playwright screen recording of the tool page following the script, plus an on-screen text overlay (ffmpeg, all free), as a draft MP4 in the artifact pack;
   - uploading stays manual, because TikTok's audit and YouTube's verification are owner steps.
7. **Optional AI copy variants in the hub.** `compose.mjs` uses fixed honest templates. Add AI variants as an opt-in path through `platform/llm/byok.mjs`, with the studio's no-invented-numbers check (`ventures/interview-content-studio/ai.mjs`).
   - Never enable it unattended without owner approval: it spends API budget (`CLAUDE.md`, "Automation").
   - Give each AI variant its own template marker so the scoreboard compares it with the fixed templates.
8. **Keep the scoreboard's history.** `score --out` writes one snapshot per run into the artifact. A history needs a commit, and a workflow that commits needs owner approval. Until then, a session can download artifacts and commit a reading by hand into `portfolio/distribution/readings/`.
9. **LinkedIn.** Posting with `w_member_social` works, but reading posts back for de-duplication does not. A state file of posted URLs, committed by the workflow, would allow it, but that needs owner approval for a committing workflow. Until then it stays drafts.
10. **Studio follow-ups:**
    - an export in the hub's `drafts.csv` shape, so a business can use the studio and a scheduler together;
    - non-English template drafts;
    - X's double weighting of CJK characters;
    - a guide page per platform in searchers' words (SEO).
11. **Re-read terms before enabling anything.** X pricing changed in 2026 and TikTok's audit rules change often. `checked:` in `platforms.mjs` is the date to beat.

## Rules this work follows

All of these come from `portfolio/distribution/README.md` and `CLAUDE.md`:

- unpaid only;
- no unsolicited messages;
- bot accounts labelled ("Automated post.");
- one post per real event;
- canonical links stay clean;
- channel tags name platforms, not people;
- nothing secret in the tree;
- every channel off until the owner sets its switch.
