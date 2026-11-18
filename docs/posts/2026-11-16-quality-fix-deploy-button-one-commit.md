---
title: "Quality fix: the Deploy button now publishes one commit, and says what it left behind when it fails"
seo_title: "Quality fix: the Deploy button publishes one atomic commit"
date: 2026-11-16
tags: [quality-audit, platform, deploy]
description: "The self-deploy page sent a commit per file and claimed nothing changed on failure. Now it is one atomic commit, honest errors, and 954 broken links fixed."
---

This was a `fix` session of the [quality programme](../../portfolio/quality/README.md).
It took the open defects from the 2026-11-07 audit of
[`platform/deploy`](../../platform/deploy/README.md), the page that lets anyone run their
own copy of a tool in their own GitHub, AWS, Google Cloud, Azure or Cloudflare account.
That audit ([`2026-11-07-deploy.json`](../../portfolio/quality/audits/2026-11-07-deploy.json))
found the cryptography and the generated bundles sound. It also found eight defects, none
fixed in the nine days since. This session fixed six. Two stay open.

## What a release engineer would have caught first

**One commit per file.** The Deploy button uploaded each file with its own contents-API
`PUT`. Each `PUT` was a commit, and each commit was a push to `app/**`, which the visitor's
own deploy workflow triggers on. A 10-file app made 10 commits and could queue 10 workflow
runs. If call 7 failed, the repository was left half-filled. The new
[`publish.mjs`](../../platform/deploy/publish.mjs) uses the Git data API instead: it reads
the branch head and sends the text files inline in one tree request. Only binary files get
their own blob call, because GitHub allows about 80 content-creating requests a minute.
Then it makes one commit and moves the branch once. Nothing appears until that last call.
For a 10-file GitHub Pages app the whole deploy is now 11 API calls. Before, it was 25.

**A 403 that read as "not found".** The page's `gh()` helper turned every 404 on a GET into
`null`, so a token without access looked the same as a repository that does not exist. Now a
404 is `null` only where the caller asks for it, and every other failure is an error.

**"Nothing else was changed."** The error handler printed this in every case, including
after it had already created a repository and stored secrets in it. The page now tracks what
it has created. On failure it lists exactly that, with the link to delete the repository.
When nothing was created, it says so.

**Apps that vanished.** 18 apps are over the 60-file or 3 MB limit, mostly flagships such as
`ai-bookkeeper` and `wall-framing-takeoff`. They were missing from the picker with no
explanation. The build now writes `skipped.json`, and the page names them.

**A bug the audit missed.** While testing the page in Chromium, a link like
`deploy/?app=hay-sale-price-calculator` opened with nothing selected. The picker shows 400
options, and the preselect only worked if the tool was among them. Every tool page's footer
links here with `?app=`. That link worked for 400 tools and failed for 954. The selected
tool is now always kept in the list.

Smaller fixes:

- The Cloudflare workflow's `|| true` hid every failure to create the project, not only
  "already exists". It now tolerates only that one message. A stand-in `wrangler` that
  returns an authentication error now fails the step.
- `compose.mjs` had three copies of the same copy loop and two identical `if` branches.
- The README's counts had drifted: it said ~1,230 apps (the build makes 1,354) and 16
  server apps (33).

## How it was checked

- `node --test platform/deploy/*.test.mjs`: 42 pass. Seven of them are new and drive the
  GitHub calls against an in-memory GitHub. They check for exactly one tree, one commit
  and one ref update. They check that binary bytes survive the upload, that a 403 is an
  error and not "missing", and that a failed ref update leaves the branch where it was.
- The mutation that survived the audit (`MAX_FILES` → `MAX_FILES + 1`) is now caught, by a
  new test at the exact boundary. So are two mutations seeded into the new module.
- Every app × provider bundle (8,223 of them) is byte-identical to `main` after the
  `compose.mjs` cleanup.
- In Chromium, against a mocked GitHub, a full GitHub Pages deploy finished: 11 calls, one
  commit whose parent is the repository's first commit.

## Not fixed

- The AWS workflow still uses long-lived access keys and runs `tofu apply -auto-approve` on
  every push. A release engineer would want OIDC role assumption and a plan step. This is
  larger than a fix-session change, so it is in the README's known gaps.
- `scaffold_static_deploy.py` is now documented but still has no test.
- No part of the deploy has run against a live cloud account. The GitHub flow is tested
  against mocks only.

Scores in the audit stay as they were. A later round re-audits the directory in a new file.
