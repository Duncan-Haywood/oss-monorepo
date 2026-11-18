---
kind: polish
date: 2026-11-05
tagged: auto
---
# Polish 2026-11-05: lumber-order comparison page for wall-framing-takeoff

Top flagship had one comparison page (stud-per-foot rule). Added `vs-ordering-lumber-by-hand.html`: first-fit-decreasing
and one-board-per-piece against the shipped cutting-stock order, with figures taken from `node bench.mjs` run today
(sample house 2384.16 vs FFD 2450.00 (+2.8%) vs 2915.04 (+22.3%); 150-case rows 64.7% / 29.3% FFD optimal). FAQ + JSON-LD,
sitemap, `llms.txt`, and a `page.test.mjs` test that pins the FAQ-to-JSON-LD match and the ratios. `page.test.mjs`: 70 pass;
`check_llms_txt_links.py`: 0 dead links. No site build or screenshots; rankings and traffic not measured.

**Next.** A named-product comparison (needs sourced facts about a competitor's pricing; none gathered here), and a
real builder's order to replace the invented house. The site build was skipped again (7 to 20 minutes).
