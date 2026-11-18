// `overlongTerms` tells the sender which proposal term "stayed behind" a bid
// link. It must measure the same text the encoder carries, or the note lies.
//
// Found by the red team on 2026-11-17: the encoder (`usableText`) strips the
// control characters no proposal should render *before* checking the 512
// ceiling, but `overlongTerms` checked the raw string. A payment-terms clause
// pasted with a few form feeds or vertical tabs (Word and PDF copies carry
// them) at 510 printable characters rode in the link, yet the page told the
// sender it had been left out and to send it separately.
//
// The rule lives in 109 vendored files: every `proposal-terms.mjs` (a copy of
// `terms.mjs`, held identical by `sync.test.mjs`) and the 48 `share.mjs`
// copies of the shared bid spec, which have no canonical file to sync against.
// So this test reads them all, the class rather than the instance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const VENTURES = new URL('../../ventures/', import.meta.url);
const FILES = ['proposal-terms.mjs', 'share.mjs'];

async function copies() {
  const found = [new URL('./terms.mjs', import.meta.url)];
  for (const entry of await readdir(VENTURES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of FILES) {
      const url = new URL(`${entry.name}/${name}`, VENTURES);
      let source;
      try {
        source = await readFile(url, 'utf8');
      } catch {
        continue;
      }
      if (/export function overlongTerms\b/.test(source)) found.push(url);
    }
  }
  return found;
}

test('every overlongTerms measures the text its encoder carries', async () => {
  const urls = await copies();
  assert.ok(urls.length > 100, `expected the ~109 vendored copies, found ${urls.length}`);
  const fits = 'x'.repeat(510) + '\u000C\u000B\u0007'.repeat(3);
  const tooLong = 'x'.repeat(513);
  const wrong = [];
  for (const url of urls) {
    const mod = await import(url);
    const max = mod.MAX_TERM_TEXT ?? 512;
    assert.equal(max, 512, url.pathname);
    if (mod.overlongTerms({ paymentTerms: fits }).length !== 0) wrong.push(`${url.pathname}: flags text that travels`);
    if (mod.overlongTerms({ paymentTerms: tooLong }).length !== 1) wrong.push(`${url.pathname}: misses text that does not`);
  }
  assert.deepEqual(wrong, []);
});

// The same 108 copies wrote "your payment terms is too long ... send it": a
// plural label with a singular verb, on every calculator with a proposal.
test('the stayed-behind note agrees in number with the term it names', async () => {
  const long = 'x'.repeat(513);
  const wrong = [];
  for (const url of await copies()) {
    const mod = await import(url);
    if (typeof mod.overlongTermsNote !== 'function') continue;
    const cases = [
      [{ paymentTerms: long }, /^your payment terms are too long .* send them /],
      [{ proposalNotes: long }, /^your notes are too long .* send them /],
      [{ proposalExclusions: long }, /^your not-included list is too long .* send it /],
    ];
    for (const [values, want] of cases) {
      const got = mod.overlongTermsNote(values);
      if (!want.test(got)) wrong.push(`${url.pathname}: ${got}`);
    }
  }
  assert.deepEqual(wrong, []);
});
