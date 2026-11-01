# Polish 2026-11-01: phone check of Research, Stories and Writing

**What.** Built the site locally (`node platform/pages/build.mjs`, about 10 minutes) and loaded `/research/`, `/stories/` and `/writing/` from `dist` in Playwright at 390 px.

**Measured.** `scrollWidth` equals viewport width (390) on all three: no sideways scroll. Screenshots of Research and Stories show a readable hero, wrapped shelf chips, and a usable tab bar (it scrolls horizontally by design, "Updates" is clipped on purpose). No defect found, so no code changed.

**Next.** Not yet looked at: a blog post page, a flagship page at 390 px in dark mode, and Lighthouse numbers on the hub. `missing_llms_txt.py` now exits 0, so the llms.txt gap list is empty.
