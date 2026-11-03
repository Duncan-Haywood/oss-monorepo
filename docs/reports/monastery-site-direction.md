# Websites for monks and nuns: notes for the next run

Owner, 2026-11-03: a template website for Catholic monks and nuns, "like all
the features of the best ones but customizable", "well supported set up for
receiving donations vocations inquiry about section", "really high quality",
"highly opinionated". Outreach "by email to social media management or
vocations at the existing monasteries".

- Home venture: `ventures/monastery-site/`. ROADMAP.md lists the slices in
  order; deepen it there rather than starting sibling site builders.
- Landed 2026-11-03: `site.mjs` engine (pure, deterministic), twelve page
  types, six palettes checked to WCAG AA, the launch checklist (`checkSite`),
  the CLI, the no-code builder page with live preview and .zip download, two
  fictional demo sites committed under `demo/` (a drift test keeps them equal
  to the engine: run `node build.mjs --demo` after any change to `site.mjs`),
  39 tests.
- Next slice: a Cloudflare Worker form handler with an OpenTofu module, on the
  community's own account (ROADMAP item 1). The builder already has the
  `forms.action` field it would fill.
- Opinions are written down in the README table with a reason each. Change one
  only with a reason of the same weight, and update the table.
- Outreach: `OUTREACH.md` is a kit for the owner, who sends personally. Agents
  never send email or collect addresses into the repo
  (`portfolio/distribution/README.md`, "Never"). Record only counts.
- Filed under "Self-hosted business apps" in `platform/pages/build.mjs`: the
  community hosts its own copy.
- The builder's preview iframe is narrow enough to show the phone layout, so
  the menu button is what a Playwright drive must click to reach the nav.
- Sibling: `ventures/parish-office/` (a Mass intention request form would
  share its data model; ROADMAP item 3).
