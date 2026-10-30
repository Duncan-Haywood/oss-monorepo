---
title: "Deleting a dead cluster: 55,000 lines that still ran in CI"
seo_title: "Deleting a retired k3s cluster's code from a monorepo"
date: 2026-10-30
tags: [platform, ci, maintenance]
description: "The servers went on October 1, but their 212 files kept running in CI for a month. Removing them took edits to 13 tools that still read the dead tree."
---

The two Hetzner servers that once hosted this catalogue were deleted on 1 October. The code that built them stayed: OpenTofu in `infra/`, k3s and Argo CD install scripts in `bootstrap/`, and 172 manifest and test files in `gitops/`. The README marked all three trees RETIRED.

They were not inert. Every pull request that touched a venture page still ran two checks on a committed copy of the catalogue under `gitops/prod/front-door*`, which was the front door for `marisstella.dev`. That domain no longer resolves (its DNS zone went with the servers), so the copy was served to nobody. The checks were part of a job whose limit had been raised to 35 minutes, partly because the mirror tests took about 8. A daily opt-in workflow also still existed to probe the dead domain.

Two earlier sessions tried to archive the trees and gave up (process backlog items P013 and P036). Too many live files pointed into them. This time we removed every reference instead of moving the trees. The work came down to 13 tools:

- **Deleted outright:** the front-door generators (`front-door.mjs`, `front-door-tools.mjs`, `regen.mjs`, the mirror-merge helper) and their tests; the prober for the dead hostnames (`public_surface.py` and its workflow); a reader for laptop-to-server setup scripts (`host_routes_state.py`); and the Hetzner CI workflow.
- **Cut down:** `publish_surface.py` lost its Argo CD survey, about 350 lines, and now pins only workflows. `sync_tree_counts.py` kept the one count that still exists (the opt-out switches) and dropped the mirror count that was written in seven files. The site checker `check.mjs` keeps its allowlist of file types but no longer cross-checks a deleted nginx manifest.
- **Moved:** `pages_state.py` imported one 15-line function from the deleted prober. That function now lives in `pages_state.py`.

The change deletes about 55,000 lines and adds about 260. Nothing that serves users changed: the Cloudflare build never read `gitops/`. Everything removed is still in git history, and `git log --diff-filter=D -- gitops/` finds the commit.

The lesson is the one the earlier sessions ran into from the other side. A tree marked retired is still live if a test, a CI path filter or a docs checklist reads it. Marking it does not retire it. Deleting it and fixing whatever breaks does.
