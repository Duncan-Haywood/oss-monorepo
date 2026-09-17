// Redirect chain classification engine: given a sequence of HTTP hops (a
// starting URL followed through each 3xx response to wherever it lands),
// does the chain do anything a crawler, a browser, or an SEO practitioner
// would consider a mistake?
//
// Five checks, each mechanical and each traceable to documented guidance:
//
//   redirect-loop        A URL earlier in the chain reappears later in it.
//                         The chain never terminates -- a browser or crawler
//                         that gives up rather than looping forever will
//                         never reach a real page.
//   chain-too-long        More hops than the recommended maximum (default 1).
//                         Google's own Search Central documentation on
//                         redirects advises keeping a chain as short as
//                         possible -- ideally a single hop -- because search
//                         engines may stop following a long chain, and each
//                         extra hop adds a full network round-trip of latency
//                         for every visitor, not just the first one.
//   protocol-downgrade    A hop redirects from https back to http. Once a
//                         visitor is on a secure connection, sending them
//                         back to an insecure one is very rarely intentional
//                         and defeats the purpose of the earlier upgrade.
//   temporary-for-a-move   A hop's URL and its target look like a permanent
//                         site move (a scheme upgrade or a www/non-www
//                         normalization of the same path) but used a
//                         temporary redirect status (302/303/307) instead of
//                         a permanent one (301/308). Search engines treat a
//                         temporary redirect as "the old URL is still
//                         canonical, check back later" and are slower to
//                         consolidate ranking signal onto the new URL.
//   unexpected mid-chain   A hop that is not itself a redirect status
//   status                (3xx) but is followed by another hop in the data
//                         provided -- the input claims more of a chain exists
//                         past a URL that already landed.
//   chain-ends-in-error   The final hop in the chain is a 4xx or 5xx client
//                         or server error -- every visitor who follows the
//                         whole chain arrives at a dead page.
//   chain-incomplete       The final hop provided is itself still a redirect
//                         (3xx) with nowhere further to go in the data given
//                         -- either more hops exist and were not included
//                         (the CLI hit --max-hops), or the chain does not
//                         terminate.
//   hop-fetch-error        (CLI only) A hop's own request could not be
//                         completed at all (timeout, DNS failure, refused
//                         connection) -- the rest of the chain past that
//                         point is unknown, not confirmed clean.
//
// Pure, no I/O, no network -- the identical function classifies hops
// produced by the CLI's real HTTP walk (fetch-chain.mjs) and hops parsed
// from text a visitor pastes into the browser page, so the two surfaces can
// never silently disagree about what a given chain means. This portfolio's
// standalone ventures vendor their own small helpers rather than importing
// from `platform/` (see sitemap-lastmod-freshness-check/engine.mjs,
// hreflang-reciprocity-check/engine.mjs), so URL comparison below is
// hand-rolled rather than pulled from a shared library.

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PERMANENT_REDIRECT_STATUSES = new Set([301, 308]);

/** @returns {URL|null} */
function tryParseUrl(input) {
  try {
    return new URL(String(input));
  } catch {
    return null;
  }
}

/** Normalizes a URL for loop comparison: strips the fragment, since a
 * fragment is never sent to the server and two hops differing only in it are
 * the same request as far as an HTTP redirect loop is concerned. */
export function normalizeForLoopCheck(rawUrl) {
  const parsed = tryParseUrl(rawUrl);
  if (!parsed) return String(rawUrl);
  parsed.hash = '';
  return parsed.toString();
}

/** True when `from` -> `to` looks like a same-path permanent-move pattern:
 * a scheme upgrade (http -> https) and/or a www/non-www host normalization,
 * with the path, search, and hash otherwise unchanged. */
function looksLikeSchemeOrHostNormalization(fromParsed, toParsed) {
  if (fromParsed.pathname !== toParsed.pathname) return false;
  if (fromParsed.search !== toParsed.search) return false;
  const schemeChanged = fromParsed.protocol !== toParsed.protocol;
  const fromHost = fromParsed.hostname.replace(/^www\./, '');
  const toHost = toParsed.hostname.replace(/^www\./, '');
  const hostNormalized = fromHost === toHost && fromParsed.hostname !== toParsed.hostname;
  return schemeChanged || hostNormalized;
}

function emptyReport(inputError) {
  return {
    hops: [], findings: [], dangerCount: 0, noticeCount: 0, hopCount: 0,
    finalStatus: null, incomplete: true, ok: false, inputError,
  };
}

/**
 * Classifies a redirect chain.
 *
 * @param {Array<{url: string, status: number|null, error?: string|null}>} hops
 *   One entry per HTTP request actually made (or attempted), in order. The
 *   last entry is whatever the chain finally reached: a non-redirect status
 *   (landed), a redirect status with no further hop in the array (either the
 *   walk was truncated, or the caller didn't provide more), or `status:
 *   null` with `error` set (the request itself failed).
 * @param {object} [opts]
 * @param {number} [opts.recommendedMaxHops] - hop count above which
 *   `chain-too-long` fires. Default 1, matching the "keep it to a single
 *   redirect" guidance this module's header describes.
 */
export function classifyChain(hops, { recommendedMaxHops = 1 } = {}) {
  if (!Array.isArray(hops) || hops.length === 0) {
    return emptyReport('No hops provided -- paste at least one "<status> <url>" line, or run the CLI against a starting URL.');
  }

  const findings = [];

  // 1. URL validity -- a hop whose own URL cannot be parsed cannot be
  // compared to its neighbours, so flag it and exclude it from the
  // pairwise checks below (its presence is still counted toward hopCount).
  const parsedByIndex = hops.map((h) => tryParseUrl(h.url));
  hops.forEach((h, i) => {
    if (!parsedByIndex[i]) {
      findings.push({
        id: 'invalid-hop-url', severity: 'danger', hopIndex: i,
        title: `Hop ${i + 1}'s URL is not valid: "${h.url}"`,
        detail: 'Every hop needs a full, absolute URL (including the scheme) to be checked.',
      });
    }
  });

  // 2. Redirect loop -- a normalized URL reappearing later in the chain.
  const seenAt = new Map();
  hops.forEach((h, i) => {
    const norm = normalizeForLoopCheck(h.url);
    if (seenAt.has(norm)) {
      const firstIndex = seenAt.get(norm);
      findings.push({
        id: 'redirect-loop', severity: 'danger', hopIndex: i,
        title: `Redirect loop: ${h.url} is visited twice`,
        detail: `This URL first appears at hop ${firstIndex + 1} and again at hop ${i + 1}. ` +
          'A chain that revisits a URL never reaches a real page -- a browser or crawler that gives ' +
          'up rather than looping forever will fail here, and one that does not give up loops forever.',
      });
    } else {
      seenAt.set(norm, i);
    }
  });

  // 3. Fetch errors mid-chain -- everything from here on only analyses the
  // hops actually completed. A hop past a fetch error is not "unchecked",
  // it simply does not exist in the data.
  const errorIndex = hops.findIndex((h) => h.status == null);
  const completed = errorIndex === -1 ? hops : hops.slice(0, errorIndex);
  if (errorIndex !== -1) {
    findings.push({
      id: 'hop-fetch-error', severity: 'danger', hopIndex: errorIndex,
      title: `Could not complete the chain: hop ${errorIndex + 1} (${hops[errorIndex].url}) failed`,
      detail: hops[errorIndex].error
        ? `The request itself failed: ${hops[errorIndex].error}. Whatever the chain does past this point is unknown, not confirmed clean.`
        : 'The request itself failed. Whatever the chain does past this point is unknown, not confirmed clean.',
    });
  }

  // 4. Chain length.
  const hopCount = Math.max(completed.length - 1, 0);
  if (hopCount > recommendedMaxHops) {
    findings.push({
      id: 'chain-too-long', severity: 'notice',
      title: `Redirect chain has ${hopCount} hop${hopCount === 1 ? '' : 's'} before landing (recommended: ${recommendedMaxHops})`,
      detail: "Google's own Search Central documentation on redirects advises keeping a redirect " +
        'chain as short as possible -- ideally a single hop -- because search engines may not follow ' +
        'a very long chain, and every extra hop adds a full network round-trip of latency for every ' +
        'visitor, not just the first crawl.',
    });
  }

  // 5. Pairwise checks between consecutive completed hops.
  for (let i = 0; i < completed.length - 1; i++) {
    const from = completed[i];
    const to = completed[i + 1];
    const fromParsed = parsedByIndex[i];
    const toParsed = parsedByIndex[i + 1];

    if (!REDIRECT_STATUSES.has(from.status)) {
      findings.push({
        id: 'unexpected-non-redirect-mid-chain', severity: 'danger', hopIndex: i,
        title: `Hop ${i + 1} has status ${from.status}, which is not a redirect, but another hop follows it`,
        detail: `Hop ${i + 1} (${from.url}) returned ${from.status}, a non-redirect status, yet the data ` +
          `provided includes a further hop after it (${to.url}). Either the input is wrong, or something ` +
          'other than an HTTP redirect (a meta refresh, client-side JavaScript navigation) is chaining ' +
          'these two requests together -- this tool only checks true HTTP 3xx redirects.',
      });
      continue;
    }

    if (fromParsed && toParsed) {
      if (fromParsed.protocol === 'https:' && toParsed.protocol === 'http:') {
        findings.push({
          id: 'protocol-downgrade', severity: 'danger', hopIndex: i,
          title: `Hop ${i + 1} redirects from HTTPS back to HTTP`,
          detail: `${from.url} (HTTPS) redirects to ${to.url} (HTTP). Sending a visitor who already ` +
            'reached a secure connection back to an insecure one is very rarely intentional, defeats ' +
            'the purpose of the earlier upgrade, and most browsers will show a "not secure" warning on ' +
            'arrival.',
        });
      }

      if (looksLikeSchemeOrHostNormalization(fromParsed, toParsed) && !PERMANENT_REDIRECT_STATUSES.has(from.status)) {
        findings.push({
          id: 'temporary-redirect-for-permanent-move', severity: 'notice', hopIndex: i,
          title: `Hop ${i + 1} looks like a permanent site move but used a temporary status (${from.status})`,
          detail: `${from.url} -> ${to.url} keeps the same path and only changes scheme and/or the www ` +
            `prefix -- the classic shape of a one-time site move -- but returned ${from.status}, a ` +
            'temporary redirect. Search engines treat a temporary redirect as "the old URL is still ' +
            'canonical, check back later" and are slower to consolidate ranking signal onto the new ' +
            'URL. A permanent move should normally use 301 or 308.',
        });
      }
    }
  }

  // 6. Final-hop analysis (only meaningful if the chain completed).
  let finalStatus = null;
  if (errorIndex === -1) {
    const final = completed[completed.length - 1];
    finalStatus = final.status;
    if (final.status >= 400) {
      findings.push({
        id: 'chain-ends-in-error', severity: 'danger', hopIndex: completed.length - 1,
        title: `Chain ends in an error: ${final.status} at ${final.url}`,
        detail: `Every visitor who follows this chain to the end arrives at ${final.url}, which returned ` +
          `${final.status}. The redirect chain itself may be fine -- the destination is broken.`,
      });
    } else if (REDIRECT_STATUSES.has(final.status)) {
      findings.push({
        id: 'chain-incomplete', severity: 'danger', hopIndex: completed.length - 1,
        title: `Chain is still redirecting at the last hop provided (${final.status})`,
        detail: `The last hop given (${final.url}) is itself a redirect (${final.status}) with nowhere ` +
          'further to go in the data provided -- either more hops exist and were not included (the CLI ' +
          'may have hit --max-hops), or the chain genuinely does not terminate.',
      });
    }
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    hops, findings, dangerCount, noticeCount, hopCount, finalStatus,
    incomplete: errorIndex !== -1,
    ok: dangerCount === 0 && errorIndex === -1,
    inputError: null,
  };
}

/**
 * Parses the browser page's paste format: one hop per line, `<status>
 * <url>`, blank lines and `#`-prefixed comments ignored. Chosen because a
 * visitor can read this directly off their browser's Network panel (Status
 * and Name/URL columns) or a `curl -sI` trace of each hop by hand -- see
 * README.md for why the page cannot fetch the chain itself.
 *
 * @returns {{hops: Array<{url:string,status:number,error:null}>, errors: string[]}}
 */
export function parseHopsText(text) {
  const lines = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  const hops = [];
  const errors = [];
  const LINE_RE = /^(\d{3})\s+(\S+)$/;
  lines.forEach((line, i) => {
    const m = LINE_RE.exec(line);
    if (!m) {
      errors.push(`Line ${i + 1}: expected "<status> <url>" (e.g. "301 https://example.com/old"), got "${line}"`);
      return;
    }
    hops.push({ url: m[2], status: Number(m[1]), error: null });
  });
  return { hops, errors };
}
