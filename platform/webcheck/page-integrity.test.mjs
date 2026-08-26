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
import { execFileSync } from 'node:child_process';
import { checkPageIntegrity, parsePage, declaredIds, queriedIds } from './page-integrity.mjs';

const REPO = new URL('../../', import.meta.url).pathname;

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

test('queriedIds ignores unrelated $ calls', () => {
  assert.deepEqual([...queriedIds("jQuery$('nope'); const a = obj.$('x');")], []);
});

test('catches the real defect at the revisions where it actually shipped', () => {
  // These are the commits in this repository's history, not a reconstruction.
  // The calculator was live and completely non-functional at the first three.
  const brokenRevisions = ['1a8feb3', 'a702ff4', '58d9b65'];
  const repaired = '4d4e6f0';
  const read = (rev) =>
    execFileSync('git', ['show', `${rev}:ventures/cut-list-optimizer/index.html`], {
      cwd: REPO,
      maxBuffer: 1 << 26,
    }).toString();

  for (const rev of brokenRevisions) {
    const findings = checkPageIntegrity(read(rev));
    assert.ok(findings.length > 0, `${rev} shipped a dead page and must be caught`);
    assert.match(findings[0], /<textarea> is never closed/, `${rev} should be caught for the actual cause`);
  }
  assert.deepEqual(checkPageIntegrity(read(repaired)), [], `${repaired} repaired the page and must pass`);
});
