// Which published tools carry a secondary guide page, and which carry none.
//
// A tool's own page ranks for the transactional query ("deck bid calculator").
// The informational query ("how much should I charge to build a deck?") is a
// separate and larger search surface, and the house answer to it is a second
// page per venture -- question-shaped filename, visible Q&A, matching
// `FAQPage` JSON-LD, a link back to the tool. Distribution here is organic
// only, so that page is the acquisition surface, not decoration.
//
// It exists because the gap is invisible from inside a venture. Nothing in the
// build fails when a tool ships without a guide page: `check.mjs` finds no dead
// link, `clauses.mjs` finds no missing disclaimer, `faq-coverage.mjs` reports
// the entry page's own derived schema and is content. So a venture merged
// without one simply never gets one, and the only way anybody notices is a
// session happening to count directories. That is how nine of them accumulated
// -- all in the evidence and procurement tools, which is where a buyer is most
// likely to arrive with a question rather than a product name.
//
// Reporting only, deliberately. This is a backlog worth seeing, not a gate:
//
//   - A venture may legitimately have no single question to answer. The one
//     current example is `ai-engineering-academy`, a docs-and-tools surface
//     rather than a single-purpose tool, and failing CI over it would push a
//     session toward writing a page nobody searched for.
//   - The failure mode of gating this is filler. A thin guide page written to
//     clear a check is worse than none: it competes with the tool's own page
//     for the same query and dilutes it.
//
// So the exit code stays 0 and the list is the output. Fixing a row means
// writing a real page, which is a judgement about whether there is a question
// worth answering -- not a box to tick.
//
//   node platform/pages/guide-coverage.mjs            # summary + the missing list
//   node platform/pages/guide-coverage.mjs --quiet    # summary line only
//   node platform/pages/guide-coverage.mjs --json     # machine-readable
//   node platform/pages/guide-coverage.mjs <slug>     # one venture

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPages, unknownVenture } from './clauses.mjs';

/**
 * One row per published browser surface: its slug, and the secondary pages it
 * ships beside its entry page.
 *
 * "Secondary" is any published `.html` that is not the surface's own
 * `index.html`. A nested entry point such as `consent-change-record/tool/
 * index.html` counts: it is a second page a visitor can land on and link from,
 * which is the property being measured. Counting only question-shaped
 * filenames would be a stricter test of a naming convention than of whether
 * the surface has any depth at all, and the convention is not the point.
 */
export function coverage(pages) {
  const bySlug = new Map();

  for (const [page] of pages) {
    const [slug, ...rest] = page.split('/');
    const relative = rest.join('/');
    if (!relative.endsWith('.html')) continue;
    if (!bySlug.has(slug)) bySlug.set(slug, { slug, entry: false, guides: [] });
    const row = bySlug.get(slug);
    if (relative === 'index.html') row.entry = true;
    else row.guides.push(relative);
  }

  return [...bySlug.values()]
    .map((row) => ({ ...row, guides: row.guides.sort() }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const slug = argv.find((arg) => !arg.startsWith('-'));

  const { pages, known } = await collectPages({ slug });
  const rows = coverage(pages);

  if (slug && !known) return unknownVenture(slug);

  if (slug && rows.length === 0) {
    // Consistent with clauses.mjs and faq-coverage.mjs: a CLI or library
    // venture has no browser surface, and that is not a failure.
    console.log(`${slug}: no published browser surface, nothing to measure`);
    return 0;
  }

  const missing = rows.filter((row) => row.guides.length === 0);
  const covered = rows.length - missing.length;

  if (json) {
    console.log(
      JSON.stringify(
        {
          total: rows.length,
          covered,
          missing: missing.map((row) => row.slug),
          guides: Object.fromEntries(rows.map((row) => [row.slug, row.guides])),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`Guide-page coverage: ${covered} of ${rows.length} published surface(s) carry a secondary page.`);

  if (missing.length > 0 && !quiet) {
    console.log(`\n${missing.length} surface(s) with no page beside the entry page:`);
    for (const row of missing) console.log(`  ${row.slug}`);
    console.log(
      '\nTo fix one: add a question-shaped page to the venture directory —\n' +
      "the question a buyer types before they know the tool exists, answered\n" +
      "from what the tool actually does. Give it visible Q&A with matching\n" +
      '`FAQPage` JSON-LD (`faq-visible.test.mjs` pins that they agree, and it\n' +
      'is stricter than it looks: `&mdash;` is not decoded and a tag becomes a\n' +
      'space, so `<code>x</code>.` reads as "x ."), the venture\'s no-warranty\n' +
      'clause, a link back to the tool, and a link to it from the tool\'s\n' +
      'index.html. Do not touch sitemap.xml — build.mjs regenerates it from\n' +
      'what actually published.\n\n' +
      'Write nothing if there is no real question. An empty row here is better\n' +
      'than a page that competes with the tool for its own query.',
    );
  }

  // Reporting only; see the header. Never a gate.
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
