// ICU MessageFormat checker: a parser, a linter that knows each locale's CLDR
// plural categories, a source-vs-translation comparison, and a small
// formatter for previews. No dependencies; runs in browsers and Node 20+.
//
// The grammar is ICU's MessageFormat as ICU4J/ICU4C parse it
// (com.ibm.icu.text.MessagePattern, ApostropheMode.DOUBLE_OPTIONAL, the
// default), written from the ICU user guide and API documentation:
//   https://unicode-org.github.io/icu/userguide/format_parse/messages/
//   https://unicode-org.github.io/icu-docs/apidoc/released/icu4j/com/ibm/icu/text/MessagePattern.html
// Plural categories come from the runtime's own CLDR data via
// Intl.PluralRules, so the checker is exactly as current as the browser or
// Node build running it. Original code, MIT.

export const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const SIMPLE_TYPES = ['number', 'date', 'time', 'spellout', 'ordinal', 'duration'];
const COMPLEX_TYPES = ['plural', 'selectordinal', 'select'];
const ALL_TYPES = [...SIMPLE_TYPES, ...COMPLEX_TYPES];
const NUMBER_STYLES = ['integer', 'currency', 'percent'];
const DATE_STYLES = ['short', 'medium', 'long', 'full'];

export class MessageSyntaxError extends Error {
  constructor(message, offset) {
    super(message);
    this.name = 'MessageSyntaxError';
    this.offset = offset;
  }
}

// Pattern_White_Space and the ASCII Pattern_Syntax characters. ICU argument
// names and plural/select keywords may contain neither (MessagePattern's
// "pattern identifier"); non-ASCII Pattern_Syntax (arrows, maths symbols) is
// matched with the Unicode property.
const WS = /[\t\n\u000B\f\r \u0085\u200E\u200F\u2028\u2029]/;
const SYNTAX = /[!-/:-@[-^`{-~]|\p{Pattern_Syntax}/u;

function levenshtein(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

export function nearest(word, choices, max = 2) {
  let best = null;
  let bestD = max + 1;
  for (const c of choices) {
    const dist = levenshtein(word.toLowerCase(), c);
    if (dist < bestD) { best = c; bestD = dist; }
  }
  return best;
}

/**
 * Parse one message. Returns { ast, notes } where notes are non-fatal
 * observations made while parsing (quoted placeholders, stray braces,
 * unterminated quotes). Throws MessageSyntaxError on text ICU rejects.
 */
export function parse(source) {
  const s = String(source);
  const notes = [];
  let i = 0;

  const skipWs = () => { while (i < s.length && WS.test(s[i])) i++; };

  function readToken(stopAt) {
    const start = i;
    while (i < s.length && !WS.test(s[i]) && !stopAt.includes(s[i])) i++;
    return s.slice(start, i);
  }

  function checkIdentifier(name, start, what) {
    for (const ch of name) {
      if (SYNTAX.test(ch)) {
        const hint = /[.\-]/.test(ch)
          ? ` ICU names cannot contain "${ch}"; use a name like ${JSON.stringify(name.replace(/[.\-]+(.)/g, (_, c) => c.toUpperCase()))}.`
          : '';
        throw new MessageSyntaxError(`${what} "${name}" contains "${ch}", which ICU MessageFormat does not allow in names.${hint}`, start);
      }
    }
  }

  function parseMessage(depth, inPlural, openAt) {
    const nodes = [];
    let text = '';
    let textStart = i;
    const flush = () => {
      if (text) nodes.push({ type: 'literal', value: text, start: textStart, end: i });
      text = '';
      textStart = i;
    };
    while (true) {
      if (i >= s.length) {
        if (depth > 0) throw new MessageSyntaxError('Unclosed "{": a sub-message or argument is never closed with "}".', openAt);
        break;
      }
      const c = s[i];
      if (c === "'") {
        const next = s[i + 1];
        if (next === "'") { text += "'"; i += 2; continue; }
        if (next === '{' || next === '}' || (next === '#' && inPlural)) {
          const qStart = i;
          i++;
          let quoted = '';
          let closed = false;
          while (i < s.length) {
            if (s[i] === "'") {
              if (s[i + 1] === "'") { quoted += "'"; i += 2; continue; }
              i++;
              closed = true;
              break;
            }
            quoted += s[i++];
          }
          text += quoted;
          if (/\{\s*[^\s{},']+\s*[,}]/.test(quoted)) {
            notes.push({ code: 'quoted-placeholder', offset: qStart, text: quoted });
          } else if (!closed) {
            notes.push({ code: 'unterminated-quote', offset: qStart, text: quoted });
          }
          continue;
        }
        text += "'";
        i++;
        continue;
      }
      if (c === '{') {
        flush();
        nodes.push(parseArgument(depth, inPlural));
        textStart = i;
        continue;
      }
      if (c === '}') {
        if (depth > 0) break;
        notes.push({ code: 'stray-close', offset: i });
        text += c;
        i++;
        continue;
      }
      if (c === '#' && inPlural) {
        flush();
        nodes.push({ type: 'pound', start: i, end: i + 1 });
        i++;
        textStart = i;
        continue;
      }
      if (c === '#' && depth === 0) notes.push({ code: 'literal-pound', offset: i });
      text += c;
      i++;
    }
    flush();
    return nodes;
  }

  function parseArgument(depth, inPlural) {
    const open = i;
    i++;
    skipWs();
    const nameStart = i;
    const name = readToken('{},');
    if (!name) throw new MessageSyntaxError('Expected an argument name after "{".', open);
    if (/^[0-9]+$/.test(name)) {
      if (name.length > 1 && name[0] === '0') throw new MessageSyntaxError(`Argument number "${name}" has a leading zero.`, nameStart);
    } else {
      checkIdentifier(name, nameStart, 'Argument name');
    }
    skipWs();
    if (s[i] === '}') { i++; return { type: 'argument', name, argType: null, style: null, start: open, end: i }; }
    if (s[i] !== ',') {
      if (i >= s.length) throw new MessageSyntaxError(`Unclosed "{" after argument "${name}".`, open);
      throw new MessageSyntaxError(`Expected "," or "}" after argument name "${name}", found "${s[i]}".`, i);
    }
    i++;
    skipWs();
    const typeStart = i;
    const argType = readToken('{},');
    if (!argType) throw new MessageSyntaxError(`Expected an argument type (number, date, plural, select…) after "${name},".`, typeStart);
    if (argType === 'choice') {
      throw new MessageSyntaxError('"choice" is the deprecated ChoiceFormat syntax; this checker does not parse it. Rewrite it as a plural or select.', typeStart);
    }
    if (!ALL_TYPES.includes(argType)) {
      const near = nearest(argType, ALL_TYPES);
      throw new MessageSyntaxError(`Unknown argument type "${argType}".${near ? ` Did you mean "${near}"?` : ` Expected one of ${ALL_TYPES.join(', ')}.`}`, typeStart);
    }
    skipWs();
    if (SIMPLE_TYPES.includes(argType)) {
      if (s[i] === '}') { i++; return { type: 'argument', name, argType, style: null, start: open, end: i }; }
      if (s[i] !== ',') throw new MessageSyntaxError(`Expected "," or "}" after "${name}, ${argType}".`, i);
      i++;
      const styleStart = i;
      let nest = 0;
      while (i < s.length) {
        const ch = s[i];
        if (ch === "'") {
          const close = s.indexOf("'", i + 1);
          if (close < 0) throw new MessageSyntaxError('Unterminated quote in an argument style.', i);
          i = close + 1;
          continue;
        }
        if (ch === '{') nest++;
        else if (ch === '}') { if (nest === 0) break; nest--; }
        i++;
      }
      if (i >= s.length) throw new MessageSyntaxError(`Unclosed "{" in the style of "${name}".`, open);
      const style = s.slice(styleStart, i).trim();
      if (!style) throw new MessageSyntaxError(`Empty style after "${name}, ${argType},".`, styleStart);
      i++;
      return { type: 'argument', name, argType, style, start: open, end: i, styleStart };
    }
    // plural, selectordinal, select
    if (s[i] !== ',') throw new MessageSyntaxError(`"${name}, ${argType}" needs options: {${name}, ${argType}, ${argType === 'select' ? 'male {…} ' : 'one {…} '}other {…}}.`, i);
    i++;
    skipWs();
    let offset = 0;
    const isPlural = argType !== 'select';
    if (isPlural && s.startsWith('offset:', i)) {
      i += 7;
      skipWs();
      const offStart = i;
      // ICU reads the number only (MessagePattern skips digits), so
      // "offset:1=0 {…}" is an offset of 1 followed by the selector =0.
      while (i < s.length && /[0-9]/.test(s[i])) i++;
      const tok = i > offStart ? s.slice(offStart, i) : readToken('{}');
      if (!/^[0-9]+$/.test(tok)) throw new MessageSyntaxError(`Plural offset must be a whole number, found "${tok}".`, offStart);
      offset = Number(tok);
      skipWs();
    }
    const options = [];
    const seen = new Set();
    while (true) {
      skipWs();
      if (i >= s.length) throw new MessageSyntaxError(`Unclosed "{" in "${name}, ${argType}".`, open);
      if (s[i] === '}') { i++; break; }
      const selStart = i;
      const selector = readToken('{}');
      if (!selector) throw new MessageSyntaxError(`Expected a selector (like "other") in "${name}, ${argType}", found "${s[i]}".`, i);
      if (selector[0] === '=') {
        if (!isPlural) throw new MessageSyntaxError(`Exact selector "${selector}" is only valid in plural or selectordinal, not select.`, selStart);
        if (!/^=-?[0-9]+(\.[0-9]+)?$/.test(selector)) throw new MessageSyntaxError(`Exact selector "${selector}" must be "=" followed by a number, like =0.`, selStart);
      } else if (selector === 'offset:' || selector.startsWith('offset:')) {
        throw new MessageSyntaxError('"offset:" must come before the first selector.', selStart);
      } else {
        checkIdentifier(selector, selStart, 'Selector');
      }
      skipWs();
      if (s[i] !== '{') throw new MessageSyntaxError(`Expected "{" after selector "${selector}".`, i);
      const subOpen = i;
      i++;
      const value = parseMessage(depth + 1, isPlural, subOpen);
      if (s[i] !== '}') throw new MessageSyntaxError(`Unclosed "{" after selector "${selector}".`, subOpen);
      i++;
      const key = selector[0] === '=' ? `=${Number(selector.slice(1))}` : selector;
      if (seen.has(key)) throw new MessageSyntaxError(`Duplicate selector "${selector}" in "${name}, ${argType}".`, selStart);
      seen.add(key);
      options.push({ selector, value, start: selStart, end: i });
    }
    if (!options.length) throw new MessageSyntaxError(`"${name}, ${argType}" has no options.`, open);
    if (!seen.has('other')) throw new MessageSyntaxError(`"${name}, ${argType}" has no "other" option; ICU requires one as the fallback.`, open);
    const node = argType === 'select'
      ? { type: 'select', name, options, start: open, end: i }
      : { type: 'plural', name, pluralType: argType === 'plural' ? 'cardinal' : 'ordinal', offset, options, start: open, end: i };
    return node;
  }

  const ast = parseMessage(0, false, 0);
  return { ast, notes };
}

export function lineCol(source, offset) {
  const before = String(source).slice(0, offset);
  const line = before.split('\n').length;
  return { line, col: offset - before.lastIndexOf('\n') };
}

// --- locales and plural categories --------------------------------------

export function canonicalLocale(tag) {
  if (!tag) return null;
  try {
    const [loc] = Intl.getCanonicalLocales(String(tag).replace(/_/g, '-'));
    if (!loc || !/^[a-z]{2,3}(-|$)/i.test(loc)) return null;
    if (!Intl.PluralRules.supportedLocalesOf([loc]).length) return null;
    return loc;
  } catch {
    return null;
  }
}

/** Guess a locale from a file name: fr.json, pt-BR.json, app_pl.arb, messages.de.json, intl_en_US.arb. */
export function localeFromFilename(filename) {
  const base = String(filename).split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  const parts = base.split(/[._]/).filter(Boolean);
  const candidates = [base];
  if (parts.length >= 2) candidates.push(parts.slice(-2).join('-'));
  if (parts.length >= 1) candidates.push(parts[parts.length - 1]);
  for (const c of candidates) {
    if (!/^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})*$/i.test(c)) continue;
    const loc = canonicalLocale(c);
    if (loc) return loc;
  }
  return null;
}

const categoryCache = new Map();

/**
 * The plural categories a locale uses, with example numbers from probing the
 * runtime's CLDR rules: integers 0..1000 and a few large round numbers,
 * plus decimals with one visible fraction digit, 0.1..9.9, skipping x.0
 * (a JS number 1.0 is the integer 1; cardinal only).
 */
export function pluralInfo(locale, type = 'cardinal') {
  const key = `${locale}|${type}`;
  if (categoryCache.has(key)) return categoryCache.get(key);
  const pr = new Intl.PluralRules(locale, { type });
  const categories = pr.resolvedOptions().pluralCategories.slice()
    .sort((a, b) => PLURAL_CATEGORIES.indexOf(a) - PLURAL_CATEGORIES.indexOf(b));
  const examples = Object.fromEntries(categories.map((c) => [c, { ints: [], decs: [] }]));
  const ints = [];
  for (let n = 0; n <= 1000; n++) ints.push(n);
  ints.push(10000, 100000, 1000000, 2000000);
  for (const n of ints) examples[pr.select(n)]?.ints.push(n);
  if (type === 'cardinal') {
    const prDec = new Intl.PluralRules(locale, { type, minimumFractionDigits: 1, maximumFractionDigits: 1 });
    for (let k = 0; k <= 100; k++) if (k % 10) examples[prDec.select(k / 10)]?.decs.push((k / 10).toFixed(1));
  }
  const info = { locale, type, categories, examples };
  categoryCache.set(key, info);
  return info;
}

function describeExamples(ex, max = 6) {
  const shown = ex.ints.slice(0, max).map(String);
  return shown.join(', ') + (ex.ints.length > max ? '…' : '');
}

// --- walking ---------------------------------------------------------------

function walk(nodes, fn, path = []) {
  for (const n of nodes) {
    fn(n, path);
    if (n.type === 'plural' || n.type === 'select') {
      for (const o of n.options) walk(o.value, fn, [...path, { node: n, option: o }]);
    }
  }
}

/** Every argument a message uses: name -> Set of kinds (text, number, date, plural, select…). */
export function argumentsOf(ast) {
  const args = new Map();
  walk(ast, (n) => {
    let kind = null;
    if (n.type === 'argument') kind = n.argType || 'text';
    else if (n.type === 'plural') kind = n.pluralType === 'cardinal' ? 'plural' : 'selectordinal';
    else if (n.type === 'select') kind = 'select';
    if (!kind) return;
    if (!args.has(n.name)) args.set(n.name, new Set());
    args.get(n.name).add(kind);
  });
  return args;
}

// --- linting -----------------------------------------------------------------

const NOTE_TEXT = {
  'quoted-placeholder': (n) => ({
    severity: 'error',
    message: `An apostrophe before "{" starts quoted literal text, so "${n.text.length > 40 ? `${n.text.slice(0, 40)}…` : n.text}" is printed as-is and the placeholder inside it is never filled in.`,
    fix: 'For an apostrophe next to a placeholder write two, as in l\'\'{item}, or use the typographic apostrophe ’ (U+2019), which needs no escaping.',
  }),
  'unterminated-quote': () => ({
    severity: 'warning',
    message: 'A quote opened with an apostrophe is never closed, so everything after it to the end of the message is literal text.',
    fix: 'Close the quote with a second apostrophe, or write \'\' for a literal apostrophe.',
  }),
  'stray-close': () => ({
    severity: 'warning',
    message: 'A "}" with no matching "{". ICU and formatjs print it as text, so it is harmless if you meant the character, but it is usually a sign of a missing "{".',
    fix: 'Quote it as \'}\' if you mean the character, or find the missing "{".',
  }),
  'literal-pound': () => ({
    severity: 'info',
    message: '"#" outside a plural is plain text; it only stands for the number inside a plural or selectordinal option.',
    fix: null,
  }),
};

/**
 * Lint one message. `locale` (optional) turns on the CLDR plural-category
 * checks. Returns { ok, ast, diagnostics[] } with severity error|warning|info.
 */
export function checkMessage(source, locale = null) {
  const diagnostics = [];
  let parsed;
  try {
    parsed = parse(source);
  } catch (e) {
    if (!(e instanceof MessageSyntaxError)) throw e;
    diagnostics.push({ severity: 'error', code: 'syntax', message: e.message, offset: e.offset, fix: null });
    return { ok: false, ast: null, diagnostics };
  }
  const { ast, notes } = parsed;
  for (const n of notes) if (Object.hasOwn(NOTE_TEXT, n.code)) diagnostics.push({ code: n.code, offset: n.offset, ...NOTE_TEXT[n.code](n) });
  const loc = locale ? canonicalLocale(locale) : null;

  walk(ast, (n) => {
    if (n.type === 'argument' && n.style) {
      const st = n.style;
      if (n.argType === 'number' && !NUMBER_STYLES.includes(st) && !st.startsWith('::') && !/[#0@%‰¤.,;E']/.test(st)) {
        const near = nearest(st, NUMBER_STYLES);
        diagnostics.push({ severity: 'warning', code: 'number-style', offset: n.styleStart,
          message: `"${st}" is not a number style ICU knows (integer, currency, percent, a ::skeleton or a pattern); ICU will try to read it as a pattern and may fail.`,
          fix: near ? `Did you mean "${near}"?` : null });
      }
      // A date pattern is letters too (yyyyMMdd), so only a near miss of a
      // style name is reported.
      if ((n.argType === 'date' || n.argType === 'time') && !DATE_STYLES.includes(st) && /^[a-z]+$/i.test(st) && nearest(st, DATE_STYLES)) {
        diagnostics.push({ severity: 'warning', code: 'date-style', offset: n.styleStart,
          message: `"${st}" is not a ${n.argType} style ICU knows (short, medium, long, full, a ::skeleton or a pattern); as a pattern its letters would be read as date fields.`,
          fix: `Did you mean "${nearest(st, DATE_STYLES)}"?` });
      }
    }
    if (n.type === 'select') {
      for (const o of n.options) {
        if (PLURAL_CATEGORIES.includes(o.selector) && o.selector !== 'other' && n.options.every((x) => PLURAL_CATEGORIES.includes(x.selector))) {
          diagnostics.push({ severity: 'warning', code: 'select-looks-plural', offset: n.start,
            message: `"${n.name}" is a select, but its options (${n.options.map((x) => x.selector).join(', ')}) are plural categories. A select compares the value as a string, so a count of 1 never matches "one".`,
            fix: `Write {${n.name}, plural, …} instead of {${n.name}, select, …}.` });
          break;
        }
      }
    }
    if (n.type !== 'plural') return;
    const what = n.pluralType === 'cardinal' ? 'plural' : 'selectordinal';
    const keywords = n.options.filter((o) => o.selector[0] !== '=');
    const exact = new Set(n.options.filter((o) => o.selector[0] === '=').map((o) => Number(o.selector.slice(1))));
    for (const o of keywords) {
      if (!PLURAL_CATEGORIES.includes(o.selector)) {
        const near = nearest(o.selector, PLURAL_CATEGORIES);
        diagnostics.push({ severity: 'error', code: 'unknown-category', offset: o.start,
          message: `"${o.selector}" in {${n.name}, ${what}} is not a plural category, so it never matches. The categories are zero, one, two, few, many and other.`,
          fix: near ? `Did you mean "${near}"?` : (/^[0-9]+$/.test(o.selector) ? `For an exact number write "=${o.selector}".` : null) });
      }
    }
    if (!loc) return;
    const info = pluralInfo(loc, n.pluralType);
    for (const o of keywords) {
      if (PLURAL_CATEGORIES.includes(o.selector) && !info.categories.includes(o.selector)) {
        const zeroHint = o.selector === 'zero' ? ` In ${loc}, 0 takes "${new Intl.PluralRules(loc, { type: n.pluralType }).select(0)}". For a special text at exactly zero write "=0".` : '';
        diagnostics.push({ severity: 'warning', code: 'unused-category', offset: o.start,
          message: `"${o.selector}" in {${n.name}, ${what}} is never selected in ${loc}, which uses only ${info.categories.join(', ')}.${zeroHint}`,
          fix: o.selector === 'zero' ? 'Change "zero" to "=0".' : `Remove "${o.selector}", or check the file's locale.` });
      }
    }
    const have = new Set(keywords.map((o) => o.selector));
    for (const c of info.categories) {
      if (have.has(c)) continue;
      const ex = info.examples[c];
      // ICU picks the keyword from n - offset but compares exact selectors
      // with n itself, so the numbers a reader types are the examples + offset.
      const uncoveredInts = ex.ints.map((x) => x + n.offset).filter((x) => !exact.has(x));
      const decs = ex.decs.map((x) => (Number(x) + n.offset).toFixed(1));
      const hasDecs = decs.length > 0;
      if (!uncoveredInts.length && !hasDecs) continue;
      if (!uncoveredInts.length) {
        diagnostics.push({ severity: 'info', code: 'missing-category-decimal', offset: n.start,
          message: `{${n.name}, ${what}} has no "${c}" option. In ${loc} that category is reached only by decimals like ${decs.slice(0, 3).join(', ')}, which will use "other".`,
          fix: null });
        continue;
      }
      diagnostics.push({ severity: 'warning', code: 'missing-category', offset: n.start,
        message: `{${n.name}, ${what}} has no "${c}" option, so in ${loc} numbers such as ${describeExamples({ ints: uncoveredInts })} will show the "other" text.`,
        fix: `Add a ${c} {…} option. ${loc} uses ${info.categories.join(', ')}${n.pluralType === 'ordinal' ? ' for ordinals' : ''}.` });
    }
  });
  return { ok: !diagnostics.some((d) => d.severity === 'error'), ast, diagnostics };
}

function selectKeys(ast) {
  const keys = new Map();
  walk(ast, (n) => {
    if (n.type !== 'select') return;
    if (!keys.has(n.name)) keys.set(n.name, new Set());
    for (const o of n.options) keys.get(n.name).add(o.selector);
  });
  return keys;
}

const KIND_LABEL = { text: '{x}', number: '{x, number}', date: '{x, date}', time: '{x, time}', plural: '{x, plural}', selectordinal: '{x, selectordinal}', select: '{x, select}', spellout: '{x, spellout}', ordinal: '{x, ordinal}', duration: '{x, duration}' };
const label = (name, kind) => KIND_LABEL[kind].replace('x', name);

/** Compare a translation's arguments and select keys with its source message (both parsed). */
export function compareMessages(sourceAst, translationAst) {
  const diagnostics = [];
  const src = argumentsOf(sourceAst);
  const tr = argumentsOf(translationAst);
  for (const [name, kinds] of src) {
    if (!tr.has(name)) {
      diagnostics.push({ severity: 'error', code: 'missing-argument', message: `The translation never uses {${name}}, so that value is lost.`, fix: `Add {${name}} (as ${[...kinds].map((k) => label(name, k)).join(' or ')}).` });
      continue;
    }
    const tk = tr.get(name);
    for (const k of kinds) {
      if (tk.has(k)) continue;
      if ((k === 'plural' || k === 'selectordinal' || k === 'select') || [...tk].some((x) => x === 'plural' || x === 'selectordinal' || x === 'select')) {
        diagnostics.push({ severity: 'warning', code: 'argument-kind', message: `The source uses ${label(name, k)} but the translation uses ${[...tk].map((x) => label(name, x)).join(' and ')}.`, fix: null });
      } else if (k !== 'text' && !tk.has('text')) {
        diagnostics.push({ severity: 'info', code: 'argument-format', message: `The source formats ${label(name, k)}; the translation formats it as ${[...tk].map((x) => label(name, x)).join(' and ')}.`, fix: null });
      }
    }
  }
  for (const name of tr.keys()) {
    if (!src.has(name)) {
      const near = nearest(name, [...src.keys()].map((x) => x.toLowerCase()), 3);
      const orig = near ? [...src.keys()].find((x) => x.toLowerCase() === near) : null;
      diagnostics.push({ severity: 'error', code: 'extra-argument', message: `The translation uses {${name}}, which the source does not have; the app will not pass it, and most libraries throw or print it raw.`, fix: orig ? `Did you mean {${orig}}?` : null });
    }
  }
  const sk = selectKeys(sourceAst);
  const tkeys = selectKeys(translationAst);
  for (const [name, keys] of sk) {
    const t = tkeys.get(name);
    if (!t) continue;
    const missing = [...keys].filter((k) => !t.has(k));
    const extra = [...t].filter((k) => !keys.has(k));
    if (missing.length) diagnostics.push({ severity: 'warning', code: 'select-missing-key', message: `{${name}, select} in the translation has no ${missing.map((k) => `"${k}"`).join(', ')} option${missing.length > 1 ? 's' : ''}; those values will show the "other" text.`, fix: null });
    if (extra.length) diagnostics.push({ severity: 'warning', code: 'select-extra-key', message: `{${name}, select} in the translation has ${extra.map((k) => `"${k}"`).join(', ')}, which the source does not; check the app ever passes ${extra.length > 1 ? 'those values' : 'that value'}.`, fix: null });
  }
  return diagnostics;
}

// --- catalogues ---------------------------------------------------------------

/**
 * Read a translation file. JSON objects (flat or nested), formatjs extracted
 * files ({ key: { defaultMessage } }), compiled-style { key: { message } } and
 * Flutter ARB (keys starting with "@" are metadata; "@@locale" names the
 * locale). Returns { locale, messages: [{ key, message }], skipped }.
 */
export function readCatalog(text, filename = '') {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`${filename || 'The file'} is not valid JSON: ${e.message}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${filename || 'The file'} must be a JSON object of message keys.`);
  const messages = [];
  let skipped = 0;
  let locale = null;
  if (typeof data['@@locale'] === 'string') locale = canonicalLocale(data['@@locale']);
  const visit = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@')) continue;
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'string') messages.push({ key, message: v });
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        const leaf = ['defaultMessage', 'message', 'translation', 'string'].find((f) => typeof v[f] === 'string');
        if (leaf) messages.push({ key, message: v[leaf] });
        else visit(v, key);
      } else skipped++;
    }
  };
  visit(data, '');
  return { locale: locale || localeFromFilename(filename), messages, skipped };
}

/**
 * Check a set of catalogues. `files` is [{ name, text, locale? }];
 * `sourceName` names the source-language file (default: the first).
 */
export function checkCatalogs(files, sourceName = null) {
  const cats = files.map((f) => {
    try {
      const c = readCatalog(f.text, f.name);
      return { name: f.name, locale: canonicalLocale(f.locale) || c.locale, messages: c.messages, skipped: c.skipped, error: null };
    } catch (e) {
      return { name: f.name, locale: canonicalLocale(f.locale) || null, messages: [], skipped: 0, error: e.message };
    }
  });
  const source = cats.find((c) => c.name === sourceName) || cats[0];
  const srcMap = new Map();
  const results = [];
  for (const cat of [source, ...cats.filter((c) => c !== source)]) {
    const entry = { name: cat.name, locale: cat.locale, isSource: cat === source, error: cat.error, skipped: cat.skipped, total: cat.messages.length, messages: [] };
    results.push(entry);
    const seen = new Set();
    for (const { key, message } of cat.messages) {
      seen.add(key);
      const r = checkMessage(message, cat.locale);
      const diags = r.diagnostics.slice();
      if (cat === source) srcMap.set(key, r.ast);
      else {
        const srcAst = srcMap.get(key);
        if (srcMap.has(key) && srcAst && r.ast) diags.push(...compareMessages(srcAst, r.ast));
        else if (!srcMap.has(key)) diags.push({ severity: 'info', code: 'not-in-source', message: 'This key is not in the source file.', fix: null });
      }
      if (diags.length) entry.messages.push({ key, message, diagnostics: diags });
    }
    if (cat !== source) entry.missingKeys = [...srcMap.keys()].filter((k) => !seen.has(k));
    if (!cat.locale && !cat.error) entry.localeWarning = 'Could not tell this file\'s locale from its name, so plural categories were not checked. Name it like fr.json or app_pl.arb, or set the locale.';
  }
  const count = (sev) => results.reduce((a, r) => a + r.messages.reduce((b, m) => b + m.diagnostics.filter((d) => d.severity === sev).length, 0) + (sev === 'error' && r.error ? 1 : 0), 0);
  return { source: source?.name ?? null, files: results, errors: count('error'), warnings: count('warning'), infos: count('info') };
}

// --- formatting (for previews) -----------------------------------------------

/**
 * Format a parsed message with Intl. Covers what previews need: text,
 * number (integer, percent, plain), date/time styles, plural with offset and
 * exact matches, selectordinal and select. Number and date skeletons and
 * patterns fall back to the default format and are reported in `approx`.
 */
export function format(ast, values, locale, approx = new Set()) {
  const nf = (opts) => new Intl.NumberFormat(locale, opts);
  const out = (nodes, pound) => nodes.map((n) => {
    if (n.type === 'literal') return n.value;
    if (n.type === 'pound') return pound === undefined ? '#' : nf().format(pound);
    if (!(n.name in values)) throw new Error(`No value for {${n.name}}.`);
    const v = values[n.name];
    if (n.type === 'argument') {
      if (n.argType === null) {
        if (typeof v === 'number') return nf().format(v);
        if (v instanceof Date) return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(v);
        return String(v);
      }
      if (n.argType === 'number') {
        if (n.style === 'integer') return nf({ maximumFractionDigits: 0 }).format(v);
        if (n.style === 'percent') return nf({ style: 'percent' }).format(v);
        if (n.style) approx.add(`{${n.name}, number, ${n.style}} shown with the default number format`);
        return nf().format(v);
      }
      if (n.argType === 'date' || n.argType === 'time') {
        const st = DATE_STYLES.includes(n.style) ? n.style : (n.style ? (approx.add(`{${n.name}, ${n.argType}, ${n.style}} shown with the short format`), 'short') : 'short');
        return new Intl.DateTimeFormat(locale, n.argType === 'date' ? { dateStyle: st } : { timeStyle: st }).format(v instanceof Date ? v : new Date(v));
      }
      approx.add(`{${n.name}, ${n.argType}} needs ICU's rule-based number formats, which browsers lack; shown as digits`);
      return nf().format(v);
    }
    if (n.type === 'select') {
      const opt = n.options.find((o) => o.selector === String(v)) || n.options.find((o) => o.selector === 'other');
      return out(opt.value, pound);
    }
    const num = Number(v);
    let opt = n.options.find((o) => o.selector[0] === '=' && Number(o.selector.slice(1)) === num);
    if (!opt) {
      const cat = new Intl.PluralRules(locale, { type: n.pluralType }).select(num - n.offset);
      opt = n.options.find((o) => o.selector === cat) || n.options.find((o) => o.selector === 'other');
    }
    return out(opt.value, num - n.offset);
  }).join('');
  return out(ast, undefined);
}

/**
 * Preview rows for a message: for each plural/selectordinal argument, one
 * row per category the locale uses (plus each exact selector), with an
 * example number and the text a reader would see. Other arguments take
 * placeholder values.
 */
export function previewRows(ast, locale) {
  const loc = canonicalLocale(locale) || 'en';
  const args = argumentsOf(ast);
  const base = {};
  const firstKey = new Map();
  walk(ast, (n) => { if (n.type === 'select' && !firstKey.has(n.name)) firstKey.set(n.name, n.options.find((o) => o.selector !== 'other')?.selector ?? 'other'); });
  for (const [name, kinds] of args) {
    if (kinds.has('plural') || kinds.has('selectordinal') || kinds.has('number') || kinds.has('spellout') || kinds.has('ordinal') || kinds.has('duration')) base[name] = 3;
    else if (kinds.has('date') || kinds.has('time')) base[name] = new Date(Date.UTC(2026, 0, 15, 14, 30));
    else if (kinds.has('select')) base[name] = firstKey.get(name);
    else base[name] = `‹${name}›`;
  }
  const rows = [];
  const approx = new Set();
  const plurals = [];
  walk(ast, (n) => { if (n.type === 'plural' && !plurals.some((p) => p.name === n.name)) plurals.push(n); });
  for (const p of plurals) {
    const info = pluralInfo(loc, p.pluralType);
    const samples = [];
    for (const o of p.options) if (o.selector[0] === '=') samples.push({ value: Number(o.selector.slice(1)), why: `exactly ${o.selector.slice(1)}` });
    for (const c of info.categories) {
      const ex = info.examples[c];
      const pick = ex.ints.map((x) => x + p.offset).find((x) => !samples.some((s) => s.value === x));
      if (pick !== undefined) samples.push({ value: pick, why: `"${c}"` });
      else if (ex.decs.length) samples.push({ value: Number(ex.decs[0]) + p.offset, why: `"${c}" (decimals)` });
    }
    for (const smp of samples) {
      try {
        rows.push({ argument: p.name, value: smp.value, category: smp.why, text: format(ast, { ...base, [p.name]: smp.value }, loc, approx) });
      } catch (e) {
        rows.push({ argument: p.name, value: smp.value, category: smp.why, text: null, error: e.message });
      }
    }
  }
  if (!plurals.length) {
    try { rows.push({ argument: null, value: null, category: null, text: format(ast, base, loc, approx) }); } catch (e) { rows.push({ argument: null, value: null, category: null, text: null, error: e.message }); }
  }
  return { rows, approx: [...approx] };
}
