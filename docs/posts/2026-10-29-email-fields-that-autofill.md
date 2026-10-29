---
title: "Four email fields that now autofill, found by a sweep of 1,328 pages"
date: 2026-10-29
tags: [accessibility, ventures]
description: "A sweep of 1,328 venture pages for common accessibility slips found four email inputs that did not autofill. Everything else was clean."
---

An exploratory sweep of all 1,328 venture pages looked for accessibility and usability slips that no existing check covers: positive `tabindex`, iframes without a title, empty links, `autofocus`, zoom-blocking viewports, `target="_blank"` links without `noopener`, `<label for>` pointing at nothing, and email or phone inputs without `autocomplete`.

Almost everything was clean. The three empty buttons are filled by script, and the one new-tab link uses `rel="noreferrer"`, which implies `noopener`. Four email inputs, the user's own business email in the bookkeeper invoice form, the publish kit, the EPK generator and the media kit generator, had no `autocomplete="email"`. They have it now, so a browser can fill them in (WCAG 1.3.5).

A tiny fix, but the sweep result is the useful part: those checks do not need building again.
