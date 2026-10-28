# Polish 2026-10-28: a generated llms.txt for every product (AEO)

**Weak surface.** `python3 platform/ci/missing_llms_txt.py --count` said 1308/1324 ventures ship no
`llms.txt`; only the flagships and a few others had one, so an assistant that matched a tool in the
hub catalogue had nothing short and sourced to fetch at `/<slug>/llms.txt`.

**Change.** `platform/pages/build.mjs` now writes `/<slug>/llms.txt` for any product that ships none
(`renderProductLlmsTxt`): title, the same description the page uses, links to the tool, its source and the catalogue,
and the standing not-advice caveat. It adds no claim the page does not already make. Hand-written
files are untouched and remain the only ones the catalogue index marks "LLM docs". Software for the
routine: no agent has to write 1,300 files, and new products get one on their first build.

**Measured.** Build then `check.mjs`: 1318 products, 5233 pages, no dead links; `ls dist/*/llms.txt`
= 1318 (was ~10). Unit test `platform/pages/product-llms.test.mjs`. Not measured: any citation or traffic effect.

**Next.** Hand-written `llms.txt` for the next flagship-adjacent ventures; list generated pages' sub-pages in them;
the 16 ventures that are not published products still have none.
