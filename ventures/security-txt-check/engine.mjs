// Parses and validates a security.txt file against RFC 9116.
//
// Everything here is pure: text in, report out. No network, no clock reads
// beyond the `now` the caller supplies -- a validator whose verdict depends on
// an ambient clock cannot be tested for the one finding that matters most
// here (an expired file), so `now` is always an argument.
//
// The rule set is RFC 9116 itself, not a vendor's house style. Where the RFC
// says MUST, a violation is `danger`; where it says SHOULD or recommends, it
// is `notice`. That distinction is the whole value of the tool: an expired
// `Expires` is a broken file, a British-spelled `Acknowledgements` is a typo
// that costs a researcher nothing, and a checker that shouts equally about
// both teaches its user to ignore it.

/** The complete set of fields RFC 9116 defines. Anything else is "unknown",
 * which a conforming consumer must ignore. */
const KNOWN_FIELDS = new Set([
  'acknowledgments', 'canonical', 'contact', 'encryption',
  'expires', 'hiring', 'policy', 'preferred-languages',
]);

// The RFC spells it without the middle "e". The British spelling is the most
// common single mistake in real files, and it is silent: a conforming parser
// ignores the unknown field, so the acknowledgments page simply never gets
// found. Worth its own finding rather than a generic "unknown field".
const MISSPELLINGS = {
  acknowledgements: 'Acknowledgments',
  'preferred-language': 'Preferred-Languages',
  contacts: 'Contact',
  expire: 'Expires',
  expiry: 'Expires',
  expiration: 'Expires',
};

const PGP_SIGNED_HEADER = '-----BEGIN PGP SIGNED MESSAGE-----';
const PGP_KEY_BLOCK = '-----BEGIN PGP PUBLIC KEY BLOCK-----';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** RFC 9116 requires the file at this path; anything else is a legacy or
 * wrong location that conforming tooling will not look at. */
export const WELL_KNOWN_PATH = '/.well-known/security.txt';

/**
 * Strips an OpenPGP cleartext signature wrapper, returning the signed payload.
 * Returns `{ signed: false, body }` unchanged when there is no wrapper.
 *
 * RFC 4880's cleartext format puts armour headers (e.g. `Hash: SHA256`) after
 * the BEGIN line, then a blank line, then the payload, then the signature.
 * Validating the armour rather than the payload is the obvious wrong turn: it
 * reports every field missing on a file that is actually fine.
 */
export function unwrapSignature(text) {
  const startIdx = text.indexOf(PGP_SIGNED_HEADER);
  if (startIdx === -1) return { signed: false, body: text };

  const afterHeader = text.slice(startIdx + PGP_SIGNED_HEADER.length);
  // Armour headers run until the first blank line.
  const blankLine = afterHeader.search(/\r?\n\r?\n/);
  if (blankLine === -1) return { signed: true, body: '' };
  const payloadStart = blankLine + afterHeader.slice(blankLine).match(/\r?\n\r?\n/)[0].length;
  const payload = afterHeader.slice(payloadStart);

  const sigIdx = payload.indexOf('-----BEGIN PGP SIGNATURE-----');
  return {
    signed: true,
    body: sigIdx === -1 ? payload : payload.slice(0, sigIdx),
  };
}

/**
 * Parses security.txt text into fields and syntax problems.
 * Field names are case-insensitive per RFC 9116; values are not.
 */
export function parseSecurityTxt(text) {
  const { signed, body } = unwrapSignature(text ?? '');
  const hadBom = (text ?? '').charCodeAt(0) === 0xfeff;
  const clean = hadBom ? body.replace(/^﻿/, '') : body;

  const fields = [];
  const malformed = [];
  const lines = clean.split(/\r?\n/);

  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    // A cleartext-signed payload escapes a leading "-" as "- -"; undo it
    // before anything else looks at the line.
    const line = signed ? rawLine.replace(/^- /, '') : rawLine;

    if (line.trim() === '') return;
    if (line.trimStart().startsWith('#')) return;

    const colon = line.indexOf(':');
    if (colon === -1) {
      malformed.push({ line: lineNo, text: line.trim() });
      return;
    }

    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (name === '') {
      malformed.push({ line: lineNo, text: line.trim() });
      return;
    }
    fields.push({ name, key: name.toLowerCase(), value, line: lineNo });
  });

  return { signed, hadBom, fields, malformed, containsKeyBlock: clean.includes(PGP_KEY_BLOCK) };
}

function parseUri(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** RFC 5646 language tags, loosely: the shape a typo actually breaks. */
function looksLikeLanguageTag(tag) {
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag);
}

/**
 * RFC 9116 requires an ISO 8601 / RFC 3339 timestamp. `Date.parse` is far
 * more forgiving than that (it accepts "Jan 1 2030", and rolls a nonexistent
 * calendar date over into the next month), so the format is checked with a
 * pattern first and only then handed to `Date`. The same "Date.parse is not a
 * validator" trap sitemap-lastmod-freshness-check documents.
 */
export function parseExpires(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?([Zz]|[+-]\d{2}:\d{2})$/.exec(value ?? '');
  if (!m) return { valid: false, date: null };

  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return { valid: false, date: null };

  const date = new Date(ms);
  // Reject a date that parsed only because it rolled over (2026-02-30).
  const utc = new Date(Date.UTC(+y, +mo - 1, +d));
  if (utc.getUTCMonth() !== +mo - 1 || utc.getUTCDate() !== +d) return { valid: false, date: null };
  if (+h > 23 || +mi > 59 || (s !== undefined && +s > 60)) return { valid: false, date: null };

  return { valid: true, date };
}

function finding(id, severity, title, detail, line = null) {
  return { id, severity, title, detail, line };
}

/**
 * Validates parsed security.txt content.
 *
 * @param {object} opts
 * @param {string} opts.text        raw file contents
 * @param {Date}   [opts.now]       the moment to judge `Expires` against
 * @param {string} [opts.servedFrom] the URL the file was actually fetched
 *                                   from, when known (CLI mode). Enables the
 *                                   location and Canonical-agreement checks
 *                                   a paste cannot support.
 * @param {string} [opts.contentType] the served Content-Type, when known.
 */
export function buildReport({ text, now = new Date(), servedFrom = null, contentType = null } = {}) {
  const parsed = parseSecurityTxt(text);
  const findings = [];

  if ((text ?? '').trim() === '') {
    return {
      ...emptyShape(parsed, servedFrom),
      findings: [finding('empty', 'danger', 'The file is empty',
        'There is no content to validate. A security.txt that exists but says nothing is worse than none: it answers a researcher\'s lookup with silence rather than a redirect to however you do accept reports.')],
      ok: false,
      dangerCount: 1,
      noticeCount: 0,
    };
  }

  const byKey = new Map();
  for (const f of parsed.fields) {
    if (!byKey.has(f.key)) byKey.set(f.key, []);
    byKey.get(f.key).push(f);
  }

  // --- Structural / syntax -------------------------------------------------
  for (const bad of parsed.malformed) {
    findings.push(finding('malformed-line', 'danger', `Line ${bad.line} is not a field or a comment`,
      `RFC 9116 lines are either "Field: value", a comment starting with "#", or blank. Line ${bad.line} is none of these: ${JSON.stringify(bad.text.slice(0, 80))}. A conforming parser stops or skips here, so anything you meant to say on this line is not being read.`,
      bad.line));
  }

  if (parsed.hadBom) {
    findings.push(finding('bom', 'notice', 'The file starts with a byte-order mark',
      'A UTF-8 BOM is legal but confuses strict line-oriented parsers, which see the first field name as "\\uFEFFContact" and treat it as unknown. Save the file as UTF-8 without a BOM.'));
  }

  // --- Contact (required) --------------------------------------------------
  const contacts = byKey.get('contact') ?? [];
  if (contacts.length === 0) {
    findings.push(finding('contact-missing', 'danger', 'No Contact field',
      'RFC 9116 requires at least one Contact field — it is the entire point of the file. Without it a researcher who found the file still has nowhere to send a report. Use a mailto:, https: or tel: URI.'));
  }
  for (const c of contacts) {
    const uri = parseUri(c.value);
    if (!uri) {
      findings.push(finding('contact-not-uri', 'danger', `Contact on line ${c.line} is not a URI`,
        `RFC 9116 requires Contact values to be URIs, so a bare address or phone number does not conform. ${JSON.stringify(c.value.slice(0, 60))} has no scheme — write an email address as "mailto:security@example.com" and a phone number as "tel:+1-201-555-0123".`,
        c.line));
    } else if (uri.protocol === 'http:') {
      findings.push(finding('contact-insecure', 'danger', `Contact on line ${c.line} uses plain http`,
        'RFC 9116 says a web Contact URI must use HTTPS. A report form served over http: can be read and altered in transit, which is precisely the traffic you least want intercepted.',
        c.line));
    }
  }

  // --- Expires (required, exactly once) ------------------------------------
  const expires = byKey.get('expires') ?? [];
  if (expires.length === 0) {
    findings.push(finding('expires-missing', 'danger', 'No Expires field',
      'RFC 9116 requires exactly one Expires field. It is what tells a researcher the contact details are still maintained rather than abandoned years ago; a file without it cannot be trusted by a conforming consumer.'));
  } else if (expires.length > 1) {
    findings.push(finding('expires-duplicate', 'danger', `Expires appears ${expires.length} times`,
      `RFC 9116 says Expires must appear exactly once. With more than one value a consumer cannot tell which date governs, and different tools will pick differently. Lines: ${expires.map((e) => e.line).join(', ')}.`,
      expires[1].line));
  }

  let expiresDate = null;
  if (expires.length >= 1) {
    const first = expires[0];
    const { valid, date } = parseExpires(first.value);
    if (!valid) {
      findings.push(finding('expires-invalid', 'danger', `Expires on line ${first.line} is not a valid timestamp`,
        `RFC 9116 requires an ISO 8601 / RFC 3339 timestamp such as "2027-01-31T23:59:00.000Z". ${JSON.stringify(first.value.slice(0, 60))} does not match that format, so a conforming consumer cannot tell whether this file is current.`,
        first.line));
    } else {
      expiresDate = date;
      const delta = date.getTime() - now.getTime();
      if (delta <= 0) {
        findings.push(finding('expires-past', 'danger', 'This security.txt has expired',
          `Expires is ${first.value}, which is in the past. RFC 9116 says data in an expired file must be considered stale and should not be used — so from a conforming researcher's point of view you currently publish no contact at all, even though the file is still being served. This is the finding most likely to be true of a file nobody has looked at in a year.`,
          first.line));
      } else if (delta > YEAR_MS) {
        findings.push(finding('expires-far', 'notice', 'Expires is more than a year away',
          `RFC 9116 recommends a value less than a year into the future, so that a stale file reveals itself rather than vouching indefinitely for contact details nobody has re-checked. Expires is ${first.value}.`,
          first.line));
      } else if (delta < THIRTY_DAYS_MS) {
        findings.push(finding('expires-soon', 'notice', 'Expires is less than 30 days away',
          `Expires is ${first.value}. Once it passes, conforming consumers treat everything in this file as stale. Renew it — and if this keeps catching you by surprise, run this check in CI so the build tells you first.`,
          first.line));
      }
    }
  }

  // --- Encryption ----------------------------------------------------------
  for (const e of byKey.get('encryption') ?? []) {
    const uri = parseUri(e.value);
    if (!uri) {
      findings.push(finding('encryption-not-uri', 'danger', `Encryption on line ${e.line} is not a URI`,
        'RFC 9116 says the Encryption field must be a URI pointing at a key — the key itself must not appear in the file. Publish the key at an https: URL (or name it with an OpenPGP fingerprint URI) and link to that.',
        e.line));
    } else if (uri.protocol === 'http:') {
      findings.push(finding('encryption-insecure', 'notice', `Encryption on line ${e.line} uses plain http`,
        'A key fetched over http: can be swapped in transit, which defeats the purpose of publishing it. Serve it over HTTPS.',
        e.line));
    }
  }
  if (parsed.containsKeyBlock) {
    findings.push(finding('encryption-inline-key', 'danger', 'A PGP public key block is pasted into the file',
      'RFC 9116 is explicit that keys must not be included directly in security.txt — the Encryption field takes a URI that points at the key. An inline block also breaks the line-oriented format for every field after it.'));
  }

  // --- Preferred-Languages -------------------------------------------------
  const langs = byKey.get('preferred-languages') ?? [];
  if (langs.length > 1) {
    findings.push(finding('languages-duplicate', 'danger', `Preferred-Languages appears ${langs.length} times`,
      `RFC 9116 says Preferred-Languages must not appear more than once; list every language in one comma-separated value instead. Lines: ${langs.map((l) => l.line).join(', ')}.`,
      langs[1].line));
  }
  for (const l of langs) {
    const tags = l.value.split(',').map((t) => t.trim()).filter(Boolean);
    const bad = tags.filter((t) => !looksLikeLanguageTag(t));
    if (tags.length === 0) {
      findings.push(finding('languages-empty', 'notice', `Preferred-Languages on line ${l.line} has no value`,
        'An empty Preferred-Languages says nothing; either list language tags (e.g. "en, nl") or remove the field.',
        l.line));
    } else if (bad.length > 0) {
      findings.push(finding('languages-invalid', 'notice', `Preferred-Languages on line ${l.line} has a tag that is not a language tag`,
        `RFC 9116 takes RFC 5646 language tags, such as "en", "en-GB" or "nl". These do not look like tags: ${bad.map((b) => JSON.stringify(b)).join(', ')}. Writing language names ("English") rather than tags is the usual cause.`,
        l.line));
    }
  }

  // --- Other URI fields ----------------------------------------------------
  for (const key of ['canonical', 'policy', 'acknowledgments', 'hiring']) {
    for (const f of byKey.get(key) ?? []) {
      const uri = parseUri(f.value);
      if (!uri) {
        findings.push(finding(`${key}-not-uri`, 'notice', `${f.name} on line ${f.line} is not a URI`,
          `RFC 9116 defines ${f.name} as a URI field. ${JSON.stringify(f.value.slice(0, 60))} has no scheme, so a consumer cannot resolve it.`,
          f.line));
      } else if (uri.protocol === 'http:') {
        findings.push(finding(`${key}-insecure`, 'notice', `${f.name} on line ${f.line} uses plain http`,
          'Serve it over HTTPS — a page reached over http: can be altered in transit, and for Canonical that means an attacker can misdirect where your own file claims to live.',
          f.line));
      }
    }
  }

  // --- Signature / Canonical -----------------------------------------------
  const canonicals = byKey.get('canonical') ?? [];
  if (parsed.signed && canonicals.length === 0) {
    findings.push(finding('signed-no-canonical', 'notice', 'Signed file with no Canonical field',
      'RFC 9116 says Canonical should be used when the file is digitally signed. Without it a signed file can be copied to another host and still verify, so the signature proves the text is yours but not where it was meant to live.'));
  }

  // --- Unknown / misspelled fields ----------------------------------------
  for (const f of parsed.fields) {
    if (KNOWN_FIELDS.has(f.key)) continue;
    const suggestion = MISSPELLINGS[f.key];

    // "Policy https://example.com/x" -- the colon after the field name is
    // missing, but the one in "https:" is not, so a naive parser splits on
    // that instead and reports a bizarre unknown field named "Policy https".
    // Worth its own message: the literal reading is technically right and
    // completely unhelpful, and this is an easy typo to make.
    const [firstWord, ...rest] = f.name.split(/\s+/);
    if (rest.length > 0 && KNOWN_FIELDS.has(firstWord.toLowerCase())) {
      findings.push(finding('field-missing-colon', 'danger', `Line ${f.line} looks like a ${firstWord} field with the colon missing`,
        `RFC 9116 lines are "Field: value". This line reads ${JSON.stringify(`${f.name}:${f.value}`.slice(0, 70))}, so the first colon a parser finds is the one inside the value — and the field name it comes away with is ${JSON.stringify(f.name)}, which means nothing. Add the colon after ${firstWord}.`,
        f.line));
      continue;
    }

    if (suggestion) {
      findings.push(finding('field-misspelled', 'notice', `"${f.name}" on line ${f.line} is not an RFC 9116 field — did you mean ${suggestion}?`,
        `A conforming consumer ignores fields it does not recognise, so this line is silently doing nothing. ${suggestion === 'Acknowledgments' ? 'The RFC spells it "Acknowledgments", without the middle "e" — the single most common mistake in real files, and an invisible one.' : `The RFC field is "${suggestion}".`}`,
        f.line));
    } else {
      findings.push(finding('field-unknown', 'notice', `"${f.name}" on line ${f.line} is not an RFC 9116 field`,
        'RFC 9116 consumers must ignore unrecognised fields, so this line has no effect. That is legal — but if it was meant to be read by someone, it is not being.',
        f.line));
    }
  }

  // --- Served location (CLI only) -----------------------------------------
  let location = null;
  if (servedFrom) {
    const uri = parseUri(servedFrom);
    if (uri) {
      location = uri.pathname;
      if (uri.pathname !== WELL_KNOWN_PATH) {
        findings.push(finding('wrong-location', 'notice', `Served from ${uri.pathname}, not ${WELL_KNOWN_PATH}`,
          `RFC 9116 places the file under /.well-known/. A copy at the site root is tolerated by some tooling for historical reasons, but conforming consumers look under /.well-known/ and will not find this one.`));
      }
      if (canonicals.length > 0) {
        const normalised = canonicals.map((c) => c.value.replace(/\/+$/, ''));
        const here = servedFrom.replace(/\/+$/, '');
        if (!normalised.includes(here)) {
          findings.push(finding('canonical-mismatch', 'notice', 'No Canonical field names the URL this file was fetched from',
            `The file was fetched from ${servedFrom}, but Canonical names ${normalised.map((n) => JSON.stringify(n)).join(', ')}. Canonical is what lets a consumer tell an authentic copy from one republished elsewhere, so it should list every URL the file is legitimately served at — including this one.`));
        }
      }
    }
  }

  if (contentType !== null) {
    const media = contentType.split(';')[0].trim().toLowerCase();
    if (media !== 'text/plain') {
      findings.push(finding('content-type', 'notice', `Served as ${media || '(no type)'} rather than text/plain`,
        'RFC 9116 says the file must be served with a text/plain media type (and charset=utf-8). Some consumers refuse to parse anything else, and a browser handed text/html may try to render it.'));
    } else if (!/charset\s*=\s*utf-8/i.test(contentType)) {
      findings.push(finding('content-type-charset', 'notice', 'Served as text/plain without charset=utf-8',
        'RFC 9116 asks for "text/plain; charset=utf-8". Without the charset a consumer has to guess the encoding, which matters as soon as a name or address is not ASCII.'));
    }
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.length - dangerCount;

  return {
    signed: parsed.signed,
    fields: parsed.fields.map(({ name, key, value, line }) => ({ name, key, value, line })),
    expiresDate,
    location,
    // A paste cannot tell us where the file is served from or with what
    // media type, so those checks are simply absent rather than passed.
    // Reporting "incomplete" is the difference between "nothing found" and
    // "nothing found in the half we could look at".
    incomplete: servedFrom === null,
    findings,
    dangerCount,
    noticeCount,
    ok: dangerCount === 0,
  };
}

function emptyShape(parsed, servedFrom) {
  return {
    signed: parsed.signed,
    fields: [],
    expiresDate: null,
    location: null,
    incomplete: servedFrom === null,
    findings: [],
    dangerCount: 0,
    noticeCount: 0,
    ok: true,
  };
}
