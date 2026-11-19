import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse, checkMessage, compareMessages, checkCatalogs, readCatalog, localeFromFilename, pluralInfo, format, previewRows, MessageSyntaxError, lineCol } from './icu.mjs';

const codes = (msg, loc) => checkMessage(msg, loc).diagnostics.map((d) => `${d.severity}:${d.code}`);
const fmt = (msg, values, loc = 'en') => format(parse(msg).ast, values, loc);

test('parses arguments, plural with offset and exact selectors, select, and #', () => {
  const { ast } = parse('{who} has {count, plural, offset:1 =0 {nobody} one {# friend} other {# friends}} ({g, select, female {she} other {they}})');
  assert.deepEqual(ast.map((n) => n.type), ['argument', 'literal', 'plural', 'literal', 'select', 'literal']);
  assert.equal(ast[2].offset, 1);
  assert.deepEqual(ast[2].options.map((o) => o.selector), ['=0', 'one', 'other']);
  assert.equal(ast[2].options[1].value[0].type, 'pound');
});

test('apostrophe rules follow ICU DOUBLE_OPTIONAL', () => {
  assert.equal(fmt("I'm here", {}), "I'm here");
  assert.equal(fmt("It''s {x}", { x: 'ok' }), "It's ok");
  assert.equal(fmt("'{x}' is literal", { x: 'no' }), '{x} is literal');
  assert.equal(fmt("'{'{x}'}'", { x: 'v' }), '{v}');
  // '# is only quoting inside a plural sub-message
  assert.equal(fmt("{n, plural, other {'#' is # }}", { n: 3 }), '# is 3 ');
  assert.equal(fmt("A '#' outside", {}), "A '#' outside");
});

test('# belongs to the immediate plural only, as in ICU4J and formatjs', () => {
  assert.equal(fmt('{n, plural, other {{g, select, other {#}} #}}', { n: 2, g: 'x' }), '# 2');
});

test('syntax errors carry an offset and a readable message', () => {
  for (const [msg, re] of [
    ['{n, plural, one {#} other {#}', /Unclosed/],
    ['{n, plural, one {x}}', /no "other"/],
    ['{g, select, a {x} a {y} other {z}}', /Duplicate selector/],
    ['{n, plurl, one {x} other {y}}', /Did you mean "plural"/],
    ['{user.name}', /userName/],
    ['{user-id}', /userId/],
    ['{n, plural, =x {a} other {b}}', /must be "=" followed by a number/],
    ['{g, select, =1 {a} other {b}}', /only valid in plural/],
    ['{n, plural, one {a} offset:1 other {b}}', /must come before/],
    ['{n, choice, 0#none|1#one}', /deprecated ChoiceFormat/],
    ['{01}', /leading zero/],
    ['{}', /Expected an argument name/],
    ['{n, number, }', /Empty style/],
  ]) {
    assert.throws(() => parse(msg), (e) => e instanceof MessageSyntaxError && re.test(e.message) && Number.isInteger(e.offset), msg);
  }
  assert.deepEqual(lineCol('ab\ncd{', 5), { line: 2, col: 3 });
});

test('the apostrophe that swallows a placeholder is an error', () => {
  assert.deepEqual(codes("Supprimer l'{item} ?", 'fr'), ['error:quoted-placeholder']);
  assert.deepEqual(codes("Supprimer l''{item} ?", 'fr'), []);
  assert.deepEqual(codes('Supprimer l’{item} ?', 'fr'), []);
  assert.deepEqual(codes("Use '{ for a brace"), ['warning:unterminated-quote']);
  assert.deepEqual(codes("Use '{' for a brace"), []);
});

test('CLDR plural categories per locale (from Intl.PluralRules)', () => {
  assert.deepEqual(pluralInfo('en').categories, ['one', 'other']);
  assert.deepEqual(pluralInfo('pl').categories, ['one', 'few', 'many', 'other']);
  assert.deepEqual(pluralInfo('ar').categories, ['zero', 'one', 'two', 'few', 'many', 'other']);
  assert.deepEqual(pluralInfo('ja').categories, ['other']);
  assert.deepEqual(pluralInfo('en', 'ordinal').categories, ['one', 'two', 'few', 'other']);
  assert.deepEqual(pluralInfo('pl').examples.few.ints.slice(0, 6), [2, 3, 4, 22, 23, 24]);
});

test('missing and unused plural categories', () => {
  const en = '{n, plural, one {# file} other {# files}}';
  assert.deepEqual(codes(en, 'en'), []);
  assert.deepEqual(codes(en, 'pl'), ['warning:missing-category', 'warning:missing-category']);
  const m = checkMessage(en, 'pl').diagnostics[0].message;
  assert.match(m, /"few".*such as 2, 3, 4, 22, 23, 24/);
  assert.deepEqual(codes(en, 'ja'), ['warning:unused-category']);
  assert.deepEqual(codes('{n, plural, zero {none} one {#} other {#}}', 'en'), ['warning:unused-category']);
  assert.match(checkMessage('{n, plural, zero {none} one {#} other {#}}', 'en').diagnostics[0].fix, /=0/);
  // =1 covers English "one" entirely, so no warning
  assert.deepEqual(codes('{n, plural, =1 {a file} other {# files}}', 'en'), []);
  // =0 and =1 do not cover French "one" for decimals: info only
  assert.deepEqual(codes('{n, plural, =0 {a} =1 {b} many {c} other {d}}', 'fr'), ['info:missing-category-decimal']);
  // Russian "other" is reached only by decimals
  assert.deepEqual(codes('{n, plural, one {a} few {b} many {c} other {d}}', 'ru'), []);
  assert.deepEqual(codes('{n, plural, on {a} other {b}}'), ['error:unknown-category']);
  assert.deepEqual(codes('{n, selectordinal, one {#st} other {#th}}', 'en'), ['warning:missing-category', 'warning:missing-category']);
});

test('a select written with plural keywords is flagged', () => {
  assert.deepEqual(codes('{n, select, one {x} other {y}}'), ['warning:select-looks-plural']);
  assert.deepEqual(codes('{g, select, female {x} other {y}}'), []);
});

test('style typos', () => {
  assert.deepEqual(codes('{p, number, percnt}'), ['warning:number-style']);
  assert.deepEqual(codes('{p, number, ::percent}'), []);
  assert.deepEqual(codes('{p, number, #,##0.00}'), []);
  assert.deepEqual(codes('{d, date, shrt}'), ['warning:date-style']);
  assert.deepEqual(codes('{d, date, yyyy-MM-dd}'), []);
});

test('source vs translation: missing, extra, kind and select keys', () => {
  const c = (a, b) => compareMessages(parse(a).ast, parse(b).ast).map((d) => d.code);
  assert.deepEqual(c('Hi {name}', 'Bonjour'), ['missing-argument']);
  assert.deepEqual(c('Hi {name}', 'Bonjour {nom}'), ['missing-argument', 'extra-argument']);
  assert.deepEqual(c('{n, plural, one {#} other {#}}', '{n} fichiers'), ['argument-kind']);
  assert.deepEqual(c('{g, select, female {a} male {b} other {c}}', '{g, select, female {a} other {c}}'), ['select-missing-key']);
  assert.deepEqual(c('{g, select, female {a} other {c}}', '{g, select, female {a} neuter {n} other {c}}'), ['select-extra-key']);
  assert.deepEqual(c('{n, plural, one {#} other {#}}', '{n, plural, one {#} few {#} many {#} other {#}}'), []);
});

test('formatting matches ICU semantics for plural, offset, exact match and select', () => {
  const m = '{count, plural, offset:1 =0 {nobody} =1 {{who}} one {{who} and # other} other {{who} and # others}}';
  assert.equal(fmt(m, { count: 0, who: 'Ana' }), 'nobody');
  assert.equal(fmt(m, { count: 1, who: 'Ana' }), 'Ana');
  assert.equal(fmt(m, { count: 2, who: 'Ana' }), 'Ana and 1 other');
  assert.equal(fmt(m, { count: 5, who: 'Ana' }), 'Ana and 4 others');
  assert.equal(fmt('{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}', { n: 22 }), '22nd');
  assert.equal(fmt('{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}', { n: 22 }, 'pl'), '22 pliki');
  assert.equal(fmt('{n, number, percent}', { n: 0.25 }), '25%');
  assert.equal(fmt('{n}', { n: 1234.5 }, 'de'), '1.234,5');
  assert.throws(() => fmt('{x}', {}), /No value for \{x\}/);
});

test('preview rows show one example per category the locale uses', () => {
  const { rows } = previewRows(parse('{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}').ast, 'pl');
  assert.deepEqual(rows.map((r) => [r.value, r.text]), [[1, '1 plik'], [2, '2 pliki'], [0, '0 plików'], [0.1, '0,1 pliku']]);
});

test('locale from file name', () => {
  assert.equal(localeFromFilename('fr.json'), 'fr');
  assert.equal(localeFromFilename('locales/pt-BR.json'), 'pt-BR');
  assert.equal(localeFromFilename('lib/l10n/app_pl.arb'), 'pl');
  assert.equal(localeFromFilename('intl_en_US.arb'), 'en-US');
  assert.equal(localeFromFilename('messages.de.json'), 'de');
  assert.equal(localeFromFilename('zh_Hant.json'), 'zh-Hant');
  assert.equal(localeFromFilename('messages.json'), null);
});

test('reads flat, nested, formatjs-extracted and ARB catalogues', () => {
  assert.deepEqual(readCatalog('{"a":"x","b":{"c":"y"}}', 'en.json').messages, [{ key: 'a', message: 'x' }, { key: 'b.c', message: 'y' }]);
  assert.deepEqual(readCatalog('{"k":{"defaultMessage":"Hi {n}","description":"d"}}', 'x.json').messages, [{ key: 'k', message: 'Hi {n}' }]);
  const arb = readCatalog('{"@@locale":"pl","files":"{n, plural, other {#}}","@files":{"placeholders":{"n":{}}}}', 'app.arb');
  assert.equal(arb.locale, 'pl');
  assert.deepEqual(arb.messages.map((m) => m.key), ['files']);
  assert.throws(() => readCatalog('{', 'bad.json'), /not valid JSON/);
});

test('checkCatalogs end to end', () => {
  const r = checkCatalogs([
    { name: 'en.json', text: JSON.stringify({ files: '{n, plural, one {# file} other {# files}}', hi: 'Hi {name}', del: 'Delete {item}?', gone: 'x' }) },
    { name: 'pl.json', text: JSON.stringify({ files: '{n, plural, one {# plik} other {# pliki}}', hi: 'Cześć', del: 'Usuń {item}?' }) },
    { name: 'fr.json', text: JSON.stringify({ files: '{n, plural, one {# fichier} many {# fichiers} other {# fichiers}}', hi: 'Salut {name}', del: "Supprimer l'{item} ?", gone: 'x', extra: 'y' }) },
  ]);
  assert.equal(r.source, 'en.json');
  const by = Object.fromEntries(r.files.map((f) => [f.name, f]));
  assert.deepEqual(by['pl.json'].messages.map((m) => [m.key, m.diagnostics.map((d) => d.code)]), [['files', ['missing-category', 'missing-category']], ['hi', ['missing-argument']]]);
  assert.deepEqual(by['pl.json'].missingKeys, ['gone']);
  assert.deepEqual(by['fr.json'].messages.map((m) => [m.key, m.diagnostics.map((d) => d.code)]), [['del', ['quoted-placeholder', 'missing-argument']], ['extra', ['not-in-source']]]);
  assert.equal(r.errors, 3);
});

test('offset with no space before the first selector, as ICU reads it', () => {
  const { ast } = parse('{n, plural, offset:1=0 {none} other {# more}}');
  assert.equal(ast[0].offset, 1);
  assert.deepEqual(ast[0].options.map((o) => o.selector), ['=0', 'other']);
  assert.throws(() => parse('{n, plural, offset:x other {a}}'), /whole number/);
});

test('style text balances braces and honours quotes, as ICU4J does', () => {
  assert.throws(() => parse('{n, number, {}'), /Unclosed/);
  assert.equal(parse("{n, number, '{'#}").ast[0].style, "'{'#");
});

// --- red-team 2026-11-19: guards for faults the suite let through ----------

test('missing-category examples count the offset (ICU picks the category from n - offset)', () => {
  // n = 2 selects "one" (2 - 1 = 1); =1 covers only n = 1, so n = 2 shows "you and 1 others".
  const d = checkMessage('{n, plural, offset:1 =1 {just you} other {you and # others}}', 'en').diagnostics;
  const miss = d.find((x) => x.code === 'missing-category');
  assert.ok(miss, JSON.stringify(d));
  assert.match(miss.message, /numbers such as 2 will show/);
  assert.equal(fmt('{n, plural, offset:1 =1 {just you} other {you and # others}}', { n: 2 }), 'you and 1 others');
  // =2 covers the one reachable "one" number, so nothing to warn about.
  assert.deepEqual(codes('{n, plural, offset:1 =1 {just you} =2 {you and one other} other {you and # others}}', 'en'), []);
  // Without an offset, =1 still covers "one" in English.
  assert.deepEqual(codes('{n, plural, =1 {just you} other {# people}}', 'en'), []);
  // Decimal-only categories shift too: fr "one" with =1 and =2 under offset:1 is reached by 1.1, 1.2…
  const fr = checkMessage('{n, plural, offset:1 =1 {a} =2 {b} other {c}}', 'fr').diagnostics.find((x) => x.code === 'missing-category-decimal');
  assert.match(fr.message, /decimals like 1\.1, 1\.2, 1\.3/);
});

test('any whole-number offset parses, not only 0 and 1', () => {
  const { ast } = parse('{n, plural, offset:25 other {#}}');
  assert.equal(ast[0].offset, 25);
  assert.equal(fmt('{n, plural, offset:2 other {# more}}', { n: 5 }), '3 more');
});

test('exact selectors are duplicates by numeric value (=1, =01, =1.0)', () => {
  assert.throws(() => parse('{n, plural, =1 {a} =01 {b} other {c}}'), /Duplicate selector "=01"/);
  assert.throws(() => parse('{n, plural, =1 {a} =1.0 {b} other {c}}'), /Duplicate selector "=1.0"/);
});

test('diagnostics name selectordinal vs plural correctly', () => {
  const ord = checkMessage('{n, selectordinal, onr {a} other {b}}', 'en').diagnostics.find((d) => d.code === 'unknown-category');
  assert.match(ord.message, /\{n, selectordinal\}/);
  assert.match(ord.fix, /Did you mean "one"/);
  const card = checkMessage('{n, plural, onr {a} other {b}}', 'en').diagnostics.find((d) => d.code === 'unknown-category');
  assert.match(card.message, /\{n, plural\}/);
});

test('typo suggestions use real edit distance', async () => {
  const { nearest } = await import('./icu.mjs');
  assert.equal(nearest('onr', ['zero', 'one', 'two', 'few', 'many', 'other']), 'one');
  assert.equal(nearest('fewr', ['zero', 'one', 'two', 'few', 'many', 'other']), 'few');
  assert.equal(nearest('xyzzy', ['one', 'other']), null);
  assert.equal(nearest('abc', ['abd', 'xyz']), 'abd');
  // A one-letter word is far from 'one' and 'other' (3 and 5 edits), not a match.
  assert.equal(nearest('x', ['one', 'other']), null);
  assert.equal(nearest('o', ['zero', 'one']), 'one');
});

test('argument-format info only when both sides format the value differently', () => {
  const kinds = (s, t) => compareMessages(parse(s).ast, parse(t).ast).map((d) => d.code);
  assert.deepEqual(kinds('{n, number}', '{n, date}'), ['argument-format']);
  assert.deepEqual(kinds('{n, number}', '{n}'), []);
  assert.deepEqual(kinds('{n}', '{n, number}'), []);
});

test('date arguments format as dates, time arguments as times', () => {
  const d = new Date(Date.UTC(2026, 0, 15, 14, 30));
  const date = fmt('{d, date, long}', { d }, 'en');
  assert.match(date, /January 1[45], 2026/);
  assert.doesNotMatch(date, /\d:\d\d/);
  assert.match(fmt('{d, time, short}', { d }, 'en'), /\d:30/);
});

test('preview picks the first real select option, and offsets shift decimal samples', () => {
  const sel = previewRows(parse('{g, select, female {She} male {He} other {They}} replied').ast, 'en');
  assert.equal(sel.rows[0].text, 'She replied');
  const fr = previewRows(parse('{n, plural, offset:1 =1 {a} =2 {b} one {c} other {d}}').ast, 'fr');
  const dec = fr.rows.find((r) => r.category === '"one" (decimals)');
  assert.equal(dec.value, 1.1);
  assert.equal(dec.text, 'c');
});
