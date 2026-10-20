// Classifies a set of per-script probe results (real HTTP responses,
// collected by probe.mjs's live requests) into a verdict about whether a
// script's production source map is publicly readable, and whether that map
// embeds full original source text.
//
// Pure function, no I/O, no network -- imported identically by the CLI
// (check.mjs) and the browser page (index.html).
//
// What each classification means:
//
//   exposed    The script carries a sourceMappingURL comment and the map it
//              points at is publicly fetchable and parses as a source map.
//              Findings from this category carry two severities:
//                danger  the map also embeds `sourcesContent` -- the full
//                        original, unminified source text of every listed
//                        file, readable by anyone who requests the map.
//                notice  the map is fetchable but has no `sourcesContent`,
//                        so only the original file/folder paths (`sources`)
//                        are exposed -- internal structure, not the text.
//   blocked    The script references a map, but the map itself returned a
//              clean 401/403/404 -- the reference survived into production
//              but the file was not (or is no longer) actually served. This
//              is the common half-fixed state and is a healthy outcome.
//   clean      No sourceMappingURL comment at all -- the most common
//              correctly-configured production case.
//   error      The script itself failed to fetch, or the map fetch failed
//              without a clean HTTP status (network error, timeout, a
//              browser's CORS-blocked "failed to fetch", or a response that
//              was not valid JSON). Never read as either exposed or safe --
//              an error is not evidence of anything either way.

function classifyOne(result) {
  const scriptUrl = result?.scriptUrl ?? '(unknown script)';
  if (!result || (result.hasReference === false && result.error)) {
    return {
      scriptUrl, category: 'error', mapUrl: null, status: result?.status ?? null,
      sourcesCount: 0, hasSourcesContent: false, sampleSources: [],
      error: result?.error ?? 'request failed',
    };
  }

  if (!result.hasReference) {
    return {
      scriptUrl, category: 'clean', mapUrl: null, status: null,
      sourcesCount: 0, hasSourcesContent: false, sampleSources: [], error: null,
    };
  }

  if (result.mapFetchable) {
    return {
      scriptUrl, category: 'exposed', mapUrl: result.mapUrl, status: result.status,
      sourcesCount: result.sourcesCount ?? 0, hasSourcesContent: Boolean(result.hasSourcesContent),
      sampleSources: result.sampleSources ?? [], error: null,
    };
  }

  if (result.status === 401 || result.status === 403 || result.status === 404) {
    return {
      scriptUrl, category: 'blocked', mapUrl: result.mapUrl, status: result.status,
      sourcesCount: 0, hasSourcesContent: false, sampleSources: [], error: null,
    };
  }

  return {
    scriptUrl, category: 'error', mapUrl: result.mapUrl, status: result.status ?? null,
    sourcesCount: 0, hasSourcesContent: false, sampleSources: [],
    error: result.error ?? 'the referenced map could not be classified',
  };
}

/**
 * @param {string|null} pageUrl - the page checked, for display only
 * @param {object[]} scripts - probe.mjs's per-script results
 * @param {{pageError?: string|null, truncated?: boolean}} [meta]
 */
export function buildReport(pageUrl, scripts, meta = {}) {
  const list = Array.isArray(scripts) ? scripts : [];
  const classified = list.map(classifyOne);

  const exposed = classified.filter((c) => c.category === 'exposed');
  const findings = exposed.map((c) => ({
    id: c.hasSourcesContent ? 'source-map-full-source-exposed' : 'source-map-paths-exposed',
    severity: c.hasSourcesContent ? 'danger' : 'notice',
    scriptUrl: c.scriptUrl,
    title: c.hasSourcesContent
      ? `A source map for "${shortName(c.scriptUrl)}" exposes full original source text`
      : `A source map for "${shortName(c.scriptUrl)}" is publicly readable`,
    detail: c.hasSourcesContent
      ? `${c.sourcesCount} original source file(s) are readable in full at the map URL, ` +
        `including any comments, internal identifiers, or hardcoded values that were only ` +
        `stripped from the minified script -- not from the map.`
      : `${c.sourcesCount} original file/folder path(s) are readable at the map URL ` +
        `(no inlined source text, only the paths): ${c.sampleSources.slice(0, 3).join(', ')}` +
        `${c.sourcesCount > 3 ? ', …' : ''}.`,
    mapUrl: c.mapUrl,
    evidenceStatus: c.status != null ? `HTTP ${c.status}` : 'inline data: URI',
  }));

  const blocked = classified.filter((c) => c.category === 'blocked');
  const clean = classified.filter((c) => c.category === 'clean');
  const errors = classified.filter((c) => c.category === 'error');

  const pageError = meta.pageError ?? null;
  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;
  const incomplete = Boolean(pageError) || errors.length > 0;

  return {
    pageUrl,
    scriptsChecked: classified.length,
    truncated: Boolean(meta.truncated),
    pageError,
    classified,
    findings,
    blocked,
    clean,
    errors,
    dangerCount,
    noticeCount,
    ok: !pageError && dangerCount === 0 && noticeCount === 0,
    incomplete,
  };
}

function shortName(url) {
  try {
    const { pathname } = new URL(url);
    const parts = pathname.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : url;
  } catch {
    return url;
  }
}
