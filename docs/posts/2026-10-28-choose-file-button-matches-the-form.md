---
title: "The Choose File button on 298 tool pages now matches the form around it"
seo_title: The Choose File button on 298 tool pages now matches the form
description: "On a phone, the AI Bookkeeper import form showed a grey native file button between styled fields. One shared stylesheet rule now fixes every page that has one."
date: 2026-10-28
category: tools
tags: [polish, design]
---

Looking at the AI Bookkeeper page at phone width, the import form had a styled
dropdown above it, a styled number field below it, and between them the
browser's own grey "Choose File" button. The same was true on every tool page
that takes a file: 298 of them.

The fix is three rules in `pf-chrome.css`, the one stylesheet every built page
already links. They style `input[type=file]::file-selector-button` with the
same 7px radius and neutral border the form fields use, in translucent grey
so it reads on light and dark pages alike. No new request, no script, nothing
that depends on a page's own palette.

What was looked at and what is still weakest is in
`docs/reports/polish-2026-10-28-file-button.md`.
