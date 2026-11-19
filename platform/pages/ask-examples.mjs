// The rule behind ask-check.mjs, kept free of Playwright so it can be tested
// without a browser (ask-examples.test.mjs).
//
// /ask/ (the 2nd most loaded page in portfolio/usage/site-visits.json on
// 2026-11-19) shows three example questions under its greeting
// (`ASK_SUGGESTIONS` in assistant.mjs). A visitor taps one before typing
// anything, so it is the first answer the page gives. PR #17474 chose them
// by clicking each on the built page by hand, and had to replace one that led
// with the wrong passage. Four polish reports in a row then asked for a check
// that clicks them, because a renamed or retired tool, or a reworded FAQ,
// would turn a tap into "I found nothing" or a link to a page that is gone
// and nothing would notice (docs/reports/polish-2026-11-19-ask-page.md item 2).

/** The rule-based reader's "no answer" sentence (assistant/client.js). */
export const NOTHING_FOUND = 'I found nothing on this page or in the catalogue';

/** Where a reply quotes the page itself rather than listing tools. */
export const FROM_PAGE = 'From this page:';

/**
 * Problems with one example question's reply. Empty means it passes.
 *
 * `reply` is `{ question, text, links, dead }`: the reply bubble's text, the
 * site-relative hrefs of the tools it lists, and the subset of those that did
 * not load (404 on the built site). `reply` null means no reply came at all.
 *
 * - No reply, or the "found nothing" sentence: the tap answered nothing.
 * - Neither a passage from the page nor a tool: an empty answer.
 * - A question that asks for a tool ("Which tool …") must list one.
 * - Every listed tool must load: a dead link is the worst first answer.
 */
export function replyProblems(question, reply) {
  if (!reply) return [`"${question}": no reply appeared`];
  const out = [];
  const text = reply.text || '';
  const links = reply.links || [];
  if (text.includes(NOTHING_FOUND)) out.push(`"${question}": answered "I found nothing"`);
  else if (!text.includes(FROM_PAGE) && !links.length) out.push(`"${question}": no passage and no tool in the reply`);
  if (/^\s*(which|what) (tool|calculator|checker)s?\b/i.test(question) && !links.length) {
    out.push(`"${question}": asks for a tool but the reply lists none`);
  }
  for (const href of reply.dead || []) out.push(`"${question}": links ${href}, which does not load`);
  return out;
}

/** Every problem across all the example questions, in order. */
export function askFailures(replies) {
  return replies.flatMap(({ question, reply }) => replyProblems(question, reply));
}
