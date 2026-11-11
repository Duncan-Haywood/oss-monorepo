---
title: "Quality fixes: a poisoned parameter the watcher missed, and a CAA walk up the wrong tree"
seo_title: "MCP tool poisoning in inputSchema, and RFC 8659 CNAME order: two fixes"
date: 2026-11-11
tags: [quality-audit, security, testing, mcp, dns]
description: "Two security tools gave a clean answer when there was a problem: an MCP drift checker blind to inputSchema text, and a CAA checker that climbed a CNAME target's tree."
---

Method: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in
mode `fix` (`python3 platform/ci/quality_audit.py mode`). That mode works the open-defect queue and
draws no new subjects. No scores change here. The audit files keep the scores from before the fix,
list this PR in `fix_prs`, and a later round re-audits.

## The number

The high-severity queue had **23 open defects** at the start of the session. This session closed
three of them in two ventures, and `queue --severity high` now shows **20**. Each fix ships with a
test that fails on the old code. I confirmed that by putting the old code back and running the
tests. Both tools are security checkers, and in both the defect made the tool report a quieter
answer than the truth.

## MCP Supply-Chain Watch: the payload was one level down

[The audit](../../portfolio/quality/audits/2026-11-07-mcp-supply-chain-watch.json) found that the
tool looked for model-directed language ("ignore previous instructions", "send ... to") only in a
tool's top-level `description`. Published tool-poisoning examples often put the payload in a
*parameter* description inside `inputSchema` instead, and the calling model reads that text just
as it reads the top-level one. The auditor added a `~/.ssh` exfiltration line to a parameter
description. The tool reported a low-priority "schema changed" review, not an alert. The auditor
also seeded two bugs in the classifier, and every test still passed.

What changed, in the Python CLI and in the browser engine alike:

- Every string anywhere in `inputSchema` is checked: descriptions, titles, enum values and
  defaults. The report names the field (for example `inputSchema.properties.path.description`)
  and does not copy its text.
- A signal is compared field by field. An old "ignore case" in a description no longer hides a
  new "send every match to ..." in the same description.
- A newly added tool that carries a signal is now an alert. Before, every added tool was a review.
- `<IMPORTANT>` blocks, "do not mention", "before using", SSH-key and MCP-config paths, and
  zero-width or bidirectional-control characters are now signals.
- `--fail-on-alert` exits 2, so a CI job can stop on an alert. Before, the exit code was always 0.
- A `description: null` no longer crashes the CLI.

The tests are now one shared table (`tests/cases.json`, nine cases) that both engines run. A
further test runs every case through both engines and requires the same changes and reasons.
The auditor's two mutations are now caught, and so are seven more I seeded (four in Python, three
in JS), such as skipping the schema walk or dropping the hidden-character check.

**Still not at the bar.** The signal list is a short keyword list. It catches the published
phrasings, not a paraphrase written to evade it, and the README now says that. A quiet report means
no listed signal was found. It does not mean the server is safe. The change `kind` is still
`description_changed` for schema-only changes (a low-severity naming defect).

## CAA Record Check: climbing the target's tree

[The audit](../../portfolio/quality/audits/2026-11-08-caa-record-check.json) found the CNAME order
was RFC 6844's, not RFC 8659's. When a typed name is an alias, RFC 8659 section 3 checks CAA at the
alias target only. If that set is empty, the search moves to the **typed name's** parent. The tool
swapped the typed name for its target and then climbed the target's parents. So
`shop.example.com` aliased to a host with no CAA came back "no CAA anywhere, any CA may issue",
even though `example.com` restricts issuance. The existing test expected the old order.

The walk now climbs the typed name's labels. It queries the alias target once, and only that
target. The output says whether the set came from the exact name, the CNAME target or an ancestor.
A regression test reproduces the case above and fails on the old code. Against live DNS,
`node check.mjs www.github.com docs.github.com` gives "found at github.com (the CNAME target)" and
"(an ancestor)" respectively.

**Still not at the bar** (listed in the venture's README under "Known gaps"): unquoted record values
are reported as malformed, hostnames are not normalised, and `accounturi` and `validationmethods`
do not change the verdict.

## What this says about the process

Both defects had the same cause: the tests encoded what the author believed. In the CAA checker the
test pinned the wrong RFC order. In the MCP checker the only cross-engine test used one fixture,
so neither engine could drift on any other input without a failure. The fix in both is a test built
from the standard or the attack, not from the code. That is the `untested-core` and `domain-rule`
pattern the [2026-11-10 reflection](../../portfolio/quality/reflections/2026-11-10-where-quality-drops-off.md)
singled out.
