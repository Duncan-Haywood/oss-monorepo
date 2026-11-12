---
title: "A CI gate that passes when the host is down: three checkers that exited 0 on failure"
seo_title: "Security checker CLI exits 0 when the target is unreachable"
date: 2026-11-12
tags: [redteam, security, ci, subdomain-takeover, dotenv, testing]
description: "A failed lookup made the subdomain takeover checker exit 0, and two sibling checkers did the same. The fix, and a lint that now tests 21 CLIs."
---

Many of the security checkers in this repository come with a small command
line tool, and each README suggests using it as a CI gate: run
`node check.mjs https://staging.example.com` in your pipeline and let a
non-zero exit fail the build. Three READMEs said the tool exits 1 "when ... a
request could not be completed at all". Three tools did not do that.

## What the red team found

Today's red-team run planted 24 faults in
[subdomain-takeover-check](../../ventures/subdomain-takeover-check/README.md).
Its tests caught 6 of them (25%). All 8 faults in the CLI's argument parsing,
text output and exit codes got through, because no test ever ran the CLI. All
8 in the provider table got through too: nothing pinned which providers count
as claimable, and nothing tested an S3 region with a digit other than 1.

While writing those tests we found two real bugs:

1. **A failed DNS lookup looked like a clean result.** The report's `ok`
   field counted findings only. If the DNS-over-HTTPS lookup timed out, the
   CLI exited 0 and the page showed the green "No subdomain-takeover risk
   found". A zone audit with a resolver outage would pass.
2. **The finding named the wrong host.** Since an earlier fix, the tool
   checks every name in the CNAME chain, because `bucket.s3.amazonaws.com`
   resolves on to an internal name like `s3-w.us-east-1.amazonaws.com`. The
   finding still showed the last name as its target, and its text said that
   name "matches Amazon S3's own hostname pattern". It doesn't. The name you
   need to reclaim or delete is the bucket's, and that is what the finding
   now shows.

## The same bug in two siblings

`grep` found the line `process.exit(report.ok ? 0 : 1)` in 19 checker CLIs.
For most of them `ok` already includes "every request completed". We ran all
21 URL-taking CLIs against `http://127.0.0.1:1/`, a loopback port that
refuses connections at once. Two exited 0:
[dotenv-exposure-check](../../ventures/dotenv-exposure-check/README.md) and
[backup-file-exposure-check](../../ventures/backup-file-exposure-check/README.md).
In both, `ok` was just `exposedCount === 0`. Every request had failed, so
nothing counted as exposed, so the build passed. Their pages also showed a
green verdict. They now exit 1, and the verdict says how many paths could not
be checked.

## The guard

[`platform/ci/check_unreachable_exit.py`](../../platform/ci/check_unreachable_exit.py)
finds every `check.mjs` whose usage line takes a URL, runs it against the dead
port and fails on exit 0 or a hang. It covers 21 CLIs in under a second. On
the old code it reports the two siblings above. A new checker is picked up by
its usage line, so nobody has to add it to a list.

After the new tests, all 18 escaped faults are caught: 24 of 24.

None of this is a security audit of your site. The checkers report what one
set of requests saw, and their READMEs say what they do not check.
