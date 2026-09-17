// hreflang reciprocity engine: does a page's <link rel="alternate" hreflang>
// set actually do what Google's own international-SEO documentation requires?
//
// Four checks, each mechanical and each traceable to one documented rule:
//
//   reciprocity      Google's Search Central hreflang documentation states
//                     the requirement plainly: "confirm the links are
//                     reciprocal" -- if page A links to page B with hreflang,
//                     and B does not link back to A, Google may ignore the
//                     annotation on both. This is the check that needs a
//                     second page's content, which is why the CLI fetches it
//                     over real HTTP and the browser page can only do it when
//                     the visitor supplies (pastes, or the browser itself
//                     manages to fetch) that second page. See index.html and
//                     README.md for exactly why a browser tab usually can't.
//   valid codes      hreflang values are BCP 47 language tags. This tool
//                     validates the common two-part shape (ISO 639-1 language
//                     [+ ISO 3166-1 region]) against the two vendored,
//                     complete-as-published lists below, and calls out the
//                     single most common real mistake by name: "en-uk" is not
//                     valid because "UK" was never assigned as an ISO 3166-1
//                     country code -- the United Kingdom's actual code is
//                     "GB". Case is checked separately from validity, because
//                     BCP 47 tags are technically case-insensitive but Google
//                     documents a canonical casing and some naive backend
//                     comparisons are not case-insensitive in practice.
//   x-default        Recommended (not required) by Google's documentation
//                     when a page has more than one real language/region
//                     variant, as the fallback for a visitor who matches none
//                     of them. Reported as a notice, not a danger, to match
//                     that "recommended" framing rather than overstating it
//                     as a hard requirement.
//   self-reference    Google's documentation says a page should list itself
//                     among its own alternates. A page missing this is
//                     telling every other page in the set "link to me" while
//                     never confirming it is part of the set from its own
//                     side.
//
// Pure functions, no I/O, no network -- the identical logic runs in the
// browser page (pasted or fetched HTML) and the Node CLI (real HTTP
// responses), so the two surfaces can never silently disagree about what a
// given set of pages means. Standalone ventures in this portfolio vendor
// their own small text-processing helpers rather than importing from
// `platform/` (confirmed convention: see cors-misconfig-check/analyze.mjs and
// structured-data-drift-check/engine.mjs), so the entity table and HTML
// attribute parsing below are vendored rather than imported.

// --- HTML entity decoding (vendored, small table -- attribute values rarely
// need more than these) -------------------------------------------------
const NAMED_ENTITIES = Object.freeze({
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
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

// --- <link> tag extraction ------------------------------------------------

const LINK_TAG_RE = /<link\b[^>]*>/gi;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function parseAttrs(tagSource) {
  const attrs = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(tagSource)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';
    attrs[name] = decodeEntities(value);
  }
  return attrs;
}

/**
 * Every `<link rel="alternate" hreflang href>` tag on a page, in
 * document order. Any attribute order, quoting, or duplicate `<link>` tag is
 * handled the same way a browser's own HTML parser would treat it -- this
 * finds the tags, it does not judge them; judging happens in `buildReport`.
 */
export function extractHreflangLinks(html) {
  const links = [];
  let m;
  LINK_TAG_RE.lastIndex = 0;
  while ((m = LINK_TAG_RE.exec(String(html))) !== null) {
    const attrs = parseAttrs(m[0]);
    const rel = (attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes('alternate')) continue;
    if (!attrs.hreflang || !attrs.href) continue;
    links.push({ hreflang: attrs.hreflang.trim(), href: attrs.href.trim() });
  }
  return links;
}

// --- BCP 47 / ISO 639-1 + ISO 3166-1 validation ---------------------------
//
// Both lists below are the complete, officially published sets (ISO 639-1
// has 184 two-letter language codes; ISO 3166-1 alpha-2 has 249 assigned
// two-letter country/territory codes) -- unlike some other checkers in this
// portfolio that curate an open-ended list (schema.org has no closed set of
// LocalBusiness subtypes), these two standards are closed and small enough to
// vendor in full, so "not in this list" is a real finding, not a heuristic
// gap that has to be disclosed as non-exhaustive.

const LANGUAGES = new Set([
  'aa', 'ab', 'ae', 'af', 'ak', 'am', 'an', 'ar', 'as', 'av', 'ay', 'az',
  'ba', 'be', 'bg', 'bh', 'bi', 'bm', 'bn', 'bo', 'br', 'bs',
  'ca', 'ce', 'ch', 'co', 'cr', 'cs', 'cu', 'cv', 'cy',
  'da', 'de', 'dv', 'dz',
  'ee', 'el', 'en', 'eo', 'es', 'et', 'eu',
  'fa', 'ff', 'fi', 'fj', 'fo', 'fr', 'fy',
  'ga', 'gd', 'gl', 'gn', 'gu', 'gv',
  'ha', 'he', 'hi', 'ho', 'hr', 'ht', 'hu', 'hy', 'hz',
  'ia', 'id', 'ie', 'ig', 'ii', 'ik', 'io', 'is', 'it', 'iu',
  'ja', 'jv',
  'ka', 'kg', 'ki', 'kj', 'kk', 'kl', 'km', 'kn', 'ko', 'kr', 'ks', 'ku', 'kv', 'kw', 'ky',
  'la', 'lb', 'lg', 'li', 'ln', 'lo', 'lt', 'lu', 'lv',
  'mg', 'mh', 'mi', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my',
  'na', 'nb', 'nd', 'ne', 'ng', 'nl', 'nn', 'no', 'nr', 'nv', 'ny',
  'oc', 'oj', 'om', 'or', 'os',
  'pa', 'pi', 'pl', 'ps', 'pt',
  'qu',
  'rm', 'rn', 'ro', 'ru', 'rw',
  'sa', 'sc', 'sd', 'se', 'sg', 'si', 'sk', 'sl', 'sm', 'sn', 'so', 'sq', 'sr', 'ss', 'st', 'su', 'sv', 'sw',
  'ta', 'te', 'tg', 'th', 'ti', 'tk', 'tl', 'tn', 'to', 'tr', 'ts', 'tt', 'tw', 'ty',
  'ug', 'uk', 'ur', 'uz',
  've', 'vi', 'vo',
  'wa', 'wo',
  'xh',
  'yi', 'yo',
  'za', 'zh', 'zu',
]);

const REGIONS = new Set([
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HM', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'UM', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
]);

// The single most common real-world hreflang mistake, named explicitly
// rather than left as a bare "not recognized" -- "UK" reads as an obviously
// correct abbreviation for the United Kingdom to most authors, and it is
// simply not one of the 249 codes ISO 3166-1 actually assigned. A generic
// "not recognized" message would send a reader to guess; this sends them
// straight to the fix.
const REGION_MISTAKES = {
  UK: '"UK" is not an ISO 3166-1 region code -- it was never assigned one. ' +
    'The United Kingdom\'s actual code is "GB" (e.g. "en-GB", not "en-UK").',
  EU: '"EU" is not an ISO 3166-1 country code. It is a user-assigned ' +
    'exception reserved for some organizations\' internal use (and used as a ' +
    'ccTLD), but it is not part of the standard region list hreflang expects.',
};

export const X_DEFAULT = 'x-default';

/**
 * Validates one hreflang attribute value against BCP 47's common shape:
 * `language[-script][-region]`, where language is checked against the full
 * ISO 639-1 two-letter set and region against the full ISO 3166-1 alpha-2
 * set. A 4-letter script subtag (`Hans`, `Latn`, ...) is recognized but not
 * validated against ISO 15924 -- no table for that is vendored here, so it
 * is reported as present rather than guessed at. A 3-digit UN M49 numeric
 * region is likewise recognized but not validated. Anything else after the
 * language is flagged as an unrecognized subtag rather than silently ignored
 * or silently accepted.
 *
 * @returns {{input: string, valid: boolean, normalized: string|null,
 *   language: string|null, region: string|null, issues: Array<{kind: string, message: string}>}}
 */
export function validateHreflangCode(code) {
  const input = String(code ?? '').trim();

  if (input.toLowerCase() === X_DEFAULT) {
    const issues = input === X_DEFAULT
      ? []
      : [{ kind: 'case', message: `"${input}" should be written in lowercase as "x-default".` }];
    return { input, valid: true, normalized: X_DEFAULT, language: null, region: null, issues };
  }

  const parts = input.split('-').filter(Boolean);
  if (parts.length === 0) {
    return {
      input, valid: false, normalized: null, language: null, region: null,
      issues: [{ kind: 'format', message: 'Empty hreflang value.' }],
    };
  }

  const issues = [];
  const [langRaw, ...rest] = parts;
  const lang = langRaw.toLowerCase();
  let langValid;

  if (!/^[A-Za-z]{2}$/.test(langRaw)) {
    langValid = false;
    issues.push({
      kind: 'language',
      message: /^[A-Za-z]{3}$/.test(langRaw)
        ? `"${langRaw}" is a three-letter code; this tool checks ISO 639-1 two-letter language codes only, so it cannot confirm this one.`
        : `"${langRaw}" is not a two-letter language subtag.`,
    });
  } else if (!LANGUAGES.has(lang)) {
    langValid = false;
    issues.push({ kind: 'language', message: `"${langRaw}" is not a recognized ISO 639-1 language code.` });
  } else {
    langValid = true;
    if (langRaw !== lang) {
      issues.push({ kind: 'case', message: `Language subtag should be lowercase: "${lang}", not "${langRaw}".` });
    }
  }

  let region = null;
  let regionValid = true;
  for (const part of rest) {
    if (/^[A-Za-z]{4}$/.test(part)) {
      continue; // script subtag (e.g. Hans, Latn) -- recognized, not validated
    }
    if (/^[0-9]{3}$/.test(part)) {
      continue; // UN M49 numeric region -- recognized, not validated
    }
    if (/^[A-Za-z]{2}$/.test(part)) {
      const upper = part.toUpperCase();
      region = upper;
      if (REGION_MISTAKES[upper]) {
        regionValid = false;
        issues.push({ kind: 'region', message: REGION_MISTAKES[upper] });
      } else if (!REGIONS.has(upper)) {
        regionValid = false;
        issues.push({ kind: 'region', message: `"${part}" is not a recognized ISO 3166-1 region code.` });
      } else if (part !== upper) {
        issues.push({ kind: 'case', message: `Region subtag should be uppercase: "${upper}", not "${part}".` });
      }
      continue;
    }
    issues.push({
      kind: 'extra',
      message: `"${part}" is not a script, region, or numeric-region subtag this tool recognizes -- left unvalidated rather than guessed at.`,
    });
  }

  const valid = langValid && regionValid;
  const normalized = langValid ? [lang, region].filter(Boolean).join('-') : null;
  return { input, valid, normalized, language: langRaw, region, issues };
}

// --- URL normalization -----------------------------------------------------

/** Resolves `href` against `base` and drops the fragment, so two spellings of
 * the same URL (with/without a trailing `#section`) compare equal. Returns
 * `null` for a string neither absolute nor resolvable against `base`. */
export function normalizeUrl(href, base) {
  try {
    const u = new URL(String(href), base ?? undefined);
    u.hash = '';
    return u.toString();
  } catch {
    return null;
  }
}

// --- Report assembly --------------------------------------------------------

/**
 * Checks one page's hreflang set.
 *
 * @param {object} input
 * @param {string|null} input.url - the page's own canonical URL. Required
 *   for the self-reference and reciprocity checks; omit it (browser paste
 *   with no URL given) and those two are reported as unchecked rather than
 *   guessed at.
 * @param {string} input.html - the page's HTML source.
 * @param {Array<{href: string, html: string|null}>} [input.alternates] -
 *   content for some or all of the hrefs this page's own hreflang tags name,
 *   however it was obtained (the CLI's real HTTP fetch, a browser fetch that
 *   happened to succeed, or HTML the visitor pasted by hand). An href with no
 *   matching entry, or an entry with `html: null`, is reported as
 *   "unverified" rather than as a finding -- not being able to check
 *   something is not the same as it being wrong.
 * @returns {object} report
 */
export function buildReport({ url = null, html, alternates = [] } = {}) {
  const targetUrl = url ? normalizeUrl(url) : null;
  const ownLinksRaw = extractHreflangLinks(html);
  const ownLinks = ownLinksRaw.map((link) => ({
    ...link,
    absoluteHref: normalizeUrl(link.href, targetUrl ?? undefined),
    validation: validateHreflangCode(link.hreflang),
  }));

  const findings = [];

  // 1. Invalid or non-canonical codes.
  for (const link of ownLinks) {
    if (!link.validation.valid) {
      findings.push({
        id: 'invalid-hreflang-code',
        severity: 'danger',
        title: `Invalid hreflang value "${link.hreflang}"`,
        detail: link.validation.issues.map((i) => i.message).join(' '),
        hreflang: link.hreflang,
        href: link.href,
      });
    } else if (link.validation.issues.length > 0) {
      findings.push({
        id: 'hreflang-case-issue',
        severity: 'notice',
        title: `hreflang "${link.hreflang}" uses non-canonical casing`,
        detail: link.validation.issues.map((i) => i.message).join(' '),
        hreflang: link.hreflang,
        href: link.href,
      });
    }
  }

  // 2. Duplicate / conflicting hreflang values.
  const byCode = new Map();
  for (const link of ownLinks) {
    const key = link.validation.normalized ?? link.hreflang.toLowerCase();
    if (!byCode.has(key)) byCode.set(key, []);
    byCode.get(key).push(link);
  }
  for (const [code, group] of byCode) {
    if (group.length < 2) continue;
    const distinctHrefs = [...new Set(group.map((g) => g.absoluteHref ?? g.href))];
    if (distinctHrefs.length > 1) {
      findings.push({
        id: 'conflicting-hreflang',
        severity: 'danger',
        title: `hreflang "${code}" points at ${distinctHrefs.length} different URLs`,
        detail: `Multiple <link> tags declare hreflang="${code}" with different href values ` +
          `(${distinctHrefs.join(', ')}). A search engine cannot tell which URL is the real ` +
          `${code} version of this page, so it is likely to ignore all of them for this code.`,
        hreflang: code,
        hrefs: distinctHrefs,
      });
    } else {
      findings.push({
        id: 'duplicate-hreflang',
        severity: 'notice',
        title: `hreflang "${code}" is declared more than once`,
        detail: `The same hreflang="${code}" -> ${distinctHrefs[0]} pairing appears in ` +
          `${group.length} separate <link> tags. Harmless but redundant -- one tag is enough.`,
        hreflang: code,
        hrefs: distinctHrefs,
      });
    }
  }

  // 3. Self-reference. Only meaningful once a page has opted into a hreflang
  // set at all -- a page with zero hreflang tags is not "missing itself",
  // it simply isn't participating in cross-language annotation.
  let selfReferenceChecked = false;
  if (targetUrl && ownLinks.length > 0) {
    selfReferenceChecked = true;
    const hasSelf = ownLinks.some((link) => link.absoluteHref === targetUrl);
    if (!hasSelf) {
      findings.push({
        id: 'missing-self-reference',
        severity: 'danger',
        title: 'Page does not list itself among its own hreflang alternates',
        detail: 'Google\'s hreflang documentation says every page in a set should include ' +
          'itself in its own list of alternates. No alternate-language link tag on this ' +
          `page points back at ${targetUrl}.`,
      });
    }
  }

  // 4. x-default.
  const distinctRealCodes = new Set(
    ownLinks
      .filter((link) => link.validation.normalized && link.validation.normalized !== X_DEFAULT)
      .map((link) => link.validation.normalized),
  );
  const hasXDefault = ownLinks.some((link) => link.hreflang.trim().toLowerCase() === X_DEFAULT);
  if (distinctRealCodes.size >= 2 && !hasXDefault) {
    findings.push({
      id: 'missing-x-default',
      severity: 'notice',
      title: 'No x-default fallback declared',
      detail: `This page declares ${distinctRealCodes.size} language/region variants but no ` +
        'hreflang="x-default" entry for a visitor who matches none of them. Google\'s ' +
        'documentation calls x-default optional but recommended for exactly this case.',
    });
  }

  // 5. Reciprocity -- needs both the target's own URL and the alternate's content.
  const alternateByHref = new Map();
  for (const alt of alternates || []) {
    const key = normalizeUrl(alt.href, targetUrl ?? undefined) ?? alt.href;
    alternateByHref.set(key, alt);
  }

  const reciprocity = [];
  const seenAlternateHrefs = new Set();
  for (const link of ownLinks) {
    const key = link.absoluteHref ?? link.href;
    if (seenAlternateHrefs.has(key)) continue; // dedupe: several codes can point at once URL
    seenAlternateHrefs.add(key);
    if (targetUrl && key === targetUrl) continue; // a page's own self-reference is not an "alternate" to reciprocate

    if (!targetUrl) {
      reciprocity.push({ href: link.href, status: 'unchecked', reason: 'no-target-url' });
      continue;
    }
    const alt = alternateByHref.get(key);
    if (!alt || alt.html == null) {
      reciprocity.push({ href: link.href, status: 'unchecked', reason: 'no-content' });
      continue;
    }
    const altLinks = extractHreflangLinks(alt.html).map((l) => ({
      ...l,
      absoluteHref: normalizeUrl(l.href, key),
    }));
    const linksBack = altLinks.some((l) => l.absoluteHref === targetUrl);
    if (linksBack) {
      reciprocity.push({ href: link.href, status: 'confirmed' });
    } else {
      reciprocity.push({ href: link.href, status: 'missing' });
      findings.push({
        id: 'missing-reciprocal-confirmation',
        severity: 'danger',
        title: `${link.href} does not link back`,
        detail: `This page links to ${link.href} with hreflang="${link.hreflang}", but that ` +
          `page's own hreflang tags do not include a link back to ${targetUrl}. Google's ` +
          'hreflang documentation requires annotations to be reciprocal or they may be ' +
          'ignored -- a one-way hreflang link is treated as if it did not exist.',
        hreflang: link.hreflang,
        href: link.href,
      });
    }
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;
  const uncheckedCount = reciprocity.filter((r) => r.status === 'unchecked').length;

  return {
    url: targetUrl,
    links: ownLinks.map((link) => ({
      hreflang: link.hreflang,
      href: link.href,
      absoluteHref: link.absoluteHref,
      valid: link.validation.valid,
      normalized: link.validation.normalized,
    })),
    findings,
    reciprocity,
    selfReferenceChecked,
    dangerCount,
    noticeCount,
    uncheckedCount,
    // Matches the sibling checkers' convention (cors-misconfig-check): a run
    // that could not confirm some of what it set out to check is not "ok",
    // even with zero danger findings among the parts it did confirm. Claiming
    // a clean reciprocity result while some alternates were never fetched
    // would be exactly the false confidence this tool exists to avoid.
    incomplete: uncheckedCount > 0,
    ok: dangerCount === 0 && uncheckedCount === 0,
  };
}
