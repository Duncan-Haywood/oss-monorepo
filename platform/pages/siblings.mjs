#!/usr/bin/env node
/**
 * Crawlable-orphan report: which tools no *other tool* links to.
 *
 * ## What this measures, and why it is not something `check.mjs` already does
 *
 * `check.mjs` proves every page is reachable: the hub links each tool, the
 * category pages group them, `sitemap.xml` lists them, and a page with no
 * inbound href at all is a build defect it fails on. All of that is about the
 * *site's own* chrome — the hub, the category index, the comparison and guide
 * indexes.
 *
 * This asks a narrower question the chrome cannot answer: **does any sibling
 * tool link to this one?** The related-tool strip rotates alphabetically
 * within a subcategory, so on a large subcategory a given pair may never
 * appear on each other's page. A crawler — or a reader — arriving on the
 * irrigation *install* calculator from a search result then has no one-hop
 * route to the irrigation *winterization* calculator, which is the single most
 * relevant other page in the catalogue for them. The route exists, but it runs
 * back up through the category index, and both crawl budget and human patience
 * are spent on that hop.
 *
 * Ten commits between 2026-09-02 and 2026-09-07 close exactly one such pair
 * each ("close crawlable orphan between install and winterization", "between
 * deadline and reporting", "between watch and evidence", …). Every one of them
 * was found by a session noticing the pair, which is the failure mode CLAUDE.md
 * names repeatedly and in its own words: *"a guard going unrun is not usually
 * discovered by a session noticing it is missing — nobody notices an absence."*
 * The fix it prescribes each time is the same, and it is what this file is:
 * enumerate the ground instead of recalling it. The command is faster than the
 * recollection and it cannot be honestly wrong.
 *
 * ## Import, don't restate
 *
 * Category and subcategory membership, the venture-tree walk and the entry-file
 * candidates all come from `build.mjs` by import. This repository has twice
 * paid for a copied rule going stale rather than being imported (CLAUDE.md,
 * "168 became 169"), and a second copy of `CATEGORY_RULES` here would go wrong
 * silently the first time a slug prefix moved.
 *
 * ## Usage
 *
 *     node platform/pages/siblings.mjs            # the worklist
 *     node platform/pages/siblings.mjs --check    # fail if orphans increased
 *     node platform/pages/siblings.mjs --json     # machine-readable
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {
  REPO_ROOT,
  categoryFor,
  discoverSurfaces,
  readMeta,
  subcategoryFor,
} from './build.mjs';

/**
 * Committed orphan budget. `--check` fails when the measured count exceeds it,
 * so a new tool that lands with no sibling link turns a run red instead of
 * waiting to be noticed; it never fails for the orphans that already exist.
 *
 * Lower it in the same commit that closes a pair — that is what makes the
 * number a ratchet rather than a second thing to remember. It is deliberately
 * a floor on a *count* and not a pinned list of slugs: a list would have to be
 * edited by every session that renames a venture, and the friction is what
 * makes a guard get skipped.
 */
// SIBLINGS_BUDGET_FILE lets a test point --check at a fixture budget.
export const ORPHAN_BUDGET_FILE =
  process.env.SIBLINGS_BUDGET_FILE ?? path.join(REPO_ROOT, 'platform', 'pages', 'siblings-budget.json');

/**
 * One-hop links out of a tool's entry page into *another tool's* entry page.
 *
 * Only `../<slug>/` forms count — a link to a sibling's sub-page
 * (`../foo/vs-jobber.html`) is a link to that comparison page, not to the tool,
 * and a crawler landing there still has to walk up. `index.html` is accepted
 * because a handful of pages spell the same destination that way.
 *
 * Anchors, queries and trailing whitespace inside the attribute are tolerated
 * so a link written `../foo/#inputs` still counts: it reaches the tool.
 */
export function outboundToolLinks(html) {
  const out = new Set();
  const pattern = /href\s*=\s*"\.\.\/([a-z0-9][a-z0-9-]*)\/(?:index\.html)?(?:[#?][^"]*)?"/gi;
  for (const [, slug] of html.matchAll(pattern)) out.add(slug.toLowerCase());
  return out;
}

/** Slug words, for ranking how closely two tools are related. */
const tokens = (slug) => new Set(slug.split('-').filter(Boolean));

/**
 * How closely two slugs are related, as the count of shared words minus a
 * penalty for the generic tail nearly every venture carries.
 *
 * `bid`, `calculator`, `cost`, `price`, `quote`, `estimator` and `tool` appear
 * in most of the catalogue, so counting them makes every trades tool look
 * equally close to every other one and the suggestion becomes noise. Dropping
 * them leaves the words that actually name the job — `irrigation`, `install`,
 * `winterization` — which is the axis a reader is moving along when they need
 * the sibling.
 */
const GENERIC = new Set([
  'bid', 'calculator', 'cost', 'price', 'pricing', 'quote', 'estimator',
  'tool', 'check', 'checker', 'compare', 'comparison', 'margin', 'fee',
]);

export function relatedness(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  let score = 0;
  for (const word of left) {
    if (!right.has(word)) continue;
    score += GENERIC.has(word) ? 0 : 1;
  }
  return score;
}

/**
 * Every tool, with the tools that link to it and the tools it links to.
 *
 * Reads the venture tree rather than a built artifact on purpose: the point is
 * to hand a session a worklist it can act on with the sources in front of it,
 * and a build takes 23 seconds it does not need to spend to answer this.
 */
export async function surveyTools(venturesDir = path.join(REPO_ROOT, 'ventures')) {
  const surfaces = await discoverSurfaces(venturesDir);
  const known = new Set(surfaces.map((s) => s.slug));
  const tools = new Map();

  for (const surface of surfaces) {
    const html = await fs.readFile(surface.entryFile, 'utf8');
    // Only links to slugs that actually shipped count. A href into a venture
    // with no entry page is a dead link, which is `check.mjs`'s job to fail on
    // and would otherwise read here as a closed orphan that is not closed.
    const outbound = new Set([...outboundToolLinks(html)].filter((s) => known.has(s) && s !== surface.slug));
    tools.set(surface.slug, {
      slug: surface.slug,
      title: readMeta(html, surface.slug).title,
      category: categoryFor(surface.slug),
      subcategory: subcategoryFor(surface.slug),
      outbound,
      inbound: new Set(),
    });
  }

  for (const tool of tools.values()) {
    for (const target of tool.outbound) tools.get(target)?.inbound.add(tool.slug);
  }

  return tools;
}

/**
 * The tools no other tool links to, each with its nearest un-linked sibling.
 *
 * "Nearest" is: same category, then same subcategory, then most shared
 * non-generic slug words, then alphabetical so the output is stable between
 * runs and a diff of two reports is readable. A suggestion is only that — the
 * pairs a session closes are a judgement about whether a reader moving between
 * the two is a real journey, and the score cannot make that call.
 */
export function findOrphans(tools) {
  const all = [...tools.values()];
  return all
    .filter((tool) => tool.inbound.size === 0)
    .map((tool) => {
      const candidates = all
        .filter((other) => other.slug !== tool.slug)
        .map((other) => ({
          tool: other,
          sameCategory: other.category?.id === tool.category?.id,
          sameSubcategory:
            tool.subcategory != null && other.subcategory?.id === tool.subcategory?.id,
          score: relatedness(tool.slug, other.slug),
        }))
        .filter((c) => c.sameCategory)
        .sort(
          (a, b) =>
            Number(b.sameSubcategory) - Number(a.sameSubcategory) ||
            b.score - a.score ||
            a.tool.slug.localeCompare(b.tool.slug),
        );
      return { ...tool, nearest: candidates[0] ?? null };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

async function readBudget() {
  try {
    const raw = JSON.parse(await fs.readFile(ORPHAN_BUDGET_FILE, 'utf8'));
    return Number(raw.orphanBudget);
  } catch {
    return null;
  }
}

async function main(argv) {
  const wantsJson = argv.includes('--json');
  const wantsCheck = argv.includes('--check');

  const tools = await surveyTools();
  const orphans = findOrphans(tools);

  if (wantsJson) {
    console.log(
      JSON.stringify(
        {
          tools: tools.size,
          orphans: orphans.map((o) => ({
            slug: o.slug,
            category: o.category?.id ?? null,
            subcategory: o.subcategory?.id ?? null,
            nearest: o.nearest?.tool.slug ?? null,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Crawlable orphans — tools no other tool links to in one hop\n`);
    console.log(`  ${orphans.length} of ${tools.size} tools have no inbound link from a sibling.\n`);
    for (const orphan of orphans) {
      const near = orphan.nearest;
      const where = orphan.subcategory?.title ?? orphan.category?.title ?? 'uncategorised';
      console.log(`  ${orphan.slug}`);
      console.log(`      in ${where}`);
      if (near) {
        console.log(
          `      nearest sibling: ${near.tool.slug}` +
            `${near.sameSubcategory ? ' (same subcategory)' : ''}`,
        );
      } else {
        console.log('      nearest sibling: none in this category');
      }
    }
    if (orphans.length) {
      console.log(
        `\n  To close one: add a sentence to each page's footer linking the other,` +
          `\n  and a test in each venture's page.test.mjs asserting the href — see` +
          `\n  ventures/irrigation-install-bid-calculator/page.test.mjs for the shape.` +
          `\n  Then lower orphanBudget in platform/pages/siblings-budget.json.`,
      );
    }
  }

  if (wantsCheck) {
    const budget = await readBudget();
    if (budget === null) {
      console.error(`\nNo budget committed at ${ORPHAN_BUDGET_FILE}; cannot check.`);
      return 1;
    }
    if (orphans.length > budget) {
      console.error(
        `\nFAIL: ${orphans.length} crawlable orphans, budget is ${budget}.` +
          `\nA tool shipped with no sibling linking it. Close a pair, or raise the` +
          `\nbudget deliberately and say in the pull request why.`,
      );
      return 1;
    }
    console.log(`\nok: ${orphans.length} orphan(s), within the committed budget of ${budget}.`);
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
