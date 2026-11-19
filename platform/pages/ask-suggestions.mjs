// What a good answer to each /ask/ example question looks like, and the judge
// that ask-suggestions-check.mjs applies to the replies it reads in a browser.
//
// The /ask/ page shows three example questions under the greeting
// (ASK_SUGGESTIONS in assistant.mjs). A tap asks it with the default,
// rule-based engine: the site search plus the page's own words. Until
// 2026-11-19 they were checked by hand once, when they were written
// (polish-2026-11-19-ask-page.md, item 2 of "Still weakest", carried over by
// three later reports). A renamed tool, a reworded FAQ or a search-index
// change could turn one into "I found nothing" on the page every visitor of
// /ask/ sees first, and nothing would notice.
//
// Each expectation names what the reply must contain, in words that survive
// small renames: `link` is a pattern one of the reply's tool links (title or
// href) must match; `passage` is a pattern the "From this page:" text must
// match; `maxLinks` caps the tool links under the answer (0 for a question the
// page answers and no tool is about: on 2026-11-19 the privacy question listed
// a sleeve-length tool, a semver explainer and a tips-tax page under the
// page's own answer, matched on "does" and "my"). Any reply that says "I found
// nothing" fails, as does one with neither a passage nor a link.

export const ASK_EXPECTATIONS = {
  'Which tool prices a roofing job?': { link: /roof/i },
  'What does eBay charge to sell a $40 item?': { link: /ebay|where to sell|marketplace/i },
  'Does what I type leave my device?': { passage: /device|browser|sent|nowhere/i, maxLinks: 0 },
};

export const NOTHING = /I found nothing/;

/**
 * Judge one reply. `reply` is { text, passage, links: [{ title, href }] } as
 * read from the panel's last `.pa-bot` message. Returns a list of problems
 * (empty when it passes).
 */
export function judgeReply(question, reply, expectations = ASK_EXPECTATIONS) {
  const problems = [];
  const want = expectations[question];
  if (!want) problems.push('no expectation in ask-suggestions.mjs for this question');
  if (!reply) return [...problems, 'no reply appeared'];
  if (NOTHING.test(reply.text || '')) problems.push('the reply says "I found nothing"');
  const links = reply.links || [];
  if (!reply.passage && !links.length) problems.push('the reply has neither a passage from the page nor a tool link');
  if (want?.link && !links.some((l) => want.link.test(`${l.title} ${l.href}`))) {
    problems.push(`no tool link matches ${want.link} (links: ${links.map((l) => l.title).join('; ') || 'none'})`);
  }
  if (want?.maxLinks != null && links.length > want.maxLinks) {
    problems.push(`${links.length} tool link(s) under the answer, at most ${want.maxLinks} expected (${links.map((l) => l.title).join('; ')})`);
  }
  if (want?.passage && !(reply.passage && want.passage.test(reply.passage))) {
    problems.push(`the page passage does not match ${want.passage} (passage: ${reply.passage ? JSON.stringify(reply.passage.slice(0, 120)) : 'none'})`);
  }
  return problems;
}

/** Questions shown on the page that have no expectation, and expectations for questions no longer shown. */
export function coverage(suggestions, expectations = ASK_EXPECTATIONS) {
  return {
    unchecked: suggestions.filter((q) => !(q in expectations)),
    stale: Object.keys(expectations).filter((q) => !suggestions.includes(q)),
  };
}

/** Pull { passage, text } out of a reply's visible text. */
export function splitReply(text) {
  const m = /From this page:\s*([\s\S]*?)(?:\n(?:Related tools:|These tools match)|\nHow:|$)/.exec(text || '');
  return { text: text || '', passage: m ? m[1].trim() : null };
}
