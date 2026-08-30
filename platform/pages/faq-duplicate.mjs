// No page may carry the same FAQ twice.
//
// The FAQ backlog was drained by several concurrent sessions on 2026-08-30
// (#2087, #2092, #2099, #2102, #2104, #2105), each appending a "Common
// questions" section to whichever ventures its own snapshot of
// `faq-coverage.mjs` reported as missing. Two of those snapshots overlapped by
// five ventures, and merging the second branch onto the first auto-resolved
// `contractor-bid-readiness/index.html` into *two* complete FAQ sections — no
// conflict, no failing test, a page that would have shipped the same five
// questions twice.
//
// `no-show-fee-calculator` reached `main` in that state by an older route: it
// authored its own `FAQPage` JSON-LD and kept a hand-maintained visible copy
// beside the real section so `faq-visible.test.mjs` would pass. The two copies
// drifted into differently-worded twins, readers saw the FAQ twice, and one
// copy sat outside `</main>` entirely.
//
// Nothing else here catches either. `faq-coverage.mjs` counts pages with *at
// least one* derived entry, so a second section only improves the number.
// `faq-visible.test.mjs` checks authored schema is visible, which a duplicate
// satisfies twice over. `check_pages.mjs` parses the HTML, and duplicated HTML
// parses fine.
//
// Deliberately narrow. It flags only what is unambiguously wrong: a repeated
// FAQ *section heading*, and the same question asked twice. It does not guess
// at near-duplicates — several ventures legitimately pair a short in-page
// `<details>` question ("How much waste should I add to an LVP bid?") with a
// longer search-worded one ("...to an LVP flooring bid?"), and a landing page
// legitimately asks both the general question and a narrower variant of it
// ("...to replace a well pump" and "...and pressure tank"). A gate that fires
// on those gets switched off, and then it catches nothing at all.
//
//   node platform/pages/faq-duplicate.mjs           # every published surface
//   node platform/pages/faq-duplicate.mjs <slug>    # one venture

import { collectPages } from './clauses.mjs';

/** Headings that label an FAQ section rather than ask a question. */
const SECTION_LABEL = /^(common questions|faq|faqs|frequently asked questions|questions)$/;

/**
 * Compare two questions the way a reader would: case, punctuation, entities
 * and whitespace carry no meaning, so "Is a no-show fee legal?" and
 * "Is a no&#45;show fee legal?" are the same question asked twice.
 */
export function normalize(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every FAQ-section heading on the page, normalized. */
export function sectionHeadings(html) {
  return [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map(([, text]) => normalize(text))
    .filter((text) => SECTION_LABEL.test(text));
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return counts;
}

/**
 * Every question the page asks as an `h2`/`h3` — the headings a duplicated FAQ
 * section duplicates, and the same ones `faqEntries()` reads.
 *
 * Read off the rendered copy rather than through `faqEntries()` itself, which
 * already drops a repeat by lower-cased question. That de-duplication is right
 * for the schema and blind to this defect: the second copy still renders, and
 * the reader still reads the same answer twice.
 *
 * `h1` is excluded deliberately. Every `how-much-to-charge.html` landing page
 * titles itself with the question it answers and then asks it again in its FAQ
 * — 40-odd pages, all correct. So is `<details><summary>`: several calculators
 * pair short inline help ("Is this the price I should charge?") with the
 * search-worded FAQ heading, which is a layout choice, not a mistake.
 */
export function visibleQuestions(html) {
  return [...html.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map(([, text]) => ({ raw: text.replace(/<[^>]+>/g, '').trim(), text: normalize(text) }))
    .filter(({ raw, text }) => raw.endsWith('?') && text.length > 1)
    .map(({ text }) => text);
}

/**
 * One row per problem on one page. `kind` is `section` for a repeated FAQ
 * section heading and `question` for a question asked more than once.
 */
export function duplicates(html) {
  const found = [];

  for (const [label, count] of countBy(sectionHeadings(html))) {
    if (count > 1) found.push({ kind: 'section', detail: label, count });
  }

  for (const [question, count] of countBy(visibleQuestions(html))) {
    if (count > 1) found.push({ kind: 'question', detail: question, count });
  }

  return found;
}

export async function main(argv = process.argv.slice(2)) {
  const slug = argv.find((arg) => !arg.startsWith('-'));
  const { pages } = await collectPages({ slug });

  const problems = [];
  for (const [page, html] of pages) {
    for (const problem of duplicates(html)) problems.push({ page, ...problem });
  }

  if (problems.length) {
    console.error(`${problems.length} duplicated FAQ item(s):`);
    for (const { page, kind, detail, count } of problems) {
      console.error(`  ${page}: ${kind} appears ${count}x — ${detail}`);
    }
    console.error(
      '\nA doubled FAQ shows the reader the same answer twice and repeats it in ' +
        'FAQPage schema. Keep one copy — usually the one inside <main>.',
    );
    return 1;
  }

  console.log(`${pages.length} page(s) checked, no duplicated FAQ questions or sections.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = await main();
}
