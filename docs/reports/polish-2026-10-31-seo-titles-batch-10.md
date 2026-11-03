# Polish 2026-10-31: `seo_title:` batch 10, 25 hand-written titles (2026-10-26 posts)

**Weak surface.** A fresh build (1,321 tools, 6,073 pages) passes `check.mjs`: no dead links, no duplicate titles across 4,119 index pages. A scan found 700 pages with titles over 70 characters, most of them posts. `propose_seo_titles.py` reports 136 posts with no clean cut (the lister's own count was 158 before batch 9).

**Change.** Hand-wrote `seo_title:` (70 characters or fewer) for the 25 newest of the 136; `h1` and structured data keep the full headline.

**Measured.** `node --test platform/pages/writing.test.mjs`: 22 pass, 0 fail. Rankings and click-through not measured.

**False alarms to skip next time.** A naive scan flags 18 tool pages as having no meta description (apostrophes in the content broke the regex; all have one of 128 to 152 characters) and four with more than one `h1` (the extra ones are sample HTML inside the tool's own demo text).

**Still weakest.** About 111 older headlines over budget, newest first (2026-10-26 and earlier). Stories and research pages at 390 px were not screenshotted.
