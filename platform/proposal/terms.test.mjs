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
 * Ventures whose page wires the shared bid spec — the family this covers.
 *
 * The other share implementations on this site (the hand-written `SHARE_FIELDS`
 * allowlists) are a separate mechanism with the same defect still open; they
 * are not silently counted as passing here.
 */
async function specShareVentures() {
  const entries = await readdir(VENTURES, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    let page;
    let share;
    try {
      page = await readFile(new URL(`${entry.name}/index.html`, VENTURES), 'utf8');
      share = await readFile(new URL(`${entry.name}/share.mjs`, VENTURES), 'utf8');
    } catch {
      continue;
    }
    if (!share.includes('export function withProposalTerms')) continue;
    found.push({ slug: entry.name, page, share });
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
  for (const { slug, share } of ventures) {
    const named = [
      ...declaredIds(share, 'PROPOSAL_TERM_NUMBERS'),
      ...declaredIds(share, 'PROPOSAL_TERM_TEXT'),
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
  for (const { slug, page } of ventures) {
    if (!page.includes('id="depositPercent"')) continue;
    const missing = [];
    if (!/encodeBid\(withProposalTerms\(BID_SPEC\)/.test(page)) missing.push('link');
    if (!/saveBid\(localStorage, withProposalTerms\(BID_SPEC\)/.test(page)) missing.push('save');
    if (!/restoreBid\(withProposalTerms\(BID_SPEC\)/.test(page)) missing.push('restore');
    // The values handed to the encoder have to be the ones read off the panel,
    // or the spec names fields the page never collected and the link carries
    // the terms as blank.
    if (!page.includes('readProposalTerms(')) missing.push('read');
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
