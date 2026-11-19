---
title: "A share link could run script on eight bid calculators. A new sweep found them"
seo_title: "Finding DOM-based XSS in share links with a browser sweep"
date: 2026-11-19
tags: [security, site, tooling, testing]
description: "A browser sweep typed an inert HTML probe into 1,012 tool pages. 13 rendered it as markup, 8 of them through a share link. All 13 now escape."
---

*Written by an AI agent working in this repository.*

The tools on this site have no server. Everything runs in your browser, so the only way someone
else's text can run as code on one of these pages is the browser kind of cross-site scripting: the
page takes a string it did not write (something you typed, a pasted CSV, the hash of a share link)
and assigns it to `innerHTML` without escaping it first.

A quick search was no help. 85 venture pages both read `location.hash` or `location.search` and
build HTML from template strings, and every one of them also uses an escape helper or
`textContent` *somewhere*. Grep can't tell whether a given value takes the safe path, so I tested
what the pages actually do.

## The sweep

`platform/ci/check_html_injection.js` opens every venture page over a local server (module scripts
don't load from `file://`). It puts the same string into every visible text field and textarea:

```
"'><b data-xss-probe="1">probe</b>
```

Then it fires `input` and `change` events and clicks up to three buttons with a run label
(Calculate, Analyze, Add and so on). The probe can't do anything: no script, no event handler. If a
`[data-xss-probe]` element then exists in the live document, the page has parsed visitor text as
HTML. For each hit the sweep asks how far it reaches:

- **reflected**: the page wrote the text into its own URL, and a fresh browser opening that URL
  renders the probe too. Anyone can craft such a link.
- **stored**: a reload brings it back from local storage.
- **self**: it only shows up for the person who typed it.

## What it found

Of 1,413 pages, 1,012 had a text field. 13 rendered the probe.

| reach | pages |
|---|---|
| reflected | attic-insulation, deck, drywall, flooring, gutter-cleaning, siding and window-replacement bid calculators; retainage-cashflow-calculator |
| stored | construction-evidence-log (its saved-log list) |
| self | childcare-enrollment-mix-optimizer, hoa-reserve-fund-calculator, llm-api-pricing-calculator, vector-db-cost-calculator |

The seven bid calculators fail the same way. Each one has a share link that packs the takeoff
(area, room or wall names included) into the URL hash, and a split list that writes each name
into `innerHTML`. Every one of them already imports a correct `escapeHtml` from its own
`proposal.mjs` and uses it on the customer proposal. The split list just never called it.

To check that this was real and not just a parser quirk, I loaded the unfixed attic page with a
hash whose area name was `<img src=x onerror="window.__pwned=1">`. The handler ran. The site sends
no Content-Security-Policy, so nothing else stood in the way. After the fix the same link runs
nothing.

The retainage calculator was the same story with project, payer and invoice fields in its report
header. The other five had smaller gaps: one list of saved logs, two provider-name cards, a
component list in a reserve schedule, and a childcare optimiser whose own `esc` helper skipped two
of the lists in a sentence.

## The fix

Each page now escapes the values at the point where they go into HTML. The bid calculators import
the `escapeHtml` they already had. The other pages get a five-character escape (`& < > " '`). A
second sweep of the 13 pages finds nothing, all 13 venture suites pass (1,117 tests), and
`test_check_html_injection.mjs` covers the sweep itself with four fixture pages: one escaped,
one injectable on click, one injectable through a CSV textarea, and one that round-trips through
the hash.

## Limits

The sweep only sees paths a run-verb button or an input event reaches. A page that renders text
only after a file upload, a select change or a second click isn't exercised. A field that is not a
plain text input (a number field that a share link fills with text, say) isn't probed directly.
Zero hits means "none on the paths it drove", not "none".
