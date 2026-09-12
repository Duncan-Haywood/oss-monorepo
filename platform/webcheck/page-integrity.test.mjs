// Tests for the shared page-integrity checker.
//
// A guard that only ever passes is indistinguishable from no guard at all, and
// this one is being added precisely because the portfolio already shipped a
// completely dead product under green CI. So these tests pin both directions:
// the checker must reject the markup that actually broke, and must accept the
// patterns the working pages really use.
//
// The most important case is not synthetic. `catches the real defect at the
// revisions where it actually shipped` runs the checker over the exact
// `cut-list-optimizer/index.html` blobs from git history — the three commits
// where the calculator was live and non-functional, and the commit that
// repaired it. If a future change to the parser stops catching that, this test
// fails with the real file rather than a hand-written approximation of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPageIntegrity, parsePage, declaredIds, queriedIds, stripComments } from './page-integrity.mjs';
import { readHistoryBlob, isShallowClone } from './history-blob.mjs';

const REPO = new URL('../../', import.meta.url).pathname;

/**
 * Read every revision of `path` these history-pinned tests need.
 *
 * Returns a Map rev -> content, or `null` after skipping the test when this
 * clone is shallow and therefore does not carry the blobs. See history-blob.mjs
 * for why a skip is right there and wrong in a full clone: in a full clone the
 * read throws and the test fails, which is what should happen if the history
 * these tests pin themselves to ever goes away.
 */
function readHistoryBlobs(t, revisions, path) {
  const blobs = new Map();
  for (const rev of revisions) {
    const result = readHistoryBlob(REPO, rev, path);
    if (!result.ok) {
      t.skip(result.reason);
      return null;
    }
    blobs.set(rev, result.content);
  }
  return blobs;
}

/** A minimal but realistic page in the shape the portfolio's products use. */
function page({ body = '', script = '' } = {}) {
  return `<!doctype html>
<html lang="en"><head><title>Tool</title></head>
<body>
  <main>
    <input id="price" type="number">
    <p id="result"></p>
    ${body}
  </main>
  <script type="module">
    ${script || "document.getElementById('price').addEventListener('input', () => {});"}
  </script>
</body></html>
`;
}

test('a sound page produces no findings', () => {
  assert.deepEqual(checkPageIntegrity(page()), []);
});

test('an unclosed raw-text element is reported, because it swallows the app', () => {
  const broken = page().replace('<p id="result"></p>', '<textarea id="notes">');
  const findings = checkPageIntegrity(broken);
  assert.equal(findings.length, 1, 'the swallow should be reported once, not buried under its own consequences');
  assert.match(findings[0], /<textarea> is never closed/);
});

test('the swallow finding suppresses the noise it causes', () => {
  // Everything after the unclosed tag stops being markup, so #result and the
  // script "go missing" too. Reporting those as separate findings would bury
  // the single cause under its own symptoms.
  const broken = page().replace('<input id="price" type="number">', '<textarea id="notes">');
  const findings = checkPageIntegrity(broken, { requiredIds: ['price', 'result'] });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /never closed/);
});

test('a script reaching for an id that no element declares is reported', () => {
  const findings = checkPageIntegrity(page({ script: "document.getElementById('missing').textContent = '';" }));
  assert.equal(findings.length, 1);
  assert.match(findings[0], /looks up ids that no element declares: missing/);
});

test('ids injected at runtime count as declared', () => {
  // The eBay calculator builds its share and reset buttons with innerHTML, so
  // the ids never appear in static markup. Failing that page would be a false
  // positive, and a check that cries wolf is one the next session turns off.
  const script = `
    const actions = document.createElement('p');
    actions.innerHTML = '<button type="button" id="share">Copy link</button>';
    document.getElementById('share').addEventListener('click', () => {});
  `;
  assert.deepEqual(checkPageIntegrity(page({ script })), []);
});

test('computed ids are skipped rather than guessed at', () => {
  const script = 'for (const n of [1, 2]) document.getElementById(`row-${n}`).remove();';
  assert.deepEqual(checkPageIntegrity(page({ script })), []);
});

test('all three lookup spellings are checked', () => {
  // The bare `$('id')` form is the one-character helper several pages define;
  // it is deliberately distinct from a `.$(...)` method call on some object.
  const scripts = [
    "const el = document.getElementById('gone');",
    "const el = document.querySelector('#gone');",
    "const $ = (id) => document.getElementById(id); const el = $('gone');",
  ];
  for (const script of scripts) {
    const findings = checkPageIntegrity(page({ script }));
    assert.equal(findings.length, 1, `should be checked: ${script}`);
    assert.match(findings[0], /gone/);
  }
});

// The raw-text balance check counts over parsed markup rather than the raw
// file, and these three pin why. The first is the false positive that actually
// reached `main` on 2026-09-10: `social-preview-check/index.html` labels a row
// of its own report table with the literal string `'<title>'`, escaped through
// `escapeHtml` before it is ever rendered, and the sweep called that page one
// that "would not render correctly in a browser". The other two are the reason
// the check cannot simply be deleted instead.
test('a tag name quoted inside an inline script is not counted as markup', () => {
  const findings = checkPageIntegrity(
    page({ script: "const label = '<title>'; document.title = label.length ? 'x' : 'y';" }),
  );
  assert.deepEqual(findings, [], 'a browser never tokenizes a tag inside a script body');
});

test('a surplus open raw-text tag in real markup is still reported', () => {
  // Two opens, one close, and the parse still completes -- so `unclosed` does
  // not fire and this loop is the only thing standing between it and a page
  // that swallows its own tail.
  const findings = checkPageIntegrity(page({ body: '<textarea id="a"></textarea><textarea id="b">' }));
  assert.ok(
    findings.some((f) => /<textarea> is opened 2x but closed 1x/.test(f) || /never closed/.test(f)),
    `expected an imbalance or swallow finding, got: ${JSON.stringify(findings)}`,
  );
});

test('a stray closing raw-text tag in real markup is still reported', () => {
  const findings = checkPageIntegrity(page({ body: '</textarea>' }));
  assert.ok(
    findings.some((f) => /<textarea> is opened 0x but closed 1x/.test(f)),
    `expected a stray-close finding, got: ${JSON.stringify(findings)}`,
  );
});

test('an unresolved merge conflict marker is reported', () => {
  const findings = checkPageIntegrity(page({ body: '<<<<<<< HEAD\n<p>a</p>\n>>>>>>> main' }));
  assert.equal(findings.length, 2, 'both markers are reported');
  assert.ok(findings.every((f) => /merge conflict marker/.test(f)));
});

test('required ids and disclaimer text are enforced against parsed markup', () => {
  const findings = checkPageIntegrity(page(), {
    requiredIds: ['price', 'absent'],
    requiredText: ['No warranty.'],
  });
  assert.equal(findings.length, 2);
  assert.match(findings.join('\n'), /missing from the rendered page: absent/);
  assert.match(findings.join('\n'), /required text is not present.*No warranty/s);
});

test('required text hidden inside a raw-text element does not count as present', () => {
  // A disclaimer sitting inside a <textarea> is in the file but not on the page.
  // Checking the raw source instead of parsed markup would call this a pass.
  const withHiddenNotice = page({ body: '<textarea id="notes">No warranty.</textarea>' });
  const findings = checkPageIntegrity(withHiddenNotice, { requiredText: ['No warranty.'] });
  assert.equal(findings.length, 1);
  assert.match(findings[0], /required text is not present/);
});

test('a module script that parsed as empty and has no src is reported', () => {
  const empty = page().replace(/<script type="module">[\s\S]*?<\/script>/, '<script type="module"></script>');
  const findings = checkPageIntegrity(empty);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /loads no application code/);
});

test('a module script loaded by src is accepted', () => {
  const external = page().replace(/<script type="module">[\s\S]*?<\/script>/, '<script type="module" src="./app.mjs"></script>');
  assert.deepEqual(checkPageIntegrity(external), []);
});

test('parsePage keeps only markup a browser would still parse', () => {
  const { markup, scripts, unclosed } = parsePage(page({ body: '<textarea id="notes"><p id="ghost"></p></textarea>' }));
  assert.equal(unclosed, null);
  assert.ok(declaredIds(markup).has('notes'), 'the textarea open tag carries a real id');
  assert.ok(!declaredIds(markup).has('ghost'), 'markup inside a textarea is text, not an element');
  assert.equal(scripts.length, 1);
});

test('queriedIds ignores a selector that only appears in a comment', () => {
  // The defect this closes: a page that documents a selector in order to warn
  // the next reader off it got that selector read back as a real lookup, and
  // failed for carrying the comment explaining its own bug. Measured on
  // vpat-acr-generator, 2026-09-11.
  const src = `
    // Do not write querySelector('#level-1.1.1') -- the dots are class
    // separators and it throws SyntaxError.
    /* Nor getElementById('ghost-block-comment'). */
    const real = document.getElementById('actually-looked-up');
  `;
  assert.deepEqual([...queriedIds(src)], ['actually-looked-up']);
});

test('stripComments leaves strings, template literals and regexes alone', () => {
  // `//` is ordinary text inside all three, and a naive strip corrupts source.
  const src = [
    "const url = 'https://example.com/a//b';",
    'const t = `see https://example.com/#anchor`;',
    "const re = /https:\\/\\/[^ ]+/g;",
    'const d = total / count / 2; // trailing comment',
  ].join('\n');
  const out = stripComments(src);
  assert.match(out, /https:\/\/example\.com\/a\/\/b/, 'a URL in a string was mangled');
  assert.match(out, /see https:\/\/example\.com\/#anchor/, 'a URL in a template was mangled');
  assert.match(out, /const d = total \/ count \/ 2;/, 'division was treated as a regex');
  assert.doesNotMatch(out, /trailing comment/, 'the trailing comment survived');
});

test('a division slash does not swallow the comment after it', () => {
  // Codex review on #4648. The first version's regex-vs-division test carried
  // an `^` alternative, which matches at position 0 of every string, so it was
  // unconditionally true and every `/` was read as opening a regex literal.
  // The scanner then consumed the comment's own `//` as the closing slash and
  // left the comment text in the output, so `queriedIds` reported an id that
  // appears nowhere but a comment.
  //
  // One operand, not two: `total / count / 2` passes even when broken,
  // because the second division slash closes the bogus regex before the
  // comment starts. That is why the original suite missed this.
  const src = "const x = a / 2; // document.getElementById('ghost')";
  assert.deepEqual([...queriedIds(src)], [], 'a commented-out lookup was reported');
  assert.doesNotMatch(stripComments(src), /ghost/, 'the comment survived the scan');
  assert.match(stripComments(src), /const x = a \/ 2;/, 'the division was mangled');
});

test('a comment inside a template substitution is stripped', () => {
  // Codex review on #4648. Template *text* is content and must survive, but
  // `${...}` is ordinary code and takes comments. Treating the whole backtick
  // literal as opaque skipped them.
  const src = 'const x = `${1 // document.getElementById("ghost2")\n}`;';
  assert.deepEqual([...queriedIds(src)], [], 'a lookup commented out inside ${} was reported');
});

test('template text itself is never treated as code', () => {
  // The other direction of the same change: a `//` in template text is
  // content, and a real lookup written beside it must still be found.
  const src = 'const s = `see https://example.com/#x`; document.getElementById("real");';
  const out = stripComments(src);
  assert.match(out, /see https:\/\/example\.com\/#x/, 'template text was blanked');
  assert.deepEqual([...queriedIds(src)], ['real']);
});

test('a slash inside a regex character class does not end the regex', () => {
  const src = 'const re = /[/]/; // document.getElementById("ghost3")';
  assert.deepEqual([...queriedIds(src)], [], 'a commented-out lookup was reported');
  assert.match(stripComments(src), /\/\[\/\]\//, 'the regex literal was mangled');
});

test('a regex after a control-flow condition is not read as division', () => {
  // Codex review on #4650. `)` is ambiguous: a `/` after the `)` of `if (ok)`
  // opens a regex, after the `)` of `f(x)` it is division. Classifying the
  // first as division let the regex's own `\/` pair with the next slash into
  // a `//`, which blanked the rest of the line and took a real lookup with it
  // -- a false negative, and this repo's inline scripts are frequently one
  // line, so "the rest of the line" can be the whole script.
  const src = "if (ok) /https?:\\/\\//.test(url); document.getElementById('missing');";
  assert.deepEqual([...queriedIds(src)], ['missing'], 'a real lookup was blanked away');
});

test('a misread regex cannot blank the rest of the line', () => {
  // Pins the backslash guard *specifically*, and is the reason it exists as
  // well as the `)` classifier. `}` closing a block also permits a regex
  // after it, and telling a block `}` from an object-literal `}` needs more
  // parsing than this scanner does -- so this case is still misread as
  // division. The guard keeps that mistake local: `\/` is consumed with the
  // character it escapes, so it cannot pair with the next slash into a `//`
  // that blanks everything after it. Without the guard, the real lookup at
  // the end of this line disappears.
  const src = "function f(){} /a\\/\\//.test(s); document.getElementById('afterblock');";
  assert.deepEqual(
    [...queriedIds(src)],
    ['afterblock'],
    'a misread regex swallowed the rest of the line',
  );
});

test('a regex after a condition is parsed as a regex, not merely survived', () => {
  // Pins the paren tracking *specifically*. The escaped-slash case above is
  // fixed by either mechanism -- the `)` classifier or the backslash guard --
  // so it cannot tell which is doing the work, and a later reader deleting
  // one of them would see the suite stay green. This case has no backslash
  // to guard: read as division, the unescaped `/*` inside the character
  // class opens a block comment and blanks everything after it.
  const src = "if (ok) /[/*]/.test(s); document.getElementById('blockc');";
  assert.deepEqual(
    [...queriedIds(src)],
    ['blockc'],
    'the regex after the condition was read as division, blanking the rest',
  );
});

test('a regex after break or continue is not read as division', () => {
  // Codex review on #4650, round 2. `break` and `continue` are restricted
  // productions: a newline after them forces automatic semicolon insertion,
  // so `break\n/re/` is two statements and that slash opens a regex. Read as
  // division, the unescaped `/*` in the character class opens a bogus block
  // comment and the real lookup after it disappears.
  const brk = "while (false) { break\n/[/*]/.test('x'); } document.getElementById('missing');";
  assert.deepEqual([...queriedIds(brk)], ['missing'], 'a real lookup was blanked after break');
  const cont = "for (;;) { continue\n/[/*]/.test('y'); } document.getElementById('cont');";
  assert.deepEqual([...queriedIds(cont)], ['cont'], 'a real lookup was blanked after continue');
});

test('a property named like a keyword is not treated as that keyword', () => {
  // Codex review on #4652. Every word in REGEX_AFTER_KEYWORD is also a legal
  // property name, and `obj.break / 2` is ordinary division. Matching the bare
  // word read that slash as a regex opener, which ate the first slash of the
  // following comment and left its text in the output -- the invented-lookup
  // failure again, reached from the one direction not yet tried.
  //
  // Not only the three keywords added in the previous commit: `obj.return`
  // and `obj?.delete` were misread by the original list too, so the guard is
  // applied to the whole list.
  for (const [src, label] of [
    ["obj.break / 2; // document.getElementById('ghost')", 'break'],
    ["obj.throw / 2; // document.getElementById('ghost')", 'throw'],
    ["obj.continue / 2; // document.getElementById('ghost')", 'continue'],
    ["obj.return / 2; // document.getElementById('ghost')", 'return'],
    ["obj?.delete / 2; // document.getElementById('ghost')", 'optional-chained delete'],
  ]) {
    assert.deepEqual(
      [...queriedIds(src)],
      [],
      `a property named \`${label}\` was read as the keyword, resurrecting a comment`,
    );
  }
});

test('a regex after a labelled break or continue is not read as division', () => {
  // Codex finding 7. `break outer` is still a restricted production, so ASI
  // applies, but the last token is the label -- which hid the keyword from the
  // bare-word check entirely.
  const brk = "outer: while (false) { break outer\n/[/*]/.test('x'); } document.getElementById('m7');";
  assert.deepEqual([...queriedIds(brk)], ['m7'], 'a real lookup was blanked after a labelled break');
  const cont = "outer: for(;;) { continue outer\n/[/*]/.test('x'); } document.getElementById('m7b');";
  assert.deepEqual([...queriedIds(cont)], ['m7b'], 'a real lookup was blanked after a labelled continue');

  // Codex finding 9. A label is a JavaScript identifier, and identifiers are
  // Unicode -- `café:` is as valid as `outer:`. The first version of this fix
  // used an ASCII-only character class, which silently stopped recognising the
  // statement and put the slash back to division.
  const accented = "café: while (false) { break café\n/[/*]/.test('x'); } document.getElementById('m9');";
  assert.deepEqual([...queriedIds(accented)], ['m9'], 'an accented label was not recognised');
  const cjk = "日本: for(;;) { continue 日本\n/[/*]/.test('y'); } document.getElementById('m9b');";
  assert.deepEqual([...queriedIds(cjk)], ['m9b'], 'a non-Latin label was not recognised');
});

test('a newline between break and a name means it is not a label', () => {
  // Codex finding 10. `break` and `continue` are restricted productions, so
  // JavaScript forbids a line terminator before the label. `break\nouter` is
  // `break;` then the expression `outer`, and the slash after it is division.
  // Matching across the newline claimed `outer` as a label, made the slash a
  // regex opener, and let it swallow the comment.
  //
  // This one also got past the cross-check, which is why it matters more than
  // its badge suggests: the comment is introduced as `label://`, whose colon
  // sits exactly where a URL scheme's would, so the naive pass exempts it and
  // agrees with the mistaken lexer. Both readings wrong together is the one
  // way an invented lookup still survives -- see the note on `queriedIds`.
  const src = "while(false){break\nouter / 2; label:// document.getElementById('ghost')\n;}";
  assert.deepEqual([...queriedIds(src)], [], 'a commented-out lookup was reported');

  // The genuine labelled statement must keep working: no newline, so it is a
  // real label and the slash after it really does open a regex.
  const real = "outer: while (false) { break outer\n/[/*]/.test('x'); } document.getElementById('m7');";
  assert.deepEqual([...queriedIds(real)], ['m7'], 'a real labelled break stopped being recognised');
});

test('all four ECMAScript line terminators end a line', () => {
  // Codex finding 11 named the label half. The comment half was not reported
  // and is the same cause pointing the other way, so both are pinned here.
  //
  // `\n` is the one everybody remembers. A lone `\r`, U+2028 and U+2029
  // terminate a line just as definitively, and every place in the scanner that
  // asks "is the line over?" has to agree.
  for (const [name, t] of [['LF', '\n'], ['CR', '\r'], ['LS', '\u2028'], ['PS', '\u2029']]) {
    // Label direction: the separator is a restricted-production boundary, so
    // `outer` is an expression and the slash after it is division. Treating
    // the separator as ordinary space made it a label, opened a regex, and
    // swallowed the comment -- an invented lookup.
    const laballed = `while(false){break${t}outer / 2; label:// document.getElementById('ghost')${t};}`;
    assert.deepEqual([...queriedIds(laballed)], [], `${name} was not treated as a line terminator (label)`);

    // Comment direction: a line comment ends at the terminator. Not ending
    // there swallowed the rest of the file and every lookup in it.
    const commented = `// a comment${t}document.getElementById('real');`;
    assert.deepEqual([...queriedIds(commented)], ['real'], `${name} did not end a line comment`);
  }
});

test('U+2028 and U+2029 do not end a quoted string', () => {
  // Codex finding 12, and a defect I introduced with the previous commit's
  // sweeping fix: `isLineTerminator` was applied to the string-literal scan
  // too. Since ES2019 subsumed JSON, U+2028 and U+2029 are *legal inside a
  // quoted string* -- they stopped ending one, while still ending a comment,
  // a regex literal and a statement. Ending the string early made a later
  // `//` in that same string read as a comment.
  //
  // Asserted on `stripComments` rather than `queriedIds`, and the reason is
  // worth knowing: `queriedIds` drops this lookup anyway, because the naive
  // pass has no idea what a string is and blanks from the `//`. That is the
  // cross-check's documented cost, not this bug, and it would mask the
  // regression completely.
  for (const sep of ['\u2028', '\u2029']) {
    const src = `const s = 'a${sep}// still string'; document.getElementById('ghost')`;
    assert.ok(
      stripComments(src).includes("getElementById('ghost')"),
      `${escape(sep)} ended a quoted string, so a later // read as a comment`,
    );
  }

  // LF and CR do still end one -- the exclusion must not go the other way.
  for (const sep of ['\n', '\r']) {
    const src = `const s = 'unterminated${sep}document.getElementById('real');`;
    assert.deepEqual([...queriedIds(src)], ['real'], 'LF/CR stopped ending a quoted string');
  }
});

test('a lookup written inside a string is prose, not code', () => {
  // Codex finding 13 arrived at this from a strange direction -- a `//` and a
  // U+2028 inside a string -- but the class is older and simpler than the
  // reported case, and predates this whole sequence: `lookupIdsIn` matches
  // textually, and text inside a string literal looks exactly like text
  // outside one.
  const plain = `const s = 'document.getElementById("ghost")';`;
  assert.deepEqual([...queriedIds(plain)], [], 'a lookup quoted inside a string was reported as live');

  // The reported shape: the naive pass used to blank through the separator and
  // hide this by accident. Once it learned that U+2028 ends a line, both passes
  // agreed and the intersection stopped filtering -- so the fix has to be in
  // what counts as code, not in either pass's idea of a comment.
  for (const sep of ['\u2028', '\u2029']) {
    const src = `const s = 'a// prose${sep}document.getElementById("ghost")';`;
    assert.deepEqual([...queriedIds(src)], [], 'lookup-shaped prose inside a string was reported');
  }

  // The distinction that makes this fixable: it is where the *call* sits, not
  // where the id sits. The id is always a string -- that is the part worth
  // keeping -- so blanking string contents wholesale would break every page.
  assert.deepEqual(
    [...queriedIds('document.getElementById("price").value;')],
    ['price'],
    'a genuine lookup stopped being found',
  );
  assert.deepEqual(
    [...queriedIds(`const label = 'a string'; document.getElementById('real');`)],
    ['real'],
    'a preceding string swallowed a genuine lookup',
  );

  // Codex finding 14. A span is only trusted when the string met its closing
  // quote. Unterminated means this scanner mistook something else for a quote
  // and then ran to the end of the line or file, over whatever real code lay
  // between -- and since a span exists to *suppress* a finding, trusting a
  // misparse loses one. Here a block `}` is still read as division (a
  // documented limit), so the regex's `'` opened a "string" that swallowed the
  // rest of the line.
  assert.deepEqual(
    [...queriedIds(`if (ok) {} /'/.test(x); document.getElementById("missing");`)],
    ['missing'],
    'an unterminated string span swallowed a genuine lookup',
  );
  assert.deepEqual(
    [...queriedIds("const s = 'unterminated\ndocument.getElementById('afterEOL');")],
    ['afterEOL'],
    'a string ended by a line terminator suppressed a later lookup',
  );
});

test('a private member named like a keyword is not that keyword', () => {
  // Codex finding 8, and a gap in finding 6's own fix: `this.#break` leaves
  // `#` as the character before the word, not `.`, so the dot guard missed it.
  for (const src of [
    "this.#break / 2; // document.getElementById('ghost')",
    "this.#return / 2; // document.getElementById('ghost')",
  ]) {
    assert.deepEqual([...queriedIds(src)], [], 'a private member was read as a keyword');
    // Asserted at the stripComments level too, and deliberately. Through
    // `queriedIds` the cross-check below would mask this guard entirely --
    // removing it fails no test, because the naive pass drops the id anyway.
    // That is the cross-check working, but it would let the lexer silently rot.
    assert.doesNotMatch(
      stripComments(src),
      /ghost/,
      'the comment survived stripComments: a private member was read as a keyword',
    );
  }
});

test('a broken lexer can lose an id but can never invent one', () => {
  // The safety property the cross-check exists for, stated as a test rather
  // than as a claim in a docstring. Eight review findings landed on
  // `stripComments`; four were the invented-lookup kind. Intersecting with an
  // independent naive scan makes that direction structurally impossible, so it
  // holds for the lexing bug nobody has found yet.
  //
  // This asserts the composition rather than simulating a broken lexer, which
  // a unit test cannot do without rewriting the module: a comment that the
  // careful pass somehow let through still has to survive the naive pass, and
  // on an ordinary line comment it cannot.
  const commented = "const x = a / 2; // document.getElementById('ghost')";
  assert.deepEqual([...queriedIds(commented)], [], 'a commented-out lookup was reported');
  assert.ok(
    naiveDropsIt(commented, 'ghost'),
    'the naive pass did not independently reject the commented-out lookup',
  );
});

/** Does the deliberately naive reading also refuse to see `id`? */
function naiveDropsIt(source, id) {
  // Re-derived here rather than exported: the test should notice if the naive
  // pass stops being an independent opinion, not inherit whatever it became.
  const naive = source
    .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])(\/\/[^\n]*)/g, (w, b, c) => b + c.replace(/[^\n]/g, ' '));
  return !naive.includes(id);
}

test('an id is only reported when both readings agree it is live', () => {
  // The structural guard. `queriedIds` intersects the careful lexer with a
  // deliberately naive comment scan, so a lexing bug can cost a finding but
  // can never invent one -- the direction that matters for a gate over 995
  // pages. Sabotaging stripComments to return its input unchanged is the
  // strongest form of "the lexer is wrong": every comment survives it.
  const commented = "const x = a / 2; // document.getElementById('ghost')";
  assert.deepEqual(
    [...queriedIds(commented)],
    [],
    'a commented-out lookup was reported',
  );
  // And the naive pass must not be so eager that it eats real code: the two
  // exemptions it carries are a URL in a string and the escaped slashes of a
  // URL-matching regex.
  const url = 'const u = "https://example.com/x"; document.getElementById("real");';
  assert.deepEqual([...queriedIds(url)], ['real'], 'a URL in a string blanked the line');
  const rx = "if (ok) /https?:\\/\\//.test(url); document.getElementById('m3');";
  assert.deepEqual([...queriedIds(rx)], ['m3'], 'an escaped-slash regex blanked the line');
});

test('a real keyword is still a keyword', () => {
  // The other side of the same change: excluding member properties must not
  // stop the genuine statement keywords from permitting a regex, or the two
  // findings fixed in the previous commit come straight back.
  const ret = "return /[/*]/.test(s); document.getElementById('m3');";
  assert.deepEqual([...queriedIds(ret)], ['m3'], 'a real `return` stopped permitting a regex');
});

test('a regex used as a throw operand is not read as division', () => {
  // Same round. `throw` can take a regex literal as its same-line operand and
  // can never be followed by division, so a `/` after it is always a regex.
  const src = "function fail() { throw /[/*]/; } document.getElementById('missing2');";
  assert.deepEqual([...queriedIds(src)], ['missing2'], 'a real lookup was blanked after throw');
});

test('a newline alone does not make the next slash a regex', () => {
  // The fix Codex proposed for the break/continue case was to treat a removed
  // newline as a statement boundary. That would be wrong, and this pins why:
  // a newline does *not* imply ASI when the next line can continue the
  // expression, and `/` can. `const a = b` / newline / `/re/.test(c)` is the
  // classic trap and really parses as two divisions. Treating it as a regex
  // would swallow to the next slash and invent lookups -- the direction these
  // guards exist to prevent. The keyword list is the correct mechanism,
  // because after `break`/`continue`/`throw` no division is possible at all.
  const src = "const a = b\n/re/.test(c); document.getElementById('asi');";
  assert.deepEqual([...queriedIds(src)], ['asi'], 'the ASI-trap line was mis-parsed');

  // And the case that shows the cost rather than merely the parse. Here the
  // continued expression is a division with a comment after it. Read as a
  // regex, the scan runs to the comment's first slash, the `//` pair is
  // broken up, the comment text survives, and a lookup that exists only
  // inside a comment is reported as live -- the exact false positive
  // `stripComments` was added to remove.
  const costly = "const a = b\n/ 2; // document.getElementById('ghost')\nconst c = 1;";
  assert.deepEqual(
    [...queriedIds(costly)],
    [],
    'treating a newline as a statement boundary resurrected a commented-out lookup',
  );
});

test('division after a call is still division', () => {
  // The other side of the same change: fixing `if (ok) /re/` must not turn
  // every `)` into a regex opener, or `f(x) / 2` starts swallowing comments
  // again -- the defect fixed one commit earlier.
  const src = "const n = f(x) / 2; // document.getElementById('ghost')";
  assert.deepEqual([...queriedIds(src)], [], 'a commented-out lookup was reported');
  assert.match(stripComments(src), /const n = f\(x\) \/ 2;/, 'the division was mangled');
});

test('stripComments preserves length and line count', () => {
  // Offsets and line numbers stay usable for any future finding.
  const src = "a(); // gone\n/* also\ngone */ b();";
  const out = stripComments(src);
  assert.equal(out.length, src.length, 'offsets shifted');
  assert.equal(out.split('\n').length, src.split('\n').length, 'line count changed');
});

test('queriedIds ignores unrelated $ calls', () => {
  assert.deepEqual([...queriedIds("jQuery$('nope'); const a = obj.$('x');")], []);
});

test('catches the real defect at the revisions where it actually shipped', (t) => {
  // These are the commits in this repository's history, not a reconstruction.
  // The calculator was live and completely non-functional at the first three.
  const brokenRevisions = ['1a8feb3', 'a702ff4', '58d9b65'];
  const repaired = '4d4e6f0';
  const blobs = readHistoryBlobs(t, [...brokenRevisions, repaired], 'ventures/cut-list-optimizer/index.html');
  if (!blobs) return;
  const read = (rev) => blobs.get(rev);

  for (const rev of brokenRevisions) {
    const findings = checkPageIntegrity(read(rev));
    assert.ok(findings.length > 0, `${rev} shipped a dead page and must be caught`);
    assert.match(findings[0], /<textarea> is never closed/, `${rev} should be caught for the actual cause`);
  }
  assert.deepEqual(checkPageIntegrity(read(repaired)), [], `${repaired} repaired the page and must pass`);
});

// --- inline script syntax -------------------------------------------------
//
// The second dead product in this portfolio was not a markup defect at all.
// `3pl-quote-normalizer/index.html` shipped an inline module that did not parse,
// so the browser ran none of it while every structural check above passed. These
// tests pin that gate in both directions, the same way the cut-list ones do.

test('a script that does not parse is reported as a dead page', () => {
  const findings = checkPageIntegrity(page({ script: "const el = document.getElementById('price')foo();" }));
  assert.equal(findings.length, 1);
  assert.match(findings[0], /does not parse, so the browser runs none of it/);
  assert.match(findings[0], /SyntaxError/);
});

test('a parse failure suppresses the id findings it would otherwise cause', () => {
  // A script that never runs looks up no ids. Reporting them as missing buries
  // the one finding that explains the dead page.
  const findings = checkPageIntegrity(page({ script: "document.getElementById('nosuchid')bar();" }));
  assert.equal(findings.length, 1);
  assert.doesNotMatch(findings[0], /ids that no element declares/);
});

test('module syntax is accepted in a module script and rejected in a classic one', () => {
  const source = "import { calculate } from './calc.mjs';\ncalculate();";
  assert.deepEqual(checkPageIntegrity(page({ script: source })), []);

  const classic = `<!doctype html><html lang="en"><head><title>T</title></head><body>
    <script>${source}</script></body></html>`;
  const findings = checkPageIntegrity(classic);
  assert.equal(findings.length, 1);
  assert.match(findings[0], /does not parse/);
});

test('non-JavaScript script blocks are left to their own parsers', () => {
  // A template block is data the JS parser has no business reading.
  const template = `<!doctype html><html lang="en"><head><title>T</title></head><body>
    <script type="text/template"><p>{{ not js }}</p></script></body></html>`;
  assert.deepEqual(checkPageIntegrity(template), []);
});

test('malformed JSON-LD is caught, valid JSON-LD passes', () => {
  const withLd = (json) => `<!doctype html><html lang="en"><head><title>T</title>
    <script type="application/ld+json">${json}</script></head><body></body></html>`;
  assert.deepEqual(checkPageIntegrity(withLd('{"@type":"WebApplication"}')), []);
  const findings = checkPageIntegrity(withLd('{"@type":"WebApplication",}'));
  assert.equal(findings.length, 1);
  assert.match(findings[0], /JSON-LD block 1 is not valid JSON/);
});

test('a src-only script has no body to parse and passes', () => {
  const shell = `<!doctype html><html lang="en"><head><title>T</title></head><body>
    <script type="module" src="./app.mjs"></script></body></html>`;
  assert.deepEqual(checkPageIntegrity(shell), []);
});

test('catches the 3PL syntax defect at the revision where it actually shipped', (t) => {
  // Again the real blobs, not a reconstruction: the commit that repaired the
  // calculator and its parent, where the page was live and completely dead.
  const blobs = readHistoryBlobs(t, ['6ccd73c^', '6ccd73c'], 'ventures/3pl-quote-normalizer/index.html');
  if (!blobs) return;
  const read = (rev) => blobs.get(rev);

  const findings = checkPageIntegrity(read('6ccd73c^'));
  assert.ok(findings.length > 0, 'the shipped page did not parse and must be caught');
  assert.match(findings[0], /does not parse, so the browser runs none of it/);
  // The token ASI could not recover at, named so the reader knows where to look.
  assert.match(findings[0], /document/);

  assert.deepEqual(checkPageIntegrity(read('6ccd73c')), [], 'the repaired page must pass');
});
