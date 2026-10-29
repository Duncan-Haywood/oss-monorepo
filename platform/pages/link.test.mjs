import { test } from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';

import {
  BID_LINK_CLAUSE,
  BID_LINK_HELPERS,
  BID_LINK_MODULE_FILE,
  BID_LINK_PREFIX,
  MAX_LINK_FIELDS,
  MAX_LINK_VALUE,
  addBidLinkClause,
  bidAmountAgrees,
  decodeBidLink,
  encodeBidLink,
  injectBidLink,
  isLinkableId,
  linkFieldMismatch,
  pageBuildsFieldsAtRuntime,
  pageHasOwnShareLink,
  pageTakesBidLink,
  renderBidLinkModule,
} from './link.mjs';
import { injectSavedBids, pageRepeatPrefixes } from './jobs.mjs';

// A page shaped like the ones this runs on: a form with enough fields to count
// as a bid, a hero number, and a feature list to append the claim to.
const page = (extra = '', fields = ['lengthFt', 'widthFt', 'hourlyWage']) => `<!doctype html>
<html><head>
<script type="application/ld+json">{"featureList":"Takeoff by size, loaded wage"}</script>
</head><body>
<main>
  <p class="hero-number" id="bidPrice">$1,800</p>
  ${fields.map((id) => `<input type="number" id="${id}" value="1">`).join('\n  ')}
  ${extra}
</main>
</body></html>`;

/** The page as the build actually presents it: saved-bids band already added. */
const built = (extra = '', fields = undefined) =>
  injectSavedBids(page(extra, fields), 'deck-bid-calculator', './');

// ---------------------------------------------------------------------------
// The round trip
// ---------------------------------------------------------------------------

test('a link carries every field it was given, and the figure', () => {
  const fragment = encodeBidLink({
    fields: { lengthFt: '14', widthFt: '20', tearOff: true },
    amount: '$1,800',
  });
  assert.ok(fragment.startsWith(BID_LINK_PREFIX));
  assert.deepEqual(decodeBidLink('#' + fragment), {
    fields: { lengthFt: '14', widthFt: '20', tearOff: true },
    amount: '$1,800',
  });
});

test('a link with no figure decodes without one rather than inventing it', () => {
  const fragment = encodeBidLink({ fields: { lengthFt: '14' } });
  assert.deepEqual(decodeBidLink(fragment), { fields: { lengthFt: '14' } });
});

test('an unparseable figure is dropped rather than carried as text', () => {
  // `normalizeHeadlineAmount` refuses anything without a currency mark, which
  // is what keeps "—" out of a sentence that reads "the sender saw ...".
  const fragment = encodeBidLink({ fields: { lengthFt: '14' }, amount: 'pending' });
  assert.equal(decodeBidLink(fragment).amount, undefined);
});

test('a form with nothing in it makes no link at all', () => {
  assert.equal(encodeBidLink({ fields: {} }), '');
  assert.equal(encodeBidLink({}), '');
  assert.equal(encodeBidLink(null), '');
});

// ---------------------------------------------------------------------------
// The fragment is the one part of these pages a stranger writes
// ---------------------------------------------------------------------------

test('a fragment that is not one of ours is not read as one', () => {
  assert.equal(decodeBidLink('#pf-jobs'), null);
  assert.equal(decodeBidLink('#'), null);
  assert.equal(decodeBidLink(''), null);
  assert.equal(decodeBidLink(null), null);
  // The per-venture `share.mjs` spelling: raw encoded JSON straight after the
  // `#`. It must not be mistaken for this format, or a page carrying both
  // would apply the wrong one.
  assert.equal(decodeBidLink('#' + encodeURIComponent('{"sections":[]}')), null);
});

test('a corrupt or truncated payload yields nothing, never a partial bid', () => {
  assert.equal(decodeBidLink('#' + BID_LINK_PREFIX + 'not-json'), null);
  assert.equal(decodeBidLink('#' + BID_LINK_PREFIX + encodeURIComponent('{"v":1')), null);
  assert.equal(decodeBidLink('#' + BID_LINK_PREFIX + encodeURIComponent('[1,2,3]')), null);
});

test('a version this build does not know is refused, not guessed at', () => {
  const payload = encodeURIComponent(JSON.stringify({ v: 2, f: { lengthFt: '14' } }));
  assert.equal(decodeBidLink('#' + BID_LINK_PREFIX + payload), null);
});

test('a link cannot set the usage opt-out or reach this feature own controls', () => {
  const payload = encodeURIComponent(JSON.stringify({
    v: 1,
    f: { lengthFt: '14', usageOptOut: true, 'pf-jobs-name': 'x', 'pf-link-copy': 'y' },
  }));
  const decoded = decodeBidLink('#' + BID_LINK_PREFIX + payload);
  assert.deepEqual(decoded, { fields: { lengthFt: '14' } });
});

test('a value of the wrong type is dropped rather than stringified', () => {
  const payload = encodeURIComponent(JSON.stringify({
    v: 1,
    f: { lengthFt: '14', widthFt: { toString: 'x' }, depth: 12, tearOff: null },
  }));
  assert.deepEqual(decodeBidLink('#' + BID_LINK_PREFIX + payload), {
    fields: { lengthFt: '14' },
  });
});

test('an oversized value is dropped, so a crafted hash cannot balloon a field', () => {
  const payload = encodeURIComponent(JSON.stringify({
    v: 1,
    f: { lengthFt: '14', note: 'x'.repeat(MAX_LINK_VALUE + 1) },
  }));
  assert.deepEqual(decodeBidLink('#' + BID_LINK_PREFIX + payload), {
    fields: { lengthFt: '14' },
  });
});

test('the field count is capped in both directions', () => {
  const many = {};
  for (let i = 0; i < MAX_LINK_FIELDS + 40; i++) many['f' + i] = String(i);
  assert.equal(Object.keys(decodeBidLink(encodeBidLink({ fields: many })).fields).length,
    MAX_LINK_FIELDS);
});

test('the field cap is a form\'s worth, pinned so a bump is deliberate', () => {
  assert.equal(MAX_LINK_FIELDS, 120);
});

test('a payload whose every field is rejected yields nothing at all', () => {
  const payload = encodeURIComponent(JSON.stringify({ v: 1, f: { usageOptOut: true } }));
  assert.equal(decodeBidLink('#' + BID_LINK_PREFIX + payload), null);
});

test('isLinkableId refuses this build own ids and the standing preference', () => {
  assert.equal(isLinkableId('lengthFt'), true);
  assert.equal(isLinkableId('pf-jobs-name'), false);
  assert.equal(isLinkableId('usageOptOut'), false);
  assert.equal(isLinkableId(''), false);
  assert.equal(isLinkableId(null), false);
});

/**
 * The proposal header's customer name and home address, and the contractor's
 * own business identity fields, must never ride in a "Copy link to this bid"
 * URL: that link is built to be pasted into email or text to the customer
 * (or forwarded on from there), and neither of these is a number the tool
 * priced.
 */
test('the proposal header is never linkable, even though the job it prices still is', () => {
  for (const id of [
    'clientName', 'clientAddress', 'companyName', 'companyAddress',
    'companyPhone', 'companyEmail', 'companyLicense',
  ]) {
    assert.equal(isLinkableId(id), false, id);
  }

  const fragment = encodeBidLink({
    fields: {
      clientName: 'Mrs Reid', clientAddress: '14 Oak St',
      companyName: 'Acme Roofing', companyAddress: '2 Main St',
      companyPhone: '555-0100', companyEmail: 'a@example.com', companyLicense: 'RC-1',
      lengthFt: '40', pitch: '6/12',
    },
    amount: '$1,800.00',
  });
  const decoded = decodeBidLink('#' + fragment);
  assert.deepEqual(decoded.fields, { lengthFt: '40', pitch: '6/12' });
  assert.equal(decoded.amount, '$1,800.00');
});

// ---------------------------------------------------------------------------
// Atomic or refused
// ---------------------------------------------------------------------------

test('a link whose fields are exactly the form fields is a clean apply', () => {
  const { missing, extra } = linkFieldMismatch(['a', 'b'], ['a', 'b']);
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, []);
});

test('a form missing one of the link fields is a refusal, not a partial write', () => {
  // The recorded defect this feature exists to prevent: writing the overlap
  // leaves a form pricing a real, plausible, smaller job than the sender sent.
  const { missing, extra } = linkFieldMismatch(['a', 'b', 'c'], ['a', 'b']);
  assert.deepEqual(missing, ['c']);
  assert.deepEqual(extra, []);
});

test('a form carrying rows the link never priced is equally a refusal', () => {
  const { missing, extra } = linkFieldMismatch(['a'], ['a', 'b']);
  assert.deepEqual(missing, []);
  assert.deepEqual(extra, ['b']);
});

// ---------------------------------------------------------------------------
// The check that makes a link worth sending
// ---------------------------------------------------------------------------

test('two figures that render the same agree', () => {
  assert.equal(bidAmountAgrees('$1,800', '$1,800'), true);
  assert.equal(bidAmountAgrees('$1,800', ' $1,800 '), true);
});

test('a near miss is a disagreement, not a rounding tolerance', () => {
  // Going through parseFloat would call these equal on every page that renders
  // a thousands separator. That is the near miss the check exists to catch.
  assert.equal(bidAmountAgrees('$1,800', '$1,800.40'), false);
  assert.equal(bidAmountAgrees('$1,800', '$1,801'), false);
});

test('an unknown figure on either side is not reported as a disagreement', () => {
  assert.equal(bidAmountAgrees('', '$1,800'), null);
  assert.equal(bidAmountAgrees('$1,800', ''), null);
  assert.equal(bidAmountAgrees('$1,800', '—'), null);
  assert.equal(bidAmountAgrees(undefined, undefined), null);
});

// ---------------------------------------------------------------------------
// Where the control is and is not offered
// ---------------------------------------------------------------------------

test('a page with its own share control is left alone', () => {
  assert.equal(pageHasOwnShareLink('<button id="copyShare">Copy share link</button>'), true);
  assert.equal(pageHasOwnShareLink("import { encodeShare } from './share.mjs';"), true);
  assert.equal(pageHasOwnShareLink('<button type="button" class="secondary" id="share">Copy a share link</button>'), true);
  assert.equal(pageHasOwnShareLink('<button>Save</button>'), false);
  assert.equal(pageTakesBidLink(page('<button type="button" id="copyShare">x</button>')), false);
});

test('a page that builds its fields in script is left alone', () => {
  // The itemised calculators: a recipient blank form has one row where the
  // sender had four, so the sets can never match and the link would always
  // refuse. A dead button is worse than no button.
  assert.equal(pageBuildsFieldsAtRuntime('<input id="${prefix}-lengthFt">'), true);
  assert.equal(pageBuildsFieldsAtRuntime("html += `<input id='${p}-x'>`"), true);
  assert.equal(pageBuildsFieldsAtRuntime('<input id="lengthFt">'), false);
  // Not markup at all: nothing builds fields at runtime, so nothing is refused.
  assert.equal(pageBuildsFieldsAtRuntime(undefined), false);
  assert.equal(pageBuildsFieldsAtRuntime(null), false);
  assert.equal(pageTakesBidLink(page('<input id="${row}-lengthFt">')), false);
});

test('a page with too few fields to be a bid is left alone', () => {
  assert.equal(pageTakesBidLink(page('', ['onlyOne'])), false);
});

test('an ordinary calculator page takes the control', () => {
  assert.equal(pageTakesBidLink(page()), true);
});

// ---------------------------------------------------------------------------
// The injection
// ---------------------------------------------------------------------------

test('the button lands on the saved-bids control line, not in a band of its own', () => {
  const out = injectBidLink(built(), { slug: 'deck-bid-calculator', toRoot: './' });
  assert.match(out, /id="pf-link-copy"/);
  const line = out.match(/<p class="pf-jobs-line">[\s\S]*?<\/p>/)[0];
  assert.match(line, /id="pf-link-copy"/);
  // One bar, two controls, in the order they are used.
  assert.ok(line.indexOf('pf-jobs-toggle') < line.indexOf('pf-link-copy'));
});

test('the note sits outside the saved-bids band so it survives that band removal', () => {
  // `jobs.mjs` calls `root.remove()` on a page whose form turns out too short.
  // A refusal message nested inside it would vanish with it.
  const out = injectBidLink(built(), { slug: 'deck-bid-calculator', toRoot: './' });
  const band = out.match(/<section class="pf-jobs"[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(band, /id="pf-link-note"/);
  assert.match(out, /id="pf-link-note"/);
  assert.ok(out.indexOf('</section>') < out.indexOf('id="pf-link-note"'));
});

test('a page with no saved-bids line gets nothing rather than an orphaned button', () => {
  // Both features are gated the same way, so this branch is only reachable by a
  // future change to one gate and not the other. It should fail closed.
  const out = injectBidLink(page(), { slug: 'deck-bid-calculator', toRoot: './' });
  assert.equal(out, page());
});

test('a source that is not a string falls back to the page being written', () => {
  // `source` is optional; a caller passing null or nothing still gets the gate
  // answered from `html`, so an ordinary page keeps its button.
  const html = built();
  const out = injectBidLink(html, { slug: 'deck-bid-calculator', toRoot: './', source: null });
  assert.match(out, /id="pf-link-copy"/);
});

test('the pass is safe to run twice', () => {
  const once = injectBidLink(built(), { slug: 'deck', toRoot: './' });
  assert.equal(injectBidLink(once, { slug: 'deck', toRoot: './' }), once);
});

test('the gate reads the source page, not the document already written into', () => {
  // `source` is the venture markup; `html` is the copy carrying the band. A
  // page excluded on its own merits stays excluded even though the band the
  // build added would pass the gate on its own.
  const source = page('<button type="button" id="copyShare">Copy share link</button>');
  const html = injectSavedBids(source, 'deck', './');
  assert.equal(injectBidLink(html, { slug: 'deck', toRoot: './', source }), html);
});

test('the script tag carries the slug and the headline selector, escaped', () => {
  const out = injectBidLink(built(), {
    slug: 'deck-bid-calculator', toRoot: '../', amountSelector: '#bidPrice',
  });
  assert.match(out, /<script type="module" src="\.\.\/pf-link\.js"/);
  assert.match(out, /data-pf-link-slug="deck-bid-calculator"/);
  assert.match(out, /data-pf-link-amount="#bidPrice"/);
  const quoted = injectBidLink(built(), { slug: 'a"b', toRoot: './' });
  assert.match(quoted, /data-pf-link-slug="a&quot;b"/);
  assert.doesNotMatch(quoted, /data-pf-link-slug="a"b"/);
});

test('the script tag runs after the saved-bids one, which builds the line it needs', () => {
  const out = injectBidLink(built(), { slug: 'deck', toRoot: './' });
  assert.ok(out.indexOf('pf-jobs.js') < out.indexOf('pf-link.js'));
});

// ---------------------------------------------------------------------------
// The claim ships with the feature, never on its own
// ---------------------------------------------------------------------------

test('the feature list gains the clause when the control goes in', () => {
  const out = injectBidLink(built(), { slug: 'deck', toRoot: './' });
  assert.ok(out.includes(BID_LINK_CLAUSE));
  // Appended to what is already there — the saved-bids band declares itself on
  // the same list, and neither claim may displace the other or the venture's.
  assert.match(out, /"featureList":"Takeoff by size, loaded wage, [^"]*a link that hands/);
});

test('no control, no claim', () => {
  // The reverse-direction guard #1894 had to add as a separate test: a page
  // must never advertise a link it does not offer.
  const source = page('<button type="button" id="copyShare">Copy share link</button>');
  const out = injectBidLink(injectSavedBids(source, 'deck', './'),
    { slug: 'deck', toRoot: './', source });
  assert.ok(!out.includes(BID_LINK_CLAUSE));
});

test('a page with no feature list gets the control and no invented JSON-LD', () => {
  const bare = `<!doctype html><html><head></head><body><main>
    <input id="a" value="1"><input id="b" value="2"><input id="c" value="3">
  </main></body></html>`;
  const out = injectBidLink(injectSavedBids(bare, 'deck', './'), { slug: 'deck', toRoot: './' });
  assert.match(out, /id="pf-link-copy"/);
  assert.ok(!out.includes('featureList'));
});

test('the clause is added once', () => {
  const once = addBidLinkClause(page());
  assert.equal(addBidLinkClause(once), once);
});

// ---------------------------------------------------------------------------
// The copy the browser actually runs
// ---------------------------------------------------------------------------

test('the shipped module is syntactically whole', () => {
  // `stripForInjection` removes comment lines and indentation from the source
  // before it ships. This is what proves no line it dropped was load-bearing.
  const source = renderBidLinkModule();
  assert.doesNotThrow(() => new Function(source));
  assert.ok(source.length > 0);
});

test('the shipped module embeds the tested functions, not a paraphrase', () => {
  // The lesson `jobs.mjs` records: the hub carried a hand-copy of `normalizeBid`
  // that went stale, and every saved outcome was silently dropped. Nothing
  // failed; only the copy the browser ran was wrong.
  const source = renderBidLinkModule();
  for (const name of ['decodeBidLink', 'encodeBidLink', 'bidAmountAgrees',
    'normalizeHeadlineAmount', 'isLinkableId']) {
    assert.match(source, new RegExp(`var ${name} =`), `${name} is not in the shipped module`);
  }
});

test('the shipped module reads its tag by attribute, not document.currentScript', () => {
  // `document.currentScript` is null in a module script, and this one is a
  // module for the ordering it buys. Reading it there would silently lose the
  // headline selector and report every link as unverifiable.
  const source = renderBidLinkModule();
  assert.doesNotMatch(source, /currentScript/);
  assert.match(source, /querySelector\('script\[data-pf-link-amount\]'\)/);
});

test('the module filename is the one the build writes and precaches', () => {
  assert.equal(BID_LINK_MODULE_FILE, 'pf-link.js');
});

test('the shipped module runs against the round trip it will meet in a browser', () => {
  // Run the emitted helper declarations — the half of the module that is pure,
  // and the half a drifting hand-copy would put out of step — and check the
  // browser's copy answers exactly as this module's does. The IIFE below them
  // is not run here: it touches `document` on the first line, and what is under
  // test is the arithmetic, not the wiring.
  const probe = new Function(
    `${BID_LINK_HELPERS}\nreturn { decodeBidLink, encodeBidLink, bidAmountAgrees };`);
  const shipped = probe();
  const fragment = encodeBidLink({ fields: { lengthFt: '14', tearOff: true }, amount: '$1,800' });
  assert.deepEqual(shipped.decodeBidLink('#' + fragment), decodeBidLink('#' + fragment));
  assert.equal(shipped.encodeBidLink({ fields: { lengthFt: '14' } }),
    encodeBidLink({ fields: { lengthFt: '14' } }));
  assert.equal(shipped.bidAmountAgrees('$1,800', '$1,800.40'), false);
});

test('no bid link on the page whose form is the shop\u2019s cost structure', () => {
  // The link is the sharper half of the same problem: a button reading "Copy
  // link to this bid" on a form holding payroll, workers' comp and the owner's
  // salary invites a contractor to send their cost structure to the customer.
  // It falls away because it anchors on a saved-bids band that is no longer
  // drawn there; this asserts that dependency rather than trusting it.
  const form = ['hourlyWage', 'workersCompPercent', 'ownerAdminSalary', 'targetMargin']
    .map((id) => `<input id="${id}" type="number" value="1">`)
    .join('');
  const html = `<html><head></head><body><main>${form}</main></body></html>`;
  const banded = injectSavedBids(html, 'shop-rate-calculator');
  assert.equal(banded, html, 'precondition: no band');
  const linked = injectBidLink(banded, { slug: 'shop-rate-calculator', source: html });
  assert.equal(linked, html);
  assert.doesNotMatch(linked, /Copy link to this bid/);
});

// ---------------------------------------------------------------------------
// A value the cap turned away is named, not silently dropped
// ---------------------------------------------------------------------------
//
// The regression: `security-camera-bid-calculator` generates a proposal scope
// draft from the priced job that runs past MAX_LINK_VALUE, so the encoder set
// it aside — rightly, a fragment is not the place for prose. The decoder then
// found one control on the form the link did not mention, read that as a link
// written by a different tool, and refused the whole bid. Every link the page
// itself wrote was refused, on the one tool whose scope text is long enough.
// Driven in Chromium: 33 of 43 fields stayed at their defaults and the headline
// read $7,440 against the sender's $2,768, under a note telling the recipient to
// ask the sender what tool they had used.

test('an over-long value is named in the payload rather than vanishing', () => {
  const scope = 'x'.repeat(MAX_LINK_VALUE + 1);
  const decoded = decodeBidLink('#' + encodeBidLink({ fields: { lengthFt: '14', proposalScope: scope } }));
  assert.deepEqual(decoded.fields, { lengthFt: '14' });
  assert.deepEqual(decoded.omitted, ['proposalScope']);
});

test('nothing is named when everything fits, so a link stays as small as it was', () => {
  const decoded = decodeBidLink('#' + encodeBidLink({ fields: { lengthFt: '14', note: 'short' } }));
  assert.equal('omitted' in decoded, false);
});

test('a field dropped for any other reason is still not named', () => {
  // A number, a null, an object: those are not values a control can hold, so
  // they were never carriable and naming them would tell the recipient the
  // sender had a field they do not.
  const decoded = decodeBidLink('#' + encodeBidLink({ fields: { lengthFt: '14', bad: 7, worse: null } }));
  assert.equal('omitted' in decoded, false);
});

test('an omitted name from a stranger is validated like any other id', () => {
  const fragment = BID_LINK_PREFIX + encodeURIComponent(JSON.stringify({
    v: 1,
    f: { lengthFt: '14' },
    o: ['proposalScope', 'pf-bid-name', 'usageOptOut', 42, ''],
  }));
  assert.deepEqual(decodeBidLink('#' + fragment).omitted, ['proposalScope']);
});

test('a payload whose omitted list is junk is read as naming nothing', () => {
  for (const value of ['proposalScope', 7, {}, null]) {
    const fragment = BID_LINK_PREFIX + encodeURIComponent(JSON.stringify({ v: 1, f: { lengthFt: '14' }, o: value }));
    assert.equal('omitted' in decodeBidLink('#' + fragment), false);
  }
});

test('the browser bundle carries the helper the encoder now calls', () => {
  assert.match(BID_LINK_HELPERS, /var omittedForLength = /);
  assert.match(BID_LINK_HELPERS, /var MAX_LINK_VALUE = /);
});

test('the page script treats a named omission as accounted for, not as a mismatch', () => {
  // The other half of the same defect. `decodeBidLink` can name the field and
  // the guard can still refuse the link, which is exactly what happened; the
  // fix is only real if the browser adds those names to the link side before
  // it compares. Asserted against the emitted source because this branch runs
  // in a page, and the browser pass in the PR is what exercises it end to end.
  const source = renderBidLinkModule();
  assert.match(source, /var skipped = incoming\.omitted \|\| \[\];/);
  // Written through the same key map as every other id since row groups landed,
  // so an omitted field inside a generated row is accounted for by position too
  // rather than only when its raw id happens to match.
  assert.match(source, /for \(var s = 0; s < skipped\.length; s\+\+\) link\[linkKeys\[skipped\[s\]\]\] = 1;/);
  // And the grown form is what the comparison measures: reading `formFields()`
  // again after the clicks is the difference between an itemised link opening
  // and being refused on the rows it just created.
  assert.match(source, /var fields = growRows\(linkIds\.concat\(skipped\)\);/);
});

// The build passes what the markup cannot say: whether this page loads a share
// control of its own from a separate script. See `pageHasOwnShareControl` in
// `build.mjs` for the two pages that made this necessary.
test('a page the build reports as already having a share control gets no second one', () => {
  const html = injectSavedBids(page(), 'demo', './');
  assert.equal(pageTakesBidLink(page()), true);
  assert.equal(pageTakesBidLink(page(), { hasShareModule: true }), false);
  assert.equal(pageTakesBidLink(page(), { hasShareModule: false }), true);
  // and the injection agrees with its own gate
  assert.equal(injectBidLink(html, { source: page(), hasShareModule: true }), html);
  assert.notEqual(injectBidLink(html, { source: page(), hasShareModule: false }), html);
});

test('the itemised calculators are offered the control once they declare their rows', async () => {
  // The eight pages this exclusion used to cost. Read off disk rather than from
  // a fixture: the point of the assertion is that the venture files carry the
  // declaration, which a fixture would happily pass without.
  const { promises: fsp } = await import('node:fs');
  const nodePath = await import('node:path');
  const { fileURLToPath: toPath } = await import('node:url');
  const root = nodePath.resolve(nodePath.dirname(toPath(import.meta.url)), '../../ventures');

  const itemised = [
    'carpet-cleaning-bid-calculator',
    'gutter-cleaning-bid-calculator',
    'hood-cleaning-bid-calculator',
    'pest-control-bid-calculator',
    'portable-restroom-event-quote',
    'snow-removal-bid-calculator',
    'tree-service-bid-calculator',
    'window-cleaning-bid-calculator',
  ];

  for (const slug of itemised) {
    const html = await fsp.readFile(nodePath.join(root, slug, 'index.html'), 'utf8');
    // Still genuinely runtime-built — this is not a page that quietly moved its
    // fields into the markup, which would make the assertions below vacuous.
    assert.equal(pageBuildsFieldsAtRuntime(html), true, `${slug} builds fields at runtime`);
    // The declaration is what every one of the eight gets from this change, and
    // it is the half `jobs.mjs` reads: a saved bid restores through the row
    // replay whether or not the page also carries a share control of its own.
    assert.ok(pageRepeatPrefixes(html).length > 0, `${slug} declares its row groups`);

    // The link half defers to a venture that already ships its own control, so
    // this can never draw a second button writing a second hash format.
    // `pest-control-bid-calculator` is the live case rather than a hypothetical:
    // it grew a `share.mjs` in #2699 while this branch was open, so it keeps
    // what it has and the other seven take the platform control.
    const ownShare = pageHasOwnShareLink(html);
    assert.equal(pageTakesBidLink(html), !ownShare, `${slug} link control follows its own share control`);
    assert.equal(pageTakesBidLink(html, { hasShareModule: true }), false, `${slug} defers to a share module`);
  }

  // None of the eight take the platform control today; all eight declare
  // their rows. Pinned as counts so a venture growing or dropping its own
  // share control shows up here as a number to re-read rather than silently.
  const takes = [];
  for (const slug of itemised) {
    const html = await fsp.readFile(nodePath.join(root, slug, 'index.html'), 'utf8');
    if (pageTakesBidLink(html)) takes.push(slug);
  }
  assert.equal(itemised.length, 8);
  assert.equal(takes.includes('pest-control-bid-calculator'), false,
    'pest-control keeps the share control it shipped in #2699');
  assert.equal(takes.includes('snow-removal-bid-calculator'), false,
    'snow-removal keeps the share control it shipped in #3048');
  assert.equal(takes.includes('gutter-cleaning-bid-calculator'), false,
    'gutter-cleaning keeps the share control it shipped in #3052');
  assert.equal(takes.includes('carpet-cleaning-bid-calculator'), false,
    'carpet-cleaning keeps the share control it shipped alongside its rooms and upholstery rows');
  assert.equal(takes.includes('hood-cleaning-bid-calculator'), false,
    'hood-cleaning keeps the share control it shipped alongside its exhaust-system component rows');
  assert.equal(takes.includes('tree-service-bid-calculator'), false,
    'tree-service keeps the share control it shipped alongside its per-tree rows');
  assert.equal(takes.includes('window-cleaning-bid-calculator'), false,
    'window-cleaning keeps the share control it shipped alongside its per-glass-type rows');
  assert.equal(takes.includes('portable-restroom-event-quote'), false,
    'portable-restroom-event-quote keeps the share control it shipped alongside its per-unit-type rows');
  assert.equal(takes.length, 0);

  // And the exclusion is intact for a runtime-built page that declares nothing,
  // which is what stops this widening past the eight pages above.
  const undeclared = '<form>' + '<input id="crewRate"><input id="travelMinutes"><input id="overhead">'
    + '<input id="margin"><input id="dumpFee">' + '</form><script>el.innerHTML = `<input id="${id}-x">`;</script>';
  assert.equal(pageBuildsFieldsAtRuntime(undeclared), true);
  assert.deepEqual(pageRepeatPrefixes(undeclared), []);
  assert.equal(pageTakesBidLink(undeclared), false);
});

// ---------------------------------------------------------------------------
// The shipped page script, run end to end against a stand-in page
// ---------------------------------------------------------------------------
//
// Red-team seeding (2026-10-17) showed the in-page `apply` guard, its refusal
// wording and the usage counter were only pinned by regexes on the source, so
// flipping a comparison in them passed every test. This runs the emitted module
// itself in a `vm` with the smallest document it needs.

function runLinkModule(hash, formIds, { storage = {}, repeatPrefix = '', hero = null, checkboxes = [], navigator = {}, values = {}, clipboard = undefined, setHashThrows = false } = {}) {
  const note = { textContent: '', hidden: true, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; } };
  const events = [];
  const nodes = formIds.map((id) => ({
    id, tagName: 'INPUT', type: checkboxes.includes(id) ? 'checkbox' : 'text', value: values[id] ?? '', closest: () => null,
    dispatchEvent(e) { events.push([id, e.type]); if (!e.bubbles) events.push([id, 'non-bubbling']); },
    getAttribute: () => null,
  }));
  let clicked = null;
  const button = { addEventListener(_t, fn) { clicked = fn; }, remove() {} };
  const document = {
    // `hero` stands in for the page's headline figure: the script tag names its
    // selector and the selector finds the element showing the number.
    querySelector: (sel) => {
      if (!hero) return null;
      if (sel.startsWith('script[')) return { getAttribute: () => '#bidPrice' };
      return sel === '#bidPrice' ? { textContent: hero } : null;
    },
    getElementById: (id) => (id === 'pf-link-note' ? note : id === 'pf-link-copy' ? button : null),
    querySelectorAll: (sel) => {
      if (sel.startsWith('input[id]')) return nodes;
      if (repeatPrefix && sel.includes('data-pf-repeat')) {
        return [{ getAttribute: () => repeatPrefix, click() {} }];
      }
      return [];
    },
  };
  const store = { ...storage };
  const context = {
    document, navigator: clipboard === undefined ? navigator : { ...navigator, clipboard }, Event: class { constructor(type, init = {}) { this.type = type; this.bubbles = !!init.bubbles; } },
    setTimeout: (fn) => fn(),
    location: {
      origin: 'https://x.test', pathname: '/', search: '',
      get hash() { return hash; },
      set hash(v) { if (setHashThrows) throw new Error('blocked'); hash = '#' + v; },
    },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
  };
  vm.runInNewContext(renderBidLinkModule(), context);
  return { note, nodes, store, events, click: () => clicked && clicked() };
}

test('the page script writes a link whose fields are exactly the form fields', () => {
  const hash = '#' + encodeBidLink({ fields: { lengthFt: '14', width: '3' } });
  const { note, nodes, store } = runLinkModule(hash, ['lengthFt', 'width']);
  assert.deepEqual(nodes.map((n) => n.value), ['14', '3']);
  assert.match(note.textContent, /^Opened from a shared bid — 2 fields/);
  assert.equal(JSON.parse(store['portfolio-hub-usage']).bid_link_opened, 1);
});

test('the page script refuses a link naming a field the form lacks, and writes nothing', () => {
  const hash = '#' + encodeBidLink({ fields: { lengthFt: '14', width: '3' } });
  const { note, nodes } = runLinkModule(hash, ['lengthFt']);
  assert.deepEqual(nodes.map((n) => n.value), ['']);
  assert.match(note.textContent, /This bid link was not opened\. It carries 1 this form does not have, so/);
  assert.doesNotMatch(note.textContent, /never priced/);
});

test('the page script refuses when the form has one control the link never priced', () => {
  const hash = '#' + encodeBidLink({ fields: { lengthFt: '14' } });
  const { note, nodes } = runLinkModule(hash, ['lengthFt', 'extraRow']);
  assert.deepEqual(nodes.map((n) => n.value), ['', '']);
  assert.match(note.textContent, /carries 1 this form has that the link never priced, so/);
  assert.doesNotMatch(note.textContent, /does not have/);
});

test('the page script names both kinds of mismatch together', () => {
  const hash = '#' + encodeBidLink({ fields: { a: '1', b: '2' } });
  const { note } = runLinkModule(hash, ['a', 'c']);
  assert.match(note.textContent,
    /carries 1 this form does not have, and 1 this form has that the link never priced, so/);
});

test('a refusal says to reload only on a page with generated rows, else to ask the sender', () => {
  const hash = '#' + encodeBidLink({ fields: { a: '1', b: '2' } });
  const plain = runLinkModule(hash, ['a']);
  assert.match(plain.note.textContent, /ask whoever sent it for the tool they used, because/);
  assert.doesNotMatch(plain.note.textContent, /reload this page/);
  const rows = runLinkModule(hash, ['a'], { repeatPrefix: 'zzrow' });
  assert.match(rows.note.textContent, /reload this page and open the link again before adding rows of your own, because/);
  assert.doesNotMatch(rows.note.textContent, /ask whoever/);
});

test('a refused link counts once in the usage counter', () => {
  const hash = '#' + encodeBidLink({ fields: { a: '1', b: '2' } });
  const { store } = runLinkModule(hash, ['a']);
  assert.equal(JSON.parse(store['portfolio-hub-usage']).bid_link_refused, 1);
});

test('the usage counter adds to an existing count and honours the opt-out', () => {
  const hash = '#' + encodeBidLink({ fields: { a: '1' } });
  const seeded = { 'portfolio-hub-usage': JSON.stringify({ bid_link_opened: 4 }) };
  const { store } = runLinkModule(hash, ['a'], { storage: seeded });
  assert.equal(JSON.parse(store['portfolio-hub-usage']).bid_link_opened, 5);
  const off = runLinkModule(hash, ['a'], { storage: { 'portfolio-hub-optout': '1' } });
  assert.equal('portfolio-hub-usage' in off.store, false);
});

test('a non-string page is never offered the control', () => {
  for (const html of [undefined, null, 7, {}]) assert.equal(pageTakesBidLink(html), false);
});

// Red-team seeding (2026-10-19): the boundaries and one gate below were each
// changed without a single test noticing.

test('a value exactly at the ceiling survives and one past it is dropped', () => {
  assert.equal(MAX_LINK_VALUE, 512);
  const at = decodeBidLink(encodeBidLink({ fields: { note: 'x'.repeat(512) } }));
  assert.equal(at.fields.note.length, 512);
  const payload = encodeURIComponent(JSON.stringify({
    v: 1, f: { lengthFt: '14', note: 'x'.repeat(513) },
  }));
  assert.deepEqual(decodeBidLink('#' + BID_LINK_PREFIX + payload), { fields: { lengthFt: '14' } });
});

test('a page that builds rows in script but declares them takes the control', () => {
  const declared = '<form><input id="a"><input id="b"><input id="c"><input id="d"><input id="e"></form>'
    + '<button data-pf-repeat="row">Add</button>'
    + '<script>el.innerHTML = `<input id="${id}-x">`;</script>';
  assert.equal(pageBuildsFieldsAtRuntime(declared), true);
  assert.ok(pageRepeatPrefixes(declared).length > 0);
  const html = injectSavedBids(declared, 'demo', './');
  assert.equal(pageTakesBidLink(html), true);
});

test('the page script reports an extra form control even when it is the first one', () => {
  const hash = '#' + encodeBidLink({ fields: { b: '1' } });
  const { note } = runLinkModule(hash, ['a', 'b']);
  assert.match(note.textContent, /carries 1 this form has that the link never priced, so/);
});

test('a figure that differs from the sender is a warning and is counted', () => {
  const hash = '#' + encodeBidLink({ fields: { a: '1' }, amount: '$1,800' });
  const off = runLinkModule(hash, ['a'], { hero: '$1,900' });
  assert.match(off.note.textContent, /^Opened from a shared bid — 1 fields\. The sender saw \$1,800 and this page works out \$1,900/);
  assert.ok('data-pf-link-warn' in off.note.attrs, 'a disagreement is shown as a warning');
  assert.equal(JSON.parse(off.store['portfolio-hub-usage']).bid_link_amount_differs, 1);
  const same = runLinkModule(hash, ['a'], { hero: '$1,800' });
  assert.match(same.note.textContent, /works out the same \$1,800/);
  assert.equal('data-pf-link-warn' in same.note.attrs, false);
});

test('a checkbox in a link sets its checked state, not its text value', () => {
  const hash = '#' + encodeBidLink({ fields: { rush: true, hours: '3' } });
  const { nodes } = runLinkModule(hash, ['rush', 'hours'], { checkboxes: ['rush'] });
  assert.equal(nodes[0].checked, true);
  assert.equal(nodes[0].value, '');
  assert.equal(nodes[1].value, '3');
});

// Red-team seeding (2026-10-21): these in-page paths escaped every test.

test('the page script honours Do Not Track and Global Privacy Control separately', () => {
  const hash = '#' + encodeBidLink({ fields: { a: '1' } });
  const dnt = runLinkModule(hash, ['a'], { navigator: { doNotTrack: '1' } });
  assert.equal('portfolio-hub-usage' in dnt.store, false);
  const gpc = runLinkModule(hash, ['a'], { navigator: { globalPrivacyControl: true } });
  assert.equal('portfolio-hub-usage' in gpc.store, false);
});

test('the usage counter stamps the day it last counted', () => {
  const hash = '#' + encodeBidLink({ fields: { a: '1' } });
  const { store } = runLinkModule(hash, ['a']);
  assert.equal(JSON.parse(store['portfolio-hub-usage']).last_day, new Date().toISOString().slice(0, 10));
});

test('opening a link fires input and change on every field it writes', () => {
  const hash = '#' + encodeBidLink({ fields: { a: '1', b: '2' } });
  const { events } = runLinkModule(hash, ['a', 'b']);
  assert.deepEqual(events, [['a', 'input'], ['a', 'change'], ['b', 'input'], ['b', 'change']]);
});

test('a link that left one long field behind says so, with the right verb', () => {
  const scope = 'x'.repeat(MAX_LINK_VALUE + 1);
  const hash = '#' + encodeBidLink({ fields: { a: '1', scope } });
  const one = runLinkModule(hash, ['a', 'scope']);
  assert.match(one.note.textContent,
    /The sender's scope was too long to fit in a link, so it is this page's own wording below\.$/);
  const hash2 = '#' + encodeBidLink({ fields: { a: '1', scope, terms: scope } });
  const two = runLinkModule(hash2, ['a', 'scope', 'terms']);
  assert.match(two.note.textContent,
    /The sender's scope, terms were too long to fit in a link, so they are this page's own wording below\.$/);
});

test('copying a bid with long fields names them and uses the right pronoun', async () => {
  const scope = 'x'.repeat(MAX_LINK_VALUE + 1);
  const wrote = [];
  const clipboard = { writeText: (u) => { wrote.push(u); return { then: (ok) => ok() }; } };
  const one = runLinkModule('', ['a', 'scope'], { values: { a: '1', scope }, clipboard });
  one.click();
  assert.match(one.note.textContent, / Your scope is too long to fit in a link and stayed behind; paste it separately if the wording matters\.$/);
  const two = runLinkModule('', ['a', 'scope', 'terms'], { values: { a: '1', scope, terms: scope }, clipboard });
  two.click();
  assert.match(two.note.textContent, / Your scope, terms are too long to fit in a link and stayed behind; paste them separately if the wording matters\.$/);
});

test('copying falls back to the address bar, and warns if even that is blocked', () => {
  const viaHash = runLinkModule('', ['a'], { values: { a: '1' } });
  viaHash.click();
  assert.match(viaHash.note.textContent, /^This browser would not copy for us/);
  assert.ok('data-pf-link-warn' in viaHash.note.attrs);
  const blocked = runLinkModule('', ['a'], { values: { a: '1' }, setHashThrows: true });
  blocked.click();
  assert.equal(blocked.note.textContent, 'This browser would not build a link for this bid.');
  assert.ok('data-pf-link-warn' in blocked.note.attrs, 'a failure to build is a warning');
});

test('a link that omits a field is encoded with the omission only when there is one', () => {
  const none = decodeBidLink('#' + encodeBidLink({ fields: { a: '1' } }));
  assert.equal('omitted' in none, false);
  assert.doesNotMatch(decodeURIComponent(encodeBidLink({ fields: { a: '1' } })), /"o"/);
  const raw = encodeBidLink({ fields: { a: '1', big: 'x'.repeat(MAX_LINK_VALUE + 1) } });
  assert.match(decodeURIComponent(raw), /"o":\["big"\]/);
});
