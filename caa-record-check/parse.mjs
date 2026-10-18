// Parses a single CAA resource record's `data` field into
// `{ flag, critical, tag, value }`, and the `issue`/`issuewild` value's own
// grammar (RFC 8657) into `{ issuerDomain, disallowAll, parameters }`.
//
// Two wire formats have to be handled, not one. DNS-over-HTTPS resolvers
// return CAA `data` two different ways, and a parser tuned to only the
// friendlier one silently breaks on the other:
//
//   "0 issue \"letsencrypt.org\""          -- the RFC 8659 presentation format
//   "\\# 21 0005697373756..."              -- RFC 3597 "unknown RR" generic
//                                              hex encoding
//
// Cloudflare's own DoH JSON changelog (2026-07-28, "Improved DoH JSON
// formatting for additional record types") says CAA used to come back in the
// generic-hex form and was only switched to the presentation form that day --
// so a resolver that hasn't shipped the same fix, or a cached/older answer,
// can still hand back generic hex today. Decoding both is the difference
// between "this tool works" and "this tool works until it hits the one
// resolver that still answers the old way."

/** Decode an RFC 3597 generic-hex `data` string: `\# <len> <hex>`. */
function decodeGenericHex(raw) {
  const m = /^\\#\s+(\d+)\s+([0-9a-fA-F\s]*)$/.exec(raw.trim());
  if (!m) return null;
  const declaredLen = Number(m[1]);
  const hex = m[2].replace(/\s+/g, '');
  if (hex.length % 2 !== 0) {
    return { error: 'generic-hex CAA data has an odd number of hex digits' };
  }
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  if (bytes.length !== declaredLen) {
    return { error: `generic-hex CAA data declares length ${declaredLen} but carries ${bytes.length} byte(s)` };
  }
  if (bytes.length < 2) return { error: 'generic-hex CAA data is too short to hold a flag and a tag length' };
  const flag = bytes[0];
  const tagLen = bytes[1];
  if (2 + tagLen > bytes.length) return { error: 'generic-hex CAA data\'s declared tag length runs past the record' };
  const tag = bytes.slice(2, 2 + tagLen).map((b) => String.fromCharCode(b)).join('');
  const value = bytes.slice(2 + tagLen).map((b) => String.fromCharCode(b)).join('');
  return { flag, tag, value };
}

/** Decode the RFC 8659 presentation format: `<flag> <tag> "<value>"`. */
function decodePresentation(raw) {
  const m = /^(\d{1,3})\s+([A-Za-z0-9][A-Za-z0-9-]*)\s+"((?:[^"\\]|\\.)*)"\s*$/.exec(raw.trim());
  if (!m) return null;
  const flag = Number(m[1]);
  const tag = m[2];
  const value = m[3].replace(/\\(.)/g, '$1');
  return { flag, tag, value };
}

/**
 * @returns {{ok: true, flag: number, critical: boolean, tag: string, value: string} |
 *           {ok: false, error: string, raw: string}}
 */
export function parseCaaData(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, error: 'empty or missing CAA record data', raw: String(raw ?? '') };
  }
  const decoded = decodePresentation(raw) ?? decodeGenericHex(raw);
  if (!decoded) {
    return { ok: false, error: 'CAA data matched neither the presentation format nor RFC 3597 generic-hex', raw };
  }
  if (decoded.error) return { ok: false, error: decoded.error, raw };
  if (!Number.isInteger(decoded.flag) || decoded.flag < 0 || decoded.flag > 255) {
    return { ok: false, error: `flag byte ${decoded.flag} is out of the valid 0-255 range`, raw };
  }
  if ((decoded.flag & 0x7f) !== 0) {
    // RFC 8659: bit 0 (0x80, the "Issuer Critical Flag") is the only defined
    // bit; every other bit is reserved. A nonzero reserved bit is evidence
    // of a hand-built or generated record that got the flags byte wrong --
    // worth flagging rather than silently rounding down to "not critical".
    return { ok: false, error: `flag byte ${decoded.flag} sets a reserved bit outside the defined critical flag (0x80)`, raw };
  }
  const knownTags = new Set(['issue', 'issuewild', 'iodef']);
  const tagLower = decoded.tag.toLowerCase();
  if (!knownTags.has(tagLower) && !/^[a-z0-9-]+$/i.test(decoded.tag)) {
    return { ok: false, error: `tag "${decoded.tag}" is not a valid CAA property-tag token`, raw };
  }
  return { ok: true, flag: decoded.flag, critical: (decoded.flag & 0x80) !== 0, tag: tagLower, value: decoded.value };
}

/**
 * Parses an `issue`/`issuewild` value's own grammar (RFC 8659 §4.2, extended
 * by RFC 8657's CA-account-authorization parameters):
 *
 *   ";"                                              -- disallow every CA
 *   "letsencrypt.org"                                -- authorize one CA
 *   "letsencrypt.org; accounturi=...; validationmethods=dns-01"
 *                                                     -- authorize one CA,
 *                                                        restricted to a
 *                                                        specific account
 *                                                        and/or validation
 *                                                        method
 *
 * A hand-rolled parser that assumes "exactly one token" breaks on the third
 * shape -- this is the literal failure a DNSControl bug report records
 * ("CAA value does not contain 3 fields") against exactly this value shape.
 */
export function parseIssueValue(value) {
  const trimmed = (value ?? '').trim();
  if (trimmed === ';' || trimmed === '') {
    return { disallowAll: true, issuerDomain: null, parameters: {} };
  }
  const parts = trimmed.split(';').map((p) => p.trim()).filter((p) => p !== '');
  const issuerDomain = (parts.shift() ?? '').toLowerCase();
  const parameters = {};
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      parameters[part.toLowerCase()] = true; // a bare parameter name, malformed but preserved
      continue;
    }
    parameters[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return { disallowAll: issuerDomain === '', issuerDomain: issuerDomain || null, parameters };
}
