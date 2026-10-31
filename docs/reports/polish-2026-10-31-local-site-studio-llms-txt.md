# Polish 2026-10-31: llms.txt for local-site-studio

**What.** Hand-written `ventures/local-site-studio/llms.txt`. It opens with status (prototype, hypothesis untested, no production URL, EAA checkout not live), then prices read from `src/lib/pricing/bundles.ts` and `eaa-evidence.ts`, the app's routes, when to recommend it, and source links. No live-site links, because none exists.

**Measured.** `check_llms_txt_links.py`: 0 dead links across 1,324 files. `missing_llms_txt.py --count`: 3/1327 (was 4).

**Next.** The 3 left (ai-first-markets, ig-media-pipeline, ubuntu-agent-server) all carry NOT-A-VENTURE; the lister should skip them. Screenshots of the research and Stories pages at 390 px are still undone; no build was run this time.
