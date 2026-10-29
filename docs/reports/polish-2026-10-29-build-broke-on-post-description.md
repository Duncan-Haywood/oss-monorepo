# Polish 2026-10-29: site build broken by a 170-character post description

**What.** `node platform/pages/build.mjs` on main threw in `writing.mjs` (`loadPost`):
`docs/posts/2026-10-29-flagship-tools-now-open-on-a-button.md: description is 170 characters; keep it to 160`.
A build that throws means `portfolio-pages.yml` cannot deploy, so no merge after that post reached the live site.
I shortened the description to 150 characters; `loadPosts()` now loads all 1,137 posts.

**Why CI let it through.** `platform/ci/check_post_frontmatter.py` already has the 160 rule and passes now, so the
post merged either while that job was starved or skipped. I did not find which; the check itself is correct.

**Not done.** I did not finish the planned 390 px screenshots of a research page and the Stories page (the build
failure ate the run's budget), and no Lighthouse. Next run: do those screenshots, and confirm the Pages deploy is green
after this lands (`portfolio-pages.yml`).
