import test from 'node:test';
import assert from 'node:assert/strict';
import { extract, toCsv, toMarkdown, csvCell, strengthOf, classify, MATRIX_COLUMNS } from './extract.mjs';
import { SAMPLE } from './sample.mjs';

const r = extract(SAMPLE);
const find = (rx) => r.requirements.find((x) => rx.test(x.text));

test('empty input is handled', () => {
  const e = extract('   ');
  assert.equal(e.requirements.length, 0);
  assert.match(e.warnings[0], /Paste/);
  assert.equal(extract(null).requirements.length, 0);
});

test('shall / must / required sentences become mandatory rows with section refs', () => {
  const hosted = find(/hosted records management/);
  assert.equal(hosted.strength, 'Mandatory');
  assert.equal(hosted.section, '2.1');
  assert.equal(find(/active SAM\.gov/).section, '3.1');
  assert.equal(find(/three references/).category, 'Past performance');
});

test('lead-in "shall:" governs each bullet as its own row', () => {
  const migrate = find(/migrate all existing records/);
  assert.ok(migrate, 'bullet (a) extracted');
  assert.match(migrate.text, /^The Contractor shall/);
  assert.equal(migrate.section, '2.2');
  assert.ok(find(/role-based access control/));
  assert.ok(find(/99\.9% monthly availability/));
  assert.equal(r.requirements.filter((x) => x.section === '2.2').length, 3);
});

test('buyer duties are not offeror requirements', () => {
  assert.equal(find(/County will evaluate/), undefined);
  assert.equal(strengthOf('The Government will review all proposals.'), null);
  assert.equal(strengthOf('The Contractor will deliver weekly updates.'), 'Mandatory');
});

test('prohibitions and desirables are distinguished', () => {
  assert.equal(find(/not store County data/).strength, 'Prohibition');
  assert.equal(find(/single sign-on/).strength, 'Desirable');
  assert.equal(find(/executive summary/).strength, 'Desirable');
});

test('categories', () => {
  assert.equal(find(/liability insurance/).category, 'Insurance & bonds');
  assert.equal(find(/encrypt data/).category, 'Security & privacy');
  assert.equal(find(/fixed-price proposal/).category, 'Pricing');
  assert.equal(classify('Say hello.'), 'General');
});

test('proposal instructions are collected separately with their types', () => {
  const types = new Set(r.instructions.map((i) => i.type));
  for (const t of ['Page limit', 'Due date', 'Questions deadline', 'Mandatory meeting', 'Copies / media', 'Font / format']) {
    assert.ok(types.has(t), `missing instruction type ${t}`);
  }
  assert.match(r.instructions.find((i) => i.type === 'Page limit').text, /25 pages/);
});

test('repeated sentences merge and are reported', () => {
  const status = r.requirements.filter((x) => /monthly status report/.test(x.text));
  assert.equal(status.length, 1);
  assert.deepEqual(status[0].also, ['4.3']);
  assert.equal(r.duplicates, 1);
  assert.ok(r.warnings.some((w) => /repeated sentence/.test(w)));
});

test('ids are sequential and counts add up', () => {
  r.requirements.forEach((x, i) => assert.equal(x.id, `REQ-${String(i + 1).padStart(3, '0')}`));
  assert.equal(r.counts.total, r.requirements.length);
  assert.equal(Object.values(r.counts.byStrength).reduce((a, b) => a + b, 0), r.counts.total);
});

test('numbered requirement sentences are not mistaken for headings', () => {
  const x = extract('3.4 The Contractor shall carry insurance.\n3.5 Pricing\n3.6 The system must log in.');
  assert.equal(x.requirements.length, 2);
  assert.deepEqual(x.requirements.map((q) => q.section), ['3.4', '3.6']);
});

test('text without section numbers warns', () => {
  const x = extract('The vendor must respond within 5 days. The vendor shall keep records.');
  assert.equal(x.requirements.length, 2);
  assert.ok(x.warnings.some((w) => /No section numbers/.test(w)));
});

test('no obligations warns instead of returning an empty success', () => {
  const x = extract('Welcome to our county. We are a nice place.');
  assert.equal(x.requirements.length, 0);
  assert.ok(x.warnings.some((w) => /No "shall/.test(w)));
});

test('CSV neutralises spreadsheet formula injection and quotes properly', () => {
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-2'), "'-2");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('plain'), 'plain');
  const evil = extract('1.1 =cmd|calc shall be rejected. The vendor shall comply.');
  const csv = toCsv(evil);
  assert.ok(!/^=/m.test(csv.split('\r\n').slice(1).join('\n')), 'no cell starts with =');
});

test('CSV has the matrix columns, blank owner and Not started status', () => {
  const csv = toCsv(r);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], MATRIX_COLUMNS.join(','));
  assert.match(lines[1], /^REQ-001,/);
  assert.match(lines[1], /,Not started,,$/);
  assert.match(csv, /Instruction type,Section,Text/);
});

test('markdown table escapes pipes', () => {
  const md = toMarkdown(extract('1.1 The vendor shall support a|b formats.'));
  assert.match(md, /a\\\|b/);
});
