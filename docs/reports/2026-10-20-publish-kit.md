# Publish Kit: tools for an AI agent to publish podcasts, audiobooks and books

**Date:** 2026-10-20. **Asked by:** the owner: "I want to make tools for
agentic publishing of podcast. cli like or similar. should make it easy. also
for trying to publish audiobooks and normal and ebooks etc. i have a couple
projects along these lines that this would be for."
**Shipped in:** PR #8726. **Code:** [`ventures/publish-kit/`](../../ventures/publish-kit/).
**Blog post:** [`docs/posts/2026-10-20-publish-a-podcast-and-a-book-with-an-agent.md`](../posts/2026-10-20-publish-a-podcast-and-a-book-with-an-agent.md).
**Handoff for the next agent:** [`ventures/publish-kit/NEXT.md`](../../ventures/publish-kit/NEXT.md).

## The short version

Publish Kit is one zero-dependency Node.js CLI, plus a browser page that uses
the same modules. It takes a folder of audio files or Markdown chapters, with
one `publish.json`, and produces:

| Input | Output | Checked against |
| --- | --- | --- |
| Episode MP3/M4A files | `feed.xml` (RSS 2.0 + iTunes + Podcasting 2.0) and an indexable show page | Apple's category list and required tags; then re-read by the separate `podcast-feed-check` validator |
| Markdown chapters | EPUB 3 with nav, NCX, cover and title page | W3C EPUBCheck 5.1.0: **0 errors, 0 warnings** (CLI and browser output) |
| Markdown chapters | Print-ready interior PDF at the trim size (via Chromium) | MediaBox 432×648 pt = 6×9 in; page count matches `pdfinfo` |
| Page count, trim, paper | KDP paperback spine width and full-wrap cover size | KDP's published per-page paper thickness |
| Audiobook chapter files | ACX report, chaptered M4B (via FFmpeg), private serial feed | ACX's published file rules; M4B chapters confirmed with `ffprobe -show_chapters` |

It was built for agents. Every command takes `--json`. Exit codes are 0 (done),
1 (blocking findings) and 2 (usage error). `publish-kit plan --json` returns
`{ready, findings[], next[]}`, so an agent loops plan → fix → build.
`skill/SKILL.md` teaches that loop, and the repo's MCP server can run the CLI
(`tools.mjs run publish-kit`).

## Why these pieces

The owner's own projects show the need. Hearth & Horizon (PR #8683, now on
`main`) and the `writing/` podcast (PR #8711) each hand-write their own RSS. An
agent publishing an episode needs four facts it can't guess: the enclosure's
byte size, the duration, an RFC 822 date, and a guid that never changes. Get
the guid wrong and every subscriber's app re-downloads the episode as new.
Publish Kit reads the first three from the file. It generates the guid once
and stores it in `publish.json`. Nothing in the agent loop can regenerate it.

Books and audiobooks have the same shape: the store checks a long list of
mechanical rules, and the rejection arrives days later. Each rule we can check
locally is a round trip saved.

## What was measured

- **Media probing without ffprobe.** `media.mjs` walks MP3 frame headers, MP4
  boxes and WAV chunks. On FFmpeg-generated files, the durations matched
  ffprobe: 5.042 vs 5.04 s (MP3 CBR), 7.027 vs 7.03 s (MP3 VBR), 3.000 vs
  3.00 s (AAC M4A). Walking every frame catches a VBR file that has no Xing
  header, which a header-only reader would report as CBR.
- **podcast:guid.** The UUIDv5 output matches the Podcasting 2.0 spec's own
  example (`podnews.net/rss` → `9b024349-ccf0-5f69-a609-6b82873eab3c`).
  SHA-1 is implemented in plain JS so it also runs in the browser, and it
  matches `node:crypto` in tests.
- **EPUBCheck caught one real bug.** The first build linked the landmarks nav
  to `nav.xhtml`, which is not a spine item (RSC-011). Fixed. Every build
  checked since then has 0 errors and 0 warnings, with and without a cover
  and with bundled images. The browser builds stored (uncompressed) ZIPs, and
  those pass too.
- **Tests.** 50 in the venture, using synthetic MP3, WAV, M4A, PNG and JPEG
  bytes, so CI needs no FFmpeg. There are also page tests in two sibling
  ventures.

## What it cost to land, and what that says about the repo

The product took about a third of the session. Landing it took the rest.
`main` moved three times while the PR was open. Each merge needed
regenerated files: the front-door mirror, its alias map and shard mounts,
`launched.json`, `publish-surface.yaml`, the tree-count sentences, the
`runs-on` README count, and a pinned privacy-switch count. Each has its own
generator, and `node platform/marketing/regen.mjs` does not run all of them:
the alias map and `portfolio-front.yaml` shard list need
`node platform/marketing/front-door-tools.mjs --write` as well. The CI
`validate`, `gitops` and `build` jobs each failed once on a stale count
before the right generator was found.

`main` was also red on one test this PR didn't cause:
`gitops/tests/test_ci_runner.py::test_every_job_that_runs_python_or_node_sets_it_up`
(`portfolio-pages.yml` runs `python3` without `setup-python`). The one-step
fix is included here.

`run_workflow_locally.py --for-changes` with no base ran every workflow in the
repo, because a shallow clone has no merge base. Running
`git fetch --deepen=500 origin main` first and passing `origin/main` as the
base cut it to 20 workflows.

## Limits, stated plainly

- The platform rules are as published when this was built: Apple Podcasts'
  categories and art size, ACX's audio rules, KDP's cover and paper figures.
  Platforms revise them, so each finding names the rule it checked.
- Loudness (RMS, peak, noise floor) is measured on 16-bit WAV only. For MP3s
  the report prints the FFmpeg command that measures them.
- No fixed-layout EPUB, footnotes or Markdown tables. The CLI never uploads
  or submits anything; the user or their agent does that under their own
  accounts.
- Usage is unmeasured, like everything on Pages: the page keeps
  local-only anonymous counts.
