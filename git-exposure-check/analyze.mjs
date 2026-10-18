// Classifies the result of two HTTP probes (real requests collected by
// probe.mjs, or pasted in by hand) into a verdict on whether a site's `.git`
// directory is publicly exposed.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can only ever analyse a payload someone already fetched) import, so
// the classification logic exists exactly once.
//
// The value here isn't "did /.git/HEAD return 200" -- curl does that, and a
// bare status check is wrong on any server that answers every unknown path
// with 200 (a "soft 404" error page, common on shared hosting and several
// popular static-site setups). It's checking that the response BODY parses
// as real git-internal content:
//
//   * `.git/HEAD` in a real repository is a one-line file, either
//     `ref: refs/heads/<branch>\n` (the normal case) or a bare 40-character
//     hex SHA-1 (a detached HEAD). Nothing else a webserver would plausibly
//     serve at that path looks like this.
//   * `.git/config` in a real repository contains an INI-style `[core]`
//     section -- every git repository's config starts with one, written by
//     `git init`.
//
// Either one alone, matched against its exact expected shape, is strong
// evidence of real exposure (not a coincidence -- see the regexes' comments
// for how narrow they are). Both matching is the same finding stated with
// higher confidence, since a real exposed `.git` directory normally serves
// every file inside it identically.
//
// What this does NOT do, on purpose: it never requests `.git/index`,
// `.git/logs/HEAD`, or any packed object -- those can be considerably larger
// and reading them would start to look like downloading the repository
// rather than checking whether it is exposed. If HEAD or config is exposed,
// the rest almost always is too; naming that inference in the report is
// enough to make the point without this tool doing the actual bulk read
// itself (`git-dumper`/`GitTools`, named in the report text, are the tools
// an authorised owner would reach for to quantify the exposure fully).

// `ref: refs/heads/main` / `ref: refs/heads/feature/x` -- a ref name is a
// sequence of non-whitespace, non-control characters per git's own
// check-ref-format rules; this accepts anything printable rather than
// re-implementing that full grammar, since the goal is distinguishing real
// git content from an arbitrary error page, not validating a ref name.
const HEAD_SYMBOLIC_RE = /^ref:\s+refs\/\S+$/;
// A detached HEAD: a bare 40-character (SHA-1) hex commit id, nothing else
// on the line.
const HEAD_DETACHED_RE = /^[0-9a-f]{40}$/i;
// Every `git init`-created config file opens with a `[core]` section before
// anything else -- distinctive enough on its own that no ordinary web page
// or error page would happen to contain it verbatim.
const CONFIG_CORE_RE = /\[core\]/;

function normaliseLine(sample) {
  return typeof sample === 'string' ? sample.trim() : '';
}

/** True when `bodySample` is exactly what a real `.git/HEAD` file contains. */
export function looksLikeGitHead(bodySample) {
  const line = normaliseLine(bodySample);
  return HEAD_SYMBOLIC_RE.test(line) || HEAD_DETACHED_RE.test(line);
}

/** True when `bodySample` contains the `[core]` section every real
 * `.git/config` file opens with. */
export function looksLikeGitConfig(bodySample) {
  return CONFIG_CORE_RE.test(typeof bodySample === 'string' ? bodySample : '');
}

function probeSummary(probe) {
  const p = probe && typeof probe === 'object' ? probe : { ok: false };
  return {
    ok: p.ok !== false,
    status: p.status ?? null,
    url: p.url ?? null,
    bodySample: typeof p.bodySample === 'string' ? p.bodySample : '',
    truncated: !!p.truncated,
    error: p.error ?? null,
  };
}

/**
 * @param {string} target - the URL that was probed (for display only)
 * @param {{head: object, config: object}} probe - the two raw probe results
 *   `runProbe` (or a hand-built equivalent) produced
 * @returns {{target: string, head: object, config: object, findings: object[],
 *   dangerCount: number, ok: boolean, incomplete: boolean}}
 */
export function buildReport(target, probe) {
  const p = probe && typeof probe === 'object' ? probe : {};
  const head = probeSummary(p.head);
  const config = probeSummary(p.config);
  const incomplete = !head.ok && !config.ok;
  const findings = [];

  if (!incomplete) {
    const headExposed = head.ok && head.status === 200 && looksLikeGitHead(head.bodySample);
    const configExposed = config.ok && config.status === 200 && looksLikeGitConfig(config.bodySample);

    if (headExposed && configExposed) {
      findings.push({
        id: 'git-directory-exposed',
        severity: 'danger',
        title: 'The .git directory is publicly readable',
        detail:
          'Both .git/HEAD and .git/config responded with real git-internal content, not a ' +
          "generic error page -- this is not a coincidence: HEAD parsed as a git ref (\"ref: " +
          'refs/heads/…\" or a bare commit SHA) and config contained the [core] section every ' +
          'real repository opens with. This lets anyone reconstruct the entire committed source ' +
          'history -- including files and secrets that were removed in a later commit, which a ' +
          'live directory listing would never show -- using a public tool such as git-dumper or ' +
          'GitTools. Remove the .git directory from the deployed webroot (it should never be ' +
          'served at all) or block the path at the webserver/CDN.',
        evidenceUrl: head.url,
      });
    } else if (headExposed) {
      findings.push({
        id: 'git-head-exposed',
        severity: 'danger',
        title: '.git/HEAD is publicly readable',
        detail:
          `The response body (\"${head.bodySample.trim()}\") is exactly what a real .git/HEAD ` +
          'file contains, not a generic error page. .git/config did not confirm it independently ' +
          '(different status, or content that did not match a real config file), but HEAD alone ' +
          'is real git-internal content and should not be reachable -- treat this the same as full ' +
          'exposure and verify with an authorised tool such as git-dumper or GitTools.',
        evidenceUrl: head.url,
      });
    } else if (configExposed) {
      findings.push({
        id: 'git-config-exposed',
        severity: 'danger',
        title: '.git/config is publicly readable',
        detail:
          'The response body contains a real git config [core] section, not a generic error page. ' +
          '.git/HEAD did not confirm it independently, but an exposed config file on its own can ' +
          'leak remote URLs (sometimes with embedded credentials or CI tokens) and confirms the ' +
          '.git directory is reachable -- treat this as exposure and verify with an authorised ' +
          'tool such as git-dumper or GitTools.',
        evidenceUrl: config.url,
      });
    }
    // else: neither response matched real git content -- protected (a 403,
    // a 404, a redirect, or a "soft 404" page that answers every path with
    // 200 but generic content). No finding.
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;

  return {
    target,
    head,
    config,
    findings,
    dangerCount,
    ok: !incomplete && dangerCount === 0,
    incomplete,
  };
}
