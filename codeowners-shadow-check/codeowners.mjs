// Pure CODEOWNERS parsing, gitignore-style pattern matching, and the one
// analysis a syntax-only linter cannot give you: which earlier, more
// specific rules are silently overridden by a broader rule listed later in
// the file, because GitHub resolves CODEOWNERS with "last matching pattern
// wins" -- the same rule as .gitignore, and the single most common way a
// CODEOWNERS file quietly stops doing what its author thinks it does.
//
// No network, no filesystem here: everything below takes the file's text
// and a list of path strings and returns data. The one thing this cannot
// tell you is whether a listed owner is a real user, team, or collaborator
// on the repository -- that needs an authenticated GitHub API call this
// tool deliberately never makes (see index.html's privacy line).

const OWNER_RE = /^(?:@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?(?:\/[a-zA-Z0-9._-]+)?|[^\s@]+@[^\s@]+\.[^\s@]+)$/;

/**
 * Parse CODEOWNERS text into an ordered list of rules. Blank lines and `#`
 * comments are skipped, matching GitHub's own parser. A trailing comment on
 * a rule line (` # note`) is stripped before splitting on whitespace, the
 * same as GitHub does.
 */
export function parseCodeowners(text) {
  const rules = [];
  const errors = [];
  const lines = String(text ?? '').split(/\r\n|\r|\n/);
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const noComment = stripComment(raw);
    const trimmed = noComment.trim();
    if (trimmed === '') return;
    const parts = trimmed.split(/\s+/);
    const pattern = parts[0];
    const owners = parts.slice(1);
    const badOwners = owners.filter((o) => !OWNER_RE.test(o));
    if (badOwners.length > 0) {
      errors.push({
        line: lineNumber,
        raw: raw.trim(),
        message: `owner(s) do not look like @user, @org/team, or an email address: ${badOwners.join(', ')}`,
      });
    }
    rules.push({
      line: lineNumber,
      raw: raw.trim(),
      pattern,
      owners,
      noOwners: owners.length === 0,
    });
  });
  return { rules, errors };
}

function stripComment(line) {
  // A '#' only starts a comment outside of... CODEOWNERS has no quoting
  // mechanism, so unlike .gitignore there is no escape to worry about: any
  // unescaped '#' with nothing but whitespace before it (or preceded by
  // whitespace) starts a trailing comment. A line whose first non-space
  // character is '#' is a comment line in full.
  const hashIndex = line.indexOf('#');
  if (hashIndex === -1) return line;
  const before = line.slice(0, hashIndex);
  if (before.trim() === '') return '';
  // Only strip when '#' is preceded by whitespace (a real trailing comment),
  // matching GitHub's parser rather than truncating a pattern that happens
  // to contain '#' with no space before it (rare, but patterns are globs,
  // not free text).
  if (/\s$/.test(before)) return before;
  return line;
}

/** True if `rawPattern` is anchored to the CODEOWNERS file's directory
 * (contains a '/' at the start or middle) rather than matching at any depth.
 * Mirrors gitignore's own rule, which GitHub states CODEOWNERS follows. */
function isAnchored(rawPattern) {
  const body = rawPattern.endsWith('/') ? rawPattern.slice(0, -1) : rawPattern;
  return body.includes('/');
}

function escapeRegExpChar(ch) {
  return /[.*+?^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}

/** One path segment of a pattern (no '/', may contain '*' and '?') into a
 * RegExp matching exactly one path segment. */
function segmentRegExp(segment) {
  let out = '^';
  for (const ch of segment) {
    if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else out += escapeRegExpChar(ch);
  }
  return new RegExp(`${out}$`);
}

/** Split a CODEOWNERS pattern into matchable segments: '**' stays a single
 * wildcard segment, a trailing '/' becomes an implicit '**' so the pattern
 * also matches everything under that directory, and a pattern with no
 * anchoring slash gets an implicit leading '**' so it matches at any depth
 * -- both exactly as .gitignore (and therefore CODEOWNERS) define it. */
export function patternToSegments(rawPattern) {
  let body = rawPattern.startsWith('/') ? rawPattern.slice(1) : rawPattern;
  const dirOnly = body.endsWith('/');
  if (dirOnly) body = body.slice(0, -1);
  const anchored = isAnchored(rawPattern);
  let segments = body.split('/').filter((s) => s.length > 0);
  if (dirOnly) segments = [...segments, '**'];
  if (!anchored) segments = ['**', ...segments];
  return segments;
}

function segmentsMatch(patternSegments, pathSegments) {
  const compiled = patternSegments.map((s) => (s === '**' ? '**' : segmentRegExp(s)));
  function walk(pi, si) {
    if (pi === compiled.length) return si === pathSegments.length;
    const seg = compiled[pi];
    if (seg === '**') {
      for (let k = si; k <= pathSegments.length; k++) {
        if (walk(pi + 1, k)) return true;
      }
      return false;
    }
    if (si >= pathSegments.length) return false;
    if (!seg.test(pathSegments[si])) return false;
    return walk(pi + 1, si + 1);
  }
  return walk(0, 0);
}

/** Does `rawPattern` match `path` (a repo-relative path, no leading '/')? */
export function patternMatches(rawPattern, path) {
  const pathSegments = String(path).split('/').filter((s) => s.length > 0);
  return segmentsMatch(patternToSegments(rawPattern), pathSegments);
}

/**
 * Resolve which rule owns each path under "last matching pattern wins" --
 * GitHub's actual CODEOWNERS semantics, the same as .gitignore. Returns one
 * row per path: the winning rule (or null, meaning no rule covers it) and
 * every rule that matched, in file order, so the report can show exactly
 * which earlier rule(s) a path's winner overrides.
 */
export function resolveOwnership(rules, paths) {
  return paths.map((path) => {
    const matches = rules
      .map((rule, ruleIndex) => ({ rule, ruleIndex }))
      .filter(({ rule }) => patternMatches(rule.pattern, path));
    const winner = matches.length > 0 ? matches[matches.length - 1] : null;
    return { path, matches, winner: winner ? winner.rule : null, winnerIndex: winner ? winner.ruleIndex : -1 };
  });
}

/**
 * Rules that never actually assign ownership for any path in the supplied
 * list, because every path they match is also matched (and therefore
 * overridden, last-match-wins) by a later rule. This is evidence against
 * the *sample* of paths given, not a proof the rule is dead in the whole
 * repository -- a rule matching none of the given paths is reported
 * separately (see `unmatchedRules`) since that usually means the sample
 * just did not include a matching file, not that the pattern is wrong.
 */
export function shadowedRules(rules, resolved) {
  const shadowed = [];
  rules.forEach((rule, ruleIndex) => {
    const matchedRows = resolved.filter((row) => row.matches.some((m) => m.ruleIndex === ruleIndex));
    if (matchedRows.length === 0) return; // reported by unmatchedRules instead
    const neverWins = matchedRows.every((row) => row.winnerIndex !== ruleIndex);
    if (!neverWins) return;
    const overriddenBy = new Map();
    for (const row of matchedRows) {
      const key = row.winnerIndex;
      if (!overriddenBy.has(key)) overriddenBy.set(key, { rule: row.winner, paths: [] });
      overriddenBy.get(key).paths.push(row.path);
    }
    shadowed.push({
      rule,
      ruleIndex,
      matchedPathCount: matchedRows.length,
      overriddenBy: [...overriddenBy.values()].sort((a, b) => b.paths.length - a.paths.length),
    });
  });
  return shadowed;
}

/** Rules that matched none of the supplied paths -- a typo, a path that no
 * longer exists, or simply a sample that did not include a matching file.
 * Reported as a notice, never a danger: this is the honest limit of
 * evidence from a finite path list, not proof the pattern is wrong. */
export function unmatchedRules(rules, resolved) {
  return rules.filter((rule, ruleIndex) => !resolved.some((row) => row.matches.some((m) => m.ruleIndex === ruleIndex)));
}

/** Paths covered by no rule at all -- falls back to the repository's
 * default reviewers, if any, or to no required review. */
export function uncoveredPaths(resolved) {
  return resolved.filter((row) => row.winner === null).map((row) => row.path);
}

/**
 * Build a full report from raw CODEOWNERS text and a newline-separated
 * list of repo-relative file paths. `paths` may be empty -- syntax errors
 * and a parsed rule table are still useful with no path list, but shadowing
 * and coverage need at least one path to say anything.
 */
export function buildReport(codeownersText, pathsText) {
  const { rules, errors } = parseCodeowners(codeownersText);
  const paths = String(pathsText ?? '')
    .split(/\r\n|\r|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !p.startsWith('#'));
  const noOwnerRules = rules.filter((r) => r.noOwners);
  const resolved = paths.length > 0 ? resolveOwnership(rules, paths) : [];
  const shadowed = paths.length > 0 ? shadowedRules(rules, resolved) : [];
  const unmatched = paths.length > 0 ? unmatchedRules(rules, resolved) : [];
  const uncovered = paths.length > 0 ? uncoveredPaths(resolved) : [];
  return {
    ruleCount: rules.length,
    rules,
    syntaxErrors: errors,
    noOwnerRules,
    pathCount: paths.length,
    resolved,
    shadowed,
    unmatched,
    uncovered,
    ok: errors.length === 0 && shadowed.length === 0,
  };
}
