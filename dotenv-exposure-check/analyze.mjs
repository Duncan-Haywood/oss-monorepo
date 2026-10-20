// Classifies a set of per-path probe results (real HTTP responses, collected
// by probe.mjs's live requests) into a verdict about whether a target is
// publicly serving one of its own dotenv files.
//
// Pure function, no I/O, no network -- imported identically by the CLI
// (check.mjs) and the browser page (index.html).
//
// The one rule every function in this file is built around: a dotenv file's
// whole purpose is holding secrets, so this tool must never let a secret
// VALUE reach a report, a screen, a JSON blob, or anything a user might paste
// somewhere else. `parseEnvLines` is the only place a response body's
// content is inspected, and it returns key names and line shape only --
// never a value, never even a value's length or first character. Everything
// downstream of it operates on that redacted shape.
//
// What each classification means:
//
//   exposed    The path returned 200 and its body's non-comment,
//              non-blank lines are overwhelmingly KEY=VALUE shaped -- this
//              really is a dotenv file, not an unrelated page. Two
//              severities:
//                critical  at least one exposed key's *name* matches a
//                          common secret-naming pattern (SECRET, TOKEN,
//                          PASSWORD, API_KEY, and similar) -- the strongest
//                          signal available without ever reading the value
//                          itself.
//                danger    keys are exposed but none matched a
//                          secret-naming pattern -- still a real
//                          configuration-structure leak (which services are
//                          integrated, what environment this is), just
//                          without a name-level signal of a live credential.
//   blocked    The path returned a clean 401/403/404/410 -- not reachable.
//              A healthy outcome, whether the file was never there or a
//              server rule already denies it.
//   not-env    The path returned 200, but the body's shape does not look
//              like a dotenv file (mostly HTML, mostly prose, empty, or a
//              minority of lines are KEY=VALUE shaped) -- most likely a
//              soft-404 catch-all page. Reported separately from `blocked`
//              because it says something about the server's behaviour, but
//              it is not evidence of an exposure either way.
//   error      The request itself failed without a clean HTTP status
//              (network error, timeout, a browser's CORS-blocked "failed to
//              fetch"). Never read as either exposed or safe.

// A real dotenv line: optional leading whitespace, a shell-variable-shaped
// key, `=`, then anything (quoted or not) to end of line. Comments (`#...`)
// and blank lines are allowed and excluded from the shape ratio below rather
// than counted against it, since both are completely normal in a real file.
const ENV_LINE_RE = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=.*$/;
const COMMENT_OR_BLANK_RE = /^\s*(#.*)?$/;
const KEY_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/;

// Name-only pattern -- matched against the KEY, never the value. Presence of
// a name like this is a real, disclosable signal ("this file declares an AWS
// secret key") without ever touching what the value actually is.
const SECRET_NAME_RE = /(SECRET|PRIVATE|PASSWORD|PASSWD|PWD|TOKEN|API[_-]?KEY|ACCESS[_-]?KEY|CREDENTIAL|DATABASE_URL|DB_PASS|AUTH|SESSION_KEY|ENCRYPTION_KEY|CLIENT_SECRET|STRIPE|AWS_)/i;

/**
 * Parses a response body into KEY names only. Never returns, retains, or
 * exposes any VALUE text -- not the raw value, not its length, not its first
 * character. `envLineCount`/`totalContentLines` are what classification
 * needs to judge the file's *shape*; `keys` is what a report is allowed to
 * show a human.
 */
export function parseEnvLines(text) {
  const lines = typeof text === 'string' ? text.split(/\r?\n/) : [];
  const keys = [];
  let envLineCount = 0;
  let totalContentLines = 0;
  for (const line of lines) {
    if (COMMENT_OR_BLANK_RE.test(line)) continue;
    totalContentLines += 1;
    if (ENV_LINE_RE.test(line)) {
      envLineCount += 1;
      const m = KEY_RE.exec(line);
      if (m) keys.push(m[1]);
    }
  }
  return { keys, envLineCount, totalContentLines };
}

function looksLikeDotenv({ envLineCount, totalContentLines }, bodySample) {
  if (totalContentLines === 0) return false;
  if (/<html[\s>]|<!doctype html/i.test(bodySample)) return false;
  // A generous but real bar: most non-comment, non-blank lines must be
  // KEY=VALUE shaped. A prose 404 page or a JSON error body will fail this
  // even if it happens to contain one line with an "=" in it somewhere.
  return envLineCount / totalContentLines >= 0.6;
}

function classifyOne(result) {
  const { path } = result;
  if (!result.ok) {
    if (result.status === 401 || result.status === 403 || result.status === 404 || result.status === 410) {
      return { path, category: 'blocked', status: result.status, url: result.url, keys: [], secretKeys: [], error: null };
    }
    return { path, category: 'error', status: result.status ?? null, url: result.url, keys: [], secretKeys: [], error: result.error ?? 'request failed' };
  }

  const text = result.text ?? '';
  const parsed = parseEnvLines(text);
  if (!looksLikeDotenv(parsed, text)) {
    return { path, category: 'not-env', status: result.status, url: result.url, keys: [], secretKeys: [], error: null };
  }

  const secretKeys = parsed.keys.filter((k) => SECRET_NAME_RE.test(k));
  return {
    path,
    category: 'exposed',
    status: result.status,
    url: result.url,
    keys: parsed.keys,
    secretKeys,
    error: null,
  };
}

/**
 * @param {string} baseUrl - the site checked, for display only
 * @param {object[]} results - probe.mjs's per-path raw results
 */
export function buildReport(baseUrl, results) {
  const list = Array.isArray(results) ? results : [];
  const classified = list.map(classifyOne);

  const exposed = classified.filter((c) => c.category === 'exposed');
  const blocked = classified.filter((c) => c.category === 'blocked');
  const notEnv = classified.filter((c) => c.category === 'not-env');
  const errors = classified.filter((c) => c.category === 'error');

  const findings = exposed.map((c) => {
    const critical = c.secretKeys.length > 0;
    return {
      id: `dotenv-exposed-${c.path.replace(/[^a-z0-9]+/gi, '-')}`,
      severity: critical ? 'critical' : 'danger',
      path: c.path,
      url: c.url,
      keyCount: c.keys.length,
      // Key NAMES only -- see this file's header comment. Never a value.
      sampleKeys: c.keys.slice(0, 12),
      secretLikeKeys: c.secretKeys,
      title: critical
        ? `"${c.path}" is publicly readable and declares at least one likely secret`
        : `"${c.path}" is publicly readable`,
      detail: critical
        ? `${c.keys.length} variable(s) are declared, including ${c.secretKeys.length} whose name matches a ` +
          `common secret pattern (${c.secretKeys.slice(0, 5).join(', ')}${c.secretKeys.length > 5 ? ', …' : ''}). ` +
          `Values are never read by this report -- only the key names above, which is already enough to know a ` +
          `real credential is likely exposed.`
        : `${c.keys.length} variable(s) are declared. None of the key names matched a common secret pattern, ` +
          `but the file's configuration structure (which services are integrated, what environment this is) is ` +
          `still exposed. Values are never read by this report.`,
    };
  });

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const exposedCount = findings.length;

  return {
    baseUrl,
    pathsChecked: classified.length,
    classified,
    findings,
    blocked,
    notEnv,
    errors,
    criticalCount,
    dangerCount,
    exposedCount,
    incomplete: errors.length > 0,
    ok: exposedCount === 0,
  };
}
