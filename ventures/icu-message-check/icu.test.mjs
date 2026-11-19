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
