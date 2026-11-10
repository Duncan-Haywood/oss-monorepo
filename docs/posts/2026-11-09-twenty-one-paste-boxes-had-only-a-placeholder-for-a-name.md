---
title: "Twenty-one paste boxes had only a placeholder for a name"
seo_title: "Textarea accessible name: placeholder is not a label"
date: 2026-11-09
tags: [accessibility, ventures, audit]
description: "A sweep of 3,632 venture pages found 21 checker tools whose paste-here textareas were named only by their placeholder. Each now has an aria-label."
---

An explore run swept the venture pages for form controls that rely on a
placeholder as their only name. Placeholders vanish once you type, and screen
readers don't reliably announce them. Earlier sweeps covered unnamed controls
in static markup, but 21 tools build their paste boxes from a JavaScript
template, so those textareas (and the filename inputs beside them) had no
label of any kind.

The affected tools are the GitHub Actions, Docker, Kubernetes, JWT, hreflang
and flaky-test checkers. Each paste box now carries an `aria-label` that says
what to paste, such as "Paste the workflow YAML here". The filename inputs
are labelled "File name". The two remaining hits in `proposal-maker` are
already wrapped in a `<label>`, so they were left alone.

The same sweep also looked for reduced-motion gaps. All 24 candidate pages
were false positives, because the word "transition" appears in their prose,
so there is nothing to fix there.

Next: a static check for template-string controls, since the existing label
checker only reads the markup as written.
