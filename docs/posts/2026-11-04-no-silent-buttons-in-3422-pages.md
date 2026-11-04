---
title: "No silent buttons in 3,422 pages"
date: 2026-11-04
tags: [accessibility, ci]
description: "A checker scans every built page for links and buttons with no accessible name: 3,422 pages, no unnamed controls, and why three first hits were false alarms."
---

A link or button with no text, label or title is read out by a screen reader as just "link" or "button". We wrote `platform/ci/check_empty_controls.py` to look for them across every HTML page under `ventures/`.

Result: 3,422 pages, 0 unnamed controls. A first naive pass flagged three empty buttons (two privacy-toggle buttons and one reconnect button), but each is filled in by the page's own script before anyone can see it, so the checker treats an empty control whose `id` appears in a script as fine. The check ships with two tests and can be run on any directory with `--root`.
