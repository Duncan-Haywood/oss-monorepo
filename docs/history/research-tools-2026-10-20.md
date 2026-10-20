# Research algorithms as tools: session report, 2026-10-20

This session started the owner's direction of 2026-10-20 (quoted in
`prompts/goals.md`, "Direction: research algorithms as tools" and "Direction:
every platform, not just the web"). Pull request: duncan-haywood/oss-monorepo#8747.

## What landed

| Item | Where | Verification |
| --- | --- | --- |
| Spec: what qualifies, licences, definition of done, candidate papers | `portfolio/research-tools/README.md` | n/a |
| Changepoint detector (PELT + BOCPD) | `ventures/changepoint-detector/` | 32 tests. Reproduces the Nile 1898 change; PELT equals brute force; BOCPD evidence equals the closed form |
| Conformal prediction intervals (split, locally weighted, CQR) | `ventures/conformal-prediction-intervals/` | 46 tests. 200-repetition coverage within [0.89, 0.92]; exact LP quantile regression |
| Matrix profile explorer (STOMP motifs and discords) | `ventures/matrix-profile-explorer/` | 37 tests. Equals brute force and STUMPY 1.14.1 outputs to 1e-10 |
| `describe` prints a tool's `PAPERS` in full | `platform/agents/tools.mjs` (+ test, README) | `node --test platform/agents/tools.test.mjs` |
| "Research algorithms & ML" site section | `platform/pages/build.mjs` (`RESEARCH_ALGORITHM_SLUGS`) | `categoryFor` test |
| Front door: category word, mount, regenerated mirror, launch dates | `platform/marketing/front-door-tools.mjs`, `gitops/prod/`, `platform/pages/launched.json` | marketing suite 275/275 locally |
| Flagship entry for future runs | `portfolio/flagships.yaml` (first) | `allocate.py` lists it |
| Blog post | `docs/posts/2026-10-20-research-algorithms-in-your-browser.md` | numbers copied from the three READMEs |

Two tools were built by subagents in parallel against the spec, then
reviewed here. All three pages were checked in headless Chromium at 390 px
and 1,100 px: no console errors, no external requests, no horizontal
scroll. One overflow on the conformal page was fixed.

## What adding a site category touches

CI found these one at a time, so here they are together:

1. `CATEGORY_RULES` in `platform/pages/build.mjs`.
2. The category count in `platform/pages/build.test.mjs`.
3. `WHY_CATEGORY_WORD` in `platform/marketing/front-door-tools.mjs`.
4. The `c__<id>.html.gz` line in `gitops/prod/kustomization.yaml`.
5. `node platform/pages/launched.mjs --write`. The front page only lists
   categories that have launched tools.
6. `node platform/marketing/front-door-tools.mjs --write`, then
   `node platform/marketing/regen.mjs`. Delete the scratch
   `gitops/prod/front-door-tools/` directory it leaves behind (about 6,000
   files; `main` does not track it).
7. The tool counts in `infra/OWNER_CHECKLIST.md` and `total` in
   `gitops/tests/test_manifests.py`.
8. Sibling links in each new page's footer, so `node platform/pages/siblings.mjs --check` passes.

## Unfinished: instructions for the next agent

1. **Desktop packaging (macOS, Windows, Linux).** This is the open gap in the
   "every platform" direction. Build `platform/distribution/desktop.mjs` on
   the pattern of `ios.mjs`:
   - Tauri v2, with a network-blocking CSP.
   - A `workflow_dispatch`-only workflow gated on `vars.DISTRIBUTE_DESKTOP`
     that attaches unsigned builds to a GitHub Release.
   - Signing documented as an owner step.
   - Rows in `portfolio/distribution/README.md` and `channels.yaml`.
2. **Next research tool.** Take the top unbuilt entry from "Candidates" in
   `portfolio/research-tools/README.md`, starting with synthetic control
   (Abadie, Diamond & Hainmueller 2010). Follow the definition of done there,
   and use `ventures/changepoint-detector/` as the model. Then add the slug to
   `RESEARCH_ALGORITHM_SLUGS`, a row to the spec's Tools table, sibling links,
   and the counts in step 7 above.
3. **Deepen the flagship.** Do the `next` milestone of `changepoint-detector`
   in `portfolio/flagships.yaml`:
   - a Poisson cost for counts;
   - a seasonal pre-step;
   - an AR(1)-aware cost;
   - each checked against R `changepoint` output.
4. **Open checks.** The conformal tool has no cross-check against R
   `quantreg` or MAPIE; none was installed here. The diabetes dataset has no
   explicit open licence. It is used as redistributed by scikit-learn
   (BSD-3), as `data/SOURCE.md` says. Replace it with a CC0 dataset if one
   fits.
5. **Distribution.** The three CLIs qualify for the npm, Homebrew, ghcr and
   MCP packagers. Run `node platform/distribution/npm.mjs` (dry run) to
   confirm they are listed. Publishing stays an owner step.
