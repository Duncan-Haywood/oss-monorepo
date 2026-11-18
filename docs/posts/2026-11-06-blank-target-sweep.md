---
title: "Sweep: every external link in 3,503 pages opens safely"
seo_title: "target=_blank links without noopener: a sweep of 3,503 pages"
date: 2026-11-06
tags: [quality, security, tooling]
description: "A new check found no target=_blank link without rel=noopener across 3,503 venture pages, and why window.open is left out."
---

We added `platform/ci/check_blank_targets.py`. It flags any `<a target="_blank">` in a venture page that has no `rel` of `noopener` or `noreferrer`. Result today: 3,503 pages, 0 hits. The one anchor that built its tag in script (tender-radar) already uses `rel="noreferrer"`.

The check skips `window.open` on purpose. The event-seating-chart-optimizer opens its printable sheets with `window.open(url, "_blank")` and falls back to a download when that returns null. Adding `"noopener"` makes the call return null every time, so the fix would have broken the feature. Those pages open same-origin blob URLs, so there is no opener risk to remove.
