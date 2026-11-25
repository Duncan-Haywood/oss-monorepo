---
kind: note
topics: [security-alerts, ci, software-for-routine]
date: 2026-11-25
---
# The security queue listed 1,243 alerts, and 96% were already fixed on main

Date: 2026-11-25. Track: process (prompt.md step 0, the security queue).

## What was found

- `security-alerts` at 01:58 UTC listed 1,243 open alerts, none claimed. The
  2026-11-24 backlog PR (PR 18676, merged 01:12 UTC) had already cut the same
  findings from 1,231 to 40 by a local CodeQL scan.
- `priv-codeql.yml` on main: the only push run that finished was run 11, on
  `e98ec5cbb404` (PR 18749, 00:54 to 01:58 UTC, about an hour). The next 14
  push runs were all `cancelled` or still waiting. The concurrency group keeps
  one running run and one waiting run. A newer push replaces the waiting run, so
  with merges every few minutes main gets one analysis about every hour, always
  of whichever commit happened to be newest when the last run finished.
- So every alert still came from `e98ec5cbb404`, from before PR 18676. Of the
  1,243 alerts, **1,189 sit in files that changed between that commit and main**
  (`a8b06d386`; 726 of 748 files). Spot checks of the high-signal ones (DOM XSS
  in quick-pick-survey's rank page, reflected XSS in its report route, the
  photo-nutrition-agent hashes, print-atelier's session ids, youtube-chapters'
  `-->` filter) all showed the fix already on main.
- Nothing in the queue said which commit was scanned. A session following
  step 0 would claim alert #1 and spend its run re-fixing code that was already
  fixed, or "fix" a line that no longer exists.

## What changed

`platform/ci/security_alerts.py` now carries `most_recent_instance.commit_sha`:

- `QUEUE.md` names the scanned commit (the one most open alerts were last
  seen on) and says that fixes merged after it are still listed.
- Each `alerts/<n>.md` gets "Last seen on commit" and a new step 0 to run
  before claiming:
  `git fetch -q --depth=1 origin <sha> main && git diff --stat <sha> origin/main -- '<path>'`.
  Main is fetched as well because a session's `origin/main` is only as new as
  its clone. Measuring this run with a stale `origin/main` said 210 instead of
  1,189.
- The command is pasted into a shell, so the sha goes in only when it is 40
  hex characters and the path only when it uses safe characters
  (`[\w./@+\[\]-]`, which keeps Next.js `[slug]` routes). Tests cover a crafted
  sha and a crafted path; the four new tests fail on the old script.

PR 18806 landed the same idea minutes earlier, with `git log <sha>..origin/main`. This PR
replaces that command. In a session's shallow clone, the old commit is usually absent, so
`git log` over a range fails, and `origin/main` is stale; that command also put the sha and
path in unchecked. The diff of two fetched commits works at depth 1.

The workflow itself is unchanged. Moving the scan to a schedule, or analysing
only on the hour, would make the delay predictable, but it is a
`security-events: write` workflow. That belongs in a separate PR, judged by
the adversarial gate.

## What is really left (54 alerts in files unchanged since the scan)

Most are the false positives PR 18676 documented: 24 deliberate `js/redos`
fixtures in regex-redos-check and devsec-toolkit, the `copy_drift`/`dxf`
regex CLI options, status-keeper's certificate probe, the WooCommerce CSV
escape and silence-cutter's `blob:` link. Ones that the 2026-11-24 report does
not list, for a later session to check:

- 10 `js/incomplete-hostname-regexp`: subpath-robots-check, sshd-config-check
  and einvoice-preflight tests, and `platform/pages/audio-cdn.mjs:23`. The
  listed lines are plain URL strings on main, so check them against the next
  scan before changing anything.
- 6 `py/clear-text-logging` / 1 `py/clear-text-storage` in
  `platform/security/risk_review.py`, `platform/ci/secrets_inventory.py`,
  `portfolio/monetization/monetization.py` and einvoice-preflight `cli.py:853`
  (the last is documented as a false positive).
- `js/prototype-polluting-assignment` in
  `platform/aws/stacks/site/deploy/emulate.mjs:57` (`toQuerystring`, a
  `__proto__` query key). It is a local test emulator, and `platform/aws/` is a
  CODEOWNERS path, so it was left for a separate PR.
- `js/insecure-download` in `source-map-leak-check/probe.mjs:44`,
  `platform/distribution/webext.mjs` (3), `platform/agents/tools.mjs:170`
  (CODEOWNERS, already noted as waiting).

After the next completed main analysis (run 121 on `118c57189` was waiting
when this was written), the queue should drop to about these 54.

## Fixed after this report (PR 18819)

- `emulate.mjs` `toQuerystring` (#997): real. `?__proto__=a&__proto__=b` wrote
  `multiValue` onto `Object.prototype`, and a lone `?toString=1` was read as a
  repeat. Now grouped in a `Map` and built with `Object.fromEntries`. Test added.
- `webext.mjs` (#574, #274, #275): `</script >` (valid HTML) did not end a
  script, so the packager's network and inline-handler checks read the wrong
  span; the end tag now allows `\b[^>]*`. The inline-handler check strips
  scripts until stable. The rewrite was never a sanitiser (it keeps `<script>`
  elements on purpose). Once the edit moved it, GitHub's PR check reported it as
  new, so it is now built from `matchAll` slices with the same output. Tests added.
- `source-map-leak-check/probe.mjs:44` (#94): a false positive. The tool reads
  a site the user names, `http://` included, and executes nothing it downloads.
- The `js/incomplete-hostname-regexp` lines: reading the code found no flow into
  a `RegExp` (`sshd-config-check` escapes globs; `subpath-robots-check` uses
  fixed patterns with the host as the subject; `CDN_ORIGIN` is only
  concatenated). Without a local CodeQL run this is unconfirmed. Their claim
  branches could not be deleted through the session proxy and expire after 48 h.

## Later the same day: `security_next.py`, and a claim race it still had

Three run records that morning (prompt.md `doc_friction`) hit step 0 by hand: every alert already
claimed, found only after an `ls-remote` diff; #1049/#1050 lost to a session that pushed between
read and push; alerts re-triaged that an earlier pass had written up. Two sessions built the same
fix in parallel; PR 18852 landed `platform/ci/security_next.py` first, and PR 18851 (this one)
was folded into it.

What 18851 adds is a test against a real bare remote, and it found a bug: `--claim` pushed
`origin/main` itself with `--force-with-lease=<ref>:`. Two racing sessions push the *same* sha,
so the loser's push is "Everything up-to-date", exits 0, and both think they hold the alert.
The lease check only runs when git has something to send. Each claim now pushes its own empty
commit on top of `origin/main` (`git commit-tree`, random nonce in the message), so the second
push for an alert really is refused. The success line says to start work from that claim commit
(`git checkout -B <branch> <sha>`), since a branch cut from `origin/main` would no longer
fast-forward onto it.
