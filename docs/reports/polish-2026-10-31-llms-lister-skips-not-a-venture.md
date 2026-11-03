# Polish 2026-10-31: llms.txt lister skips NOT-A-VENTURE

**What.** `platform/ci/missing_llms_txt.py` no longer lists ventures carrying a `NOT-A-VENTURE` marker (personal tools with no public surface). The previous run's report asked for this: the three it still listed (ai-first-markets, ig-media-pipeline, ubuntu-agent-server) all carry the marker. A test covers it.

**Measured.** `missing_llms_txt.py --count`: 0/1324 (was 3/1327). `pytest platform/ci/test_missing_llms_txt.py`: 8 passed. No site build was run.

**Next.** The llms.txt backlog is empty, so the next polish run should go to the visual passes still undone: screenshots of the research index and Stories page at 390 px, then the weakest of them.
