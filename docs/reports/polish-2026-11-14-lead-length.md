# Polish 2026-11-14: answer-lead length cap

Picked from `polish-2026-11-13-answer-lead-style.md`, item 2 ("Long leads").

## What was measured

Words per `data-answer-lead` paragraph across all 55 leads (tags stripped, whitespace
split). The median is about 75 words. Before this run, the over-100 pages were
child-tax-credit-calculator 123, social-security-earnings-test-calculator 111 and
economic-nexus-threshold-tracker 111. Next longest: aca-subsidy-cliff-calculator 99,
medicare-irmaa-cliff-calculator 94, gambling-loss 93, solo-401k / charitable /
dependent-care-fsa 92.

Lead height and first-input depth, Chromium on `dist/`, reduced motion, 844 px tall viewport:

| Page | lead 390 | lead 1280 | first input 390 | first input 1280 |
|---|---|---|---|---|
| child-tax-credit | 487 → 369 | 194 → 144 | 962 → 887 | 573 → 544 |
| ss-earnings-test | 369 → 275 | 144 → 119 | 906 → 855 | 562 → 537 |
| economic-nexus | 404 → 358 | 164 → 140 | 1,704 → 1,712 | 1,007 → 1,009 |

Method: copy the dist page to `_before.html`, apply the source diff to the dist
`index.html`, serve `dist/` with `python3 -m http.server`, and read
`getBoundingClientRect()` of the lead and the first `main input/select/textarea`. The
script is easy to rebuild. Delete the `_before.html` copies afterwards.

## What changed

- Trimmed the three leads to fact + source + date. How-to-use and caveat sentences
  moved to the paragraph below, so nothing was deleted from the page, apart from the
  NY "100 transactions" aside, which the per-state table already shows.
- `platform/pages/answer-lead.test.mjs`: a new test caps every lead at 100 words
  (`MAX_LEAD_WORDS`). With the old text it failed on exactly these three. It also
  asserts that at least 50 leads were found, so a renamed marker can't make it pass
  with nothing checked.

## Still weakest, and what I would do next

1. **economic-nexus-threshold-tracker's intro.** The first input is 1,712 px down on a
   phone, below two screens. Three paragraphs (intro, "After using this...", the 1099-K
   aside) sit between the lead and the form. The "after using this" paragraph and the
   1099-K aside could become a shared `pf-jump` row (`polish-2026-11-13-shared-jump-row.md`).
2. **Lower the cap to 90** once the six leads at 91 to 99 words are trimmed the same way
   (aca-subsidy-cliff and medicare-irmaa first: both over 560 characters).
3. **llms.txt mirrors.** economic-nexus `llms.txt` line 9 still carries the older,
   longer lead. It's accurate, so it was left alone. If llms.txt files should match the
   lead word for word, a test could compare them.
4. Carried over: leads missing on about 26 high-intent tools
   (`polish-2026-11-13-answer-leads-nexus-obbba.md`, item 1); `MAX_LINKS` 8 → 6 in
   `intro-links.test.mjs`; `.pager` defined twice in the writing STYLE; the ticker's
   third line at 320 px.
