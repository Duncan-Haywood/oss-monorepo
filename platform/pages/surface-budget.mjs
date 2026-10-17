// What marketing surfaces a venture already has -- and a budget on the one kind
// that does not scale: the comparison page written against a generic method.
//
// Why this exists, measured 2026-09-16. Three separate sessions built a
// comparison page for `overtime-pay-calculator` on the afternoon it shipped:
// #4768 ("vs. doing it by hand"), #4771 ("vs. a spreadsheet") three hours
// later, and a third that got as far as a pushed branch and an open PR before
// noticing. Every one of those sessions ran the overlap check CLAUDE.md's
// "Duplicate PRs" section prescribes, and every one ran it honestly and got a
// clean answer, because the collisions landed in the window between checking
// open PRs and pushing. An overlap check that reads *pull requests* cannot see
// a sibling page that merged ten minutes ago; only the tree can.
//
// So this reads the tree. `--for <slug>` is the pre-flight: it prints what a
// venture already publishes and the angle each page takes, which is the
// question a session actually needs answered before writing another one, and
// it answers it from files rather than from anything that can be raced.
//
// ## Why only generic-method pages are budgeted
//
// The obvious version of this check counts comparison pages per venture and
// complains past some threshold. That version is wrong, and the catalogue says
// so: the two ventures carrying three each are `cloud-egress-calculator`
// (vs. the AWS, Azure and Google Cloud pricing calculators) and
// `locksmith-bid-calculator` (vs. Housecall Pro, Jobber and Workiz). Those are
// three *distinct named products*, and a reader comparing against Jobber is not
// served by a page about Workiz. Pages like that are bounded naturally by how
// many real competitors exist, and each already has to carry its own trademark
// disclaimer, so there is nothing to budget.
//
// The kind that does not scale is the comparison against a generic method --
// "a spreadsheet", "doing it by hand", "a single-rate calculator". There is
// really only one such angle per tool: *you could work this out yourself, and
// here is what you would get wrong*. A second page on that angle competes with
// the first for the same query while telling the reader the same thing.
//
// Those pages are already enumerated, and not by this file: `clauses.mjs`
// exempts exactly them from the trademark disclaimer, for exactly the reason
// that makes them budgetable here -- they name no product. This imports that
// set rather than re-deriving it from filenames, so a page can never be one
// kind for the disclaimer check and the other kind for this one. CLAUDE.md
// records under "168 became 169" what a restated rule costs the next time the
// canonical one moves.
//
// Run against `main` on the day it was written, and before the override below
// is applied, this goes red on exactly one venture -- the one three sessions
// collided on -- and stays quiet on the two three-page ventures a naive count
// would have flagged. With the override it exits 0, and still refuses a third.
//
// Deliberately not a text-similarity checker. Measured on those three pages,
// 6-gram overlap between them is 3.5-4.6%: they are independently written, and
// a similarity gate would have passed all three while the actual problem went
// unremarked. What is duplicated is the *angle*, not the prose.
//
// Usage:
//   node platform/pages/surface-budget.mjs --for overtime-pay-calculator
//   node platform/pages/surface-budget.mjs --check    # exit 1 if over budget
//   node platform/pages/surface-budget.mjs            # the whole table
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { COMPARISON_FILE_PATTERN, REPO_ROOT, comparisonText, discoverSurfaces } from './build.mjs';
import { COMPARISON_DISCLAIMER_EXEMPT } from './clauses.mjs';

/**
 * Generic-method comparison pages one venture may carry without a recorded
 * reason.
 *
 * One. Measured rather than chosen: 12 ventures on `main` carry a
 * generic-method page at all, 11 of them carry exactly one, and the twelfth is
 * the collision recorded below. The claim behind the number is that there is a
 * single "you could do this yourself" angle per tool.
 */
export const GENERIC_COMPARISON_BUDGET = 1;

/**
 * Ventures allowed more than {@link GENERIC_COMPARISON_BUDGET}, with why.
 *
 * A row here is a claim someone is making, so it carries a reason and a date
 * rather than just a number.
 */
export const GENERIC_BUDGET_OVERRIDES = {
  'overtime-pay-calculator': {
    allowed: 2,
    why:
      'Recorded 2026-09-16, the day this check was written, because this venture is the case that prompted it. ' +
      'Three sessions shipped a generic-method page here in one afternoon: #4768 ("vs. doing it by hand"), #4771 ' +
      '("vs. a spreadsheet") three hours later, and #4772 ("vs. a single-rate calculator"), each by a session whose ' +
      'overlap check was clean when it ran. #4772 was this session\'s, and the commit that added this check also ' +
      'removes it -- deleting the newest page rather than one of the two that shipped first, and deleting its own ' +
      'work rather than someone else\'s. The remaining two are well made and independently written (4.6% 6-gram ' +
      'overlap), so neither is obviously the one to go, and removing a second day-old URL costs more than the ' +
      'duplication does. Allowed at two, which still blocks a fourth. Folding them into one page is worth doing ' +
      'when someone next edits either.',
  },
  'shopify-fee-calculator': {
    allowed: 2,
    why:
      'Recorded 2026-09-23: two sessions each added a generic-method page for this venture within the same ' +
      'window, #5200 ("vs. a flat card-fee guess", a mental-math estimate) and this session\'s own ' +
      '"vs. doing it in a spreadsheet" (a hand-built formula). Both landed cleanly against an overlap check ' +
      'that was correct when it ran -- the collision is the one surface-budget.mjs\'s own docstring already ' +
      'describes for overtime-pay-calculator, from a different pair of angles: a merchant who never builds a ' +
      'formula at all (guesses a flat rate) versus one who builds a formula and gets specific steps wrong ' +
      '(the third-party transaction fee, plan allocation, target-margin and break-even algebra). Neither ' +
      'duplicates the other\'s worked example or conclusion. Allowed at two, which still blocks a third.',
  },
  'sign-language-interpreter-rate-calculator': {
    allowed: 2,
    why:
      'Recorded 2026-09-23: two sessions each added a generic-method page for this venture within the same ' +
      'window, this session\'s own "vs. a spreadsheet" (a formula-builder who already has hours and a rate in a ' +
      'sheet) and #5368\'s "vs. a flat fee per assignment" (an interpreter who skips arithmetic entirely and ' +
      'quotes a memorized number). Both landed cleanly against an overlap check that was correct when it ran -- ' +
      'the same collision shape surface-budget.mjs\'s own docstring already describes for overtime-pay-calculator ' +
      'and shopify-fee-calculator, from a third pair of angles: a spreadsheet formula misses the booking minimum, ' +
      'the differential, and the team-interpreting recommendation the same way a flat memorized fee misses travel, ' +
      'an evening differential, and that same team-interpreting recommendation -- but neither page\'s worked ' +
      'example or conclusion duplicates the other\'s. Allowed at two, which still blocks a third.',
  },
  'apparel-decoration-price-calculator': {
    allowed: 2,
    why:
      'Recorded 2026-09-24: two sessions each added a generic-method page for this venture within the same ' +
      'window, this session\'s own "vs. a flat price per shirt" (a decorator who quotes one flat per-piece rate ' +
      'no matter the job) and #5387\'s "vs. a spreadsheet" (a decorator who already builds a per-piece formula ' +
      'but gets specific mechanics wrong -- setup spread over the wrong quantity, blanks bought without a ' +
      'spoilage margin, embroidery machine time divided by heads when hooping should not be). Both landed ' +
      'cleanly against an overlap check that was correct when it ran -- the same collision shape ' +
      'surface-budget.mjs\'s own docstring already describes for overtime-pay-calculator, shopify-fee-calculator ' +
      'and sign-language-interpreter-rate-calculator, from a fourth pair of angles: no formula at all versus a ' +
      'formula with specific, identified defects. Neither page\'s worked example or conclusion duplicates the ' +
      'other\'s. Allowed at two, which still blocks a third.',
  },
  'atm-route-margin': {
    allowed: 2,
    why:
      'Recorded 2026-09-24: two sessions each added this venture\'s first generic-method page within the same ' +
      'window, #5410\'s "vs. a spreadsheet" (an operator who already builds a per-location formula but has no ' +
      'cell that charges vault cash a cost of capital, since that cost never arrives as a bill) and this ' +
      'session\'s own "vs. ranking your route by transaction count" (an operator who skips the formula entirely ' +
      'and sorts locations by withdrawal count, which cannot distinguish a profitable placement from a losing ' +
      'one at the identical transaction count). Both landed cleanly against an overlap check that was correct ' +
      'when it ran -- the same collision shape surface-budget.mjs\'s own docstring already describes for ' +
      'overtime-pay-calculator, shopify-fee-calculator, sign-language-interpreter-rate-calculator and ' +
      'apparel-decoration-price-calculator, from a fifth pair of angles: a spreadsheet formula with one specific ' +
      'missing cost versus no formula at all. Neither page\'s worked example or conclusion duplicates the ' +
      'other\'s. Allowed at two, which still blocks a third.',
  },
  'fleet-repair-or-replace-planner': {
    allowed: 2,
    why:
      'Recorded 2026-09-24: two sessions each added this venture\'s first generic-method page within the same ' +
      'window, this session\'s own "vs. a spreadsheet" (an owner who already builds a per-asset formula but gets ' +
      'the payback and budget-ranking arithmetic wrong the two specific ways calc.mjs\'s own header documents ' +
      'having shipped) and #5541\'s "vs. comparing the repair bill to a new price" (an owner who skips a formula ' +
      'entirely and holds this year\'s repair invoice up against a replacement quote, which leaves out downtime). ' +
      'Both landed cleanly against an overlap check that was correct when it ran -- the same collision shape ' +
      'surface-budget.mjs\'s own docstring already describes for overtime-pay-calculator, shopify-fee-calculator, ' +
      'sign-language-interpreter-rate-calculator, apparel-decoration-price-calculator and atm-route-margin, from ' +
      'a sixth pair of angles: a spreadsheet formula with specific documented defects versus no formula at all. ' +
      'Neither page\'s worked example or conclusion duplicates the other\'s. Allowed at two, which still blocks a ' +
      'third.',
  },
  'menu-engineering-calculator': {
    allowed: 2,
    why:
      'Recorded 2026-09-24: two sessions each added this venture\'s first generic-method page within the same ' +
      'window, #5639\'s "vs. averaging margins in a spreadsheet" (an operator who builds a per-dish margin ' +
      'formula but averages it unweighted, so a high-volume plate can misread as below the bar) and this ' +
      'session\'s own "vs. ranking by food cost percentage" (an operator who never builds a margin figure at ' +
      'all and instead sorts dishes by the one percentage every POS and recipe card already reports, which the ' +
      'calculator\'s own shipped example ranks backwards from contribution margin). Both landed cleanly against ' +
      'an overlap check that was correct when it ran -- the same collision shape surface-budget.mjs\'s own ' +
      'docstring already describes for overtime-pay-calculator, shopify-fee-calculator, ' +
      'sign-language-interpreter-rate-calculator, apparel-decoration-price-calculator, atm-route-margin and ' +
      'fleet-repair-or-replace-planner, from a seventh pair of angles: an unweighted spreadsheet formula versus ' +
      'no formula at all. Neither page\'s worked example or conclusion duplicates the other\'s. Allowed at two, ' +
      'which still blocks a third.',
  },
  'facebook-marketplace-fee-calculator': {
    allowed: 2,
    why:
      'Recorded 2026-09-25. This venture shipped with vs-tracking-facebook-marketplace-sales-in-a-spreadsheet.html ' +
      'at launch (#5772), but that page was never registered in clauses.mjs\'s COMPARISON_DISCLAIMER_EXEMPT set, ' +
      'so surface-budget.mjs misclassified it as named-product and reported "room for 1 more generic-method page" ' +
      'on a venture that already had one. Two sessions read that false signal within the same window and took two ' +
      'different, correct actions on it: this session registered the existing page\'s exemption (the fix the false ' +
      'signal actually called for), and #5813 -- reading the same signal before this fix landed -- added a second, ' +
      'independent page, "vs. doing the fee math by hand" (an eighth instance of the pair surface-budget.mjs\'s own ' +
      'docstring already describes for overtime-pay-calculator, shopify-fee-calculator, ' +
      'sign-language-interpreter-rate-calculator, apparel-decoration-price-calculator, atm-route-margin, ' +
      'fleet-repair-or-replace-planner and menu-engineering-calculator: a spreadsheet formula versus no formula at ' +
      'all). Neither page\'s worked example or conclusion duplicates the other\'s, and removing either loses real, ' +
      'independently written coverage rather than fixing a duplication. Allowed at two, which still blocks a third.',
  },
};

/** How many generic-method comparison pages `slug` may carry. */
export function budgetFor(slug) {
  return GENERIC_BUDGET_OVERRIDES[slug]?.allowed ?? GENERIC_COMPARISON_BUDGET;
}

/**
 * Does this page compare against a generic method rather than a named product?
 *
 * Answered by `clauses.mjs`'s exemption set, keyed the same way it is -- by
 * `slug/relative` display path -- so the two checks cannot disagree about what
 * a given page is.
 */
export function isGenericComparison(slug, file) {
  return COMPARISON_DISCLAIMER_EXEMPT.has(`${slug}/${file}`);
}

/**
 * The angle a marketing page takes, in its author's own words.
 *
 * The `<h1>` is the answer where there is one -- "This calculator vs. a
 * spreadsheet" says more than any filename can -- with the `<title>` as the
 * fallback and the filename as the last resort, so a page always reports
 * *something* rather than being silently dropped. That ordering matters for a
 * pre-flight: a session reading this output is deciding whether an angle is
 * already taken, and a missing row reads as "not taken".
 */
export function angleOf(html, file) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return comparisonText(h1[1]);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (title) return comparisonText(title[1]).replace(/\s+[|—-]\s+[^|—-]*$/, '');
  return file;
}

/** Is this a marketing surface rather than the tool itself? */
function isMarketingPage(name) {
  // A guide/explainer page is published HTML that is neither the entry point
  // nor a comparison page. Counted and printed, never budgeted: there is no
  // observed norm for them, and inventing one would be the kind of unmeasured
  // rule the header explains this file is trying not to add.
  return name.endsWith('.html') && name !== 'index.html';
}

/** Every marketing surface each venture publishes, keyed by slug. */
export async function surfacesByVenture(venturesDir = path.join(REPO_ROOT, 'ventures')) {
  const out = new Map();
  for (const { slug, sourceDir } of await discoverSurfaces(venturesDir)) {
    const names = (await fs.readdir(sourceDir)).filter(isMarketingPage).sort();
    const pages = [];
    for (const name of names) {
      const html = await fs.readFile(path.join(sourceDir, name), 'utf8');
      const comparison = COMPARISON_FILE_PATTERN.test(name);
      pages.push({
        file: name,
        comparison,
        generic: comparison && isGenericComparison(slug, name),
        angle: angleOf(html, name),
      });
    }
    out.set(slug, pages);
  }
  return out;
}

/** Ventures carrying more generic-method pages than {@link budgetFor} allows. */
export function overBudget(bySlug) {
  const over = [];
  for (const [slug, pages] of bySlug) {
    const generic = pages.filter((p) => p.generic);
    const allowed = budgetFor(slug);
    if (generic.length > allowed) over.push({ slug, generic, allowed });
  }
  return over.sort((a, b) => b.generic.length - a.generic.length || a.slug.localeCompare(b.slug));
}

function kindOf(page) {
  if (!page.comparison) return 'guide  ';
  return page.generic ? 'vs/gen ' : 'vs/name';
}

function printVenture(slug, pages) {
  const generic = pages.filter((p) => p.generic);
  const named = pages.filter((p) => p.comparison && !p.generic);
  const guides = pages.filter((p) => !p.comparison);
  console.log(
    `\n${slug} — ${generic.length} generic-method, ${named.length} named-product, ${guides.length} guide`,
  );
  console.log(
    `  budget: ${budgetFor(slug)} generic-method page(s)${GENERIC_BUDGET_OVERRIDES[slug] ? ' (override)' : ''}`,
  );
  for (const p of pages) {
    console.log(`  ${kindOf(p)}  ${p.file}`);
    console.log(`            ${p.angle}`);
  }
  if (!pages.length) console.log('  (no marketing surface yet)');
}

async function main(argv) {
  const bySlug = await surfacesByVenture();

  const forIndex = argv.indexOf('--for');
  if (forIndex !== -1) {
    const slug = argv[forIndex + 1];
    if (!slug) {
      console.error('--for needs a venture slug');
      return 2;
    }
    if (!bySlug.has(slug)) {
      console.error(`no venture with a published entry point: ${slug}`);
      return 2;
    }
    const pages = bySlug.get(slug);
    printVenture(slug, pages);
    const count = pages.filter((p) => p.generic).length;
    const allowed = budgetFor(slug);
    console.log(
      count >= allowed
        ? `\n  At or over the generic-method budget. A page comparing against another\n` +
            `  named product is still fine; another "vs. doing it yourself" page needs a\n` +
            `  reason in GENERIC_BUDGET_OVERRIDES, in the same commit.`
        : `\n  Room for ${allowed - count} more generic-method page(s). Read the angles above first --\n` +
            `  a page whose angle is already covered competes with its own sibling.`,
    );
    return 0;
  }

  const over = overBudget(bySlug);

  if (argv.includes('--check')) {
    if (!over.length) {
      const totals = new Map();
      for (const pages of bySlug.values()) {
        const n = pages.filter((p) => p.generic).length;
        totals.set(n, (totals.get(n) ?? 0) + 1);
      }
      const shape = [...totals]
        .sort((a, b) => a[0] - b[0])
        .map(([n, count]) => `${count} with ${n}`)
        .join(', ');
      console.log('surface-budget: no venture is over its generic-method comparison budget.');
      console.log(`  generic-method pages per venture: ${shape}`);
      return 0;
    }
    console.error('surface-budget: venture(s) over the generic-method comparison budget:\n');
    for (const { slug, generic, allowed } of over) {
      console.error(`  ${slug}: ${generic.length} generic-method pages, budget ${allowed}`);
      for (const g of generic) console.error(`      ${g.file} — ${g.angle}`);
    }
    console.error(
      `\n  Each page may be good on its own. What this asks is whether one venture\n` +
        `  needs two pages making the same "you could do this yourself" argument to\n` +
        `  the same reader. A comparison against a named product is not affected.\n\n` +
        `  If the extra page is deliberate, add a row to GENERIC_BUDGET_OVERRIDES in\n` +
        `  platform/pages/surface-budget.mjs with the reason, in the same commit.\n` +
        `  Otherwise fold it into the sibling that already covers the angle.`,
    );
    return 1;
  }

  for (const [slug, pages] of bySlug) if (pages.length) printVenture(slug, pages);
  if (over.length) console.log(`\n${over.length} venture(s) over budget — run with --check for the exit code.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
