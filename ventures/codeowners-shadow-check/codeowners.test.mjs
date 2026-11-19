import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCodeowners,
  patternToSegments,
  patternMatches,
  resolveOwnership,
  shadowedRules,
  unmatchedRules,
  uncoveredPaths,
  buildReport,
} from './codeowners.mjs';

test('parses rules and skips comments and blank lines', () => {
  const { rules, errors } = parseCodeowners([
    '# top comment',
    '',
    '*.js @frontend-team',
    '/docs/ @docs-team @jane',
    '  # indented comment',
  ].join('\n'));
  assert.equal(errors.length, 0);
  assert.equal(rules.length, 2);
  assert.equal(rules[0].pattern, '*.js');
  assert.deepEqual(rules[0].owners, ['@frontend-team']);
  assert.equal(rules[1].line, 4);
  assert.deepEqual(rules[1].owners, ['@docs-team', '@jane']);
});

test('strips a trailing comment but not a pattern containing a literal #-less path', () => {
  const { rules } = parseCodeowners('*.rb @ruby-owners  # keep this line short');
  assert.equal(rules.length, 1);
  assert.equal(rules[0].pattern, '*.rb');
  assert.deepEqual(rules[0].owners, ['@ruby-owners']);
});

test('flags an owner that is not @user, @org/team, or an email', () => {
  const { errors } = parseCodeowners('*.go golang-team');
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /golang-team/);
});

test('accepts @user, @org/team, and email owners', () => {
  const { errors } = parseCodeowners([
    '*.py @octocat',
    '*.rs @my-org/rust-team',
    '*.md docs@example.com',
  ].join('\n'));
  assert.equal(errors.length, 0);
});

test('a pattern with no owners is recorded, not flagged as a syntax error', () => {
  const { rules, errors } = parseCodeowners('*.generated.js');
  assert.equal(errors.length, 0);
  assert.equal(rules[0].noOwners, true);
});

test('a pattern with no internal slash matches at any depth', () => {
  assert.ok(patternMatches('*.js', 'src/app.js'));
  assert.ok(patternMatches('*.js', 'app.js'));
  assert.ok(patternMatches('*.js', 'a/b/c/app.js'));
  assert.ok(!patternMatches('*.js', 'app.ts'));
});

test('a leading-slash pattern is anchored to the repo root', () => {
  assert.ok(patternMatches('/build', 'build'));
  assert.ok(!patternMatches('/build', 'apps/build'));
});

test('a pattern with a middle slash is anchored even with no leading slash', () => {
  assert.ok(patternMatches('apps/web', 'apps/web'));
  assert.ok(!patternMatches('apps/web', 'other/apps/web'));
});

test('a trailing-slash directory pattern matches everything under it', () => {
  assert.ok(patternMatches('docs/', 'docs/readme.md'));
  assert.ok(patternMatches('docs/', 'docs/nested/deep/file.md'));
  assert.ok(!patternMatches('docs/', 'not-docs/readme.md'));
});

test('an unanchored directory-shaped pattern matches that directory name at any depth', () => {
  assert.ok(patternMatches('build/', 'apps/web/build/out.js'));
  assert.ok(patternMatches('build/', 'build/out.js'));
});

test('** matches across directory boundaries, including zero segments', () => {
  assert.ok(patternMatches('apps/**/test/*.js', 'apps/web/test/a.js'));
  assert.ok(patternMatches('apps/**/test/*.js', 'apps/test/a.js'));
  assert.ok(!patternMatches('apps/**/test/*.js', 'apps/web/other/a.js'));
});

test('patternToSegments prepends an implicit ** for an unanchored pattern', () => {
  assert.deepEqual(patternToSegments('*.js'), ['**', '*.js']);
  assert.deepEqual(patternToSegments('/docs/'), ['docs', '**+']);
});

// Regressions found by the differential test against git (codeowners.git.test.mjs):
// a trailing '**' (written, or implied by a trailing '/') used to match zero
// segments, so a directory rule also owned a file with the directory's name.
test('a directory-only pattern does not match a file with that name', () => {
  assert.ok(!patternMatches('build/', 'scripts/build'));
  assert.ok(patternMatches('build/', 'scripts/build/out.js'));
  assert.ok(!patternMatches('/docs/', 'docs'));
  assert.ok(!patternMatches('*.d/', 'conf/x.d'));
  assert.ok(patternMatches('*.d/', 'conf/x.d/a.conf'));
});

test('a trailing /** matches only what is inside the directory', () => {
  assert.ok(!patternMatches('docs/**', 'docs'));
  assert.ok(patternMatches('docs/**', 'docs/a.md'));
  assert.ok(patternMatches('docs/**', 'docs/x/a.md'));
  // `dir/**/` names directories inside dir, so its direct files are not matched
  assert.ok(!patternMatches('docs/**/', 'docs/a.md'));
  assert.ok(patternMatches('docs/**/', 'docs/x/a.md'));
  assert.ok(patternMatches('**', 'README.md'));
});

test('a later directory rule no longer shadows a rule for a same-named file', () => {
  const report = buildReport('/scripts/build @ci\nbuild/ @frontend\n', 'scripts/build\nweb/build/app.js\n');
  assert.equal(report.shadowed.length, 0);
  assert.equal(report.resolved.find((r) => r.path === 'scripts/build').winner.owners[0], '@ci');
});

test('last matching pattern wins, matching GitHub CODEOWNERS semantics', () => {
  const { rules } = parseCodeowners([
    '*.js @generalists',
    '/src/payments/*.js @payments-team',
  ].join('\n'));
  const resolved = resolveOwnership(rules, ['src/payments/charge.js', 'src/other/util.js']);
  assert.deepEqual(resolved[0].winner.owners, ['@payments-team']);
  assert.deepEqual(resolved[1].winner.owners, ['@generalists']);
});

test('shadowedRules flags a specific rule that a later broad rule always overrides', () => {
  const { rules } = parseCodeowners([
    '/src/payments/*.js @payments-team',
    '*.js @generalists',
  ].join('\n'));
  const paths = ['src/payments/charge.js', 'src/payments/refund.js'];
  const resolved = resolveOwnership(rules, paths);
  const shadowed = shadowedRules(rules, resolved);
  assert.equal(shadowed.length, 1);
  assert.equal(shadowed[0].rule.pattern, '/src/payments/*.js');
  assert.equal(shadowed[0].matchedPathCount, 2);
  assert.equal(shadowed[0].overriddenBy[0].rule.pattern, '*.js');
  assert.deepEqual(shadowed[0].overriddenBy[0].paths.sort(), paths.sort());
});

test('a specific rule placed after the broad rule is not shadowed', () => {
  const { rules } = parseCodeowners([
    '*.js @generalists',
    '/src/payments/*.js @payments-team',
  ].join('\n'));
  // Two paths so the broad rule also has a file it alone covers -- with
  // only the payments path in the sample the broad rule would trivially
  // read as "never won on what I was shown," which is a true but
  // uninteresting statement about a one-path sample, not about the rule.
  const resolved = resolveOwnership(rules, ['src/payments/charge.js', 'src/app.js']);
  const shadowed = shadowedRules(rules, resolved);
  assert.equal(shadowed.length, 0);
});

test('a rule that matches nothing in the sample is unmatched, not shadowed', () => {
  const { rules } = parseCodeowners([
    '*.rb @ruby-owners',
    '*.js @generalists',
  ].join('\n'));
  const resolved = resolveOwnership(rules, ['app.js']);
  const shadowed = shadowedRules(rules, resolved);
  const unmatched = unmatchedRules(rules, resolved);
  assert.equal(shadowed.length, 0);
  assert.equal(unmatched.length, 1);
  assert.equal(unmatched[0].pattern, '*.rb');
});

test('a rule partly winning is not shadowed even if a later rule also matches it elsewhere', () => {
  const { rules } = parseCodeowners([
    '/src/payments/*.js @payments-team',
    '/src/payments/legacy.js @legacy-owner',
  ].join('\n'));
  const resolved = resolveOwnership(rules, ['src/payments/charge.js', 'src/payments/legacy.js']);
  const shadowed = shadowedRules(rules, resolved);
  assert.equal(shadowed.length, 0, 'the first rule still wins on charge.js, so it is not dead');
});

test('uncoveredPaths lists paths no rule matches', () => {
  const { rules } = parseCodeowners('*.js @generalists');
  const resolved = resolveOwnership(rules, ['app.js', 'README.md']);
  assert.deepEqual(uncoveredPaths(resolved), ['README.md']);
});

test('buildReport is ok with no shadowing and no syntax errors', () => {
  const report = buildReport('*.js @generalists', 'app.js');
  assert.equal(report.ok, true);
  assert.equal(report.pathCount, 1);
});

test('buildReport flags shadowing and is not ok', () => {
  const report = buildReport(
    ['/src/payments/*.js @payments-team', '*.js @generalists'].join('\n'),
    'src/payments/charge.js',
  );
  assert.equal(report.ok, false);
  assert.equal(report.shadowed.length, 1);
});

test('buildReport with no path list still parses and reports zero paths', () => {
  const report = buildReport('*.js @generalists', '');
  assert.equal(report.pathCount, 0);
  assert.equal(report.ruleCount, 1);
  assert.equal(report.shadowed.length, 0);
  assert.equal(report.uncovered.length, 0);
});

test('buildReport ignores blank lines and #-comments in the pasted path list', () => {
  const report = buildReport('*.js @generalists', ['app.js', '', '# a comment', 'lib.js'].join('\n'));
  assert.equal(report.pathCount, 2);
});

test('the worked example (a specific rule shadowed by a later broad rule) matches the page', () => {
  // Kept in lockstep with index.html's EXAMPLE constant by page.test.mjs.
  const codeowners = [
    '# Intended: payments code needs a second set of eyes',
    '/src/payments/*.js @payments-team',
    '',
    '# Added later: a catch-all for everything else',
    '*.js @generalists',
  ].join('\n');
  const paths = ['src/payments/charge.js', 'src/payments/refund.js', 'src/app.js'];
  const report = buildReport(codeowners, paths.join('\n'));
  assert.equal(report.ok, false, 'the catch-all added later silently overrides the payments rule');
  assert.equal(report.shadowed.length, 1);
  assert.equal(report.shadowed[0].rule.pattern, '/src/payments/*.js');
});

test('a directory pattern without a trailing slash covers the files under it (GitHub docs examples)', () => {
  // Quality census 2026-11-15-8354: `/apps/github` and `**/logs` matched nothing
  // inside the directory, so the lost review requirement was reported as "unmatched".
  assert.equal(patternMatches('/src/payments', 'src/payments/charge.js'), true);
  assert.equal(patternMatches('/apps/github', 'apps/github/deep/x.rb'), true);
  assert.equal(patternMatches('**/logs', 'build/logs/a.log'), true);
  assert.equal(patternMatches('**/logs', 'deeply/nested/logs/x/y.log'), true);
  assert.equal(patternMatches('apps', 'web/apps/index.js'), true); // unanchored: any depth
  assert.equal(patternMatches('/src/payments', 'src/paymentsX/a.js'), false);
  // GitHub's exception: a wildcard last segment does not reach nested files.
  assert.equal(patternMatches('docs/*', 'docs/getting-started.md'), true);
  assert.equal(patternMatches('docs/*', 'docs/build-app/troubleshooting.md'), false);
  assert.equal(patternMatches('*.js', 'src/app.js'), true);
});

// Red-team 2026-11-16: three seeded faults passed this suite.
test('accepts owner handles with any digit, not only 0 and 1', () => {
  const { errors } = parseCodeowners('*.py @dev42x\n*.rs @acme9/team-7');
  assert.deepEqual(errors, []);
});

test('an anchored trailing-slash pattern keeps its full last directory name', () => {
  // `src/docs/` is anchored by its middle slash; dropping one character too
  // many from the trailing slash would read it as `src/doc` and unanchor it.
  assert.ok(patternMatches('src/docs/', 'src/docs/a.md'));
  assert.ok(!patternMatches('src/docs/', 'lib/src/docs/a.md'));
  assert.ok(!patternMatches('/ab/', 'x/ab/c'));
});

test('a single listed path is enough to report a rule that matches nothing', () => {
  const report = buildReport('*.js @a\n/docs/ @b', 'src/app.js');
  assert.equal(report.pathCount, 1);
  assert.deepEqual(report.unmatched.map((r) => r.pattern), ['/docs/']);
});

// GitHub's CODEOWNERS docs: "Using ! to negate a pattern doesn't work",
// "Using [ ] to define a character range doesn't work", escaping a leading #
// with \ "doesn't work", and "If any line ... contains invalid syntax, that
// line will be skipped". The page must not call such a file clean.
test('flags gitignore syntax GitHub does not support in CODEOWNERS', () => {
  const { errors } = parseCodeowners([
    '*.js @a',
    '!vendor/*.js @b',
    '*.[ch] @c',
    '\\#notes.md @d',
  ].join('\n'));
  assert.deepEqual(errors.map((e) => e.line), [2, 3, 4]);
  assert.match(errors[0].message, /negat/);
  assert.match(errors[1].message, /\[ \]/);
  assert.match(errors[2].message, /\\#/);
  assert.equal(buildReport('!vendor/ @b', 'vendor/x.js').ok, false);
});

test('a rule shadowed only by rules with the same owners is redundant, not a lost review', () => {
  const same = buildReport('/CLAUDE.md @Owner\n**/CLAUDE.md @owner\n', 'CLAUDE.md\nweb/CLAUDE.md\n');
  assert.equal(same.shadowed.length, 1);
  assert.equal(same.shadowed[0].sameOwners, true);
  assert.equal(same.redundant.length, 1);
  assert.equal(same.ok, true);
  const diff = buildReport('/src/pay/*.js @payments\n*.js @generalists\n', 'src/pay/a.js\n');
  assert.equal(diff.shadowed[0].sameOwners, false);
  assert.equal(diff.redundant.length, 0);
  assert.equal(diff.ok, false);
});
