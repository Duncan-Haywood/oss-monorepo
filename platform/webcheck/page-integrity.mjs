// Shared page-integrity checks for the portfolio's browser-local products.
//
// Why this exists
// ---------------
// `cut-list-optimizer/index.html` opened `<textarea id="cuts">` and never closed
// it. HTML treats textarea as a raw-text element, so the parser fed the button,
// the results panel, the liability disclaimer, the usage opt-out, `</main>` and
// the entire `<script type="module">` into the textarea as literal text. The
// script never ran: the tool had never calculated anything since the day it
// shipped. Three separate pull requests merged green over the top of it, because
// every venture's tests import `calc.mjs` directly and none of them ever look at
// the page.
//
// The lesson recorded in the ledger for that repair is not "close your tags" but
// that no venture had a DOM-level test at all, so a completely dead product was
// indistinguishable from a working one in CI. That gap is portfolio-wide, so the
// guard belongs here rather than in one venture.
//
// Design constraints
// ------------------
// Venture CI is a bare `node --test` inside the venture directory, with no
// package.json, no node_modules and no build step. So this module is
// dependency-free and does its own parsing: no jsdom, no browser, no install
// step to keep working. It is imported by relative path.
//
// What it deliberately does NOT do: assert that the arithmetic is right. That is
// each venture's `calc.test.mjs`, which is a better place for it. This module
// answers one question those tests cannot — would a browser actually run this
// page at all, and does the script only reach for elements that exist.
//
// The second dead product
// -----------------------
// `3pl-quote-normalizer/index.html` shipped an inline module with two missing
// semicolons: `form.addEventListener('change', e => {...})document.querySelector(...)`.
// ASI cannot recover when the `)` and the `document` share a line, so the module
// failed to *parse* and the browser ran none of it — no submit handler, no
// recalculation, no saving. The page rendered its whole 36-field form and the
// results panel stayed empty forever.
//
// Every check above passed it: the script tag was present and non-empty, no tag
// was unclosed, and every id it looked up existed. The venture's own 92 tests
// passed too, because they assert that strings appear in the HTML file, not that
// the file is a runnable program. So the page was dead and everything was green.
//
// A parse error is the one class of JS defect that is statically decidable with
// no false positives, which makes it exactly the right thing for a repo-wide
// gate to insist on. `checkScriptSyntax` below therefore runs the real parser
// over every inline script body — it never executes the code, and it does not
// claim the calculator computes the right number, only that the browser will get
// as far as trying.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Elements whose content a browser does not parse as markup. Leaving one open
// silently discards the remainder of the document with no parse error anywhere.
// `title` is RCDATA rather than raw text, but fails the same way and for the
// same reason, so it is checked alongside them.
const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style', 'title'];

// `type` values a browser executes as JavaScript. An absent type means classic
// script. Anything else — `text/template`, `application/ld+json`, an HTML
// import — is data the JS parser has no business reading, so it is left alone
// (JSON-LD gets its own check below, since it fails just as silently).
const JS_SCRIPT_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'module/javascript']);

function scriptType(tag) {
  return (/\btype\s*=\s*["']?([^"'\s>]*)/i.exec(tag)?.[1] ?? '').toLowerCase();
}

/**
 * Walk `source` the way a browser's tokenizer does, so an unclosed raw-text
 * element really does swallow everything after it.
 *
 * A plain regex over the file would happily match markup the parser had already
 * buried inside a textarea — exactly the mistake that let a dead page ship, since
 * the tags all *looked* present in the file. `markup` therefore holds only what
 * the browser would still parse as elements, and `scripts` only script bodies
 * that would actually execute.
 *
 * @param {string} source raw HTML file contents
 * @returns {{markup: string, scripts: string[], unclosed: string|null}}
 */
export function parsePage(source) {
  const RAW = new RegExp(`<(${RAW_TEXT_ELEMENTS.join('|')})\\b[^>]*>`, 'i');
  let rest = source;
  let markup = '';
  const scripts = [];
  const scriptTags = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, scriptTags, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    // Keep the open tag itself: it may carry the id the script looks up.
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    // No closing tag: the rest of the document is this element's text content
    // and never becomes markup at all.
    if (!closer) return { markup, scripts, scriptTags, unclosed: tag };
    if (tag === 'script') {
      scripts.push(rest.slice(contentStart, contentStart + closer.index));
      // Parallel to `scripts`, so a caller can tell a module from a classic
      // script and JSON-LD data from code without re-scanning the source.
      scriptTags.push(open[0]);
    }
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

// One scratch directory per process, created only if a page actually has an
// inline script to check. `node --check` needs a real path, and the extension is
// what selects the parser goal: .mjs parses `import`/`export` at top level, .js
// does not, which is exactly the distinction `type="module"` makes in a browser.
let scratchDir = null;
function scratchPath(name) {
  scratchDir ??= mkdtempSync(join(tmpdir(), 'page-integrity-'));
  return join(scratchDir, name);
}

/**
 * Turn `node --check` stderr into one line that says where to look.
 *
 * These pages are frequently minified onto a single line, so node's own excerpt
 * — the whole offending line with a caret under it — can be tens of thousands of
 * characters and is useless in a CI log. Report the position and a short window
 * of source around it instead, which is what actually finds the defect.
 *
 * @param {string} stderr raw output from `node --check`
 * @param {string} body the script source that was checked
 * @returns {string} a single-line description
 */
function describeParseFailure(stderr, body) {
  const lines = stderr.split('\n');
  const message = lines.find((line) => /^\w*(SyntaxError|Error):/.test(line.trim()))?.trim() ?? 'SyntaxError';
  // node's first stderr line is `<path>:<line>`, and the caret line that follows
  // the source excerpt gives the column.
  const lineNo = Number(/:(\d+)$/.exec(lines[0]?.trim() ?? '')?.[1]);
  const caret = lines.findIndex((line) => /^\s*\^+\s*$/.test(line));
  const column = caret > 0 ? lines[caret].indexOf('^') : -1;

  let where = Number.isFinite(lineNo) ? `line ${lineNo}` : 'unknown position';
  const sourceLine = body.split('\n')[lineNo - 1] ?? '';
  // node truncates its excerpt for a very long line — and these pages are often
  // minified onto one — after which the caret no longer lines up with the real
  // column. Only quote a position when the excerpt is verbatim, so the pointer
  // is either exactly right or absent. A confidently wrong column is worse than
  // none: it sends the reader to the wrong place in a 30,000-character line.
  if (column >= 0 && lines[caret - 1] === sourceLine) {
    where += `, column ${column + 1}`;
    const from = Math.max(0, column - 60);
    const excerpt = sourceLine.slice(from, column + 60);
    if (excerpt.trim()) where += `: ...${excerpt}...`;
  }
  return `${message} at ${where}`;
}

/**
 * Parse every inline script the browser would execute, and every JSON-LD block.
 *
 * Uses `node --check`, which runs V8's parser and never executes the code. That
 * is the same parser the pages are written for, and a parse failure is not a
 * matter of opinion — so this can be a hard gate across all 161 products without
 * ever crying wolf on working code.
 *
 * @param {string[]} scripts inline script bodies, from parsePage
 * @param {string[]} scriptTags the matching open tags, from parsePage
 * @returns {string[]} findings; empty means every block parses
 */
export function checkScriptSyntax(scripts, scriptTags = []) {
  const findings = [];
  scripts.forEach((body, index) => {
    const tag = scriptTags[index] ?? '';
    const type = scriptType(tag);
    // A src= tag with no inline body has nothing to parse here; the referenced
    // file is a real module and is checked wherever modules are checked.
    if (!body.trim()) return;

    if (type === 'application/ld+json') {
      // Structured data fails the same silent way code does: search engines and
      // AI crawlers drop a malformed block without telling anyone.
      try {
        JSON.parse(body);
      } catch (error) {
        findings.push(`inline JSON-LD block ${index + 1} is not valid JSON, so crawlers discard it -> ${error.message}`);
      }
      return;
    }
    if (!JS_SCRIPT_TYPES.has(type)) return;

    // The extension selects the parser goal. `.mjs` parses top-level
    // `import`/`export`, matching `type="module"`. A classic script must use
    // `.cjs` and not `.js`: since v22 node sniffs module syntax in a `.js` file
    // and re-parses it as a module, which would quietly accept an `import` that
    // a browser rejects in a non-module script.
    const file = scratchPath(`s${index}.${type === 'module' ? 'mjs' : 'cjs'}`);
    writeFileSync(file, body);
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      findings.push(
        `inline <script> block ${index + 1} does not parse, so the browser runs none of it -> ${
          describeParseFailure(String(error.stderr ?? error.message ?? ''), body)
        }`,
      );
    }
  });
  return findings;
}

/**
 * Ids declared by elements the browser would actually create.
 *
 * `scriptSource` is included because several pages build part of their UI at
 * runtime — the eBay calculator injects its share and reset buttons through
 * `innerHTML` — so an id can be perfectly real without ever appearing in the
 * static markup. Treating those as undeclared would fail a working page, and a
 * check that cries wolf is one the next session turns off.
 */
export function declaredIds(markup, scriptSource = '') {
  const ids = new Set([...markup.matchAll(/\bid=["']([\w:.-]+)["']/g)].map((m) => m[1]));
  for (const m of scriptSource.matchAll(/\bid=\\?["']([\w:.-]+)\\?["']/g)) ids.add(m[1]);
  return ids;
}

/**
 * Blank out comments in JavaScript source, preserving offsets and newlines.
 *
 * Why this exists. `queriedIds` below scans for lookup spellings with a regex,
 * and a regex has no idea what a comment is. So a page that *documents* a
 * selector -- "do not write `querySelector('#level-1.1.1')`, it throws" --
 * gets that selector read back as a real lookup, and the page fails for
 * carrying the comment that explains its own bug. Measured on
 * `vpat-acr-generator` on 2026-09-11: the comment added in the same commit
 * that fixed the defect was itself the only thing the checker flagged.
 *
 * That is precisely the failure mode `declaredIds` above names -- "a check
 * that cries wolf is one the next session turns off" -- and it punishes
 * exactly the comment most worth writing.
 *
 * Blanking rather than deleting keeps every other match's offset intact, and
 * keeping the newlines keeps line numbers usable in any future finding.
 *
 * This is a scanner rather than a pair of regexes because `//` is ordinary
 * text inside a string (`'https://example.com'`) and inside a regex literal,
 * and stripping those would corrupt real source. It tracks the states that
 * can contain a `/` harmlessly: single quotes, double quotes, template
 * literal text, regex literals (character classes included, where `/` is a
 * literal slash), and `${...}` substitutions, which are ordinary code again
 * and so *do* take comments.
 *
 * **Two defects the first version shipped with, both found by review and both
 * pinned in the tests below (fixed 2026-09-12).** They are worth naming,
 * because both made this function silently do the opposite of its job.
 *
 * First, the "can a regex start here?" test was `/…|^|…/`, and the `^`
 * alternative matches at position 0 of every string — so `.test()` was
 * unconditionally true and *every* `/` was read as opening a regex literal.
 * On `const x = a / 2; // getElementById('ghost')` the scanner took the
 * division slash as an opener, ran forward for a closing one, consumed the
 * comment's own `//` as that closer, and left the comment text in the output.
 * `queriedIds` then reported `ghost` as a live lookup — exactly the false
 * positive this function exists to remove. The discrimination now reads the
 * last meaningful character, and the direction of the remaining risk is
 * deliberate: mistaking a regex for division blanks a little real code and
 * can only *lose* an id, while mistaking division for a regex resurrects
 * comments and invents them.
 *
 * Second, a backtick literal was treated as opaque all the way to its closing
 * backtick, which skipped comments inside `${...}`. Template *text* must stay
 * untouched, but a substitution is code and is now scanned as code.
 *
 * The lesson for anyone editing this: a test that passes is not proof the
 * branch under it works. The original suite asserted division survived, on
 * `total / count / 2`, and passed — because the *second* division slash
 * happened to close the bogus regex before the comment began. One operand
 * fewer and it would have caught this.
 */
/**
 * ECMAScript has four line terminators, not one.
 *
 * `\n` is the one everybody remembers; `\r` (a lone CR, without a following
 * LF), U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR terminate a line
 * just as definitively. Every place in this file that asks "is the line over?"
 * has to agree, and before this was shared they did not:
 *
 *   - a `//` comment ended only at `\n`, so one terminated by any of the
 *     other three swallowed the rest of the file and every lookup in it;
 *   - the label check treated the other three as ordinary space, so
 *     `break\router` read `outer` as a label and let the following slash
 *     open a regex, which then ate a comment -- an invented lookup.
 *
 * Opposite directions, one cause. Defined once here so a future reader
 * changing the set changes it everywhere.
 */
const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;
const isLineTerminator = (ch) => ch !== undefined && LINE_TERMINATOR.test(ch);

export function stripComments(source) {
  return scanSource(source).text;
}

/**
 * `stripComments`, plus where the quoted-string contents were.
 *
 * `lookupIdsIn` matches `getElementById('x')` textually, and text inside a
 * string literal looks exactly like text outside one. So
 * `const s = 'document.getElementById("ghost")'` reported `ghost` as a live
 * lookup -- prose about code, read as code. That predates everything in this
 * sequence; review finding 13 arrived at it from a stranger direction (a `//`
 * and a U+2028 inside the string) and is the same bug.
 *
 * It cannot be fixed by blanking string contents, because the id itself is a
 * string: in `getElementById('price')`, `price` is exactly the part worth
 * keeping. What distinguishes the two is where the *call* sits, not where the
 * id sits -- so the scanner records each string's interior and `lookupIdsIn`
 * drops any match that begins inside one.
 *
 * **Measured 2026-09-12, because by review round four this mechanism was
 * generating most of the findings and had to justify itself.** Across the
 * whole catalogue -- 997 pages with inline script, 2,164 ids -- the span
 * filter removes **0 ids on 0 pages**. Every finding it has ever produced
 * here came from the lexer *under* it being wrong: a `/` misread as division
 * (or as a regex) swallows a quote, the quote opens a span that was never
 * there, and the span then suppresses a real lookup. Findings 24, 25 and 26
 * all reach the caller by that exact route.
 *
 * Deleting it would therefore have cost nothing measurable and closed three
 * of four findings at a stroke. It is kept anyway, and the reason is the
 * direction of the two failures. Without it, a lookup written *about* code --
 * in prose, in a template, in a string -- is reported as a query against an
 * id no page has, which is a false positive: the checker cries wolf about a
 * sound page, and this file's own docstring records that as the failure mode
 * that gets a checker ignored. With it, a lexer bug suppresses a finding on a
 * page that is genuinely broken -- also bad, but it is the direction the
 * whole-catalogue run can still catch, and it is the direction that has a
 * fix rather than a tradeoff. Zero measured benefit is not zero value when
 * what it buys is the safer failure. Re-measure before removing it.
 */
export function scanSource(source) {
  let out = '';
  let i = 0;
  /** [start, end) of every quoted-string interior, in `out` coordinates. */
  const stringSpans = [];

  // Where we are. Empty means plain code. A `template` entry means inside a
  // backtick literal's text, where a `//` is content and not a comment. A
  // `subst` entry means inside a `${...}` inside one, which is ordinary code
  // again and *does* take comments -- `depth` counts the braces opened since,
  // so an object literal inside a substitution does not end it early.
  const stack = [];
  const top = () => stack[stack.length - 1];

  // After a value -- an identifier, `]`, a number, a string -- a `/` is
  // division. After an operator, a separator, or one of these keywords, it
  // opens a regex literal. Getting this backwards in the *division* direction
  // is the expensive one: the scanner then runs off looking for a closing
  // slash, swallows whatever lies between, and a comment caught inside it
  // survives into the output -- which is the defect this whole function
  // exists to prevent.
  // `throw`, `break` and `continue` earn their place for a reason worth
  // stating: none of them can be followed by division in valid JavaScript, so
  // a `/` after one is always a regex (or a syntax error). `break` and
  // `continue` are also the restricted productions where a newline forces
  // automatic semicolon insertion, which is how `break\n/re/…` arises.
  const REGEX_AFTER_KEYWORD =
    /\b(return|throw|break|continue|debugger|default|extends|typeof|case|in|of|delete|void|instanceof|new|do|else|yield|await)$/;
  // `}` is here for a reason worth stating, because it was the cause behind
  // three separate review findings. A `}` immediately before a `/` closes a
  // *block*, and a regex may follow one: `if (ok) {} /re/.test(x)`. The other
  // reading -- an object literal divided by something -- is not code anyone
  // writes: `{a: 1} / 2` is NaN, and `f({}) / 2` ends in `)`, which the paren
  // tracking below handles separately. Reading it as division sent the scanner
  // into the regex looking for a string, and whatever quote it found there
  // opened a span that swallowed real lookups (findings 14, 15, 16).
  const REGEX_AFTER_PUNCT = new Set([...'([{;,:=!&|?+-*/~%^<>']);

  /**
   * True when `before` ends with one of those words used *as a keyword*.
   *
   * Every one of them is also a legal property name, and `obj.break / 2` is
   * ordinary division. Matching the bare word there reads the division slash
   * as a regex opener, which then eats the first slash of any following
   * comment and leaves the comment's text in the output -- the invented-lookup
   * failure this function exists to prevent, arrived at from the one direction
   * that had not been tried yet. Applies to the whole list rather than the
   * three most recently added: `obj.return` and `obj?.delete` were misread by
   * the original list too.
   */
  function endsWithKeyword(before) {
    // `break outer` / `continue outer`: the label is the last token, but the
    // statement is still a restricted production, so ASI applies and a slash
    // on the next line opens a regex. Checked before the bare-keyword match,
    // because the label hides the keyword from it.
    // The label is a JavaScript identifier, which is Unicode -- `café:` is as
    // valid as `outer:`. An ASCII-only class here silently stopped recognising
    // the statement, which put the slash back to division and blanked the line.
    // `[^\S\n]` rather than `\s`: `break` and `continue` are restricted
    // productions, so JavaScript forbids a line terminator between them and
    // their label. `break\nouter` is therefore `break;` followed by the
    // expression `outer`, and a slash after it is division. Matching across
    // the newline claimed `outer` as a label, made the slash a regex opener,
    // and let it swallow a comment -- an invented lookup.
    const labelled = before.match(
      /\b(break|continue)[^\S\n\r\u2028\u2029]+[\p{ID_Start}$_][\p{ID_Continue}$]*$/u,
    );
    if (labelled) {
      const head = before.slice(0, before.length - labelled[0].length).replace(/\s+$/, '');
      return !head.endsWith('.') && !head.endsWith('#');
    }
    const match = before.match(REGEX_AFTER_KEYWORD);
    if (!match) return false;
    const head = before.slice(0, before.length - match[0].length).replace(/\s+$/, '');
    // `.` covers `?.` as well, since both end in a dot. `#` covers a private
    // member -- `this.#break` leaves `#` as the last character, not `.`, which
    // the first version of this guard missed.
    return !head.endsWith('.') && !head.endsWith('#');
  }

  // `)` is the ambiguous one, and it is why this stack exists. A `/` after the
  // `)` of `if (ok)` opens a regex; after the `)` of `f(x)` it is division.
  // The difference is what the matching `(` belonged to, so each open paren
  // records whether a control-flow keyword introduced it, and the matching
  // close hands that answer back.
  const CONTROL_FLOW_PAREN = /\b(if|while|for|switch|catch|with)\s*$/;
  const parens = [];
  let lastCloseWasCondition = false;

  // `}` has the same two readings as `)`, and needs the same treatment. It
  // closes a *block* -- after which a regex may start -- or an *object
  // literal*, which is a value, after which a `/` is division:
  //
  //     if (ok) {} /re/.test(x)              block:   regex
  //     const n = {valueOf(){return 4}} / 2  literal: division
  //
  // Treating every `}` as a block (the previous revision) misreads the second;
  // treating every one as a literal misreads the first, which is what findings
  // 14, 15 and 16 all were. So each `{` records which it opened, by the same
  // test JavaScript itself uses: a `{` in expression position is a literal,
  // anywhere else it is a block.
  // Derived from the list above rather than written out again, because the two
  // answer almost the same question -- "is this expression position?" -- and
  // when they were maintained separately they drifted: `throw` reached the
  // regex list and not this one, so `throw {…} / 2` read the literal as a
  // block (review finding 22). Deriving it makes that drift impossible.
  //
  // The exclusions are the whole difference, and each is a real one:
  //   do, else        take a *block*, so `do {}` is not a value
  //   break,
  //   continue,
  //   debugger        cannot be followed by `{` at all
  const BLOCK_NOT_LITERAL = new Set(['do', 'else', 'break', 'continue', 'debugger']);
  const OBJECT_LITERAL_AFTER_KEYWORD = new RegExp(
    `\\b(${REGEX_AFTER_KEYWORD.source
      .replace(/^\\b\(/, '')
      .replace(/\)\$$/, '')
      .split('|')
      .filter((word) => !BLOCK_NOT_LITERAL.has(word))
      .join('|')})$`,
  );
  const braces = [];
  let lastCloseWasBlock = true;
  /**
   * Was the `:` we just passed a conditional's, rather than a label's?
   *
   * Recorded at the colon for the same reason `lastCloseWasBlock` is recorded
   * at the brace: by the time the next token asks, the context that settles it
   * has gone past. `ternaryDepth` counts conditionals whose `:` has not
   * arrived; a `{` saves and clears it, because a function body inside one arm
   * must not consume the arm's own colon.
   */
  let lastColonWasTernary = false;
  let ternaryDepth = 0;
  const ternaryStack = [];

  /**
   * Statement position, as distinct from expression position.
   *
   * **Two different questions have been sharing `REGEX_AFTER_PUNCT`, and that
   * is what review findings 26, 27 and 28 each found one token of.** That set
   * answers *"may a `/` here open a regex?"*, and the answer is yes in both
   * kinds of position, which is exactly why it is the right set for that
   * question and the wrong one for the other two this scanner asks:
   *
   *     does a `{` here open an object literal?   only in expression position
   *     is this `function` an expression?         only in expression position
   *
   * `;` and `{` are in `REGEX_AFTER_PUNCT` because a regex may follow either,
   * but both end a statement -- so `; {}` is a *block* and
   * `'use strict'; function f(){}` is a *declaration*. Patching them one
   * reported token at a time is what produced findings 26, 27 and 28; naming
   * the distinction answers all three and whatever the fourth would have been.
   */
  function inStatementPosition(before) {
    if (before === '') return true;
    // `${` opens a substitution, whose contents are an expression. Its brace
    // never reaches the `{` handler, so the stack cannot answer for it.
    if (before.endsWith('${')) return false;
    const last = before.slice(-1);
    // A `;` ends a statement -- unless it is a `for` header's delimiter, the
    // only place a `;` appears inside parentheses and where what follows is
    // still an expression (review finding 30).
    //
    // "Inside parentheses" is not the same as "in a `for` header", which is
    // what review finding 32 then caught: a callback or an IIFE keeps its
    // calling parenthesis open across the whole function body, and a `;` in
    // there really does end a statement. What separates the two is the brace:
    // a header reaches only its own nesting level, so a `{` opened since the
    // paren -- a callback body, or a function body written inside the header
    // itself -- ends that reach.
    //
    // It deliberately does *not* also require a control-flow paren, though
    // `CONTROL_FLOW_PAREN` is right there and the first draft did. With no
    // brace opened since, a `;` inside parentheses can only be a `for`
    // header's in valid JavaScript, so the extra condition changed no test,
    // no probe and no page -- and on *invalid* input, which this scanner does
    // meet, it pushes the wrong way: it would make such a `;` read as a
    // statement boundary, the direction that invents lookups. An unexercised
    // condition that also picks the riskier default is worth less than none.
    if (last === ';') {
      const paren = parens[parens.length - 1];
      return !(paren && braces.length === paren.bracesAtOpen);
    }
    // A `{` opens statement position only when it opened a block. After an
    // object literal's `{` we are in its body, which is expression territory.
    if (last === '{') return braces[braces.length - 1] !== true;
    // `:` carries three readings, not two. Between a key and its value, and
    // as a conditional's separator, it is expression position; ending a label
    // or a `case` it is statement position. The brace stack answers the first
    // and `lastColonWasTernary` the second (review finding 31).
    if (last === ':') return !lastColonWasTernary && braces[braces.length - 1] !== true;
    return false;
  }

  /**
   * Is this `{` the body of a class or function *expression*?
   *
   * A declaration's `}` closes a block, so a regex may follow it
   * (`function f(){} /re/.test(x)`). An expression's `}` closes a **value**,
   * so a `/` after it divides (`const n = function(){ return 4 } / 2`). Same
   * brace, opposite answers, exactly like the object-literal case above --
   * which is the whole reason `braces` exists.
   *
   * Finds the nearest preceding `class`/`function` with no `{`, `}` or `;`
   * between it and here (so it really is this brace's head), then asks the
   * same expression-position question of the keyword itself.
   */
  function opensAnExpressionBody(before) {
    const head = before.match(/\b(class|function)\b[^{};]*$/);
    if (!head) return false;
    const upto = before
      .slice(0, before.length - head[0].length)
      .replace(/\s+$/, '')
      // `const n = async function(){…}` -- the match begins at `function`, so
      // `async` is left in the prefix and would read as an identifier, making
      // the body look like a declaration's block.
      .replace(/\basync$/, '')
      .replace(/\s+$/, '');
    if (inStatementPosition(upto)) return false;
    const prev = upto.slice(-1);
    return REGEX_AFTER_PUNCT.has(prev) || OBJECT_LITERAL_AFTER_KEYWORD.test(upto);
  }

  function regexCanStartHere() {
    // `out` has comments already blanked to spaces, so trimming trailing
    // whitespace skips them -- a comment between a token and a `/` should not
    // change what that `/` means.
    const before = out.replace(/\s+$/, '');
    if (before === '') return true;
    const last = before.slice(-1);
    // There is deliberately no "a newline before the slash means a regex"
    // branch here. An earlier revision had one; it was dead code, because
    // `\s` matches `\n` and the trim above had already removed it. Making it
    // *live* would be worse than dead, because a newline does not imply a
    // statement boundary -- `const a = b` / newline / `/re/.test(c)` is the
    // classic ASI trap and really does parse as two divisions. Treating it as
    // a regex would swallow the rest of the line and invent lookups, the
    // direction this function exists to avoid. The statement boundaries that
    // *do* matter are the restricted-production keywords, handled in
    // REGEX_AFTER_KEYWORD above, where no division is possible either way.
    if (last === ')') return lastCloseWasCondition;
    if (last === '}') return lastCloseWasBlock;
    // `...` spreads an expression, so a regex may follow it directly. The
    // final character is a `.`, which on its own means a member access and
    // would read as division -- the ellipsis has to be matched whole.
    if (before.endsWith('...')) return true;
    if (REGEX_AFTER_PUNCT.has(last)) return true;
    return endsWithKeyword(before);
  }

  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];

    // --- inside a template literal's text -------------------------------
    if (top()?.type === 'template') {
      if (c === '\\') {
        out += c;
        i += 1;
        if (i < source.length) { out += source[i]; i += 1; }
        continue;
      }
      if (c === '`') {
        // Template *text* is content, the same as a quoted string's -- review
        // finding 23. `${…}` substitutions are code and are excluded, because
        // each one closes the span before it and opens a new one after.
        const from = top().spanStart;
        if (from !== undefined && out.length > from) stringSpans.push([from, out.length]);
        out += c;
        i += 1;
        stack.pop();
        continue;
      }
      if (c === '$' && next === '{') {
        const from = top().spanStart;
        if (from !== undefined && out.length > from) stringSpans.push([from, out.length]);
        out += '${';
        i += 2;
        stack.push({ type: 'subst', depth: 0 });
        continue;
      }
      out += c;
      i += 1;
      continue;
    }

    // --- ordinary code (including inside a ${...}) ----------------------
    // A `${...}` needs its own brace *depth* so the substitution knows which
    // `}` ends it. Review finding 29: an earlier revision consumed every
    // nested brace here and returned, so braces inside a substitution never
    // reached the block-vs-literal tracking below and `lastCloseWasBlock` went
    // stale -- `` `${({valueOf(){return 4}} / 2, 0)}` `` then read its division
    // as a regex. Depth is counted here and the brace itself falls through;
    // only the `}` that closes the substitution is consumed.
    if (top()?.type === 'subst') {
      if (c === '{') top().depth += 1;
      else if (c === '}') {
        if (top().depth === 0) {
          stack.pop();
          out += c;
          i += 1;
          // Back in template text: start a fresh span after the substitution.
          if (top()?.type === 'template') top().spanStart = out.length;
          continue;
        }
        top().depth -= 1;
      }
    }

    // Track what each `(` belongs to, so the matching `)` can say whether a
    // `/` after it opens a regex (see CONTROL_FLOW_PAREN above).
    if (c === '(') {
      // `bracesAtOpen` is what makes "am I in a `for` header?" answerable: a
      // header reaches only as far as its own nesting level, so a `{` opened
      // inside it ends that reach (review finding 32).
      parens.push({
        control: CONTROL_FLOW_PAREN.test(out.replace(/\s+$/, '')),
        bracesAtOpen: braces.length,
      });
      out += c;
      i += 1;
      continue;
    }
    if (c === ')') {
      lastCloseWasCondition = parens.pop()?.control ?? false;
      out += c;
      i += 1;
      continue;
    }

    // Conditionals, so a later `:` can say which kind it is. `?.` is optional
    // chaining and `??` is nullish coalescing; neither opens one.
    if (c === '?' && next !== '.' && next !== '?' && out.slice(-1) !== '?') {
      ternaryDepth += 1;
      out += c;
      i += 1;
      continue;
    }
    if (c === ':') {
      lastColonWasTernary = ternaryDepth > 0;
      if (ternaryDepth > 0) ternaryDepth -= 1;
      out += c;
      i += 1;
      continue;
    }
    if (c === ';' && !inStatementPosition(out.replace(/\s+$/, '') + ';')) {
      // Inside a `for` header: the delimiter is not a statement boundary, so
      // leave the conditional count alone (`for (a ? b : c; ; )`).
      out += c;
      i += 1;
      continue;
    }
    if (c === ';') {
      // A statement boundary ends any conditional still counted open, which
      // can only mean the scan mis-paired a `?` somewhere.
      ternaryDepth = 0;
      out += c;
      i += 1;
      continue;
    }

    // And the same for `{`, so the matching `}` can say whether it closed a
    // block or an object literal. A `{` in *expression* position -- after an
    // operator, a separator, an open bracket, `return` and friends -- opens a
    // literal; anywhere else it opens a block. That is the same question
    // `regexCanStartHere` answers about `/`, so it is answered the same way.
    if (c === '{') {
      const before = out.replace(/\s+$/, '');
      const last = before.slice(-1);
      // An object literal: a `{` sitting in expression position. See
      // `inStatementPosition` for why `REGEX_AFTER_PUNCT` alone cannot decide
      // this -- `;` and `{` are in it and both end a statement.
      const literal =
        !inStatementPosition(before)
        && last !== ')'
        && last !== '}'
        && (REGEX_AFTER_PUNCT.has(last) || OBJECT_LITERAL_AFTER_KEYWORD.test(before));
      braces.push(literal || opensAnExpressionBody(before));
      // A body inside one arm of a conditional must not eat the arm's colon.
      ternaryStack.push(ternaryDepth);
      ternaryDepth = 0;
      out += c;
      i += 1;
      continue;
    }
    if (c === '}') {
      // Default to `true` (a block) when the stack is empty: an inline script
      // fragment can close a brace it never opened, and a block is the reading
      // that keeps a following regex scannable.
      lastCloseWasBlock = !(braces.pop() ?? false);
      ternaryDepth = ternaryStack.pop() ?? 0;
      out += c;
      i += 1;
      continue;
    }

    // A bare `\` is a syntax error in real code, so meeting one here means the
    // discrimination above already went wrong somewhere. Consuming it with the
    // character it escapes keeps that mistake local: without this, the `\/` of
    // a regex read as division pairs with the next `/` into a `//` that blanks
    // the rest of the line, taking real lookups with it.
    if (c === '\\') {
      out += c;
      i += 1;
      if (i < source.length) { out += source[i]; i += 1; }
      continue;
    }

    if (c === '/' && next === '/') {
      while (i < source.length && !isLineTerminator(source[i])) { out += ' '; i += 1; }
      continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i += 1) out += isLineTerminator(source[i]) ? source[i] : ' ';
      continue;
    }
    if (c === '`') { out += c; i += 1; stack.push({ type: 'template', spanStart: out.length }); continue; }
    if (c === '"' || c === "'") {
      // A quote sitting immediately after a slash still cannot be a string --
      // `x /'abc'` is NaN -- so it came from a regex this scanner misread.
      // With `}` now classified correctly above, the case that produced this
      // is gone; it is kept because it costs nothing and the `/` ambiguity has
      // more corners than the three that were reported.
      const quotedFromARegex = out.endsWith('/');
      out += c;
      i += 1;
      const spanStart = out.length;
      let closed = false;
      while (i < source.length) {
        out += source[i];
        if (source[i] === '\\') {
          i += 1;
          if (i < source.length) out += source[i];
          i += 1;
          continue;
        }
        if (source[i] === c) { i += 1; closed = true; break; }
        // Not `isLineTerminator`, and the difference is a real one. Since
        // ES2019 subsumed JSON, U+2028 and U+2029 are *legal inside a quoted
        // string* -- they stopped terminating one, while still terminating a
        // comment, a regex literal and a statement. Treating them as ending a
        // string here closed it early, so a `//` later in that same string
        // read as a comment and swallowed a real lookup after it. Only LF and
        // CR end a quoted string.
        if (source[i] === '\n' || source[i] === '\r') { i += 1; break; }
        i += 1;
      }
      // Only a string that actually met its closing quote is recorded.
      //
      // An unterminated one means this scanner took a `'` for a quote that was
      // something else, and the only thing it can do then is run to the end of
      // the line or the file -- over however much real code lies between.
      // Since a span's whole job is to *suppress* a finding, trusting a
      // misparse here loses one. Review finding 14 is exactly that:
      //
      //     if (ok) {} /'/.test(x); document.getElementById("missing");
      //
      // A block `}` is still read as division (the limit documented above), so
      // the regex's `'` opened a "string" that swallowed the rest of the line
      // and `missing` disappeared. Declining to record it costs nothing: an
      // unterminated string suppresses no false positive worth having.
      // `closed` alone is not enough, and review finding 15 is why: with the
      // same quote style on both, the regex's `'` opened the "string" and the
      // id argument's own `'` closed it, so the span looked perfectly well
      // formed and covered the call. `quotedFromARegex` is what actually
      // distinguishes the case; `closed` stays because an unterminated span is
      // untrustworthy for its own reasons (finding 14).
      if (closed && !quotedFromARegex) {
        // The interior, excluding the closing quote just appended.
        stringSpans.push([spanStart, Math.max(spanStart, out.length - 1)]);
      }
      continue;
    }
    if (c === '/' && regexCanStartHere()) {
      out += c;
      i += 1;
      let inClass = false;
      while (i < source.length) {
        const r = source[i];
        out += r;
        if (r === '\\') {
          i += 1;
          if (i < source.length) out += source[i];
          i += 1;
          continue;
        }
        // A `/` inside a character class is a literal slash, not the end.
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) { i += 1; break; }
        else if (isLineTerminator(r)) { i += 1; break; }
        i += 1;
      }
      continue;
    }

    out += c;
    i += 1;
  }
  return { text: out, stringSpans };
}

/**
 * Ids the script asks the document for.
 *
 * Comments are blanked first (see `stripComments`): a selector quoted in prose
 * is documentation, not a lookup, and reading it as one fails working pages.
 *
 * Covers the three lookup spellings used across the portfolio's pages:
 * `getElementById('x')`, `querySelector('#x')` and the one-character `$('x')`
 * helper several ventures define. Quotes may be single, double or backtick, but
 * a template literal containing `${...}` is skipped — the id is computed at
 * runtime and cannot be checked statically without guessing.
 */
function lookupIdsIn(scriptSource, stringSpans = []) {
  const ids = new Set();
  // A match that *begins* inside a quoted string is prose about code, not
  // code. The id argument is itself a string, so the test is where the call
  // starts, never where the id sits.
  const insideAString = (at) => stringSpans.some(([from, to]) => at >= from && at < to);
  const add = (raw, at) => {
    if (raw && !raw.includes('${') && !insideAString(at)) ids.add(raw);
  };
  for (const m of scriptSource.matchAll(/getElementById\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) add(m[1], m.index);
  for (const m of scriptSource.matchAll(/querySelector(?:All)?\(\s*["'`]#([\w:.-]+)["'`]\s*\)/g)) add(m[1], m.index);
  for (const m of scriptSource.matchAll(/(?<![\w$.])\$\(\s*["'`]([\w:.-]+)["'`]\s*\)/g)) add(m[1], m.index);
  return ids;
}

/**
 * A deliberately naive second opinion on what is a comment.
 *
 * It knows nothing about strings, template literals or regexes: a block
 * comment runs to the first closing delimiter after its opener, and a line
 * comment is a double slash to the end of the line. (Spelled out in words
 * rather than punctuation because the closing delimiter cannot be written
 * inside this comment.) That is far too crude to strip comments correctly on
 * its own -- and it is never asked to. It exists only to *disagree* with
 * `stripComments`.
 *
 * Two characters before the `//` are exempt, and both were measured rather
 * than guessed:
 *
 *   - `:` -- `https://example.com` inside a string, which is everywhere.
 *   - `\` -- the escaped slashes of a URL-matching regex. `/https?:\/\//`
 *     ends in `\/\/`, whose last two characters are a literal `//`; without
 *     this exemption the naive pass blanks the rest of that line and drops a
 *     real lookup sitting after it. Caught by the fixture for finding 3,
 *     which is exactly what those fixtures are for.
 *
 * Being crude everywhere else is the point: its mistakes are in a different
 * place from a lexer's, which is what makes the intersection below mean
 * something.
 */
function naiveUncommented(source) {
  const blank = (text) => text.replace(/[^\n\r\u2028\u2029]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:\\])(\/\/[^\n\r\u2028\u2029]*)/g, (whole, before, comment) => before + blank(comment));
}

/**
 * Ids the script asks the document for.
 *
 * **An id is reported only when two independent readings agree it is live**,
 * and that belt-and-braces is the whole design rather than a flourish. Review
 * found eight defects in `stripComments` across four pull requests, and four
 * of them were the same shape: a lexing mistake let a comment's text survive,
 * so a lookup that existed *only inside a comment* was reported as real. That
 * direction is the expensive one. A false positive turns the catalogue-wide
 * sweep red on a page that is perfectly fine, and `declaredIds` above already
 * records where that ends: "a check that cries wolf is one the next session
 * turns off".
 *
 * Patching the lexer one finding at a time was not converging -- two of those
 * eight defects were *caused* by the fix for the one before, and a third was a
 * gap left by it. So the fix is structural: intersect the careful reading with
 * a deliberately stupid one (`naiveUncommented`). The two are wrong about
 * different things, and an id has to survive both.
 *
 * The asymmetry that makes this sound: intersection can only ever *remove*
 * ids. So a lexer bug costs a finding rather than inventing one, which is the
 * right way round for a gate over 995 pages.
 *
 * **It is a strong guard, not an absolute one, and the difference was found
 * the hard way.** An earlier revision of this comment said invented lookups
 * were "structurally impossible". They are not: the guard only holds while
 * the naive pass independently rejects the comment, and the `:` exemption
 * below is a hole in exactly that. Review finding 10 walked through it with
 * `label:// document.getElementById('ghost')` -- a labelled statement whose
 * colon sits where a URL scheme's would, so the naive pass exempts the `//`
 * and agrees with the mistaken lexer. Both readings are then wrong together
 * and the intersection preserves the error.
 *
 * The lexer bug behind that one is fixed at its root (see the restricted
 * production note in `endsWithKeyword`). The hole in the naive pass stays,
 * because `label://` and `https://` are textually identical to a scan that
 * does not parse, and removing the exemption loses a real lookup after any
 * URL in a string. So: the cross-check makes the invented-lookup class rare
 * and shallow rather than impossible, and `stripComments` still has to be
 * right. Do not read this paragraph as a licence to stop caring about that.
 *
 * What it costs, stated plainly: a lookup whose only occurrence sits after a
 * `//` inside a string (`"a//b"`, an XPath, a bare separator) is dropped by
 * the naive pass and so goes unreported. Measured across every page in the
 * catalogue when this was added, that cost was zero ids. It is not zero in
 * principle, and `stripComments` is still worth getting right -- the
 * false-negative half of the defects above is still real and still fixed
 * there. This only guarantees the failures land on the safe side.
 */
export function queriedIds(rawScriptSource) {
  const scanned = scanSource(rawScriptSource);
  const careful = lookupIdsIn(scanned.text, scanned.stringSpans);
  // The naive pass gets no span information on purpose: it is meant to be an
  // independent opinion, and handing it the careful scanner's conclusions
  // would make it agree by construction.
  const naive = lookupIdsIn(naiveUncommented(rawScriptSource));
  return new Set([...careful].filter((id) => naive.has(id)));
}

/**
 * Run every generic integrity check over one page.
 *
 * Returns a list of problems rather than throwing, so a caller can report all of
 * them at once instead of one per run, and so the checker itself is testable.
 *
 * @param {string} html raw file contents
 * @param {object} [options]
 * @param {string[]} [options.requiredIds] ids the primary journey depends on
 * @param {(string|RegExp)[]} [options.requiredText] text that must survive parsing
 *   as real markup — the liability disclaimer and privacy note the playbook
 *   requires on every user-facing surface. A page can carry these in the file and
 *   still not show them, which is precisely what happened to cut-list-optimizer.
 * @returns {string[]} human-readable findings; empty means the page is sound
 */
export function checkPageIntegrity(html, options = {}) {
  const { requiredIds = [], requiredText = [] } = options;
  const findings = [];
  const { markup, scripts, scriptTags, unclosed } = parsePage(html);

  if (unclosed) {
    findings.push(
      `<${unclosed}> is never closed: everything after it is swallowed as text instead of parsed as markup, ` +
        `so the rest of the page — including any script — never runs.`,
    );
    // Every later check would report the swallowed remainder as "missing",
    // which buries the one finding that explains all of them.
    return findings;
  }

  // Counted over `markup`, not the raw `html`, for the same reason `markup`
  // exists at all: a browser never tokenizes a tag that is sitting inside a
  // raw-text body, so neither may this. `parsePage` keeps every raw-text
  // element's *open and closing tags* and drops only its body, which is
  // exactly the set a browser would parse -- so a genuine imbalance is still
  // counted while a `'<title>'` string literal inside an inline script is not.
  //
  // Reading the raw file here was a false positive that reached `main`
  // (2026-09-10): `social-preview-check/index.html` labels a row of its own
  // report table with the literal `'<title>'`, correctly escaped through
  // `escapeHtml` before it is ever rendered, and this loop reported the page
  // as one that "would not render correctly in a browser". It renders fine.
  // That is the costly kind of wrong for a sweep whose whole value is that it
  // has no skip list: a checker that cries wolf on correct markup teaches the
  // next session to skim past the one page that is genuinely broken.
  //
  // Detection is unchanged. A raw-text element that is opened and never closed
  // is caught earlier and more precisely by `unclosed` above, which returns
  // before this loop; what remains for this loop is the surplus-open and
  // stray-close cases, and both survive into `markup` intact.
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (markup.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (markup.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    if (opened !== closed) findings.push(`<${tag}> is opened ${opened}x but closed ${closed}x`);
  }

  // An unresolved merge is a parse error in a script and dead text in markup.
  // Concurrent sessions edit these pages constantly, so this is a live risk.
  for (const marker of ['<<<<<<<', '>>>>>>>']) {
    if (html.includes(marker)) findings.push(`unresolved merge conflict marker ${marker} left in the page`);
  }

  const scriptSource = scripts.join('\n');
  const ids = declaredIds(markup, scriptSource);

  if (/<script\b[^>]*type=["']module["']/i.test(html)) {
    if (!/<script\b[^>]*type=["']module["']/i.test(markup)) {
      findings.push('the module script tag was swallowed by an earlier element and would never execute');
    } else if (scriptSource.trim() === '' && !/<script\b[^>]*\bsrc=/i.test(markup)) {
      findings.push('the module script parsed as empty and has no src: the page loads no application code');
    }
  }

  // Run before the id checks: when a script does not parse, none of its element
  // lookups happen either, and reporting them as missing ids buries the one
  // finding that explains the dead page.
  const syntax = checkScriptSyntax(scripts, scriptTags);
  if (syntax.length) return [...findings, ...syntax];

  const missingQueried = [...queriedIds(scriptSource)].filter((id) => !ids.has(id));
  if (missingQueried.length) {
    findings.push(
      `the script looks up ids that no element declares: ${missingQueried.join(', ')} ` +
        `(each is a null dereference the moment that line runs)`,
    );
  }

  const missingRequired = requiredIds.filter((id) => !ids.has(id));
  if (missingRequired.length) {
    findings.push(`ids required by the primary journey are missing from the rendered page: ${missingRequired.join(', ')}`);
  }

  for (const needle of requiredText) {
    const present = needle instanceof RegExp ? needle.test(markup) : markup.includes(needle);
    if (!present) {
      findings.push(`required text is not present as real markup: ${needle instanceof RegExp ? needle.source : JSON.stringify(needle)}`);
    }
  }

  return findings;
}

// A venture wanting assertions stronger than the repo-wide sweep — the exact ids
// its primary journey depends on, its own disclaimer wording — adds a
// `page.test.mjs` that calls checkPageIntegrity directly. `node --test` picks it
// up with no configuration:
//
//     import { test } from 'node:test';
//     import assert from 'node:assert/strict';
//     import { readFileSync } from 'node:fs';
//     import { checkPageIntegrity } from '../../platform/webcheck/page-integrity.mjs';
//
//     test('the page would run in a browser', () => {
//       const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
//       assert.deepEqual(checkPageIntegrity(html, {
//         requiredIds: ['price', 'profit'],
//         requiredText: [/<strong>No warranty\.<\/strong>/],
//       }), []);
//     });
