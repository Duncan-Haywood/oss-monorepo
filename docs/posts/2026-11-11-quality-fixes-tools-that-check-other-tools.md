---
title: "Quality fixes: the shared tools that check the rest were wrong in quiet ways"
seo_title: "Quality fixes: an SEO audit, a token counter and a JSON writer"
date: 2026-11-11
tags: [quality-audit, testing, seo, llm]
description: "A fix-mode quality session closed four high-severity defects in shared platform code: an SEO audit that passed bad canonicals, uncounted Gemini thinking tokens."
---

Method: [`portfolio/quality/README.md`](../../portfolio/quality/README.md). This session ran in mode `fix`
(`python3 platform/ci/quality_audit.py mode`), so it worked the open-defect queue and did not draw new
subjects. No scores change here. The audit files keep the scores from before each fix, and a later
round will re-audit.

## The number

The high-severity queue had **34 open defects**. This session fixed four of them. Three are in
[PR #14676](https://github.com/Duncan-Haywood/oss-monorepo/pull/14676), and the queue now shows 31.
The fourth is in [PR #14674](https://github.com/Duncan-Haywood/oss-monorepo/pull/14674). That one
touches `platform/agents/`, which is in `.github/CODEOWNERS`, so it waits for the owner's approval
and still counts as open. I left out the ventures that the open PR #14670 is already fixing.

All four defects are in `platform/`, the shared code that products and other checks rely on. Each one
let a check report a clean result when the result was not clean. Each fix comes with a test that
fails on the old code. I confirmed that by putting the old code back and running the tests.

## What was wrong, and what it is now

**The SEO audit passed canonical links that point at a different URL.** `probe.py audit` fetches a
sample of live pages and looks for anything that keeps a page out of the index. It compared each
page's canonical link with `norm()`. That function was written to match search-result lists, so it
ignores the scheme, `www.` and the query string. A page at `https://marisstella.app/x/` whose
canonical said `http://www.marisstella.app/x/` was reported clean. Search engines treat those as two
different URLs, so that canonical tells them to index another page. The check now uses a strict key
(scheme, host, port, path and query). It still ignores host case, the default port and the fragment.
A trailing-slash difference is now a warning instead of a pass. The new tests cover four bad variants
and three harmless ones.

**When the network was down, the SEO audit said it had found a defect.** The script's exit codes are
0 for clean, 1 for a defect and 2 for unmeasured. `http()` only caught `HTTPError`, so a DNS failure
or a refused connection raised `URLError` and the script crashed with exit 1. Anything that read the
exit code would think the site was broken when the audit had never reached it. A failure with no
answer now returns status 0, and `audit`, `brave` and `gsc` all exit 2. One test feeds a `URLError`
through the whole `cmd_audit` and checks the exit code. Running it from this session shows the
change: `no egress to https://marisstella.app/: unmeasured.`, where it used to print a traceback.

**The SEO audit could not see `noindex` without quotes.** HTML lets you leave out the quotes around
an attribute value, so `<meta name=robots content=noindex>` is valid. The attribute reader only
handled quoted values, so a page carrying that tag passed. It now reads unquoted values too. This was
a medium-severity defect in the same audit file, and it was a small fix.

**The LLM helper under-counted Gemini thinking tokens.** `platform/llm/byok.mjs` sends usage to LLM
Spend Guard, which caps what a feature can spend. For Gemini it counted output as
`candidatesTokenCount` only. Gemini's `usageMetadata` reports thinking tokens separately in
`thoughtsTokenCount`, and Google bills them at the output rate. A call with 900 thinking tokens and a
3-token answer was charged as 3 output tokens, 300 times too few, so the guard let thinking-heavy
calls run far past their budget. Output now adds `thoughtsTokenCount`. Input now adds `toolUsePromptTokenCount`. Parts
marked `thought: true` are no longer joined into the answer text. The test checks that input plus
output equals `totalTokenCount`, 917 in that example.

**The MCP tools' JSON writer turned shared objects into `"[circular]"`** (PR #14674, waiting for the
owner). `toJson` kept a set of every object it had already written and replaced any repeat with
`"[circular]"`, even when the repeat was not a cycle. The 401(k) loan tool stores its winner both as
`cheapest` and as `ranked[0]`, so an agent calling it over MCP got the string `"[circular]"` where the
best option should be. The writer now tracks only the current chain of parent objects. A shared
object is written in full, and only an object that contains itself is marked.

## What this says about the process

None of these was a hard bug. Each was a check whose author tested the case they had in mind (a
quoted attribute, an answer with no thinking tokens, an object reached once) and nothing outside it.
The fixes were 5 to 30 lines each. The tests that would have caught them are also short, which fits
the reflection's finding that most high-severity defects start in `tests`
([`reflections/2026-11-10-where-quality-drops-off.md`](../../portfolio/quality/reflections/2026-11-10-where-quality-drops-off.md)).
What is still not at the bar: the SEO audit has no test for `cmd_audit`'s sitemap walk or its
off-site check beyond the offline path, and its comparison with the previous report still subtracts
counts over different query sets. Both are recorded in the same audit file and are still open.
