import test from 'node:test';
import assert from 'node:assert/strict';

import {
  encodeBid,
  decodeBid,
  saveBid,
  loadBid,
  clearBid,
  restoreBid,
  withProposalTerms,
  readProposalTerms,
  overlongTerms,
  overlongTermsNote,
  MAX_TERM_TEXT,
  PROPOSAL_TERM_NUMBERS,
  PROPOSAL_TERM_TEXT,
} from './share.mjs';
import {
  HEAD_TYPE_PRESETS, STORY_PRESETS, ELECTRICAL_PRESETS, CONDENSATE_PRESETS, SYSTEM_PRESETS,
} from './calc.mjs';

// These exercise the transform, so the spec below is a stand-in rather than
// this venture's real field list. That split is deliberate: a unit test that
// restated the form's fields would be a second copy of them to keep in sync —
// exactly the drift this module exists to avoid. The tie between the real
// form and what a link carries is asserted in `page.test.mjs`, against the
// page source itself.
const SPEC = {
  key: 'saved-bid',
  numbers: ['area', 'wage', 'margin'],
  flags: ['extraA', 'extraB'],
  choices: { scope: ['basic', 'standard', 'full'], grade: ['plain', 'fancy'] },
};

// This venture's actual field list, mirroring `BID_SPEC` in `index.html`: a
// fixed field set (no visitor-grown rows), with the five preset selects
// validated against `calc.mjs`'s own arrays rather than a hand-copied list.
const MINI_SPLIT_SPEC = {
  key: 'mini-split-bid',
  numbers: [
    'headCount', 'btuPerHead', 'outdoorUnitCost', 'indoorHeadCostEach', 'branchBoxCost',
    'headTypeFactor', 'storyFactor', 'indoorHoursPerHead', 'outdoorHours',
    'lineSetFeet', 'includedFeetPerHead', 'lineSetMaterialPerExtraFoot', 'hoursPerExtraTenFeet',
    'electricalHours', 'electricalMaterial', 'condensateHours', 'condensateMaterial',
    'commissionHoursPerHead', 'hourlyWage', 'burdenRate', 'permitFee', 'travelAndLift',
    'overheadRate', 'targetMargin', 'proposedPrice',
  ],
  flags: [],
  choices: {
    systemPreset: SYSTEM_PRESETS.map((_, index) => String(index)),
    headTypePreset: HEAD_TYPE_PRESETS.map((preset) => preset.id),
    storyPreset: STORY_PRESETS.map((preset) => preset.id),
    electricalPreset: ELECTRICAL_PRESETS.map((preset) => preset.id),
    condensatePreset: CONDENSATE_PRESETS.map((preset) => preset.id),
  },
};

// A fake storage that behaves like localStorage, including the throwing kind a
// browser with site data blocked hands back.
function fakeStorage({ throws = false } = {}) {
  const map = new Map();
  return {
    getItem: key => { if (throws) throw new Error('blocked'); return map.has(key) ? map.get(key) : null; },
    setItem: (key, value) => { if (throws) throw new Error('blocked'); map.set(key, String(value)); },
    removeItem: key => { if (throws) throw new Error('blocked'); map.delete(key); },
    size: () => map.size,
  };
}

test('a full bid round-trips through a link unchanged', () => {
  const values = {
    scope: 'full',
    grade: 'fancy',
    area: '48',
    wage: '62.5',
    margin: '22',
    extraA: true,
    extraB: false,
  };
  assert.deepEqual(decodeBid(SPEC, encodeBid(SPEC, values)), {
    scope: 'full',
    grade: 'fancy',
    area: '48',
    wage: '62.5',
    margin: '22',
    extraA: true,
    extraB: false,
  });
});

test('encoding is stable, so a copied link does not churn between visits', () => {
  const values = { area: '48', scope: 'basic', extraA: true };
  assert.equal(encodeBid(SPEC, values), encodeBid(SPEC, { ...values }));
});

test('a blank field is left out instead of encoding an empty string', () => {
  const encoded = encodeBid(SPEC, { area: '', wage: '55' });
  assert.equal(encoded.includes('area'), false);
  assert.deepEqual(decodeBid(SPEC, encoded), { wage: '55' });
});

test('a leading ? or # is accepted so location.hash needs no trimming', () => {
  assert.deepEqual(decodeBid(SPEC, '?area=30'), { area: '30' });
  assert.deepEqual(decodeBid(SPEC, '#area=30'), { area: '30' });
});

test('a crafted link cannot set a select to an option the form does not offer', () => {
  assert.deepEqual(decodeBid(SPEC, 'scope=free-labour&grade=plain'), { grade: 'plain' });
});

test('a crafted link cannot inject an unknown field or a bad number', () => {
  assert.deepEqual(
    decodeBid(SPEC, 'area=-40&wage=abc&margin=18&sneakyRate=999'),
    { margin: '18' },
  );
});

test('non-string input decodes to nothing rather than throwing', () => {
  assert.deepEqual(decodeBid(SPEC, null), {});
  assert.deepEqual(decodeBid(SPEC, undefined), {});
  assert.deepEqual(decodeBid(SPEC, 42), {});
});

test('a saved bid comes back on the next visit', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { area: '48', scope: 'standard', extraA: true });
  assert.deepEqual(loadBid(storage, SPEC), { scope: 'standard', area: '48', extraA: true });
});

test('clearing removes the saved bid', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { area: '48' });
  clearBid(storage, SPEC);
  assert.deepEqual(loadBid(storage, SPEC), {});
  assert.equal(storage.size(), 0);
});

test('storage that throws never takes the page down with it', () => {
  const storage = fakeStorage({ throws: true });
  assert.equal(saveBid(storage, SPEC, { area: '48' }), false);
  assert.deepEqual(loadBid(storage, SPEC), {});
  assert.equal(clearBid(storage, SPEC), false);
});

test('a stored blob from another version, or hand-edited, is ignored', () => {
  const storage = fakeStorage();
  storage.setItem(SPEC.key, JSON.stringify({ v: 99, values: { area: '48' } }));
  assert.deepEqual(loadBid(storage, SPEC), {});
  storage.setItem(SPEC.key, 'not json at all');
  assert.deepEqual(loadBid(storage, SPEC), {});
});

test('a link beats a saved bid, because an opened link is what the visitor meant to see', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { area: '10' });
  const restored = restoreBid(SPEC, { search: '?area=48', storage });
  assert.deepEqual(restored.values, { area: '48' });
  assert.equal(restored.source, 'link');
});

test('a plain visit falls back to the saved bid', () => {
  const storage = fakeStorage();
  saveBid(storage, SPEC, { area: '10' });
  const restored = restoreBid(SPEC, { search: '', storage });
  assert.deepEqual(restored.values, { area: '10' });
  assert.equal(restored.source, 'storage');
});

test('a first visit restores nothing and says so', () => {
  const restored = restoreBid(SPEC, { search: '', storage: fakeStorage() });
  assert.deepEqual(restored.values, {});
  assert.equal(restored.source, 'none');
});

// ---- This venture's actual field list --------------------------------------
//
// A ductless mini-split install is priced as a fixed field set: heads, BTU,
// equipment cost, head-type and story factors, line-set extras, electrical
// and condensate adders, and the installer's own wage/burden/overhead/margin.
// Nothing here is a visitor-grown row list, so no `rows` group is needed.

test('the real bid round-trips: heads, presets, line-set, and every rate', () => {
  const values = {
    headCount: '2',
    btuPerHead: '15000',
    outdoorUnitCost: '2200',
    indoorHeadCostEach: '580',
    branchBoxCost: '350',
    systemPreset: '2',
    headTypePreset: 'cassette',
    headTypeFactor: '1.35',
    storyPreset: 'second',
    storyFactor: '1.2',
    indoorHoursPerHead: '4',
    outdoorHours: '3',
    lineSetFeet: '40',
    includedFeetPerHead: '15',
    lineSetMaterialPerExtraFoot: '12',
    hoursPerExtraTenFeet: '1',
    electricalPreset: 'circuit-40',
    electricalHours: '4.5',
    electricalMaterial: '380',
    condensatePreset: 'pump',
    condensateHours: '1.5',
    condensateMaterial: '180',
    commissionHoursPerHead: '1',
    hourlyWage: '42',
    burdenRate: '30',
    permitFee: '175',
    travelAndLift: '85',
    overheadRate: '15',
    targetMargin: '22',
    proposedPrice: '3800',
  };
  assert.deepEqual(decodeBid(MINI_SPLIT_SPEC, encodeBid(MINI_SPLIT_SPEC, values)), values);
});

test('a crafted link cannot select a preset the calculator has no rates for', () => {
  const decoded = decodeBid(MINI_SPLIT_SPEC, 'headTypePreset=jetpack&storyPreset=second&systemPreset=99');
  assert.deepEqual(decoded, { storyPreset: 'second' });
});

test('a stale link from before a preset was added still decodes the fields it recognises', () => {
  // Simulates a link built against an older SYSTEM_PRESETS array: index "9"
  // is not (yet, or ever) an option this build offers.
  const decoded = decodeBid(MINI_SPLIT_SPEC, 'systemPreset=9&headCount=3');
  assert.deepEqual(decoded, { headCount: '3' });
});

test('a negative or non-numeric field is rejected rather than pricing a nonsense job', () => {
  const decoded = decodeBid(MINI_SPLIT_SPEC, 'headCount=-1&btuPerHead=abc&lineSetFeet=40');
  assert.deepEqual(decoded, { lineSetFeet: '40' });
});

test('a select the page coerced to a number still reaches the link', () => {
  // fillSelect gives systemPreset String(index) values, but a defensive page
  // could hand this module a number; the same tolerance share.mjs documents
  // for other ventures' selects applies here too.
  const encoded = encodeBid(MINI_SPLIT_SPEC, { systemPreset: 2, headCount: '2' });
  assert.equal(new URLSearchParams(encoded).get('systemPreset'), '2');
  assert.deepEqual(decodeBid(MINI_SPLIT_SPEC, encoded), { systemPreset: '2', headCount: '2' });
});

test('the real spec round-trips through save and reload too', () => {
  const storage = fakeStorage();
  const values = { headCount: '1', btuPerHead: '12000', headTypePreset: 'wall', storyPreset: 'first' };
  saveBid(storage, MINI_SPLIT_SPEC, values);
  assert.deepEqual(loadBid(storage, MINI_SPLIT_SPEC), values);
});

// ---- Proposal terms -------------------------------------------------------
//
// The defect these cover, recorded 2026-08-29: 48 bid calculators carried the
// pricing form into a shared link and left the proposal terms behind, so a
// bid sent at a 50% deposit held for 15 days reopened at the venture's
// defaults — 30% and 30 days — under a headline figure that matched the
// sender's to the cent. The same terms were missing from the setter's own
// saved bid.

test('the proposal terms ride in a link and come back as sent', () => {
  const spec = withProposalTerms(MINI_SPLIT_SPEC);
  const values = {
    headCount: '2', btuPerHead: '15000', hourlyWage: '42', targetMargin: '22',
    headTypePreset: 'cassette', storyPreset: 'second',
    depositPercent: '50',
    validDays: '15',
    paymentTerms: 'Half on acceptance, balance on completion.',
    proposalNotes: 'Line sets run in exterior chase, painted to match.',
    proposalExclusions: 'Drywall patching\nElectrical service upgrade',
  };
  assert.deepEqual(decodeBid(spec, encodeBid(spec, values)), values);
});

test('newlines survive, because an exclusions list is a list', () => {
  const spec = withProposalTerms(MINI_SPLIT_SPEC);
  const values = { headCount: '1', proposalExclusions: 'Permits\nDrywall patching\nPaint' };
  assert.equal(
    decodeBid(spec, encodeBid(spec, values)).proposalExclusions,
    'Permits\nDrywall patching\nPaint',
  );
});

test('a term too long to travel is dropped whole, never half-sent', () => {
  const spec = withProposalTerms(MINI_SPLIT_SPEC);
  const essay = 'x'.repeat(MAX_TERM_TEXT + 1);
  const decoded = decodeBid(spec, encodeBid(spec, { headCount: '1', paymentTerms: essay }));
  assert.equal(decoded.paymentTerms, undefined);
  assert.equal(decoded.headCount, '1');
  assert.deepEqual(overlongTerms({ paymentTerms: essay }), ['paymentTerms']);
  assert.deepEqual(overlongTerms({ paymentTerms: 'Net 30.' }), []);
  assert.deepEqual(overlongTerms(null), []);
});

test('a term at the ceiling still travels', () => {
  const spec = withProposalTerms(MINI_SPLIT_SPEC);
  const exact = 'x'.repeat(MAX_TERM_TEXT);
  assert.equal(decodeBid(spec, encodeBid(spec, { paymentTerms: exact })).paymentTerms, exact);
});

test('a crafted link cannot paste control characters into a printed proposal', () => {
  const spec = withProposalTerms(MINI_SPLIT_SPEC);
  const crafted = new URLSearchParams({ headCount: '1', paymentTerms: 'Net [2J 30' }).toString();
  assert.equal(decodeBid(spec, crafted).paymentTerms, 'Net [2J 30');
});

test('a term holding only whitespace is not carried as terms the sender wrote', () => {
  const spec = withProposalTerms(MINI_SPLIT_SPEC);
  const encoded = encodeBid(spec, { headCount: '1', paymentTerms: '  \n  ' });
  assert.equal(new URLSearchParams(encoded).has('paymentTerms'), false);
});

test('the terms are saved with the bid, so they are typed once', () => {
  const storage = fakeStorage();
  const spec = withProposalTerms(MINI_SPLIT_SPEC);
  saveBid(storage, spec, { headCount: '2', depositPercent: '50', paymentTerms: 'Net 15.' });
  const loaded = loadBid(storage, spec);
  assert.equal(loaded.depositPercent, '50');
  assert.equal(loaded.paymentTerms, 'Net 15.');
});

test('a link wins over stored terms, as it does over stored figures', () => {
  const storage = fakeStorage();
  const spec = withProposalTerms(MINI_SPLIT_SPEC);
  saveBid(storage, spec, { headCount: '2', depositPercent: '30', paymentTerms: 'Net 30.' });
  const restored = restoreBid(spec, {
    search: encodeBid(spec, { headCount: '2', depositPercent: '50', paymentTerms: 'Net 15.' }),
    storage,
  });
  assert.equal(restored.source, 'link');
  assert.equal(restored.values.depositPercent, '50');
  assert.equal(restored.values.paymentTerms, 'Net 15.');
});

test('folding the terms in twice leaves one copy of each', () => {
  const once = withProposalTerms(MINI_SPLIT_SPEC);
  const twice = withProposalTerms(once);
  assert.deepEqual(twice.numbers, once.numbers);
  assert.deepEqual(twice.text, once.text);
  assert.equal(new Set(twice.numbers).size, twice.numbers.length);
});

test('every named term is one kind or the other, and no id is both', () => {
  const overlap = PROPOSAL_TERM_NUMBERS.filter(id => PROPOSAL_TERM_TEXT.includes(id));
  assert.deepEqual(overlap, []);
});

test('withProposalTerms leaves a non-spec alone rather than inventing one', () => {
  assert.equal(withProposalTerms(null), null);
  assert.equal(withProposalTerms('nope'), 'nope');
});

test('readProposalTerms takes the terms off the page and leaves the rest', () => {
  const page = {
    depositPercent: { value: '50' },
    validDays: { value: '15' },
    paymentTerms: { value: 'Net 15.' },
    proposalNotes: { value: '' },
    proposalExclusions: { value: 'Permits' },
  };
  const values = readProposalTerms({ headCount: '2' }, id => page[id] ?? null);
  assert.equal(values.headCount, '2');
  assert.equal(values.depositPercent, '50');
  assert.equal(values.paymentTerms, 'Net 15.');
  assert.equal(values.proposalNotes, '');
});

test('a page without the proposal panel is unchanged, and a throwing lookup is survivable', () => {
  assert.deepEqual(readProposalTerms({ headCount: '2' }, () => null), { headCount: '2' });
  assert.deepEqual(
    readProposalTerms({ headCount: '2' }, () => { throw new Error('no such id'); }),
    { headCount: '2' },
  );
  assert.deepEqual(readProposalTerms({ headCount: '2' }, undefined), { headCount: '2' });
  assert.deepEqual(readProposalTerms(null, () => null), {});
});

test('the note names the box on screen, not the id in the markup', () => {
  const long = 'x'.repeat(MAX_TERM_TEXT + 1);
  assert.equal(overlongTermsNote({ paymentTerms: 'Net 30.' }), '');
  assert.match(overlongTermsNote({ paymentTerms: long }), /^your payment terms is too long/);
  assert.match(
    overlongTermsNote({ paymentTerms: long, proposalNotes: long }),
    /^your payment terms and notes are too long/,
  );
});

// Company/customer contact fields and `usageOptOut` are deliberately absent
// from every SPEC above: no business rides in a URL, and a link must never
// silently flip the recipient's own privacy choice.
test('company, customer, and usageOptOut never ride in a mini-split bid link', () => {
  const spec = withProposalTerms(MINI_SPLIT_SPEC);
  const all = [...spec.numbers, ...(spec.flags ?? []), ...Object.keys(spec.choices ?? {}), ...spec.text];
  for (const excluded of [
    'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
    'clientName', 'clientAddress', 'usageOptOut',
  ]) {
    assert.equal(all.includes(excluded), false, `${excluded} must not be part of the bid spec`);
  }
});
