// The proposal terms are named in two places. This is what stops them from
// becoming two different lists.
//
// The panel `adopt.mjs` generates carries `TERM_IDS` — the deposit, how long
// the price is held, and the three blocks of prose a contractor writes once and
// reuses. The share module vendored beside it carries `PROPOSAL_TERM_NUMBERS`
// and `PROPOSAL_TERM_TEXT`, which is what decides whether those fields ride in
// a link and in the setter's own saved bid.
//
// They were not one list on 2026-08-29, and it cost exactly what this
// repository's share bugs always cost. A setter priced a job at a 50% deposit
// held for 15 days, copied the link, and the recipient's page opened the bid
// under the venture's defaults — 30% and 30 days — beneath a headline figure
// that matched the sender's to the cent. Two people reading one price and
// different money on acceptance, with nothing anywhere saying so. 48 tools were
// in that state; `platform/pages/roundtrip.mjs` found them by driving a
// browser, which is the expensive way to learn that two lists have drifted.
//
// So: add a term to the panel, add it to the share module, or this fails.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const HERE = new URL('./', import.meta.url);
const VENTURES = new URL('../../ventures/', import.meta.url);

/** The ids the generated proposal panel treats as the contractor's terms. */
async function adoptTermIds() {
  const source = await readFile(new URL('adopt.mjs', HERE), 'utf8');
  const match = source.match(/const TERM_IDS = \[([^\]]*)\]/);
  assert.ok(match, 'adopt.mjs no longer declares TERM_IDS; this test needs rewriting, not deleting');
  return match[1].split(',').map((part) => part.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

/**
 * Every venture that carries the terms, by whichever of the two mechanisms.
 *
 * `share.mjs` with `withProposalTerms` is the shared bid spec (36 tools).
 * `proposal-terms.mjs` is the module vendored into the 12 that predate it, each
 * keeping a hand-written allowlist. Both declare the ids, and this keeps the
 * declarations one list.
 */
async function specShareVentures() {
  const entries = await readdir(VENTURES, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let page;
    let share = '';
    let terms = '';
    try {
      page = await readFile(new URL(`${entry.name}/index.html`, VENTURES), 'utf8');
    } catch {
      continue;
    }
    try {
      share = await readFile(new URL(`${entry.name}/share.mjs`, VENTURES), 'utf8');
    } catch { /* a venture may carry the terms module and no shared spec */ }
    try {
      terms = await readFile(new URL(`${entry.name}/proposal-terms.mjs`, VENTURES), 'utf8');
    } catch { /* and the reverse */ }
    const spec = share.includes('export function withProposalTerms');
    if (!spec && !terms) continue;
    found.push({ slug: entry.name, page, spec, source: spec ? share : terms });
  }
  return found;
}

/**
 * Ventures on a third, older mechanism: a hand-kept field list in `share.mjs`
 * (`SHARE_FIELDS`, or a `NUMBER_FIELD_IDS`/`TEXT_FIELD_IDS`/`BOOLEAN_FIELD_IDS`
 * split) with no `withProposalTerms` and no vendored `proposal-terms.mjs`.
 * `specShareVentures` above does not see these at all, which is exactly how
 * `deck-staining-bid-calculator`, `gutter-cleaning-bid-calculator`,
 * `snow-removal-bid-calculator`, `hardwood-refinishing-bid-calculator` and
 * `translator-project-quote` shipped a proposal panel whose deposit and terms
 * silently did not survive a shared link or a saved draft — the panel was
 * retrofitted onto the page by `adopt.mjs`, and nothing updated this older,
 * per-venture allowlist to match. `platform/pages/roundtrip.mjs` found the
 * five above by driving a browser; this checks the same gap from source, on
 * every venture that carries it, so a sixth cannot ship the same way.
 */
async function flatShareVentures() {
  const spec = await specShareVentures();
  const specSlugs = new Set(spec.map(({ slug }) => slug));
  const entries = await readdir(VENTURES, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || specSlugs.has(entry.name)) continue;
    let page;
    let share;
    try {
      page = await readFile(new URL(`${entry.name}/index.html`, VENTURES), 'utf8');
      share = await readFile(new URL(`${entry.name}/share.mjs`, VENTURES), 'utf8');
    } catch {
      continue;
    }
    if (!page.includes('id="depositPercent"')) continue;
    found.push({ slug: entry.name, share });
  }
  return found;
}

function declaredIds(share, name) {
  const match = share.match(new RegExp(`export const ${name} = Object\\.freeze\\(\\[([^\\]]*)\\]`));
  assert.ok(match, `${name} is not declared as a frozen array literal`);
  return match[1].split(',').map((part) => part.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

test('every share module names exactly the terms the proposal panel offers', async () => {
  const expected = [...await adoptTermIds()].sort();
  const ventures = await specShareVentures();
  assert.ok(ventures.length > 0, 'no venture uses the shared bid spec; this test has lost its subject');

  const drifted = [];
  for (const { slug, source } of ventures) {
    const named = [
      ...declaredIds(source, 'PROPOSAL_TERM_NUMBERS'),
      ...declaredIds(source, 'PROPOSAL_TERM_TEXT'),
    ].sort();
    if (named.join(',') !== expected.join(',')) drifted.push(`${slug} (${named.join(', ')})`);
  }
  assert.deepEqual(drifted, [],
    `these share modules name different terms than adopt.mjs does: ${drifted.join('; ')}`
    + `\nadopt.mjs offers: ${expected.join(', ')}`);
});

test('a page with the proposal panel carries its terms in the link and the save', async () => {
  const ventures = await specShareVentures();
  const unwired = [];
  for (const { slug, page, spec } of ventures) {
    if (!page.includes('id="depositPercent"')) continue;
    const missing = [];
    if (spec) {
      if (!/encodeBid\(withProposalTerms\(BID_SPEC\)/.test(page)) missing.push('link');
      if (!/saveBid\(localStorage, withProposalTerms\(BID_SPEC\)/.test(page)) missing.push('save');
      if (!/restoreBid\(withProposalTerms\(BID_SPEC\)/.test(page)) missing.push('restore');
      // The values handed to the encoder have to be the ones read off the panel,
      // or the spec names fields the page never collected and the link carries
      // the terms as blank.
      if (!page.includes('readProposalTerms(')) missing.push('read');
    } else {
      // The vendored module: the terms are appended to whatever this venture's
      // own encoder wrote, and split back off before its decoder sees the hash.
      if (!/withTerms\(/.test(page)) missing.push('link');
      if (!/splitTerms\(/.test(page)) missing.push('split');
      if (!/applyTerms\(/.test(page)) missing.push('restore');
      if (!/readTerms\(/.test(page)) missing.push('read');
    }
    if (missing.length > 0) unwired.push(`${slug} (${missing.join(', ')})`);
  }
  assert.deepEqual(unwired, [],
    'these pages show the contractor a deposit and terms that their own bid link drops: '
    + unwired.join('; '));
});

test('a term that would be dropped is named to the sender, not left silent', async () => {
  const ventures = await specShareVentures();
  const silent = ventures
    .filter(({ page }) => page.includes('id="depositPercent"'))
    .filter(({ page }) => !page.includes('overlongTermsNote('))
    .map(({ slug }) => slug);
  assert.deepEqual(silent, [],
    'these pages copy a link without saying which term stayed behind: ' + silent.join(', '));
});

test('a venture on the older hand-kept field list still names all five terms', async () => {
  const expected = await adoptTermIds();
  const ventures = await flatShareVentures();
  assert.ok(ventures.length > 0, 'no venture uses the older hand-kept field list; this test has lost its subject');

  const drifted = [];
  for (const { slug, share } of ventures) {
    const missing = expected.filter((id) => !share.includes(`'${id}'`));
    if (missing.length > 0) drifted.push(`${slug} (missing ${missing.join(', ')})`);
  }
  assert.deepEqual(drifted, [],
    'these share modules offer the proposal panel but drop its terms from the link and saved '
    + `draft: ${drifted.join('; ')}`);
});
