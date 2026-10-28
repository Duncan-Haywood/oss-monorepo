# Polish run 2026-10-28: native file button

**Looked at** (390px and 1280px, local build): hub, AI Bookkeeper, research
index, blog index and one post. The hub, research and blog are in good shape
(no sideways scroll: `scrollWidth` equals `innerWidth` on all of them). The
hub's "89 browser tools" in a screenshot was a count-up animation caught
mid-run; the built HTML says 1060.

**Weakest:** the flagship tool's import form. Styled select and number field
around an unstyled native "Choose File" button, on 298 pages
(`grep -l 'type="file"' dist/*/index.html`, none had `file-selector-button`).

**Changed:** `CHROME_CSS` in `platform/pages/build.mjs` gains a
`::file-selector-button` rule (palette-free, translucent grey, inherits font
and colour). After the rebuild `pf-chrome.css` carries it and the AI
Bookkeeper form shows a rounded button that matches its neighbours.

**Also fixed:** `build.test.mjs` "no page still points at the placeholder
origin" was red on `main` because two 2026-10-28 blog posts quoted the
placeholder host in prose. Reworded; the guard is unchanged.

**Not measured:** Lighthouse, traffic. **Next:** the dense grey paragraph of
links under the AI Bookkeeper h1 (about 10 lines on a phone) would read better
as a short lead plus a "Guides" list; the blog post page has only a
"previous" link and no related posts.
