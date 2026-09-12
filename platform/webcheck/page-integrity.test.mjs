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
