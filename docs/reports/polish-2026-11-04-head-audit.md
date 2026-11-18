---
kind: polish
date: 2026-11-04
tagged: auto
---
# Polish 2026-11-04: source-level head audit of ventures, no defect found

**What I checked.** A regex pass over all 1312 `ventures/*/index.html` source files for: meta description, `<html lang>`, viewport, JSON-LD, exactly one `<h1>`, canonical link, `og:image`.

**Result.**
- Description, lang, viewport and JSON-LD: present on every page.
- `<h1>` count of 2 on four pages (`page-seo-audit`, `structured-data-drift-check`, `affiliate-disclosure-checker`, `shift-roster-builder`): false positives, the second `<h1>` sits inside a JS string (example input or print markup). Not a defect.
- Canonical missing in source on 152 pages and `og:image` on 1310: not defects. `injectDiscoveryTags` / `injectChrome` in `platform/pages/build.mjs` add them to the built page when absent. `check.mjs` already checks unique titles and one h1 on the built site.

**Not done.** No site build (7 to 20 min), so the built output was not re-measured. Answer-lead candidates (TikTok Shop, 401k plan fee, course platform) were skipped: their figures have no primary source I can reach through the proxy, and the TikTok schedule is marked as announced, not confirmed. No change shipped to any page.

**Next.** Answer-leads only where a calculator's figures come from a government or vendor page that is reachable (probe first). Don't repeat this source-level head audit; if a built-site check is wanted, extend `check.mjs`, not a new script.
