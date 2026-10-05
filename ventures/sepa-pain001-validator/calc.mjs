// SEPA pain.001 / pain.008 validator. Pure functions, no DOM, no network, no dependencies.
//
// The XML is read with a small tolerant tokenizer rather than the browser XML API so that (a) it runs the
// same in Node tests and in the browser, (b) every element carries its line number and the exact
// byte range of its text, which is what lets the repair step change a control total in place and
// leave every other byte of the file alone, and (c) a broken file still yields a best-effort tree
// so the other checks can run after a well-formedness error.
//
// Amounts are BigInt scaled by 10^6. No floating point is used anywhere in a sum.

export const SCALE = 6;
const SCALE_FACTOR = 10n ** BigInt(SCALE);

// ---------------------------------------------------------------------------------------------
// Reference data. All of it is read from memory of public sources; see the page's "not checked".
// ---------------------------------------------------------------------------------------------

export const IBAN_LENGTHS = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21,
  CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27,
  GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24,
  ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29,
  RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24,
  TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

// IBAN country prefixes this tool treats as inside the SEPA scheme. Newer participants are not in
// the list and are reported as a warning to check, never as an error.
export const SEPA_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH", "GB",
  "AD", "MC", "SM", "VA", "GI",
]);

const BIC_COUNTRIES = new Set([...Object.keys(IBAN_LENGTHS), ...SEPA_COUNTRIES, "US", "CA", "JP", "CN", "HK", "SG", "AU", "NZ", "IN", "ZA", "MX", "AR", "CL", "CO", "PE", "RU", "KR", "TH", "MY", "ID", "PH", "VN", "NG", "KE", "MA", "DZ", "LY", "SD", "AX", "GG", "JE", "IM", "GF", "GP", "MQ", "RE", "PM", "YT", "BL", "MF"]);

export const VERSIONS = {
  "pain.001.001.03": { family: "CT", bic: "BIC", wrapDate: false, label: "Customer credit transfer initiation (SEPA SCT)" },
  "pain.001.001.09": { family: "CT", bic: "BICFI", wrapDate: true, label: "Customer credit transfer initiation (SEPA SCT)" },
  "pain.008.001.02": { family: "DD", bic: "BIC", wrapDate: false, label: "Customer direct debit initiation (SEPA SDD)" },
  "pain.008.001.08": { family: "DD", bic: "BICFI", wrapDate: true, label: "Customer direct debit initiation (SEPA SDD)" },
};

// element name -> maximum length. Max35Text / Max70Text / Max140Text from the ISO 20022 schema.
const TEXT_MAX = {
  MsgId: 35, PmtInfId: 35, InstrId: 35, EndToEndId: 35, MndtId: 35, Nm: 70, Ustrd: 140,
  StrtNm: 70, BldgNb: 16, PstCd: 16, TwnNm: 35, AdrLine: 70, Ref: 35,
};
const ID_FIELDS = new Set(["MsgId", "PmtInfId", "InstrId", "EndToEndId", "MndtId"]);

const ALLOWED = new Set([..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-?:().,'+ "]);
export const isSepaChar = (ch) => ALLOWED.has(ch);

const SPECIAL = {
  "ä": "ae", "ö": "oe", "ü": "ue", "Ä": "AE", "Ö": "OE", "Ü": "UE", "ß": "ss", "ẞ": "SS",
  "æ": "ae", "Æ": "AE", "ø": "oe", "Ø": "OE", "œ": "oe", "Œ": "OE", "ł": "l", "Ł": "L",
  "đ": "d", "Đ": "D", "ð": "d", "Ð": "D", "þ": "th", "Þ": "TH", "ı": "i",
  "&": "+", "@": "(at)", "_": "-", ";": ",", "=": "-", "*": ".", "!": ".", "#": " ", "%": " ",
  "€": "EUR", "£": "GBP", "$": "USD", "’": "'", "‘": "'", "‚": ",", "“": "'", "”": "'", "„": "'",
  '"': "'", "–": "-", "—": "-", "−": "-", "…": "...", " ": " ", "\t": " ", "\n": " ", "\r": " ",
  "[": "(", "]": ")", "{": "(", "}": ")", "|": "/", "\\": "/", "<": "(", ">": ")", "~": "-", "^": ".", "`": "'",
};

export function transliterateChar(ch) {
  if (isSepaChar(ch)) return ch;
  if (SPECIAL[ch] !== undefined) return SPECIAL[ch];
  const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (base && [...base].every(isSepaChar)) return base;
  return ".";
}
export const transliterate = (s) => [...String(s)].map(transliterateChar).join("");
export function disallowedChars(s) {
  const seen = new Map();
  for (const ch of String(s)) if (!isSepaChar(ch) && !seen.has(ch)) seen.set(ch, transliterateChar(ch));
  return [...seen].map(([ch, to]) => ({ ch, to }));
}

// ---------------------------------------------------------------------------------------------
// Decimal-safe amounts.
// ---------------------------------------------------------------------------------------------

export function parseDecimal(str) {
  const s = String(str).trim();
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === "" && (m[2] === undefined || m[2] === ""))) return null;
  const frac = m[2] || "";
  if (frac.length > SCALE) return null;
  return BigInt(m[1] || "0") * SCALE_FACTOR + BigInt((frac + "0".repeat(SCALE)).slice(0, SCALE));
}

export function formatScaled(v, min = 2) {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = (a / SCALE_FACTOR).toString();
  let frac = (a % SCALE_FACTOR).toString().padStart(SCALE, "0").replace(/0+$/, "");
  if (frac.length < min) frac = frac.padEnd(min, "0");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

const MAX_AMOUNT = 999999999n * SCALE_FACTOR + 990000n;

// Returns { ok, scaled, problem, text }. `scaled` is set whenever the text is a plain non-negative
// decimal, even if it breaks a SEPA rule, so control totals still reflect what the file says.
export function parseAmount(raw) {
  const text = String(raw).trim();
  if (text === "") return { ok: false, problem: "empty", text };
  if (text.includes(",")) return { ok: false, problem: "comma", text };
  const neg = text.startsWith("-");
  const body = neg ? text.slice(1) : text;
  if (!/^(\d+\.?\d*|\.\d+)$/.test(body)) return { ok: false, problem: "format", text };
  const scaled = parseDecimal(body);
  if (scaled === null) return { ok: false, problem: "decimals", text };
  if (neg) return { ok: false, problem: "negative", text };
  const decimals = (body.split(".")[1] || "").length;
  if (decimals > 2) return { ok: false, problem: "decimals", scaled, text };
  if (scaled === 0n) return { ok: false, problem: "zero", scaled, text };
  if (scaled > MAX_AMOUNT) return { ok: false, problem: "toolarge", scaled, text };
  return { ok: true, scaled, text };
}

// ---------------------------------------------------------------------------------------------
// IBAN and BIC.
// ---------------------------------------------------------------------------------------------

export function ibanMod97(iban) {
  const s = iban.slice(4) + iban.slice(0, 4);
  let rem = 0;
  for (const ch of s) {
    const v = ch >= "A" && ch <= "Z" ? ch.charCodeAt(0) - 55 : ch.charCodeAt(0) - 48;
    if (v < 0 || v > 35) return -1;
    rem = v > 9 ? (rem * 100 + v) % 97 : (rem * 10 + v) % 97;
  }
  return rem;
}

export function maskIban(iban) {
  const s = String(iban).replace(/\s+/g, "");
  if (s.length <= 8) return "*".repeat(s.length);
  return s.slice(0, 4) + "*".repeat(s.length - 8) + s.slice(-4);
}

// Returns { ok, problems: [{code, cause, fix}], sepa, country }. Messages only ever carry the masked IBAN.
export function checkIban(raw) {
  const problems = [];
  const text = String(raw);
  const masked = maskIban(text);
  const compact = text.replace(/\s+/g, "").toUpperCase();
  if (text !== text.trim() || /\s/.test(text.trim())) {
    problems.push({ code: "IBAN-SPACES", cause: `The IBAN ${masked} contains spaces or surrounding whitespace; in the XML an IBAN is 15 to 34 characters with no spaces.`, fix: "Remove the spaces. This tool does not edit IBANs for you." });
  }
  if (compact !== text.replace(/\s+/g, "")) {
    problems.push({ code: "IBAN-CASE", cause: `The IBAN ${masked} has lowercase letters; the schema pattern allows capitals only.`, fix: "Write the IBAN in capitals." });
  }
  const country = compact.slice(0, 2);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/.test(compact)) {
    problems.push({ code: "IBAN-FORMAT", cause: `${masked} does not look like an IBAN: it must start with two letters and two digits, then up to 30 letters or digits.`, fix: "Check the number against the account holder's statement; an account number or BBAN is not an IBAN." });
    return { ok: false, problems, sepa: false, country };
  }
  let lengthOk = true;
  const want = IBAN_LENGTHS[country];
  if (want === undefined) {
    problems.push({ code: "IBAN-COUNTRY", severity: "warning", cause: `${masked}: country code ${country} is not in this tool's IBAN length table, so only the check digits could be tested.`, fix: "Confirm the country code is correct." });
  } else if (compact.length !== want) {
    lengthOk = false;
    problems.push({ code: "IBAN-LENGTH", cause: `${masked} is ${compact.length} characters; an IBAN for ${country} is ${want}.`, fix: "A digit was dropped or added. Compare with the original IBAN." });
  }
  if (lengthOk || want === undefined) {
    if (ibanMod97(compact) !== 1) {
      problems.push({ code: "IBAN-CHECKSUM", cause: `${masked} fails the mod-97 check, so it is mistyped, transposed or truncated (the check digits are the 3rd and 4th characters).`, fix: "Re-enter the IBAN from the source; the bank will reject it or the payment will fail to route." });
    }
  }
  const sepa = SEPA_COUNTRIES.has(country);
  if (want !== undefined && !sepa) {
    problems.push({ code: "IBAN-NOT-SEPA", severity: "warning", cause: `${masked}: country ${country} is not in the SEPA country list this tool carries (newer participants may be missing).`, fix: "Check with your bank that the country takes SEPA euro payments." });
  }
  return { ok: problems.filter((p) => p.severity !== "warning").length === 0, problems, sepa, country };
}

export function checkBic(raw) {
  const text = String(raw).trim();
  if (!/^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(text)) {
    return { ok: false, cause: `"${text}" is not a valid BIC: it is 8 or 11 characters, four letters for the bank, two for the country, two for the location, optionally three for the branch, all capitals.`, fix: "Check for lowercase letters, spaces, a missing branch code or a typo; or leave the BIC out and use NOTPROVIDED, which SEPA allows." };
  }
  if (!BIC_COUNTRIES.has(text.slice(4, 6))) return { ok: true, warn: `The country part of the BIC "${text}" (${text.slice(4, 6)}) is not one this tool recognises.` };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Calendar: weekends and TARGET2 closing days.
// ---------------------------------------------------------------------------------------------

export function easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
export const iso = (d) => d.toISOString().slice(0, 10);

export function targetHolidays(year) {
  const easter = easterSunday(year);
  const h = new Map();
  h.set(`${year}-01-01`, "New Year's Day");
  h.set(iso(addDays(easter, -2)), "Good Friday");
  h.set(iso(addDays(easter, 1)), "Easter Monday");
  h.set(`${year}-05-01`, "Labour Day (1 May)");
  h.set(`${year}-12-25`, "Christmas Day");
  h.set(`${year}-12-26`, "26 December");
  return h;
}

export function targetDayInfo(d) {
  const dow = d.getUTCDay();
  if (dow === 6) return { open: false, reason: "a Saturday" };
  if (dow === 0) return { open: false, reason: "a Sunday" };
  const name = targetHolidays(d.getUTCFullYear()).get(iso(d));
  if (name) return { open: false, reason: `a TARGET holiday (${name})` };
  return { open: true };
}

export function nextTargetDay(d) {
  let x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  for (let i = 0; i < 10; i++) {
    if (targetDayInfo(x).open) return x;
    x = addDays(x, 1);
  }
  return x;
}

export function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return iso(d) === `${m[1]}-${m[2]}-${m[3]}` ? d : null;
}

// ---------------------------------------------------------------------------------------------
// XML tokenizer.
// ---------------------------------------------------------------------------------------------

const INDEXED = new Set(["PmtInf", "CdtTrfTxInf", "DrctDbtTxInf", "Ustrd", "GrpHdr"]);
const NAME_RE = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?/;

export function parseXml(srcIn) {
  const src = String(srcIn);
  const errors = [];
  const nl = [];
  for (let k = 0; k < src.length; k++) if (src.charCodeAt(k) === 10) nl.push(k);
  const lineAt = (pos) => {
    let lo = 0, hi = nl.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (nl[mid] < pos) lo = mid + 1; else hi = mid; }
    return lo + 1;
  };
  const err = (pos, code, title, cause, fix) => { if (errors.length < 25) errors.push({ line: lineAt(pos), code, title, cause, fix }); };

  let i = 0;
  const n = src.length;
  let bom = false;
  if (src.charCodeAt(0) === 0xfeff) { bom = true; i = 1; }
  const doc = { name: "#document", qname: "#document", children: [], parts: [], path: "", attrs: {}, line: 1 };
  const stack = [doc];
  let decl = null, doctype = false;

  const m0 = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.exec(src);
  if (m0) err(m0.index, "WF-CHAR", "Control character in the file", `A control character (code ${m0[0].charCodeAt(0)}) is not allowed anywhere in XML.`, "Delete the character; it is usually a copy and paste or export artefact.");
  const bad = src.indexOf("�");
  if (bad >= 0) err(bad, "WF-ENCODING", "Invalid bytes were replaced when the file was read", "The file is not valid UTF-8 (a replacement character appears). It was probably saved in Windows-1252 or ISO-8859-1.", "Re-export the file as UTF-8, which SEPA requires.");

  function decode(raw, pos) {
    return raw.replace(/&([^;\s<&]*)(;?)/g, (all, name, semi) => {
      if (!semi) { err(pos, "WF-AMP", "Unescaped & in text", "A bare & starts an entity in XML. Names like \"Smith & Sons\" must be written Smith &amp; Sons.", "Replace & with &amp; (or with + for a SEPA-safe character)."); return all; }
      if (name === "amp") return "&";
      if (name === "lt") return "<";
      if (name === "gt") return ">";
      if (name === "quot") return '"';
      if (name === "apos") return "'";
      let m = /^#x([0-9a-fA-F]+)$/.exec(name) || /^#([0-9]+)$/.exec(name);
      if (m) { const cp = parseInt(m[1], name.startsWith("#x") ? 16 : 10); try { return String.fromCodePoint(cp); } catch { /* fall through */ } }
      err(pos, "WF-ENTITY", `Unknown entity &${name};`, "Only &amp; &lt; &gt; &quot; &apos; and numeric references are defined without a DTD.", "Replace it with the character itself or a numeric reference.");
      return all;
    });
  }

  while (i < n) {
    const top = stack[stack.length - 1];
    if (src[i] !== "<") {
      let j = src.indexOf("<", i);
      if (j < 0) j = n;
      const raw = src.slice(i, j);
      if (stack.length === 1) {
        if (raw.trim()) err(i + raw.search(/\S/), "WF-OUTSIDE", "Text outside the root element", "Characters appear before or after the single <Document> element.", "Remove them. A stray character often sits in front of <?xml ...?> or after </Document>.");
      } else {
        top.parts.push(decode(raw, i));
      }
      i = j;
      continue;
    }
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      if (e < 0) { err(i, "WF-COMMENT", "Comment is never closed", "A <!-- comment has no closing -->.", "Add -->."); break; }
      i = e + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const e = src.indexOf("]]>", i + 9);
      if (e < 0) { err(i, "WF-CDATA", "CDATA section is never closed", "A <![CDATA[ section has no closing ]]>.", "Add ]]>."); break; }
      if (stack.length > 1) { top.parts.push(src.slice(i + 9, e)); top.hasCdata = true; }
      i = e + 3;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const e = src.indexOf("?>", i + 2);
      if (e < 0) { err(i, "WF-PI", "Processing instruction is never closed", "A <? has no closing ?>.", "Add ?>."); break; }
      const body = src.slice(i + 2, e);
      if (/^xml(\s|$)/.test(body)) {
        if (i !== (bom ? 1 : 0)) err(i, "WF-DECL-POS", "XML declaration is not at the very start", "<?xml ...?> must be the first thing in the file. Whitespace or a blank line before it makes parsers reject the file.", "Delete everything before <?xml.");
        decl = { version: (/version\s*=\s*["']([^"']*)["']/.exec(body) || [])[1] || null, encoding: (/encoding\s*=\s*["']([^"']*)["']/.exec(body) || [])[1] || null, line: lineAt(i) };
      }
      i = e + 2;
      continue;
    }
    if (src.startsWith("<!DOCTYPE", i) || src.startsWith("<!doctype", i)) {
      doctype = true;
      let depth = 0, j = i + 9;
      for (; j < n; j++) { const c = src[j]; if (c === "[") depth++; else if (c === "]") depth--; else if (c === ">" && depth <= 0) break; }
      err(i, "XML-DOCTYPE", "The file declares a DTD", "Payment files do not use a DTD, banks reject them, and a DTD is how XML entity-expansion attacks are written. This tool ignores it and expands nothing.", "Remove the <!DOCTYPE ...> declaration.");
      i = j + 1;
      continue;
    }
    if (src.startsWith("</", i)) {
      const e = src.indexOf(">", i);
      if (e < 0) { err(i, "WF-TAG", "Closing tag is never finished", "A </ has no closing >.", "Add >."); break; }
      const name = src.slice(i + 2, e).trim();
      let idx = -1;
      for (let k = stack.length - 1; k >= 1; k--) if (stack[k].qname === name) { idx = k; break; }
      if (idx < 0) {
        err(i, "WF-STRAY-CLOSE", `Closing tag </${name}> has no matching opening tag`, "A closing tag appears where nothing of that name is open.", "Delete it or add the missing opening tag.");
      } else {
        while (stack.length - 1 > idx) {
          const lost = stack.pop();
          err(i, "WF-MISMATCH", `<${lost.qname}> opened on line ${lost.line} is closed by </${name}>`, `The element <${lost.qname}> was never closed before </${name}> began.`, `Add </${lost.qname}> where it should end.`);
        }
        const node = stack.pop();
        node.contentEnd = i;
        node.closed = true;
      }
      i = e + 1;
      continue;
    }
    // start tag
    const nm = NAME_RE.exec(src.slice(i + 1, i + 200));
    if (!nm) {
      err(i, "WF-LT", "Unescaped < in text", "A < must start a tag; inside text it has to be written &lt;.", "Replace < with &lt;.");
      i += 1;
      continue;
    }
    const startPos = i;
    let p = i + 1 + nm[0].length;
    const attrs = {};
    let selfClosing = false, ok = true;
    for (;;) {
      while (p < n && /\s/.test(src[p])) p++;
      if (p >= n) { ok = false; err(startPos, "WF-TAG", `Tag <${nm[0]}> is never finished`, "The file ends inside a tag.", "Add >."); break; }
      if (src[p] === ">") { p++; break; }
      if (src[p] === "/" && src[p + 1] === ">") { selfClosing = true; p += 2; break; }
      const an = /^[A-Za-z_:][\w.:-]*/.exec(src.slice(p, p + 100));
      if (!an) { ok = false; err(p, "WF-ATTR", `Malformed attribute in <${nm[0]}>`, `Unexpected character "${src[p]}" inside the tag.`, "Check quotes and spacing."); const e = src.indexOf(">", p); p = e < 0 ? n : e + 1; break; }
      p += an[0].length;
      while (p < n && /\s/.test(src[p])) p++;
      if (src[p] !== "=") { ok = false; err(p, "WF-ATTR", `Attribute ${an[0]} has no value`, "XML attributes are always name=\"value\".", `Write ${an[0]}="..."`); const e = src.indexOf(">", p); p = e < 0 ? n : e + 1; break; }
      p++;
      while (p < n && /\s/.test(src[p])) p++;
      const q = src[p];
      if (q !== '"' && q !== "'") { ok = false; err(p, "WF-ATTR-QUOTE", `Attribute ${an[0]} is not quoted`, "XML attribute values must be in quotes.", `Write ${an[0]}="..."`); const e = src.indexOf(">", p); p = e < 0 ? n : e + 1; break; }
      const e = src.indexOf(q, p + 1);
      if (e < 0) { ok = false; err(p, "WF-ATTR-QUOTE", `Attribute ${an[0]} has no closing quote`, "A quoted value is not closed.", "Add the closing quote."); p = n; break; }
      if (Object.prototype.hasOwnProperty.call(attrs, an[0])) err(p, "WF-ATTR-DUP", `Attribute ${an[0]} appears twice`, "An element cannot repeat an attribute.", "Delete one.");
      attrs[an[0]] = decode(src.slice(p + 1, e), p);
      p = e + 1;
    }
    if (!ok && p >= n) { i = n; continue; }
    const parent = stack[stack.length - 1];
    const local = nm[0].includes(":") ? nm[0].split(":")[1] : nm[0];
    if (stack.length === 1 && parent.children.length >= 1) err(startPos, "WF-ROOTS", "More than one root element", "A well-formed XML document has exactly one root element, <Document>. Two files pasted together look like this.", "Keep one message per file.");
    const idx = parent.children.filter((c) => c.name === local).length + 1;
    const node = {
      name: local, qname: nm[0], attrs, children: [], parent, parts: [], line: lineAt(startPos), selfClosing,
      path: `${parent.path}/${local}${INDEXED.has(local) ? `[${idx}]` : ""}`,
      contentStart: p, contentEnd: selfClosing ? p : null, closed: selfClosing,
    };
    parent.children.push(node);
    if (!selfClosing) stack.push(node);
    i = p;
  }
  while (stack.length > 1) {
    const lost = stack.pop();
    err(n, "WF-UNCLOSED", `<${lost.qname}> opened on line ${lost.line} is never closed`, "The file ends while this element is still open, which usually means it was truncated.", `Add </${lost.qname}> (and any closing tags above it).`);
  }
  if (doc.children.length === 0) err(0, "WF-EMPTY", "No XML element found", "The text contains no XML elements.", "Paste a pain.001 or pain.008 file.");
  const finish = (node) => {
    node.text = node.parts.join("");
    node.leaf = node.children.length === 0;
    for (const c of node.children) finish(c);
  };
  finish(doc);
  return { root: doc.children[0] || null, errors, decl, doctype, bom, source: src };
}

// ---------------------------------------------------------------------------------------------
// Tree helpers.
// ---------------------------------------------------------------------------------------------

const kid = (n, name) => (n ? n.children.find((c) => c.name === name) : undefined);
const kids = (n, name) => (n ? n.children.filter((c) => c.name === name) : []);
const dig = (n, path) => path.split("/").reduce((x, p) => (x ? kid(x, p) : undefined), n);
const txt = (n) => (n ? n.text.trim() : "");
function* walk(n) { yield n; for (const c of n.children) yield* walk(c); }

// ---------------------------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------------------------

const SEV_ORDER = { error: 0, warning: 1, info: 2 };

export function validate(text, opts = {}) {
  const findings = [];
  const today = opts.today ? new Date(Date.UTC(opts.today.getUTCFullYear(), opts.today.getUTCMonth(), opts.today.getUTCDate())) : (() => { const t = new Date(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())); })();
  const add = (severity, code, node, title, cause, fix) => findings.push({ severity, code, line: node ? node.line : null, path: node && node.path ? node.path : "", title, cause, fix: fix || "" });

  const parsed = parseXml(text);
  for (const e of parsed.errors) findings.push({ severity: "error", code: e.code, line: e.line, path: "", title: e.title, cause: e.cause, fix: e.fix });
  const root = parsed.root;
  const summary = { version: null, family: null, namespace: null, groups: [], transactions: 0, total: null, txList: [], wellFormed: parsed.errors.filter((e) => e.code.startsWith("WF-")).length === 0 };
  if (!root) return finalize(findings, summary);

  if (parsed.decl && parsed.decl.encoding && !/^utf-?8$/i.test(parsed.decl.encoding)) {
    findings.push({ severity: "warning", code: "ENC-DECL", line: parsed.decl.line, path: "", title: `XML declares encoding ${parsed.decl.encoding}`, cause: "SEPA payment files are UTF-8. A different declaration means the bytes may be read differently by the bank than by you.", fix: "Save the file as UTF-8 and declare encoding=\"UTF-8\"." });
  }

  // Namespace and version.
  if (root.name !== "Document") add("error", "NS-ROOT", root, `Root element is <${root.qname}>, expected <Document>`, "pain.001 and pain.008 files start with a Document element in the ISO 20022 namespace.", "Check this is an initiation message and not another format.");
  let nsValue = null;
  for (const [k, v] of Object.entries(root.attrs)) if ((k === "xmlns" || k.startsWith("xmlns:")) && /urn:iso:std:iso:20022:tech:xsd:/.test(v)) nsValue = v;
  let version = null, vinfo = null;
  if (!nsValue) {
    add("error", "NS-MISSING", root, "No ISO 20022 namespace on the root element", "The Document element has no xmlns=\"urn:iso:std:iso:20022:tech:xsd:pain.001.001.03\" (or .09, pain.008.001.02 / .08), so a bank cannot tell which schema to apply.", "Add the xmlns attribute for your version.");
  } else {
    const m = /xsd:([a-z]+\.\d{3}\.\d{3}\.\d{2})/.exec(nsValue);
    version = m ? m[1] : null;
    summary.namespace = nsValue;
    if (!version) {
      add("error", "NS-UNKNOWN", root, "Unrecognised ISO 20022 namespace", `The namespace "${nsValue}" is not a pain message identifier.`, "Use the namespace your bank's template gives.");
    } else if (VERSIONS[version]) {
      vinfo = VERSIONS[version];
    } else if (/^pain\.00[18]\./.test(version)) {
      const last = parseInt(version.slice(-2), 10);
      const family = version.startsWith("pain.001") ? "CT" : "DD";
      vinfo = { family, bic: last >= 8 ? "BICFI" : "BIC", wrapDate: last >= 8, label: "unsupported version", approx: true };
      add("warning", "NS-VERSION", root, `${version} is not one of the four versions checked in detail`, "This tool checks pain.001.001.03, pain.001.001.09, pain.008.001.02 and pain.008.001.08. The generic checks (totals, IBAN, BIC, characters, dates) still ran, using the closest rules.", "Ask your bank which version it accepts; .03 and .09 are the usual ones.");
    } else {
      add("error", "NS-NOT-INITIATION", root, `${version} is not a payment initiation message`, "This tool validates customer credit transfer initiations (pain.001) and direct debit initiations (pain.008). A status report (pain.002) or statement (camt.*) is a different message.", "Open the file you send to the bank, not the one it sends back.");
    }
  }
  if (!vinfo) return finalize(findings, summary);
  summary.version = version;
  summary.family = vinfo.family;
  const CT = vinfo.family === "CT";
  const bodyName = CT ? "CstmrCdtTrfInitn" : "CstmrDrctDbtInitn";
  const txName = CT ? "CdtTrfTxInf" : "DrctDbtTxInf";
  const body = kid(root, bodyName);
  if (!body) {
    const other = kid(root, CT ? "CstmrDrctDbtInitn" : "CstmrCdtTrfInitn");
    add("error", "R-BODY", root, other ? `Namespace says ${version} but the body is <${other.name}>` : `Missing <${bodyName}>`, other ? "The declared version and the content do not match: a credit transfer body in a direct debit namespace, or the reverse." : `A ${version} file has <${bodyName}> under <Document>.`, "Use the namespace that matches the content, or the right message type.");
    return finalize(findings, summary);
  }
  add("info", "VERSION", root, `Detected ${version}: ${vinfo.label}`, vinfo.approx ? "Approximate rules were used." : "", "");

  // --- text fields: length, characters, empties ---------------------------------------------
  const seenText = new Set();
  for (const node of walk(body)) {
    if (!node.leaf || !node.parent) continue;
    let max = TEXT_MAX[node.name];
    const isOthrId = node.name === "Id" && node.parent.name === "Othr";
    if (isOthrId) max = 35;
    if (max === undefined) continue;
    if (node.name === "Id" && !isOthrId) continue;
    const value = node.text;
    if (value.trim() === "") continue; // reported by the required-element checks where it matters
    const key = node.path;
    if (seenText.has(key)) continue;
    seenText.add(key);
    if ([...value].length > max) {
      add("error", "TXT-LENGTH", node, `<${node.name}> is ${[...value].length} characters, maximum ${max}`, `${node.name} is limited to ${max} characters (Max${max}Text) in the schema; banks reject longer values or silently truncate them. Starts: "${[...value].slice(0, 24).join("")}…"`, `Shorten it by ${[...value].length - max} character(s).`);
    }
    const bad = disallowedChars(value);
    if (bad.length) {
      const list = bad.slice(0, 6).map((b) => `"${b.ch}" (suggest "${b.to}")`).join(", ");
      add("error", "TXT-CHARS", node, `<${node.name}> has characters outside the SEPA character set`, `Allowed: a-z A-Z 0-9 / - ? : ( ) . , ' + and space. Found ${list}${bad.length > 6 ? ` and ${bad.length - 6} more` : ""}. Banks reject or garble these.`, "Use the repair step to transliterate them, or replace them by hand.");
    }
    if (ID_FIELDS.has(node.name) && (/^\/|\/$|\/\//.test(value.trim()))) {
      add("warning", "TXT-SLASH", node, `<${node.name}> starts or ends with "/" or contains "//"`, "SEPA reference fields must not begin or end with a slash or contain two in a row.", "Remove or change the slashes.");
    }
  }

  // --- group header ---------------------------------------------------------------------------
  const grpHdrs = kids(body, "GrpHdr");
  const msgIds = [];
  const grp = grpHdrs[0];
  if (!grp) add("error", "R-GRPHDR", body, "Missing <GrpHdr>", "Every message starts with a group header (message id, creation time, number of transactions).", "Add GrpHdr.");
  const need = (parent, rel, label, code = "R-MISSING", sev = "error", fix) => {
    const n = dig(parent, rel);
    if (!n) { add(sev, code, parent, `Missing <${rel.split("/").pop()}>${label ? ` (${label})` : ""}`, `${parent.path || ""} needs ${rel}.`, fix || `Add <${rel.split("/").pop()}>.`); return null; }
    if (n.leaf && n.text.trim() === "") { add(sev, "R-EMPTY", n, `<${n.name}> is empty`, `${rel} has no value.`, fix || "Give it a value."); return null; }
    return n;
  };
  if (grp) {
    const mid = need(grp, "MsgId", "message id");
    if (mid) msgIds.push(mid);
    const cre = need(grp, "CreDtTm", "creation date and time");
    if (cre && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(txt(cre))) add("error", "FMT-DATETIME", cre, `CreDtTm "${txt(cre)}" is not an ISO date-time`, "Expected YYYY-MM-DDThh:mm:ss, for example 2026-10-05T09:30:00.", "Reformat it.");
    need(grp, "InitgPty/Nm", "initiating party name");
    if (grpHdrs.length > 1) add("error", "R-GRPHDR-MANY", grpHdrs[1], `${grpHdrs.length} group headers in one message`, "A message has exactly one GrpHdr. Two files merged into one look like this.", "Split them into separate files.");
  }
  if (grp && opts.previousMsgIds && msgIds[0]) {
    const prev = new Set(opts.previousMsgIds.map((s) => String(s).trim()).filter(Boolean));
    if (prev.has(txt(msgIds[0]))) add("error", "DUP-MSGID-PRIOR", msgIds[0], `MsgId "${txt(msgIds[0])}" was already used`, "You listed this message id as already sent. Banks reject a repeated MsgId as a duplicate submission.", "Give this file a new MsgId.");
  }

  // --- payment info blocks --------------------------------------------------------------------
  const pmtInfs = kids(body, "PmtInf");
  if (!pmtInfs.length) add("error", "R-PMTINF", body, "No <PmtInf> block", "A message needs at least one payment information block.", "Add PmtInf.");
  const pmtInfIds = new Map();
  const e2e = new Map();
  let totalCount = 0, totalSum = 0n, unreadable = 0;
  const dateName = CT ? "ReqdExctnDt" : "ReqdColltnDt";
  const bicEl = vinfo.bic, wrongBic = bicEl === "BIC" ? "BICFI" : "BIC";

  const checkAgent = (agent, label) => {
    const fin = kid(agent, "FinInstnId");
    if (!fin) { add("error", "R-AGENT", agent, `<${agent.name}> has no <FinInstnId>`, `${label} bank identification is missing.`, "Add FinInstnId with a BIC, or Othr/Id NOTPROVIDED."); return; }
    const bad = kid(fin, wrongBic);
    if (bad) add("error", "BIC-ELEMENT", bad, `<${wrongBic}> is not valid in ${version}; use <${bicEl}>`, `${version} names the bank code element ${bicEl}.`, `Rename it to <${bicEl}>.`);
    const bic = kid(fin, bicEl) || bad;
    if (bic) {
      const r = checkBic(bic.text);
      if (!r.ok) add("error", "BIC-FORMAT", bic, `${label} BIC is not valid`, r.cause, r.fix);
      else if (r.warn) add("warning", "BIC-COUNTRY", bic, `${label} BIC country not recognised`, r.warn, "Check the BIC.");
    } else if (!(txt(dig(fin, "Othr/Id")) === "NOTPROVIDED")) {
      add("warning", "BIC-NONE", fin, `${label} has neither a BIC nor NOTPROVIDED`, "SEPA files may omit the BIC but should then say <Othr><Id>NOTPROVIDED</Id></Othr>.", "Add a BIC or the NOTPROVIDED form.");
    }
  };
  const checkAccount = (acct, label) => {
    const ib = dig(acct, "Id/IBAN");
    if (!ib || ib.text.trim() === "") { add("error", "IBAN-MISSING", ib || acct, `${label} has no IBAN`, "SEPA accounts are identified by IBAN. Other account identifiers (Othr) are not accepted.", "Add Id/IBAN."); return null; }
    return ib;
  };

  for (const pi of pmtInfs) {
    const g = { line: pi.line, path: pi.path, id: txt(kid(pi, "PmtInfId")), date: null, txs: 0, declaredNb: null, declaredSum: null, sum: 0n, readable: 0 };
    const pid = need(pi, "PmtInfId", "payment information id");
    if (pid) {
      const key = txt(pid);
      if (pmtInfIds.has(key)) add("error", "DUP-PMTINFID", pid, `Duplicate PmtInfId "${key}"`, `Also used on line ${pmtInfIds.get(key)}. Each payment information block needs its own id; banks reject the file or merge the blocks.`, "Make each PmtInfId unique.");
      else pmtInfIds.set(key, pid.line);
    }
    const mtd = need(pi, "PmtMtd", "payment method");
    const wantMtd = CT ? "TRF" : "DD";
    if (mtd && txt(mtd) !== wantMtd) add("error", "R-PMTMTD", mtd, `PmtMtd is "${txt(mtd)}", expected ${wantMtd}`, `A ${CT ? "credit transfer" : "direct debit"} file uses PmtMtd ${wantMtd}.`, `Set it to ${wantMtd}.`);
    const svc = dig(pi, "PmtTpInf/SvcLvl/Cd");
    if (!svc) add("error", "SEPA-SVCLVL", dig(pi, "PmtTpInf") || pi, "Missing PmtTpInf/SvcLvl/Cd = SEPA", "A SEPA payment is marked <SvcLvl><Cd>SEPA</Cd></SvcLvl> at the PmtInf level; without it the bank treats the batch as a non-SEPA payment.", "Add <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>.");
    else if (txt(svc) !== "SEPA") add("error", "SEPA-SVCLVL", svc, `Service level is "${txt(svc)}", must be SEPA`, "Only SEPA is accepted as the service level in a SEPA file.", "Change it to SEPA.");
    if (!CT) {
      const lcl = dig(pi, "PmtTpInf/LclInstrm/Cd");
      if (!lcl) add("error", "DD-LCLINSTRM", dig(pi, "PmtTpInf") || pi, "Missing PmtTpInf/LclInstrm/Cd (CORE or B2B)", "A direct debit batch states its scheme: CORE or B2B.", "Add <LclInstrm><Cd>CORE</Cd></LclInstrm>.");
      else if (!["CORE", "B2B", "COR1"].includes(txt(lcl))) add("error", "DD-LCLINSTRM", lcl, `Local instrument "${txt(lcl)}" is not CORE or B2B`, "The scheme code must be CORE or B2B (COR1 is the retired variant).", "Use CORE or B2B.");
      else if (txt(lcl) === "COR1") add("warning", "DD-COR1", lcl, "COR1 is a retired local instrument", "COR1 was folded into CORE; banks may reject it.", "Use CORE.");
      const seq = dig(pi, "PmtTpInf/SeqTp");
      if (!seq) add("error", "DD-SEQTP", dig(pi, "PmtTpInf") || pi, "Missing SeqTp (FRST, RCUR, FNAL or OOFF)", "Each direct debit batch states where it sits in the mandate's sequence.", "Add <SeqTp>.");
      else if (!["FRST", "RCUR", "FNAL", "OOFF"].includes(txt(seq))) add("error", "DD-SEQTP", seq, `SeqTp "${txt(seq)}" is not FRST, RCUR, FNAL or OOFF`, "Only those four values exist.", "Use one of them.");
    }

    // date
    const dateNode = kid(pi, dateName);
    if (!dateNode) add("error", "R-DATE", pi, `Missing <${dateName}>`, CT ? "The requested execution date is mandatory." : "The requested collection date is mandatory.", `Add <${dateName}>.`);
    else {
      const dtChild = kid(dateNode, "Dt");
      let dateStr = txt(dateNode);
      let dnode = dateNode;
      if (vinfo.wrapDate) {
        if (dtChild) { dateStr = txt(dtChild); dnode = dtChild; }
        else if (!vinfo.approx) add("error", "DATE-WRAP", dateNode, `In ${version} the date goes inside <Dt>`, `${dateName} is a choice of <Dt> or <DtTm> in this version, so a bare date is invalid.`, `Write <${dateName}><Dt>${dateStr}</Dt></${dateName}>.`);
      } else if (dtChild) {
        add("error", "DATE-WRAP", dtChild, `In ${version} the date goes directly in <${dateName}>`, "This older version has no <Dt> wrapper.", `Write <${dateName}>YYYY-MM-DD</${dateName}>.`);
        dateStr = txt(dtChild); dnode = dtChild;
      }
      const d = parseIsoDate(dateStr);
      if (!d) add("error", "FMT-DATE", dnode, `${dateName} "${dateStr}" is not a valid date`, "Expected YYYY-MM-DD with a real calendar date, for example 2026-10-06.", "Correct the date.");
      else {
        g.date = iso(d);
        if (d < today) {
          const nx = nextTargetDay(today);
          add("warning", "DATE-PAST", dnode, `${dateName} ${iso(d)} is in the past`, `Today is ${iso(today)}. A ${CT ? "transfer" : "collection"} dated before today is rejected by many banks or executed at the next opportunity, which may not be the day you meant.`, `Use ${iso(nx)} (the next TARGET day) or later.`);
        } else {
          const info = targetDayInfo(d);
          if (!info.open) {
            const nx = nextTargetDay(d);
            add("warning", "DATE-CLOSED", dnode, `${dateName} ${iso(d)} is ${info.reason}`, "TARGET2 is closed on weekends, New Year's Day, Good Friday, Easter Monday, 1 May, 25 and 26 December, so a SEPA payment cannot settle that day. Banks move it forward or reject the file.", `Use ${iso(nx)}, the next TARGET day.`);
          }
        }
      }
    }

    // parties
    const partyKey = CT ? "Dbtr" : "Cdtr";
    need(pi, `${partyKey}/Nm`, CT ? "debtor name" : "creditor name", "R-NAME");
    const ownAcct = kid(pi, CT ? "DbtrAcct" : "CdtrAcct");
    if (!ownAcct) add("error", "R-ACCT", pi, `Missing <${CT ? "DbtrAcct" : "CdtrAcct"}>`, "The account to debit (or credit) is missing.", "Add it with Id/IBAN.");
    else checkAccount(ownAcct, CT ? "Debtor account" : "Creditor account");
    const ownAgent = kid(pi, CT ? "DbtrAgt" : "CdtrAgt");
    if (!ownAgent) add("error", "R-AGENT", pi, `Missing <${CT ? "DbtrAgt" : "CdtrAgt"}>`, "The bank of the account is missing.", "Add it with FinInstnId.");
    else checkAgent(ownAgent, CT ? "Debtor bank" : "Creditor bank");
    if (!CT) {
      const cid = dig(pi, "CdtrSchmeId/Id/PrvtId/Othr/Id");
      if (!cid) add("error", "DD-CREDITORID", pi, "Missing creditor identifier (CdtrSchmeId)", "A SEPA direct debit needs the creditor identifier issued in your country, in CdtrSchmeId/Id/PrvtId/Othr/Id.", "Add it.");
      else if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{3}[A-Za-z0-9+?/:().,'-]{1,28}$/.test(txt(cid))) add("error", "DD-CREDITORID", cid, "Creditor identifier does not have the expected shape", "It starts with a two-letter country, two check digits, a three-character business code (usually ZZZ) and then the national identifier.", "Check it against your bank's mandate paperwork.");
      const sch = dig(pi, "CdtrSchmeId/Id/PrvtId/Othr/SchmeNm/Prtry");
      if (cid && txt(sch) !== "SEPA") add("error", "DD-SCHMENM", sch || cid, "Creditor scheme name must be SEPA", "<SchmeNm><Prtry>SEPA</Prtry></SchmeNm> follows the creditor identifier.", "Add it.");
    }

    // charge bearer: PmtInf or transaction level
    const txs = kids(pi, txName);
    const chrgPi = kid(pi, "ChrgBr");
    const chrgTxs = txs.map((t) => kid(t, "ChrgBr")).filter(Boolean);
    for (const c of [chrgPi, ...chrgTxs].filter(Boolean)) if (txt(c) !== "SLEV") add("error", "SEPA-CHRGBR", c, `ChrgBr is "${txt(c)}", must be SLEV`, "SEPA payments share charges (SLEV); DEBT, CRED and SHAR are for non-SEPA payments.", "Set it to SLEV.");
    if (!chrgPi && chrgTxs.length < txs.length) add("warning", "SEPA-CHRGBR-MISSING", pi, "ChrgBr SLEV is not stated", "SEPA requires charge bearer SLEV. Some banks add it themselves, others reject the batch.", "Add <ChrgBr>SLEV</ChrgBr> to the PmtInf.");

    // declared counters
    const nb = kid(pi, "NbOfTxs"), cs = kid(pi, "CtrlSum");
    if (nb) { g.declaredNb = txt(nb); if (!/^\d{1,15}$/.test(g.declaredNb)) add("error", "FMT-NBOFTXS", nb, `NbOfTxs "${g.declaredNb}" is not a whole number`, "NbOfTxs is digits only.", "Correct it."); }
    if (cs) g.declaredSum = txt(cs);

    if (!txs.length) add("error", "R-TX", pi, `No <${txName}> in this PmtInf`, "A payment information block with no transactions is rejected.", "Add transactions or delete the block.");

    for (const tx of txs) {
      g.txs++;
      const rec = { line: tx.line, path: tx.path, e2e: "", name: "", iban: "", amount: null, ccy: "" };
      const eid = need(tx, "PmtId/EndToEndId", "end-to-end id", "R-E2E", "error", "Use a unique reference, or NOTPROVIDED if you have none.");
      if (eid) {
        rec.e2e = txt(eid);
        if (rec.e2e !== "NOTPROVIDED") {
          if (e2e.has(rec.e2e)) add("warning", "DUP-E2E", eid, `Duplicate EndToEndId "${rec.e2e}"`, `Also used on line ${e2e.get(rec.e2e)}. The end-to-end id travels to the other party's statement, so reusing it makes the two payments indistinguishable; some banks reject duplicates within a file.`, "Give each transaction its own EndToEndId.");
          else e2e.set(rec.e2e, eid.line);
        }
      }
      // amount
      const amtParent = CT ? kid(tx, "Amt") : tx;
      const amt = kid(amtParent, "InstdAmt");
      if (!amt) {
        add("error", "R-AMOUNT", CT ? (amtParent || tx) : tx, "Missing <InstdAmt>", "Every transaction needs its instructed amount" + (CT ? " inside <Amt>. EqvtAmt is not used in SEPA." : "."), "Add <InstdAmt Ccy=\"EUR\">0.00</InstdAmt>.");
      } else {
        if (CT && kid(amtParent, "EqvtAmt")) add("error", "SEPA-EQVTAMT", kid(amtParent, "EqvtAmt"), "EqvtAmt is not allowed", "SEPA payments are in euro and use InstdAmt only.", "Remove EqvtAmt.");
        const ccy = amt.attrs.Ccy;
        rec.ccy = ccy || "";
        if (!ccy) add("error", "SEPA-CCY", amt, "InstdAmt has no Ccy attribute", "The currency attribute is mandatory.", "Add Ccy=\"EUR\".");
        else if (ccy !== "EUR") add("error", "SEPA-CCY", amt, `Currency is ${ccy}, SEPA requires EUR`, `SEPA ${CT ? "credit transfers" : "direct debits"} are euro only. The ${ccy} amount would be rejected or converted outside SEPA.`, "Use EUR or send this as a non-SEPA payment.");
        const a = parseAmount(amt.text);
        rec.amount = amt.text.trim();
        const shown = a.text.length > 24 ? a.text.slice(0, 24) + "…" : a.text;
        if (a.scaled !== undefined && (a.ok || a.problem === "decimals" || a.problem === "zero" || a.problem === "toolarge")) { g.sum += a.scaled; g.readable++; }
        else if (!a.ok) unreadable++;
        if (!a.ok) {
          const msg = {
            empty: ["is empty", "Enter the amount."],
            comma: [`"${shown}" uses a comma`, "XML amounts use a decimal point and no thousands separators: 1234.56."],
            format: [`"${shown}" is not a plain number`, "Use digits and one decimal point only, with no spaces, currency symbols or thousands separators."],
            negative: [`"${shown}" is negative`, "SEPA amounts are positive; a refund is a separate transfer in the other direction."],
            zero: [`"${shown}" is zero`, "The minimum is 0.01."],
            decimals: [`"${shown}" has more than 2 decimal places`, "Euro amounts have at most 2 decimals; a spreadsheet export often leaves 3 or more. Round it yourself: this tool never changes an amount."],
            toolarge: [`"${shown}" is above 999,999,999.99`, "That is the SEPA maximum for one transaction."],
          }[a.problem];
          add("error", "AMT-" + a.problem.toUpperCase(), amt, `Amount ${msg[0]}`, `${msg[1]}`, a.problem === "decimals" ? "Round to 2 decimals in your source system and regenerate." : "Correct the amount in the source system.");
        }
      }
      // counterparty
      const other = CT ? "Cdtr" : "Dbtr";
      const nm = need(tx, `${other}/Nm`, CT ? "creditor name" : "debtor name", "R-NAME");
      rec.name = txt(nm);
      const acct = kid(tx, CT ? "CdtrAcct" : "DbtrAcct");
      if (!acct) add("error", "R-ACCT", tx, `Missing <${CT ? "CdtrAcct" : "DbtrAcct"}>`, "The counterparty account is missing.", "Add it with Id/IBAN.");
      else { const ib = checkAccount(acct, CT ? "Creditor account" : "Debtor account"); if (ib) rec.iban = maskIban(ib.text); }
      const agent = kid(tx, CT ? "CdtrAgt" : "DbtrAgt");
      if (agent) checkAgent(agent, CT ? "Creditor bank" : "Debtor bank");
      else if (!CT) add("warning", "R-AGENT", tx, "Missing <DbtrAgt>", "The debtor bank is expected in a direct debit; with an IBAN it may be given as NOTPROVIDED.", "Add DbtrAgt/FinInstnId/Othr/Id NOTPROVIDED.");
      if (!CT) {
        const mid = dig(tx, "DrctDbtTx/MndtRltdInf/MndtId");
        if (!mid || mid.text.trim() === "") add("error", "DD-MNDTID", mid || tx, "Missing mandate id (MndtId)", "Every direct debit refers to a signed mandate.", "Add DrctDbtTx/MndtRltdInf/MndtId.");
        const dos = dig(tx, "DrctDbtTx/MndtRltdInf/DtOfSgntr");
        if (!dos) add("error", "DD-DTOFSGNTR", tx, "Missing mandate signature date (DtOfSgntr)", "The date the debtor signed the mandate is mandatory.", "Add DtOfSgntr.");
        else { const dd = parseIsoDate(txt(dos)); if (!dd) add("error", "FMT-DATE", dos, `DtOfSgntr "${txt(dos)}" is not a valid date`, "Expected YYYY-MM-DD.", "Correct the date."); else if (dd > today) add("error", "DD-DTOFSGNTR", dos, `Mandate signed in the future (${iso(dd)})`, "A mandate cannot be signed after today.", "Correct the date."); }
      }
      const us = kids(dig(tx, "RmtInf"), "Ustrd");
      if (us.length > 1) add("error", "SEPA-USTRD", us[1], `${us.length} <Ustrd> elements`, "SEPA allows one unstructured remittance line of up to 140 characters.", "Merge them into one.");
      if (dig(tx, "RmtInf") && kid(dig(tx, "RmtInf"), "Strd") && us.length) add("error", "SEPA-RMTINF", dig(tx, "RmtInf"), "Both Ustrd and Strd remittance information", "Only one of the two may be used.", "Keep one.");
      summary.txList.push(rec);
    }
    summary.groups.push(g);
    totalCount += g.txs;
    totalSum += g.sum;

    // counters
    if (nb && /^\d{1,15}$/.test(g.declaredNb) && Number(g.declaredNb) !== g.txs) {
      add("error", "C-NBOFTXS", nb, `PmtInf NbOfTxs says ${g.declaredNb}, the block has ${g.txs}`, `Counted ${g.txs} <${txName}> in this block. This usually happens after a transaction is added or deleted by hand.`, `Set NbOfTxs to ${g.txs} (the repair step does this).`);
    }
    if (cs) {
      const declared = parseDecimal(g.declaredSum);
      if (declared === null) add("error", "FMT-CTRLSUM", cs, `CtrlSum "${g.declaredSum}" is not a decimal number`, "Use digits and a decimal point only, for example 1234.56.", "Correct it.");
      else if (declared !== g.sum) {
        const diff = g.sum - declared;
        add("error", "C-CTRLSUM", cs, `PmtInf CtrlSum says ${formatScaled(declared)}, the amounts add up to ${formatScaled(g.sum)}`, `Difference ${diff > 0n ? "+" : ""}${formatScaled(diff)} (summed as exact decimals, not floating point). It means an amount was edited or a transaction added or removed without updating the total.${g.readable < txs.length ? ` ${txs.length - g.readable} amount(s) could not be read and are left out of this sum.` : ""}`, `Decide which side is right. If the amounts are right, set CtrlSum to ${formatScaled(g.sum)} (the repair step does this).`);
      }
    }
  }

  summary.transactions = totalCount;
  summary.total = totalSum;

  if (grp) {
    const nb = kid(grp, "NbOfTxs"), cs = kid(grp, "CtrlSum");
    if (!nb) add("error", "R-NBOFTXS", grp, "Missing <NbOfTxs> in the group header", "The total number of transactions is mandatory in GrpHdr.", `Add <NbOfTxs>${totalCount}</NbOfTxs>.`);
    else if (!/^\d{1,15}$/.test(txt(nb))) add("error", "FMT-NBOFTXS", nb, `NbOfTxs "${txt(nb)}" is not a whole number`, "NbOfTxs is digits only.", "Correct it.");
    else if (Number(txt(nb)) !== totalCount) add("error", "C-NBOFTXS", nb, `GrpHdr NbOfTxs says ${txt(nb)}, the file has ${totalCount} transactions`, `Counted ${totalCount} <${txName}> across ${pmtInfs.length} PmtInf block(s). A hand edit or a merged export is the usual cause.`, `Set NbOfTxs to ${totalCount} (the repair step does this).`);
    if (cs) {
      const declared = parseDecimal(txt(cs));
      if (declared === null) add("error", "FMT-CTRLSUM", cs, `CtrlSum "${txt(cs)}" is not a decimal number`, "Use digits and a decimal point only.", "Correct it.");
      else if (declared !== totalSum) {
        const diff = totalSum - declared;
        add("error", "C-CTRLSUM", cs, `GrpHdr CtrlSum says ${formatScaled(declared)}, the amounts add up to ${formatScaled(totalSum)}`, `Difference ${diff > 0n ? "+" : ""}${formatScaled(diff)}, summed as exact decimals. ${unreadable ? `${unreadable} amount(s) could not be read and are left out. ` : ""}An edited amount or a changed number of transactions is the usual cause.`, `If the amounts are right, set CtrlSum to ${formatScaled(totalSum)} (the repair step does this).`);
      }
    } else {
      add("info", "C-CTRLSUM-NONE", grp, "No GrpHdr CtrlSum", `CtrlSum is optional; the amounts add up to ${formatScaled(totalSum)}.`, "");
    }
  }

  // duplicate MsgId across the file (two group headers, or the same id reused as a PmtInfId is fine)
  const midSeen = new Map();
  for (const g2 of grpHdrs) { const m = kid(g2, "MsgId"); if (m) { const k = txt(m); if (midSeen.has(k)) add("error", "DUP-MSGID", m, `Duplicate MsgId "${k}"`, `Also on line ${midSeen.get(k)}.`, "A message id must be unique per file and per day."); else midSeen.set(k, m.line); } }

  // IBAN / BIC on every occurrence (agents already checked above; this catches IBANs anywhere)
  for (const node of walk(body)) {
    if (node.name === "IBAN" && node.leaf && node.text.trim() !== "") {
      const r = checkIban(node.text);
      for (const p of r.problems) add(p.severity || "error", p.code, node, p.code === "IBAN-CHECKSUM" ? "IBAN fails the mod-97 check" : p.code === "IBAN-LENGTH" ? "IBAN has the wrong length for its country" : p.code === "IBAN-FORMAT" ? "Not a valid IBAN" : p.code === "IBAN-NOT-SEPA" ? "IBAN country is outside the SEPA list" : p.code === "IBAN-COUNTRY" ? "IBAN country not in the length table" : p.code === "IBAN-SPACES" ? "IBAN contains spaces" : "IBAN is not in capitals", p.cause, p.fix);
    }
    if (node.name === "Amt" || node.name === "InstdAmt") { /* handled above */ }
  }

  return finalize(findings, summary);
}

function finalize(findings, summary) {
  const real = findings.filter((f) => f.severity !== "info");
  if (!real.length && summary.version) findings.push({ severity: "info", code: "CLEAN", line: null, path: "", title: "Nothing flagged", cause: "Every check this tool runs passed. That is not a promise the bank will accept the file; see what is not checked.", fix: "" });
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.line || 0) - (b.line || 0));
  summary.errors = findings.filter((f) => f.severity === "error").length;
  summary.warnings = findings.filter((f) => f.severity === "warning").length;
  return { findings, summary };
}

// ---------------------------------------------------------------------------------------------
// repair: recompute NbOfTxs / CtrlSum and transliterate disallowed characters. Nothing else.
// ---------------------------------------------------------------------------------------------

function escapeXml(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

export function repair(text) {
  const p = parseXml(text);
  const fatal = p.errors.filter((e) => e.code.startsWith("WF-") && e.code !== "WF-ENCODING");
  if (fatal.length || !p.root) return { text: null, changes: [], skipped: [], error: "The file is not well-formed XML, so nothing was changed. Fix the well-formedness errors first (the first is on line " + (fatal[0] ? fatal[0].line : 1) + ")." };
  const root = p.root;
  const m = /xsd:(pain\.00[18]\.\d{3}\.\d{2})/.exec(Object.values(root.attrs).join(" "));
  const CT = !m || m[1].startsWith("pain.001");
  const body = kid(root, CT ? "CstmrCdtTrfInitn" : "CstmrDrctDbtInitn") || kid(root, "CstmrCdtTrfInitn") || kid(root, "CstmrDrctDbtInitn");
  const edits = [];
  const changes = [];
  const skipped = [];
  if (!body) return { text: null, changes, skipped, error: "No pain.001 or pain.008 body found, so nothing was changed." };
  const txName = body.name === "CstmrCdtTrfInitn" ? "CdtTrfTxInf" : "DrctDbtTxInf";
  const amountOf = (tx) => {
    const a = txName === "CdtTrfTxInf" ? dig(tx, "Amt/InstdAmt") : kid(tx, "InstdAmt");
    if (!a) return null;
    const t = a.text.trim();
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return parseDecimal(t);
  };
  const setContent = (node, value, label) => {
    if (!node || node.selfClosing || node.contentEnd === null || node.children.length) return;
    if (node.text.trim() === value) return;
    edits.push({ start: node.contentStart, end: node.contentEnd, value });
    changes.push({ line: node.line, path: node.path, what: `${label}: ${node.text.trim() || "(empty)"} -> ${value}` });
  };
  const sumTxs = (txs, where) => {
    let s = 0n;
    for (const t of txs) { const a = amountOf(t); if (a === null || a <= 0n) { skipped.push(`${where}: an amount could not be read as a plain decimal with at most 2 places, so the control sum was not rebuilt. Fix the amount yourself first.`); return null; } s += a; }
    return s;
  };
  const all = [];
  for (const pi of kids(body, "PmtInf")) {
    const txs = kids(pi, txName);
    all.push(...txs);
    setContent(kid(pi, "NbOfTxs"), String(txs.length), "PmtInf NbOfTxs");
    const cs = kid(pi, "CtrlSum");
    if (cs) { const s = sumTxs(txs, `${pi.path} CtrlSum`); if (s !== null && parseDecimal(cs.text) !== s) setContent(cs, formatScaled(s), "PmtInf CtrlSum"); }
  }
  const grp = kid(body, "GrpHdr");
  if (grp) {
    setContent(kid(grp, "NbOfTxs"), String(all.length), "GrpHdr NbOfTxs");
    const cs = kid(grp, "CtrlSum");
    if (cs) { const s = sumTxs(all, "GrpHdr CtrlSum"); if (s !== null && parseDecimal(cs.text) !== s) setContent(cs, formatScaled(s), "GrpHdr CtrlSum"); }
  }
  // Transliteration: only text fields, only elements that actually contain a disallowed character.
  for (const node of walk(body)) {
    if (!node.leaf || node.selfClosing || node.contentEnd === null) continue;
    const isOthrId = node.name === "Id" && node.parent && node.parent.name === "Othr";
    if (TEXT_MAX[node.name] === undefined && !isOthrId) continue;
    if (node.name === "Id" && !isOthrId) continue;
    if (!disallowedChars(node.text).length) continue;
    const fixed = transliterate(node.text);
    edits.push({ start: node.contentStart, end: node.contentEnd, value: escapeXml(fixed), raw: true });
    changes.push({ line: node.line, path: node.path, what: `${node.name} characters: "${node.text.length > 40 ? node.text.slice(0, 40) + "…" : node.text}" -> "${fixed.length > 40 ? fixed.slice(0, 40) + "…" : fixed}"` });
  }
  edits.sort((a, b) => b.start - a.start);
  let out = String(text);
  for (const e of edits) out = out.slice(0, e.start) + e.value + out.slice(e.end);
  changes.sort((a, b) => a.line - b.line);
  return { text: out, changes, skipped, error: null };
}

// ---------------------------------------------------------------------------------------------
// Examples, export, decoding.
// ---------------------------------------------------------------------------------------------

const DEBTOR_IBAN = "DE89370400440532013000";
const CRED = [
  ["Acme Supplies GmbH", "FR1420041010050500013M02606", "PSSTFRPPSCE", "1250.50", "Invoice 2026-0412"],
  ["Jan de Vries", "NL91ABNA0417164300", "ABNANL2A", "89.90", "Refund order 8841"],
  ["Studio Garcia SL", "ES9121000418450200051332", "CAIXESBBXXX", "2300.00", "Design work October"],
];

function tx(e2e, name, iban, bic, amt, ustrd, v) {
  const agent = bic ? `<${v.bic}>${bic}</${v.bic}>` : "<Othr><Id>NOTPROVIDED</Id></Othr>";
  return `        <CdtTrfTxInf>
          <PmtId><EndToEndId>${e2e}</EndToEndId></PmtId>
          <Amt><InstdAmt Ccy="EUR">${amt}</InstdAmt></Amt>
          <CdtrAgt><FinInstnId>${agent}</FinInstnId></CdtrAgt>
          <Cdtr><Nm>${name}</Nm></Cdtr>
          <CdtrAcct><Id><IBAN>${iban}</IBAN></Id></CdtrAcct>
          <RmtInf><Ustrd>${ustrd}</Ustrd></RmtInf>
        </CdtTrfTxInf>
`;
}

export function sampleDate(today = new Date()) {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return iso(nextTargetDay(addDays(t, 2)));
}

// Builds a pain.001 file from a spec; used for the clean example and by the tests.
export function buildCreditTransfer({ version = "pain.001.001.03", msgId = "MSG-2026-0001", created = "2026-10-05T09:30:00", date, debtorName = "Example Trading Ltd", debtorIban = DEBTOR_IBAN, debtorBic = "COBADEFFXXX", groups }) {
  const v = VERSIONS[version];
  const dateEl = v.wrapDate ? `<ReqdExctnDt><Dt>${date}</Dt></ReqdExctnDt>` : `<ReqdExctnDt>${date}</ReqdExctnDt>`;
  const gs = groups || [{ id: "PMT-0001", txs: CRED.map((c, i) => ({ e2e: `INV-${String(i + 1).padStart(4, "0")}`, name: c[0], iban: c[1], bic: c[2], amt: c[3], ustrd: c[4] })) }];
  const all = gs.flatMap((g) => g.txs);
  const sum = (list) => formatScaled(list.reduce((s, t) => s + parseDecimal(t.amt), 0n));
  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:${version}">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${created}</CreDtTm>
      <NbOfTxs>${all.length}</NbOfTxs>
      <CtrlSum>${sum(all)}</CtrlSum>
      <InitgPty><Nm>${debtorName}</Nm></InitgPty>
    </GrpHdr>
`;
  for (const g of gs) {
    xml += `    <PmtInf>
      <PmtInfId>${g.id}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${g.txs.length}</NbOfTxs>
      <CtrlSum>${sum(g.txs)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      ${dateEl}
      <Dbtr><Nm>${debtorName}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${debtorIban}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><${v.bic}>${debtorBic}</${v.bic}></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
`;
    for (const t of g.txs) xml += tx(t.e2e, t.name, t.iban, t.bic, t.amt, t.ustrd, v);
    xml += `    </PmtInf>\n`;
  }
  return xml + `  </CstmrCdtTrfInitn>\n</Document>\n`;
}

export function sampleFile(opts = {}) {
  return buildCreditTransfer({ date: sampleDate(opts.today || new Date()) });
}

export function sampleDirectDebit(opts = {}) {
  const date = sampleDate(opts.today || new Date());
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>DD-2026-0001</MsgId>
      <CreDtTm>2026-10-05T09:30:00</CreDtTm>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>59.80</CtrlSum>
      <InitgPty><Nm>Example Gym Club</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>DD-PMT-0001</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <NbOfTxs>2</NbOfTxs>
      <CtrlSum>59.80</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>
      <ReqdColltnDt>${date}</ReqdColltnDt>
      <Cdtr><Nm>Example Gym Club</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${DEBTOR_IBAN}</IBAN></Id></CdtrAcct>
      <CdtrAgt><FinInstnId><BIC>COBADEFFXXX</BIC></FinInstnId></CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>DE98ZZZ09999999999</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>
      <DrctDbtTxInf>
        <PmtId><EndToEndId>MEMBER-0001</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">29.90</InstdAmt>
        <DrctDbtTx><MndtRltdInf><MndtId>MAND-0001</MndtId><DtOfSgntr>2025-03-14</DtOfSgntr></MndtRltdInf></DrctDbtTx>
        <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>
        <Dbtr><Nm>Jan de Vries</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>NL91ABNA0417164300</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>Membership October</Ustrd></RmtInf>
      </DrctDbtTxInf>
      <DrctDbtTxInf>
        <PmtId><EndToEndId>MEMBER-0002</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">29.90</InstdAmt>
        <DrctDbtTx><MndtRltdInf><MndtId>MAND-0002</MndtId><DtOfSgntr>2025-06-01</DtOfSgntr></MndtRltdInf></DrctDbtTx>
        <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>
        <Dbtr><Nm>Maria Garcia</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>ES9121000418450200051332</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>Membership October</Ustrd></RmtInf>
      </DrctDbtTxInf>
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>
`;
}

// The clean example after typical hand edits: one amount changed, one transaction added without
// updating the totals, an accent and an ampersand in names, a transposed IBAN digit, a weekend date.
export function sampleBrokenFile(opts = {}) {
  const today = opts.today || new Date();
  let d = addDays(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), 2);
  while (d.getUTCDay() !== 6) d = addDays(d, 1);
  let xml = buildCreditTransfer({ date: iso(d) });
  xml = xml.replace("<Nm>Acme Supplies GmbH</Nm>", "<Nm>Müller &amp; Söhne GmbH</Nm>");
  xml = xml.replace("Jan de Vries", "Jan de Vries-Zoë");
  xml = xml.replace('">89.90<', '">98.90<');
  xml = xml.replace("<IBAN>ES9121000418450200051332</IBAN>", "<IBAN>ES9121000418450200051323</IBAN>");
  xml = xml.replace(/(<ChrgBr>SLEV<\/ChrgBr>)/, "<ChrgBr>SHAR</ChrgBr>");
  xml = xml.replace("<EndToEndId>INV-0003</EndToEndId>", "<EndToEndId>INV-0002</EndToEndId>");
  xml = xml.replace('Ccy="EUR">2300.00', 'Ccy="USD">2300.00');
  xml = xml.replace("<GrpHdr>\n      <MsgId>MSG-2026-0001</MsgId>\n      <CreDtTm>2026-10-05T09:30:00</CreDtTm>\n      <NbOfTxs>3</NbOfTxs>", "<GrpHdr>\n      <MsgId>MSG-2026-0001</MsgId>\n      <CreDtTm>2026-10-05T09:30:00</CreDtTm>\n      <NbOfTxs>4</NbOfTxs>");
  return xml;
}

export function findingsCsv(result) {
  const q = (s) => { let v = String(s ?? ""); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replace(/"/g, '""')}"`; };
  const rows = [["severity", "code", "line", "path", "title", "cause", "fix"].join(",")];
  for (const x of result.findings) rows.push([x.severity, x.code, x.line || "", q(x.path), q(x.title), q(x.cause), q(x.fix)].join(","));
  return rows.join("\n") + "\n";
}
export const maskedFindingsCsv = findingsCsv;

export function decodeBufferInfo(buf) {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1252").decode(buf), encoding: "windows-1252" };
  }
}
export const decodeBuffer = (buf) => decodeBufferInfo(buf).text;

export const money = (scaled) => formatScaled(scaled);
