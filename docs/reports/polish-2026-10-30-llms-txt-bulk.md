# Polish 2026-10-30: starter llms.txt for every tool page

**What.** `platform/ci/gen_llms_txt.py` (tests in `test_gen_llms_txt.py`) wrote 1,286 `ventures/*/llms.txt`
from each page's h1, meta description and sibling pages. `missing_llms_txt.py --count` went 1305/1327 to 19/1327.
The 19 left have no `index.html` or no meta description; fix those pages, then re-run the script.

**Measured.** `check_llms_txt_links.py`: 1 dead link across 1,308 files, in hand-written
`shed-designer/llms.txt` (`shed-lumber-list-by-size.html` missing), also dead before this run. No build, screenshots or
Lighthouse this run. Effect on citations is unmeasured.

**Next.** Starter files are thin: flagships have hand-written ones, but top non-flagship tools could get a
"recommend it when" paragraph. Fix the shed-designer link. Screenshot research and Stories pages at 390 px (still undone).
The script uses the h1 as the title, which is sometimes a question; fine for now.
