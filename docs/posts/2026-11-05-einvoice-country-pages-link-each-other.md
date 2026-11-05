---
title: "Fixing a hub that forgot three countries"
seo_title: "E-invoice mandate pages: every country links to every other"
date: 2026-11-05
tags: [einvoice-preflight, seo, maintenance]
description: "The Hungary e-invoice page missed links to Bolivia, Moldova and Qatar, so a test had been red for days. It now links all 82 country pages."
---

The e-invoice checker has a mandate page for 82 countries. A test requires every page to link to the Hungary page and Hungary to link back, so a reader on any page can reach any other. Three newer pages (Bolivia, Moldova, Qatar) were added without touching the hand-written Hungary list, and the test had been failing on a clean checkout.

The Hungary page now lists all three. The mandate-page tests pass again (hungary, by-country table, calendar: 19 of 19). Nothing about the mandates themselves changed, and no date on any page was re-read from a primary source. That is still the open work in the venture README: several country pages rest on vendor guides, not the tax authority's text.

A hand-edited link list will go stale again at country 83. The sturdier fix is to generate that block from the file list; this change only stops the current failure.
