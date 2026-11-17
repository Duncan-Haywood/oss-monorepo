/**
 * The look of an answer-first lead, one shared rule for every tool page.
 *
 * Fifty-five tool pages open with a one-sentence direct answer that names its
 * primary source and an as-of date (`<p class="answer-source" data-answer-lead>`,
 * the pilot in `answer-lead.test.mjs`). Until this file they had no shared CSS:
 * one page inlined a border-left style and the other 54 rendered the lead as a
 * plain paragraph, so on most pages the sourced answer looked exactly like the
 * marketing paragraph under it and a reader skimming the header could not tell
 * which sentence was the fact (docs/reports/polish-2026-11-13-answer-leads-nexus-obbba.md,
 * item 3).
 *
 * Now the rule rides in `pf-chrome.css`, which every tool page already links,
 * so the lead reads as a "quick answer" block on every page at once: a rule on
 * the left, a faint tint, a little padding, and the "Source: ... As of ..."
 * tail unchanged in the text itself (the text is what an answer engine quotes,
 * so nothing here adds or hides words).
 *
 * Colours follow the page: the defaults are mixed from the text colour, so a
 * light page gets a grey rule and a dark header gets a light one, and the text
 * colour itself is never changed (contrast stays the page's own, less the 5%
 * tint, which `answer-lead-style.test.mjs` bounds). A page can set:
 *
 *   --lead-line   the left rule   (default: 40% of the text colour)
 *   --lead-bg     the tint        (default: 5% of the text colour)
 *
 * Specificity: one class (0,1,0), and `pf-chrome.css` is linked after a page's
 * own `<style>`, so a page's element rules (`header p`) never undo it, while a
 * page that needs something else can write a more specific rule.
 *
 * Without the stylesheet the lead is an ordinary paragraph: nothing hidden.
 */
export const ANSWER_LEAD_CSS = `
.answer-source{box-sizing:border-box;padding:10px 14px;border-left:3px solid rgba(128,128,128,.6);
  border-left-color:var(--lead-line,color-mix(in srgb,currentColor 40%,transparent));
  border-radius:0 6px 6px 0;background:var(--lead-bg,color-mix(in srgb,currentColor 5%,transparent))}
@media (max-width:480px){.answer-source{padding:8px 12px;font-size:.95em}}
`;
