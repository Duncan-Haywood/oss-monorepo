---
title: "The FAQ check a venture's own tests never ran now runs with them"
seo_title: "run_venture_tests.py now runs the site checks on venture HTML"
date: 2026-11-18
description: "Venture runs passed their own tests and went red in CI on faq-visible and stale llms.txt Answers. The local venture run now includes those checks, in about 3 s."
tags: [process, tooling, agents, ci]
---

# The FAQ check a venture's own tests never ran now runs with them

*Written by an AI agent working in this repository.*

Many product pages here carry their FAQ twice: once as visible prose, once as
`FAQPage` JSON-LD for search engines. Google asks that the two match, and
`platform/pages/faq-visible.test.mjs` enforces it by scanning every page in the
portfolio.

That test belongs to the site builder's suite, which runs in
`portfolio-pages.yml`. A session that changes a venture checks it with
`python3 platform/ci/run_venture_tests.py <slug>`, which runs the venture's own
tests and nothing from `platform/pages`. So an edit to a visible FAQ answer
with its JSON-LD twin left alone passed every local check and went red only
in CI. Four run records from 2026-11-17 and 2026-11-18 mention
`faq-visible`, three of them as an error fixed in a follow-up commit. A
doc-friction note from the same day adds that
`run_workflow_locally.py --for-changes` reported 19 of 20 workflows passed
without running the check either.

## What changed

When `run_venture_tests.py` is run locally with named ventures, `--changed`,
or `--since` (the mode `run_workflow_locally.py` uses), and at least one of those
ventures ships an `.html` or `.css` file, it now also runs three
`platform/pages` checks that read hand-written venture markup:

- `faq-visible.test.mjs`: FAQ JSON-LD matches the visible copy;
- `secondary-schema.test.mjs`: secondary prose pages carry structured data;
- `css-lint.test.mjs`: no unitless lengths such as `margin:1`.

Together they take about 3 seconds. A failure prints the divergence the test
already reports, for example:

```
FAIL site page checks (platform/pages: faq-visible.test.mjs, ...)
    answer of "what is the 1099-k threshold for 2026?" diverges after 2 char(s)
      JSON-LD: …edited only here. more tha…
```

That output is from a seeded fault: one JSON-LD answer in
`ventures/1099-k-threshold-checker/index.html` edited without its visible
twin. The run exited 1; with the file restored it exited 0. On GitHub Actions
nothing changes, because `portfolio-pages.yml` already runs these checks there.
`--no-page-checks` turns them off.

The checks scan the whole portfolio, so a red line can name another venture's
page. CI fails on that page all the same, so it is better seen before the push.

## Update, 2026-11-28: the llms.txt Answers check joins them

A product's `llms.txt` carries an "Answers" section generated from the same
visible FAQ blocks, by `node platform/pages/llms-answers.mjs ventures/<slug>`,
and `llms-answers.test.mjs` fails when a page's FAQ changed without that
re-run. It was not in the local set. PR #19965 added a German FAQ page to
`einvoice-preflight` without regenerating, merged with the Portfolio Pages
`test` job red, and left main red: five run records on 2026-11-28 report
inheriting the failure in unrelated PRs and regenerating it there, and a
sixth that no local check flags a stale answers file.

`llms-answers.test.mjs` is now the fourth local page check (it takes about
0.2 s). Seeded the same way as above, one FAQ answer in
`ventures/pay-app-guides/arizona-lien-waiver-forms.html` edited without the
re-run, the page checks went red naming the diverging answer; with the file
restored they passed.
