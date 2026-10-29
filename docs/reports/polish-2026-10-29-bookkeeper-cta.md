# Polish 2026-10-29: first-screen call-to-action on AI Bookkeeper, and a broken site build

**Weak spot** (from `polish-2026-10-29-site-scan.md`): at 390 px the AI Bookkeeper page shows a heading and
dense paragraphs, with no action visible on the first screen.

**Change.** `ventures/ai-bookkeeper/index.html`: a button row under the `h1`: "Import a bank file" (jumps to
the import card) and "Try the example" (loads the synthetic three-month example, same handler as the existing
button). Visible focus ring, wraps on phones.

**Measured** (Playwright, 390 px): first CTA top at y = 193 px, so above the fold (844 px high);
`scrollWidth` 390 (no sideways scroll). Screenshot: `img/polish-ai-bookkeeper-cta-390.png`. `page.test.mjs` and
`compare.test.mjs` pass (32/32). The example-click path was not exercised in the browser (the page's module
imports failed over `file://`, and I did not re-test over http).

**Found on the way: `main`'s site build was failing.** `node platform/pages/build.mjs` threw on
`docs/posts/2026-10-29-an-airline-strike-in-weekly-data.md` (description 169 chars, limit 160), so
`portfolio-pages.yml` could not deploy. Shortened to 155 chars; `loadPosts()` now returns all 1,038 posts.
I did not re-run the full 20-minute build after the fix.

**Next.** The floating mic button still overlaps body text at 390 px. Other flagship venture pages likely
have the same no-CTA first screen. Lighthouse not run.
