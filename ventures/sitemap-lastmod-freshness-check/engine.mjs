// sitemap <lastmod> freshness engine: does a sitemap.xml's own claim about
// when a page last changed hold up against the sitemap protocol's format
// rules, basic plausibility, and (when a live fetch is available) the page's
// own HTTP `Last-Modified` response header?
//
// Four checks, each mechanical and each traceable to a documented rule:
//
//   format          <lastmod> must be a W3C Datetime, per the sitemap
//                   protocol (sitemaps.org): a full date (YYYY-MM-DD) or a
//                   full date-time with an explicit timezone offset. Anything
//                   else is not a value a consumer can parse reliably.
//   future-dated    A page cannot have been modified in the future. A
//                   <lastmod> after "now" is either a clock/timezone bug in
//                   whatever generated the sitemap, or a placeholder that was
//                   never replaced -- either way it is wrong on its face, no
//                   external evidence needed.
//   duplicate <loc> The protocol expects one <url> entry per <loc>. Two
//                   entries for the same URL with different <lastmod> values
//                   is an unresolvable conflict for anything consuming the
//                   file.
//   uniform pattern The "freshness-faking" anti-pattern: a build step that
//                   stamps every URL with today's date on every deploy,
//                   regardless of whether the page actually changed. Google's
//                   own sitemap documentation says <lastmod> should reflect a
//                   genuine, significant change, and that a site whose
//                   <lastmod> values don't hold up may have that signal
//                   discounted. Detected statistically (a large share of
//                   entries sharing one exact date), disclosed as a
//                   statistical signal rather than a certainty -- a real
//                   one-time site migration produces the same shape.
//   server mismatch (needs a live fetch, so only the CLI can run it) whether
//                   the page's own HTTP `Last-Modified` response header
//                   confirms a change as recent as the sitemap claims.
//                   Disclosed as one signal, not proof -- many servers send
//                   render time rather than content-edit time, or send no
//                   `Last-Modified` header at all, in which case the entry is
//                   reported as unverified, never as confirmed-wrong or
//                   confirmed-clean.
//
// Pure functions, no I/O, no network -- the identical logic runs in the
// browser page (pasted sitemap XML, or a best-effort per-URL browser fetch)
// and the Node CLI (real HTTP responses), so the two surfaces can never
// silently disagree about what a given sitemap means. Standalone ventures in
// this portfolio vendor their own small text-processing helpers rather than
// importing from `platform/` (see hreflang-reciprocity-check/engine.mjs,
// cors-misconfig-check/analyze.mjs), so the entity table and XML text
// extraction below are vendored rather than imported.

// --- XML entity decoding (vendored, small table -- <loc>/<lastmod> text
// content rarely needs more than these) -------------------------------------
const NAMED_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
});
const ENTITY_RE = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

export function decodeEntities(text) {
  return String(text).replace(ENTITY_RE, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole;
      return String.fromCodePoint(code);
    }
    return Object.hasOwn(NAMED_ENTITIES, body) ? NAMED_ENTITIES[body] : whole;
  });
}

// --- <url>/<sitemap> entry extraction ---------------------------------------

const URL_BLOCK_RE = /<url\b[^>]*>([\s\S]*?)<\/url\s*>/gi;
const SITEMAP_BLOCK_RE = /<sitemap\b[^>]*>([\s\S]*?)<\/sitemap\s*>/gi;
const LOC_RE = /<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/i;
const LASTMOD_RE = /<lastmod\b[^>]*>([\s\S]*?)<\/lastmod\s*>/i;

function extractEntries(xml, blockRe) {
  const entries = [];
  let m;
  blockRe.lastIndex = 0;
  while ((m = blockRe.exec(xml)) !== null) {
    const block = m[1];
    const locMatch = LOC_RE.exec(block);
    const lastmodMatch = LASTMOD_RE.exec(block);
    if (!locMatch) continue; // <loc> is required by the protocol; an entry with none is not checkable
    entries.push({
      loc: decodeEntities(locMatch[1].trim()),
      lastmodRaw: lastmodMatch ? decodeEntities(lastmodMatch[1].trim()) : null,
    });
  }
  return entries;
}

/**
 * Parses a sitemap document (either a `<urlset>` of pages or a
 * `<sitemapindex>` of child sitemaps -- the same two checks apply to both,
 * since a sitemap index's own `<lastmod>` entries are just as fakeable).
 *
 * @returns {{kind: 'urlset'|'sitemapindex'|null, entries: Array<{loc:string,lastmodRaw:string|null}>, parseError: string|null}}
 */
export function parseSitemap(xml) {
  const text = String(xml ?? '');
  const isIndex = /<sitemapindex\b/i.test(text);
  const isUrlset = /<urlset\b/i.test(text);
  if (!isIndex && !isUrlset) {
    return {
      kind: null,
      entries: [],
      parseError: 'No <urlset> or <sitemapindex> root element found -- is this a sitemap XML document?',
    };
  }
  const entries = isIndex
    ? extractEntries(text, SITEMAP_BLOCK_RE)
    : extractEntries(text, URL_BLOCK_RE);
  return { kind: isIndex ? 'sitemapindex' : 'urlset', entries, parseError: null };
}

// --- W3C Datetime validation (sitemap protocol's required <lastmod> shape) -

// sitemaps.org requires W3C Datetime: a full date, or a full date-time with
// an explicit timezone (Z or +hh:mm/-hh:mm) -- no bare "unzoned" time, no
// two-digit year, no slash-separated or textual date.
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Validates one raw `<lastmod>` text value against the sitemap protocol's
 * required W3C Datetime shape, and (if the shape is right) that the calendar
 * date it names actually exists -- `Date.parse`/`Date.UTC` silently roll over
 * an invalid date (2024-02-30 becomes 2024-03-01) rather than rejecting it,
 * so the year/month/day are checked by hand before trusting the `Date`.
 *
 * @returns {{input: string, present: boolean, valid: boolean|null, date: Date|null, issues: Array<{kind:string,message:string}>}}
 */
export function validateLastmod(raw) {
  const input = String(raw ?? '').trim();
  if (!input) {
    return { input, present: false, valid: null, date: null, issues: [] };
  }

  const m = DATETIME_RE.exec(input);
  if (!m) {
    return {
      input,
      present: true,
      valid: false,
      date: null,
      issues: [{
        kind: 'format',
        message: `"${input}" is not a valid W3C Datetime, which the sitemap protocol requires for ` +
          '<lastmod> -- a full date (YYYY-MM-DD) or a full date-time with an explicit timezone ' +
          '(YYYY-MM-DDThh:mm:ssTZD). A bare time with no timezone, a two-digit year, or a ' +
          'slash-separated date are all common mistakes that produce exactly this shape of failure.',
      }],
    };
  }

  const [, yStr, moStr, dStr, hStr, miStr, sStr, tz] = m;
  const year = Number(yStr);
  const month = Number(moStr);
  const day = Number(dStr);
  const issues = [];

  if (month < 1 || month > 12) {
    issues.push({ kind: 'calendar', message: `"${input}" names month ${month}, which does not exist.` });
  } else if (day < 1 || day > daysInMonth(year, month)) {
    issues.push({
      kind: 'calendar',
      message: `"${input}" names day ${day} of month ${month}, which only has ${daysInMonth(year, month)} days.`,
    });
  }

  let hour = 0;
  let minute = 0;
  let second = 0;
  if (hStr !== undefined) {
    hour = Number(hStr);
    minute = Number(miStr);
    second = sStr !== undefined ? Number(sStr) : 0;
    if (hour > 23) issues.push({ kind: 'calendar', message: `"${input}" names hour ${hour}, which does not exist.` });
    if (minute > 59) issues.push({ kind: 'calendar', message: `"${input}" names minute ${minute}, which does not exist.` });
    if (second > 60) issues.push({ kind: 'calendar', message: `"${input}" names second ${second}, which does not exist.` });
  }

  if (issues.length > 0) {
    return { input, present: true, valid: false, date: null, issues };
  }

  let ms;
  if (hStr === undefined) {
    ms = Date.UTC(year, month - 1, day);
  } else {
    let offsetMinutes = 0;
    if (tz !== 'Z') {
      const sign = tz[0] === '-' ? -1 : 1;
      const [ohStr, omStr] = tz.slice(1).split(':');
      offsetMinutes = sign * (Number(ohStr) * 60 + Number(omStr));
    }
    ms = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
  }

  return { input, present: true, valid: true, date: new Date(ms), issues: [] };
}

// --- Classification ---------------------------------------------------------

const DEFAULT_FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000; // 1 day, for clock skew across timezones
const DEFAULT_UNIFORM_THRESHOLD = 0.9;
const DEFAULT_UNIFORM_MIN_COUNT = 5;

/**
 * Classifies a parsed sitemap's entries.
 *
 * @param {Array<{loc:string, lastmodRaw:string|null}>} entries
 * @param {object} [opts]
 * @param {Date} [opts.now] - injectable for tests; defaults to the real clock.
 * @param {number} [opts.futureToleranceMs] - how far into the future a
 *   <lastmod> can be before it is flagged, to absorb ordinary clock/timezone
 *   skew rather than flagging every entry stamped a few hours ahead.
 * @param {number} [opts.uniformThreshold] - the share of valid, present
 *   <lastmod> values that must share one exact date before the uniform
 *   pattern is flagged.
 * @param {number} [opts.uniformMinCount] - the uniform check needs at least
 *   this many valid, present <lastmod> values before it runs at all -- a tiny
 *   sitemap sharing one date is not evidence of anything.
 * @param {Map<string,{ok:boolean, lastModified: Date|null}>} [opts.liveResults] -
 *   keyed by <loc>. An entry absent from this map, or present with
 *   `ok:false` or `lastModified:null`, is reported as unverified rather than
 *   silently skipped -- not being able to confirm a claim is not the same as
 *   the claim being wrong.
 */
export function classifyEntries(entries, {
  now = new Date(),
  futureToleranceMs = DEFAULT_FUTURE_TOLERANCE_MS,
  uniformThreshold = DEFAULT_UNIFORM_THRESHOLD,
  uniformMinCount = DEFAULT_UNIFORM_MIN_COUNT,
  liveResults = new Map(),
} = {}) {
  const findings = [];
  const enriched = entries.map((e) => ({ ...e, validation: validateLastmod(e.lastmodRaw) }));

  // 1. Invalid <lastmod> format/calendar.
  for (const e of enriched) {
    if (e.validation.present && !e.validation.valid) {
      findings.push({
        id: 'invalid-lastmod-format',
        severity: 'danger',
        loc: e.loc,
        title: `Invalid <lastmod> value on ${e.loc}`,
        detail: e.validation.issues.map((i) => i.message).join(' '),
      });
    }
  }

  // 2. Future-dated <lastmod>.
  for (const e of enriched) {
    if (e.validation.valid && e.validation.date.getTime() > now.getTime() + futureToleranceMs) {
      findings.push({
        id: 'future-dated-lastmod',
        severity: 'danger',
        loc: e.loc,
        title: `<lastmod> is in the future on ${e.loc}`,
        detail: `This entry's <lastmod> is "${e.validation.input}", which is after ${now.toISOString()}. ` +
          'A page cannot have been last modified in the future -- this is either a clock or timezone ' +
          'bug in whatever generated the sitemap, or a placeholder value that was never replaced.',
      });
    }
  }

  // 3. Duplicate <loc> entries.
  const byLoc = new Map();
  for (const e of enriched) {
    if (!byLoc.has(e.loc)) byLoc.set(e.loc, []);
    byLoc.get(e.loc).push(e);
  }
  for (const [loc, group] of byLoc) {
    if (group.length < 2) continue;
    const distinctRaw = new Set(group.map((g) => g.lastmodRaw ?? '(none)'));
    if (distinctRaw.size > 1) {
      findings.push({
        id: 'duplicate-loc-conflicting-lastmod',
        severity: 'danger',
        loc,
        title: `${loc} appears ${group.length} times with different <lastmod> values`,
        detail: 'The sitemap protocol expects each <loc> to appear once. This URL appears ' +
          `${group.length} times with different <lastmod> values (${[...distinctRaw].join(', ')}) -- ` +
          'a consumer of this sitemap cannot tell which entry is correct.',
      });
    } else {
      findings.push({
        id: 'duplicate-loc',
        severity: 'notice',
        loc,
        title: `${loc} is listed ${group.length} times`,
        detail: 'Harmless (every occurrence agrees on <lastmod>) but redundant -- the sitemap ' +
          'protocol expects each URL to appear once.',
      });
    }
  }

  // 4. Uniform-lastmod ("freshness-faking") pattern.
  const validPresent = enriched.filter((e) => e.validation.valid);
  if (validPresent.length >= uniformMinCount) {
    const dateCounts = new Map();
    for (const e of validPresent) {
      const key = e.validation.date.toISOString().slice(0, 10);
      dateCounts.set(key, (dateCounts.get(key) || 0) + 1);
    }
    const [topDate, topCount] = [...dateCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const share = topCount / validPresent.length;
    if (share >= uniformThreshold) {
      findings.push({
        id: 'uniform-lastmod-pattern',
        severity: 'notice',
        title: `${Math.round(share * 100)}% of URLs share the exact same <lastmod> date (${topDate})`,
        detail: `${topCount} of ${validPresent.length} URLs with a valid <lastmod> all claim ${topDate}. ` +
          "Google's own sitemap documentation says <lastmod> should reflect a real, significant " +
          "content change, and that it may stop trusting a site's <lastmod> values if they don't " +
          'hold up. A single date shared by nearly every URL is the shape that produces: often a ' +
          'build step that stamps every page with the current date on every deploy, regardless of ' +
          'whether the page actually changed. This is a statistical signal, not a certainty -- a ' +
          'genuine one-time site migration or CMS re-platform produces the same shape.',
        date: topDate,
        share,
        count: topCount,
        total: validPresent.length,
      });
    }
  }

  // 5. Server-header cross-check (only as informative as `liveResults` is).
  let uncheckedCount = 0;
  for (const e of enriched) {
    if (!e.validation.valid) continue; // no confirmable claim to check
    const live = liveResults.get(e.loc);
    if (!live || !live.ok || !live.lastModified) {
      uncheckedCount++;
      continue;
    }
    if (e.validation.date.getTime() > live.lastModified.getTime() + futureToleranceMs) {
      findings.push({
        id: 'lastmod-not-confirmed-by-server',
        severity: 'notice',
        loc: e.loc,
        title: `${e.loc}'s sitemap <lastmod> is not confirmed by the page's own Last-Modified header`,
        detail: `The sitemap claims <lastmod>${e.validation.input}</lastmod>, but the live page's own ` +
          `HTTP Last-Modified response header says ${live.lastModified.toISOString()} -- earlier than ` +
          "the sitemap's claim. A server's Last-Modified header is not always precise (some frameworks " +
          'send render time rather than content-edit time, and many dynamic sites send none at all), ' +
          'so treat this as one signal to check, not proof the sitemap entry is wrong.',
      });
    }
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    entries: enriched,
    findings,
    dangerCount,
    noticeCount,
    uncheckedCount,
    // Matches the sibling checkers' convention (hreflang-reciprocity-check,
    // cors-misconfig-check): a run that could not confirm some of what it set
    // out to check is not "ok", even with zero danger findings among the
    // parts it did confirm.
    incomplete: uncheckedCount > 0,
    ok: dangerCount === 0 && uncheckedCount === 0,
  };
}

/**
 * Convenience wrapper: parse then classify in one call, folding a parse
 * failure into the same report shape rather than a separate error path.
 */
export function buildReport({ xml, now, futureToleranceMs, uniformThreshold, uniformMinCount, liveResults } = {}) {
  const parsed = parseSitemap(xml);
  if (parsed.parseError) {
    return {
      kind: null,
      entries: [],
      findings: [],
      dangerCount: 0,
      noticeCount: 0,
      uncheckedCount: 0,
      incomplete: true,
      ok: false,
      parseError: parsed.parseError,
    };
  }
  const classified = classifyEntries(parsed.entries, { now, futureToleranceMs, uniformThreshold, uniformMinCount, liveResults });
  return { kind: parsed.kind, parseError: null, ...classified };
}
