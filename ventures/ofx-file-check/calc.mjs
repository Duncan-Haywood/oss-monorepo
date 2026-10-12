// OFX / QFX (Web Connect) file checker. Pure functions, no DOM, no network.
// Reads the OFX 1.x (SGML) and 2.x (XML) statement formats for bank and credit-card exports.
// Written from memory of the public OFX 1.0.2 / 2.x specifications; confirm against the current
// standard. Checks the file, never any one app's import rules.

// Elements that contain other elements (and so always have a closing tag, even in SGML).
const AGGREGATES = new Set([
  "OFX", "SIGNONMSGSRSV1", "SONRS", "STATUS", "FI", "BANKMSGSRSV1", "STMTTRNRS", "STMTRS",
  "BANKACCTFROM", "BANKACCTTO", "BANKTRANLIST", "STMTTRN", "LEDGERBAL", "AVAILBAL", "BALLIST", "BAL",
  "CREDITCARDMSGSRSV1", "CCSTMTTRNRS", "CCSTMTRS", "CCACCTFROM", "CCACCTTO", "PAYEE", "CURRENCY",
  "ORIGCURRENCY", "MKTGINFO", "INV401KSOURCE", "INVACCTFROM", "INVSTMTMSGSRSV1", "INVSTMTTRNRS",
  "INVSTMTRS", "INVTRANLIST", "INVPOSLIST", "INVBAL", "SECLISTMSGSRSV1", "SECLIST", "TRNRS",
]);
const STMT_AGGS = new Set(["STMTRS", "CCSTMTRS"]);
const DATE_FIELDS = new Set(["DTPOSTED", "DTSTART", "DTEND", "DTSERVER", "DTASOF", "DTUSER", "DTAVAIL", "DTACCTUP"]);
const TRN_TYPES = new Set(["CREDIT", "DEBIT", "INT", "DIV", "FEE", "SRVCHG", "DEP", "ATM", "POS", "XFER", "CHECK", "PAYMENT", "CASH", "DIRECTDEP", "DIRECTDEBIT", "REPEATPMT", "HOLD", "OTHER"]);
const ACCT_TYPES = new Set(["CHECKING", "SAVINGS", "MONEYMRKT", "CREDITLINE", "CD"]);
const SGML_KEYS = ["OFXHEADER", "DATA", "VERSION", "SECURITY", "ENCODING", "CHARSET", "COMPRESSION", "OLDFILEUID", "NEWFILEUID"];
const SGML_VERSIONS = new Set(["102", "151", "160"]);
const XML_VERSIONS = new Set(["200", "201", "202", "203", "210", "211", "220"]);
const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/y;

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  // Keep a UTF-8 BOM so the checker can report it. Many OFX files are Windows-1252, not UTF-8.
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(b);
  } catch {
    return new TextDecoder("windows-1252").decode(b);
  }
}

function validYMD(y, m, d) {
  if (m < 1 || m > 12 || d < 1) return false;
  const dim = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= dim[m - 1];
}

// YYYYMMDD[HHMMSS[.XXX]][[offset[:TZ]]]
export function checkOfxDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2})(?:\.(\d{1,3}))?)?(?:\[([+-]?\d{1,2}(?:\.\d+)?)(?::([A-Za-z]{1,5}))?\])?$/.exec(v);
  if (!m) return { ok: false, why: "does not match YYYYMMDD[HHMMSS[.XXX]][gmt offset]" };
  if (!validYMD(+m[1], +m[2], +m[3])) return { ok: false, why: "is not a real calendar date" };
  if (m[4] !== undefined && (+m[4] > 23 || +m[5] > 59 || +m[6] > 60)) return { ok: false, why: "has an impossible time of day" };
  return { ok: true, day: m[1] + m[2] + m[3] };
}

// ISO-looking dates that can be rewritten with no guessing.
export function normaliseDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (!m || !validYMD(+m[1], +m[2], +m[3])) return null;
  let out = m[1] + m[2] + m[3];
  if (m[4] !== undefined) {
    if (+m[4] > 23 || +m[5] > 59 || (m[6] !== undefined && +m[6] > 59)) return null;
    out += m[4] + m[5] + (m[6] ?? "00");
  }
  return out;
}

// Amount to integer cents-of-a-unit string math: returns {neg, int, frac} or null.
function parseAmount(v) {
  const m = /^([+-]?)(\d*)(?:\.(\d*))?$/.exec(v);
  if (!m || (m[2] === "" && (m[3] === undefined || m[3] === ""))) return null;
  return { neg: m[1] === "-", int: m[2] || "0", frac: m[3] || "" };
}
const toMicro = (a) => {
  const frac = (a.frac + "000000").slice(0, 6);
  const n = BigInt(a.int) * 1000000n + BigInt(frac);
  return a.neg ? -n : n;
};
const fmtMicro = (n) => {
  const neg = n < 0n;
  if (neg) n = -n;
  let cents = (n + 5000n) / 10000n;
  const s = String(cents).padStart(3, "0");
  return (neg && cents !== 0n ? "-" : "") + s.slice(0, -2) + "." + s.slice(-2);
};

function tokenize(text, bodyStart) {
  const tokens = [];
  const tag = /<(\/?)([A-Za-z][A-Za-z0-9._]*)\s*>/y;
  let i = bodyStart, textStart = i;
  const flush = (end) => { if (end > textStart) tokens.push({ type: "text", raw: text.slice(textStart, end), off: textStart }); };
  while (i < text.length) {
    if (text[i] !== "<") { i++; continue; }
    tag.lastIndex = i;
    const m = tag.exec(text);
    flush(i);
    if (m) {
      tokens.push({ type: m[1] ? "close" : "open", name: m[2].toUpperCase(), raw: m[0], off: i });
      i += m[0].length;
    } else {
      tokens.push({ type: "stray", raw: "<", off: i });
      i++;
    }
    textStart = i;
  }
  flush(text.length);
  return tokens;
}

function analyze(input) {
  const text = String(input ?? "");
  const findings = [];
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") lineStarts.push(i + 1);
  const lineAt = (off) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= off) lo = mid; else hi = mid - 1; } return lo + 1; };
  const add = (severity, off, title, detail, fix) => findings.push({ severity, line: off == null ? 0 : lineAt(off), title, detail, fixable: !!fix, fix });
  const ctx = { eol, header: "", tokens: [], bom: false, tail: [] };

  let src = text;
  let bomLen = 0;
  if (src.charCodeAt(0) === 0xfeff) {
    bomLen = 1;
    ctx.bom = true;
    add("error", 0, "Byte order mark at the start of the file", "A UTF-8 BOM before the header makes many importers reject the file as not OFX.", () => "Removed the byte order mark.");
  }

  const rootMatch = /<OFX\s*>/i.exec(src);
  if (!rootMatch) {
    add("error", 0, "No <OFX> root element", src.trim() ? "The file has no <OFX> tag, so it is not an OFX statement (or it was cut off or saved as a different format)." : "The file is empty.");
    return finish(findings, ctx, { format: "unknown", cards: 0 }, text);
  }
  const bodyStart = rootMatch.index;
  const headerRaw = src.slice(bomLen, bodyStart);
  ctx.header = headerRaw;
  const tokens = tokenize(src, bodyStart);
  ctx.tokens = tokens;

  // ---- structure walk ----
  const stack = [];
  const trns = [];
  const accounts = [];
  const info = { dates: {}, acct: null, stmts: 0, ledger: false, sonrs: false, status: false };
  let curTrn = null, curStmt = null;
  let leafNoClose = 0, leafClosed = 0;
  const leafMissingClose = [];
  const addAt = (sev, tok, title, detail, fix) => add(sev, tok.off, title, detail, fix);
  const valueOf = (i) => {
    const t = tokens[i + 1];
    if (t && t.type === "text") return { val: t.raw.trim(), tok: t, i: i + 1 };
    return { val: "", tok: null, i };
  };
  const nonAscii = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "stray") {
      addAt("error", t, "Unescaped < in a value", "A < that is not part of a tag breaks parsing. Write it as &lt;.", () => { t.raw = "&lt;"; return "Escaped a stray < as &lt;."; });
      continue;
    }
    if (t.type === "text") {
      for (let k = 0; k < t.raw.length; k++) {
        const ch = t.raw[k];
        if (ch === "&") {
          ENTITY.lastIndex = k;
          if (!ENTITY.test(t.raw)) {
            const off = t.off + k;
            const fixKey = t;
            add("error", off, "Unescaped & in a value", "A bare & is invalid in OFX and stops the import at that transaction. Write it as &amp;.", () => {
              fixKey.raw = fixKey.raw.replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;");
              return "Escaped & as &amp;.";
            });
          }
        } else if (ch.charCodeAt(0) > 127) nonAscii.push({ off: t.off + k, ch });
      }
      continue;
    }
    if (t.type === "open") {
      if (AGGREGATES.has(t.name)) {
        stack.push({ name: t.name, tok: t, idx: i });
        if (t.name === "STMTTRN") curTrn = { line: lineAt(t.off), off: t.off, f: {}, acct: info.acct };
        if (STMT_AGGS.has(t.name)) { curStmt = { kind: t.name, off: t.off, f: {}, acct: {}, trans: 0 }; accounts.push(curStmt); info.acct = curStmt; }
        if (t.name === "SONRS") info.sonrs = true;
        if (t.name === "LEDGERBAL" && curStmt) curStmt.ledger = true;
        continue;
      }
      const { val, tok, i: vi } = valueOf(i);
      // matching close directly after the value?
      let closeIdx = -1;
      let j = vi + 1;
      if (tokens[j] && tokens[j].type === "close" && tokens[j].name === t.name) closeIdx = j;
      else if (tokens[j] && tokens[j].type === "text" && !tokens[j].raw.trim() && tokens[j + 1] && tokens[j + 1].type === "close" && tokens[j + 1].name === t.name) closeIdx = j + 1;
      if (closeIdx >= 0) { leafClosed++; tokens[closeIdx].leafClose = true; } else { leafNoClose++; leafMissingClose.push({ t, vi, name: t.name }); }
      const inStack = (n) => stack.some((s) => s.name === n);
      const rec = { value: val, tok, off: t.off, name: t.name };
      if (curTrn && inStack("STMTTRN")) {
        if (!(t.name in curTrn.f)) curTrn.f[t.name] = rec;
        else if (t.name !== "NAME" && t.name !== "MEMO") curTrn.f[t.name + "#dup"] = rec;
      } else if (curStmt && (inStack("BANKACCTFROM") || inStack("CCACCTFROM"))) {
        curStmt.acct[t.name] = rec;
        if (t.name === "ACCTID") curStmt.acctId = val;
      } else if (curStmt && inStack("BANKTRANLIST")) curStmt.f[t.name] = rec;
      else if (curStmt && (inStack("LEDGERBAL") || inStack("AVAILBAL"))) curStmt.f[(inStack("LEDGERBAL") ? "L_" : "A_") + t.name] = rec;
      else if (curStmt && stack.at(-1)?.name === curStmt.kind) curStmt.f[t.name] = rec;
      else if (inStack("SONRS")) { info.dates[t.name] = rec; if (inStack("STATUS")) info.status = true; }
      if (DATE_FIELDS.has(t.name) && val) {
        const ck = checkOfxDate(val);
        if (!ck.ok) {
          const iso = normaliseDate(val);
          if (iso) add("error", t.off, `${t.name} is not in OFX date format`, `"${val}" ${ck.why}. It is an unambiguous ISO date, so it can be rewritten as ${iso}.`, () => { tok.raw = tok.raw.replace(val, iso); return `Rewrote ${t.name} ${val} as ${iso}.`; });
          else add("error", t.off, `${t.name} is not in OFX date format`, `"${val}" ${ck.why}. Slash dates such as 03/04/2024 are not rewritten because day-first and month-first cannot be told apart.`);
        }
      }
      continue;
    }
    if (t.type === "close") {
      if (t.leafClose) continue;
      const pos = stack.map((s) => s.name).lastIndexOf(t.name);
      if (pos < 0) {
        if (AGGREGATES.has(t.name)) addAt("error", t, `Closing tag </${t.name}> with no matching open tag`, "The tag was opened earlier and already closed, or never opened.", () => { t.raw = ""; return `Removed the stray </${t.name}>.`; });
        else addAt("info", t, `Closing tag </${t.name}> on a value that was not opened as expected`, "OFX 1.x leaves value tags unclosed; this closing tag is ignored.");
        continue;
      }
      if (pos < stack.length - 1) {
        const open = stack.slice(pos + 1).reverse();
        const names = open.map((s) => `</${s.name}>`).join(" ");
        addAt("error", t, `Unclosed tag before </${t.name}>`, `${open.map((s) => `<${s.name}> (line ${lineAt(s.tok.off)})`).join(", ")} ${open.length === 1 ? "was" : "were"} never closed.`, () => { t.raw = open.map((s) => `</${s.name}>${eol}`).join("") + t.raw; return `Inserted missing ${names}.`; });
      }
      const closed = stack.splice(pos);
      for (const c of closed) {
        if (c.name === "STMTTRN" && curTrn) { trns.push(curTrn); if (curStmt) curStmt.trans++; curTrn = null; }
        if (STMT_AGGS.has(c.name)) curStmt = null;
      }
    }
  }
  if (stack.length) {
    const open = stack.slice().reverse();
    const names = open.map((s) => `</${s.name}>`).join(" ");
    add("error", text.length, "File ends with tags still open", `${open.map((s) => `<${s.name}> (line ${lineAt(s.tok.off)})`).join(", ")} never closed. The file is probably cut off or an export was interrupted.`, () => { ctx.tail.push(...open.map((s) => `</${s.name}>`)); return `Appended missing ${names}.`; });
    for (const c of stack) if (c.name === "STMTTRN" && curTrn) trns.push(curTrn);
  }

  // ---- format and header ----
  const hdr = headerRaw;
  const sgmlKeys = {};
  const sgmlLine = {};
  for (const m of hdr.matchAll(/^[ \t]*([A-Za-z]+)[ \t]*:[ \t]*(.*?)[ \t]*$/gm)) { sgmlKeys[m[1].toUpperCase()] = m[2]; sgmlLine[m[1].toUpperCase()] = bomLen + m.index; }
  const xmlPi = /<\?OFX\s+([^?]*)\?>/i.exec(hdr);
  const hasXmlDecl = /<\?xml\b/i.test(hdr);
  let format;
  if (xmlPi || hasXmlDecl) format = "xml";
  else if (Object.keys(sgmlKeys).length) format = "sgml";
  else format = leafClosed > 0 && leafNoClose === 0 ? "xml" : "sgml";
  const headerless = !xmlPi && !Object.keys(sgmlKeys).length;
  let version = "";

  if (format === "sgml") {
    ctx.fixHeader = {};
    if (headerless) {
      add("error", 0, "No OFX header", "An OFX 1.x file must begin with the nine header lines (OFXHEADER, DATA, VERSION, SECURITY, ENCODING, CHARSET, COMPRESSION, OLDFILEUID, NEWFILEUID) before <OFX>.", () => { ctx.addHeaderKeys = true; return "Added the standard OFX 1.x header."; });
    } else {
      version = sgmlKeys.VERSION || "";
      const want = { OFXHEADER: "100", DATA: "OFXSGML", COMPRESSION: "NONE" };
      const missing = [];
      for (const k of SGML_KEYS) {
        if (!(k in sgmlKeys)) missing.push(k);
        else if (k in want && sgmlKeys[k] !== want[k]) {
          add("error", sgmlLine[k], `Header ${k} should be ${want[k]}`, `Found "${sgmlKeys[k]}". ${want[k]} is the only value defined for ${k} in OFX 1.x.`, () => { ctx.fixHeader[k] = want[k]; return `Set header ${k} to ${want[k]}.`; });
        } else if (k === "VERSION" && !SGML_VERSIONS.has(sgmlKeys[k])) add("warning", sgmlLine[k], "Unusual OFX version", `VERSION:${sgmlKeys[k]} is not one of 102, 151 or 160.`);
        else if (k === "SECURITY" && !["NONE", "TYPE1"].includes(sgmlKeys[k].toUpperCase())) add("warning", sgmlLine[k], "Unusual SECURITY value", `SECURITY:${sgmlKeys[k]}; expected NONE or TYPE1.`);
        else if (k === "ENCODING" && !["USASCII", "UTF-8", "UNICODE"].includes(sgmlKeys[k].toUpperCase())) add("warning", sgmlLine[k], "Unusual ENCODING value", `ENCODING:${sgmlKeys[k]}; expected USASCII or UTF-8.`);
      }
      if (missing.length) add("error", 0, `Header is missing ${missing.join(", ")}`, "Quicken, QuickBooks and others reject a file whose header lacks a required line.", () => { ctx.addHeaderKeys = true; return `Added missing header line${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`; });
      for (const k of Object.keys(sgmlKeys)) if (!SGML_KEYS.includes(k)) add("warning", sgmlLine[k], `Unknown header line ${k}`, "Not part of the OFX 1.x header; some importers reject unexpected lines.");
      if (!/\n[ \t]*\r?\n[ \t]*$/.test(hdr)) {
        add("warning", bomLen, "No blank line between the header and <OFX>", "The OFX 1.x header is separated from the body by one blank line.", () => { ctx.blankLine = true; return "Added the blank line after the header."; });
      }
    }
    if (leafClosed > 0 && leafNoClose === 0 && !headerless && sgmlKeys.DATA === "OFXSGML") add("info", 0, "SGML header but XML-style closed tags", "Every value tag is closed. That is valid XML but an OFXSGML (1.x) header; most importers accept it.");
  } else {
    const attrs = {};
    if (xmlPi) for (const m of xmlPi[1].matchAll(/([A-Za-z]+)\s*=\s*"([^"]*)"/g)) attrs[m[1].toUpperCase()] = m[2];
    version = attrs.VERSION || "";
    const piOff = bomLen + (xmlPi ? xmlPi.index : 0);
    if (!xmlPi) add("error", 0, "No <?OFX ...?> header line", "An OFX 2.x file needs <?OFX OFXHEADER=\"200\" VERSION=\"211\" SECURITY=\"NONE\" OLDFILEUID=\"NONE\" NEWFILEUID=\"NONE\"?> after the XML declaration.", () => { ctx.xmlHeader = true; return "Added the <?OFX ...?> header line."; });
    else {
      const missing = ["OFXHEADER", "VERSION", "SECURITY", "OLDFILEUID", "NEWFILEUID"].filter((k) => !(k in attrs));
      if (missing.length) add("error", piOff, `<?OFX?> header is missing ${missing.join(", ")}`, "OFX 2.x importers expect all five attributes.", () => { ctx.xmlHeaderAttrs = missing; return `Added missing <?OFX?> attribute${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`; });
      if (attrs.OFXHEADER && attrs.OFXHEADER !== "200") add("error", piOff, "OFXHEADER should be 200 in an XML file", `Found "${attrs.OFXHEADER}".`, () => { ctx.xmlHeaderSet = { ...(ctx.xmlHeaderSet || {}), OFXHEADER: "200" }; return "Set OFXHEADER to 200."; });
      if (attrs.VERSION && !XML_VERSIONS.has(attrs.VERSION)) add("warning", piOff, "Unusual OFX version", `VERSION="${attrs.VERSION}" is not one of 200-203, 210, 211 or 220.`);
    }
    if (!hasXmlDecl) add("warning", 0, "No <?xml ...?> declaration", "OFX 2.x files are XML and normally start with <?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>.", () => { ctx.xmlDecl = true; return "Added the XML declaration."; });
    for (const m of leafMissingClose) {
      const nm = m.name;
      add("error", m.t.off, `<${nm}> is not closed`, "An OFX 2.x file is XML, so every value tag needs a closing tag. Leaving it off is only valid in OFX 1.x.", () => {
        const at = m.vi;
        const ins = { type: "close", name: nm, raw: `</${nm}>`, off: -1 };
        tokens[at].after = (tokens[at].after || []).concat(ins.raw);
        return `Closed <${nm}>.`;
      });
    }
  }

  // ---- encoding vs content ----
  const enc = (sgmlKeys.ENCODING || "").toUpperCase();
  const charset = (sgmlKeys.CHARSET || "").toUpperCase();
  if (format === "sgml" && nonAscii.length) {
    const first = nonAscii[0];
    if (enc === "USASCII") add("warning", first.off, "Non-ASCII characters in a USASCII file", `${nonAscii.length} character${nonAscii.length === 1 ? "" : "s"} outside ASCII (first: "${first.ch}"). ENCODING:USASCII promises plain ASCII, so importers may drop or garble them. Not changed: the right replacement depends on what you want the text to say.`);
    else if (charset === "1252" && nonAscii.some((n) => n.ch.charCodeAt(0) > 255)) add("warning", first.off, "Characters outside Windows-1252", "CHARSET:1252 cannot hold some characters in this file (for example Greek, Cyrillic or CJK letters).");
  }

  // ---- body checks ----
  if (!info.sonrs) add("warning", 0, "No <SONRS> sign-on block", "Importers expect SIGNONMSGSRSV1/SONRS with STATUS, DTSERVER and LANGUAGE before the statements.");
  else {
    const d = info.dates;
    if (!d.DTSERVER || !d.DTSERVER.value) add("warning", 0, "SONRS has no DTSERVER", "The sign-on block should carry the server date and time.");
    if (!info.status) add("warning", 0, "SONRS has no STATUS block", "Expected <STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>.");
  }
  if (!accounts.length) add("error", 0, "No statement response found", "No STMTRS (bank) or CCSTMTRS (credit card) block. Investment (INVSTMTRS) files are not checked by this tool.");
  if (accounts.length && !trns.length) add("warning", 0, "No transactions in the file", "There are no <STMTTRN> blocks, so there is nothing to import.");

  const fitSeen = new Map();
  let credits = 0n, debits = 0n, total = 0n, minDay = "", maxDay = "";
  let counted = 0;
  const missingFields = new Set();
  for (const a of accounts) {
    const isCC = a.kind === "CCSTMTRS";
    const need = isCC ? ["ACCTID"] : ["BANKID", "ACCTID", "ACCTTYPE"];
    for (const k of need) {
      const r = a.acct[k];
      if (!r) add("error", a.off, `Account is missing ${k}`, `${isCC ? "CCACCTFROM" : "BANKACCTFROM"} must contain ${k}. Importers cannot match the file to an account without it.`);
      else if (!r.value) add("error", r.off, `${k} is blank`, `${k} is present but empty.`);
    }
    if (a.acct.ACCTTYPE?.value && !ACCT_TYPES.has(a.acct.ACCTTYPE.value.toUpperCase())) add("error", a.acct.ACCTTYPE.off, "Invalid ACCTTYPE", `"${a.acct.ACCTTYPE.value}" is not CHECKING, SAVINGS, MONEYMRKT, CREDITLINE or CD.`);
    if (a.acct.ACCTID?.value && a.acct.ACCTID.value.length > 22) add("warning", a.acct.ACCTID.off, "ACCTID longer than 22 characters", "OFX 1.x limits ACCTID to 22 characters; some importers truncate or reject longer ones.");
    if (!a.f.CURDEF?.value) add("warning", a.off, "Statement has no CURDEF", "The currency (for example USD) is expected on every statement.");
    const s = a.f.DTSTART, e = a.f.DTEND;
    {
      if (!s || !s.value) add("error", a.off, "BANKTRANLIST has no DTSTART", "The statement period start date is required.");
      if (!e || !e.value) add("error", a.off, "BANKTRANLIST has no DTEND", "The statement period end date is required.");
      const sd = s?.value && checkOfxDate(s.value), ed = e?.value && checkOfxDate(e.value);
      if (sd?.ok && ed?.ok && sd.day > ed.day) add("error", s.off, "DTSTART is after DTEND", `The period runs ${sd.day} to ${ed.day}.`);
      a.range = { s: sd?.ok ? sd.day : "", e: ed?.ok ? ed.day : "" };
    }
    {
      const lb = a.f.L_BALAMT;
      if (!lb) add("warning", a.off, "No LEDGERBAL", "The ledger balance is expected; some importers use it to reconcile.");
      else {
        if (!parseAmount(lb.value)) add("error", lb.off, "LEDGERBAL BALAMT is not a number", `"${lb.value}" is not numeric with "." as the decimal mark.`);
        const dt = a.f.L_DTASOF;
        if (!dt || !dt.value) add("warning", lb.off, "LEDGERBAL has no DTASOF", "The balance date is required.");
      }
      const ab = a.f.A_BALAMT;
      if (ab && !parseAmount(ab.value)) add("error", ab.off, "AVAILBAL BALAMT is not a number", `"${ab.value}" is not numeric with "." as the decimal mark.`);
    }
  }

  for (const t of trns) {
    counted++;
    const f = t.f;
    for (const k of ["TRNTYPE", "DTPOSTED", "TRNAMT", "FITID"]) {
      if (!f[k]) { add("error", t.off, `Transaction is missing ${k}`, `Every STMTTRN needs ${k}. Without it the importer skips or rejects the transaction.`); missingFields.add(k); }
      else if (!f[k].value) add("error", f[k].off, `${k} is blank`, `${k} is present but empty.`);
    }
    const tt = f.TRNTYPE?.value;
    if (tt && !TRN_TYPES.has(tt.toUpperCase())) add("warning", f.TRNTYPE.off, "Unknown TRNTYPE", `"${tt}" is not an OFX transaction type (CREDIT, DEBIT, CHECK, XFER, ...).`);
    let day = "";
    if (f.DTPOSTED?.value) {
      const ck = checkOfxDate(f.DTPOSTED.value);
      if (ck.ok) day = ck.day;
      else { const iso = normaliseDate(f.DTPOSTED.value); if (iso) day = iso.slice(0, 8); }
    }
    if (day) {
      if (!minDay || day < minDay) minDay = day;
      if (!maxDay || day > maxDay) maxDay = day;
      const r = t.acct?.range;
      if (r && ((r.s && day < r.s) || (r.e && day > r.e))) add("warning", f.DTPOSTED.off, "DTPOSTED is outside DTSTART-DTEND", `Posted ${day}, statement period ${r.s || "?"}-${r.e || "?"}. Some importers drop transactions outside the stated range.`);
    }
    if (f.TRNAMT?.value) {
      const raw = f.TRNAMT.value;
      const a = parseAmount(raw);
      if (!a) {
        const hint = /,/.test(raw) ? " A comma is not a decimal mark in OFX; use a period." : /[$£€()]/.test(raw) ? " Remove currency symbols and parentheses; use a minus sign for money out." : "";
        add("error", f.TRNAMT.off, "TRNAMT is not a number", `"${raw}" must be digits with "." as the decimal mark and an optional leading sign.${hint} Not rewritten: 1,250 could mean one thousand or one and a quarter.`);
      } else {
        const v = toMicro(a);
        total += v;
        if (v > 0n) credits += v; else debits += v;
        if (tt && /^(DEBIT|CHECK|ATM|POS|FEE|SRVCHG|PAYMENT)$/i.test(tt) && v > 0n) add("warning", f.TRNAMT.off, `${tt.toUpperCase()} with a positive amount`, "Money out should be negative. Some bank exports flip the sign, which makes the importer record it as a deposit.");
        if (tt && /^(CREDIT|DEP|DIRECTDEP)$/i.test(tt) && v < 0n) add("warning", f.TRNAMT.off, `${tt.toUpperCase()} with a negative amount`, "Money in should be positive.");
      }
    }
    const fit = f.FITID;
    if (fit?.value) {
      const key = `${t.acct?.acctId ?? ""}|${fit.value}`;
      if (!fitSeen.has(key)) fitSeen.set(key, { n: 1, first: lineAt(fit.off) });
      else {
        const rec = fitSeen.get(key);
        rec.n++;
        const n = rec.n;
        add("error", fit.off, "Duplicate FITID", `"${fit.value}" is already used on line ${rec.first}. QuickBooks and Quicken treat a repeated FITID as the same transaction and drop or reject it. The fix appends -${n} (or the next free number) so every ID is unique.`, () => {
          const used = ctx.usedFit ?? (ctx.usedFit = new Set());
          let k = n, cand;
          do { cand = `${fit.value}-${k++}`; } while (used.has(`${t.acct?.acctId ?? ""}|${cand}`) || fitSeen.has(`${t.acct?.acctId ?? ""}|${cand}`));
          used.add(`${t.acct?.acctId ?? ""}|${cand}`);
          fit.tok.raw = fit.tok.raw.replace(fit.value, cand);
          return `Changed duplicate FITID ${fit.value} (line ${lineAt(fit.off)}) to ${cand}.`;
        });
      }
      if (fit.value.length > 255) add("error", fit.off, "FITID longer than 255 characters", "OFX limits FITID to 255 characters.");
      else if (fit.value.length > 32) add("warning", fit.off, "FITID longer than 32 characters", "OFX 1.x limits FITID to 32 characters and some importers truncate longer ones, which can create duplicates.");
    }
    const nm = f.NAME?.value, mm = f.MEMO?.value;
    if (nm && nm.length > 32) add("warning", f.NAME.off, "NAME longer than 32 characters", `${nm.length} characters. OFX 1.x allows 32; QuickBooks and Quicken truncate or reject longer payee names. Not changed.`);
    if (mm && mm.length > 255) add("warning", f.MEMO.off, "MEMO longer than 255 characters", `${mm.length} characters; OFX allows 255. Not changed.`);
    if (!nm && !mm && f.FITID) add("info", t.off, "Transaction has no NAME or MEMO", "Importers show a blank description for it.");
  }

  const summary = {
    format,
    version,
    transactions: counted,
    accounts: accounts.length,
    total: fmtMicro(total),
    credits: fmtMicro(credits),
    debits: fmtMicro(debits),
    first: minDay,
    last: maxDay,
  };
  return finish(findings, ctx, summary, text);
}

function finish(findings, ctx, summary, text) {
  const sevRank = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || a.line - b.line);
  summary.errors = findings.filter((f) => f.severity === "error").length;
  summary.warnings = findings.filter((f) => f.severity === "warning").length;
  summary.fixable = findings.filter((f) => f.fixable).length;
  return { findings, summary, ctx, text };
}

export function validate(text) {
  const { findings, summary } = analyze(text);
  return { findings: findings.map(({ fix, ...f }) => f), summary };
}

function buildHeader(ctx, text, existing) {
  const eol = ctx.eol;
  const nonAscii = /[^\x00-\x7f]/.test(text);
  const defaults = { OFXHEADER: "100", DATA: "OFXSGML", VERSION: "102", SECURITY: "NONE", ENCODING: nonAscii ? "UTF-8" : "USASCII", CHARSET: nonAscii ? "NONE" : "1252", COMPRESSION: "NONE", OLDFILEUID: "NONE", NEWFILEUID: "NONE" };
  const have = {};
  for (const ln of existing.split(/\r\n|\n|\r/)) {
    const m = /^\s*([A-Za-z]+)\s*:\s*(.*?)\s*$/.exec(ln);
    if (m) have[m[1].toUpperCase()] = m[2];
  }
  const out = [];
  for (const k of SGML_KEYS) out.push(`${k}:${ctx.fixHeader?.[k] ?? have[k] ?? defaults[k]}`);
  for (const k of Object.keys(have)) if (!SGML_KEYS.includes(k)) out.push(`${k}:${have[k]}`);
  return out.join(eol) + eol + eol;
}

export function repair(text) {
  const input = String(text ?? "");
  const a = analyze(input);
  const changes = [];
  const ctx = a.ctx;
  for (const f of a.findings) if (f.fix) { const c = f.fix(ctx); if (c && !changes.includes(c)) changes.push(c); }
  if (!ctx.tokens.length && !ctx.header) return { text: input, changes: [] };
  let header = ctx.header;
  const eol = ctx.eol;
  const isSgml = a.summary.format === "sgml";
  if (isSgml && (ctx.addHeaderKeys || Object.keys(ctx.fixHeader || {}).length || ctx.blankLine)) {
    header = buildHeader(ctx, input, header);
  } else if (!isSgml) {
    if (ctx.xmlHeaderAttrs || ctx.xmlHeaderSet) {
      header = header.replace(/<\?OFX\s+([^?]*)\?>/i, (m, body) => {
        const attrs = [...body.matchAll(/([A-Za-z]+)\s*=\s*"([^"]*)"/g)].map((x) => [x[1].toUpperCase(), x[2]]);
        const map = Object.fromEntries(attrs);
        Object.assign(map, ctx.xmlHeaderSet || {});
        const defs = { OFXHEADER: "200", VERSION: "211", SECURITY: "NONE", OLDFILEUID: "NONE", NEWFILEUID: "NONE" };
        for (const k of ctx.xmlHeaderAttrs || []) map[k] = defs[k];
        const order = ["OFXHEADER", "VERSION", "SECURITY", "OLDFILEUID", "NEWFILEUID"];
        return `<?OFX ${[...order, ...Object.keys(map).filter((k) => !order.includes(k))].filter((k) => k in map).map((k) => `${k}="${map[k]}"`).join(" ")}?>`;
      });
    }
    if (ctx.xmlHeader) header += `<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>${eol}`;
    if (ctx.xmlDecl) header = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>${eol}` + header;
  }
  let body = ctx.tokens.map((t) => t.raw + (t.after ? t.after.join("") : "")).join("");
  if (ctx.tail.length) body = body.replace(/\s*$/, "") + eol + ctx.tail.join(eol) + eol;
  const out = header + body;
  return { text: out, changes: out === input ? [] : changes };
}

export function findingsCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["severity,line,title,detail,auto_fixed", ...result.findings.map((f) => [f.severity, f.line || "", q(f.title), q(f.detail), f.fixable ? "yes" : "no"].join(","))].join("\r\n") + "\r\n";
}

// A plain line-by-line diff of what the fix changed (original vs fixed).
export function diffLines(before, after) {
  const a = String(before).split(/\r\n|\n|\r/), b = String(after).split(/\r\n|\n|\r/);
  const n = a.length, m = b.length;
  if (n * m > 4_000_000) return ["(file too large to diff in the page; the change list above is complete)"];
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { i++; j++; }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) out.push(`+ ${b[j++]}`);
    else out.push(`- ${a[i++]}`);
  }
  return out;
}

export function sampleFile() {
  return [
    "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "COMPRESSION:NONE", "OLDFILEUID:NONE", "NEWFILEUID:NONE", "",
    "<OFX>", "<SIGNONMSGSRSV1>", "<SONRS>", "<STATUS>", "<CODE>0", "<SEVERITY>INFO", "</STATUS>", "<DTSERVER>20240315120000", "<LANGUAGE>ENG", "</SONRS>", "</SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1>", "<STMTTRNRS>", "<TRNUID>1", "<STATUS>", "<CODE>0", "<SEVERITY>INFO", "</STATUS>",
    "<STMTRS>", "<CURDEF>USD", "<BANKACCTFROM>", "<BANKID>123456789", "<ACCTID>000111222", "<ACCTTYPE>CHECKING", "</BANKACCTFROM>",
    "<BANKTRANLIST>", "<DTSTART>20240301", "<DTEND>20240315",
    "<STMTTRN>", "<TRNTYPE>DEBIT", "<DTPOSTED>20240304120000", "<TRNAMT>-45.20", "<FITID>2024030401", "<NAME>CORNER COFFEE", "<MEMO>Card purchase", "</STMTTRN>",
    "<STMTTRN>", "<TRNTYPE>CREDIT", "<DTPOSTED>20240308120000", "<TRNAMT>1250.00", "<FITID>2024030802", "<NAME>CLIENT PAYMENT", "</STMTTRN>",
    "<STMTTRN>", "<TRNTYPE>DEBIT", "<DTPOSTED>20240312120000", "<TRNAMT>-89.99", "<FITID>2024031203", "<NAME>OFFICE SUPPLIES", "</STMTTRN>",
    "</BANKTRANLIST>", "<LEDGERBAL>", "<BALAMT>4321.55", "<DTASOF>20240315120000", "</LEDGERBAL>", "</STMTRS>", "</STMTTRNRS>", "</BANKMSGSRSV1>", "</OFX>", "",
  ].join("\r\n");
}

export function sampleBrokenFile() {
  return [
    "OFXHEADER:100", "DATA:OFXSGML", "VERSION:102", "SECURITY:NONE", "ENCODING:USASCII", "CHARSET:1252", "OLDFILEUID:NONE", "",
    "<OFX>", "<SIGNONMSGSRSV1>", "<SONRS>", "<STATUS>", "<CODE>0", "<SEVERITY>INFO", "</STATUS>", "<DTSERVER>20240315120000", "<LANGUAGE>ENG", "</SONRS>", "</SIGNONMSGSRSV1>",
    "<BANKMSGSRSV1>", "<STMTTRNRS>", "<TRNUID>1", "<STATUS>", "<CODE>0", "<SEVERITY>INFO", "</STATUS>",
    "<STMTRS>", "<CURDEF>USD", "<BANKACCTFROM>", "<BANKID>123456789", "<ACCTID>000111222", "<ACCTTYPE>CHECKING", "</BANKACCTFROM>",
    "<BANKTRANLIST>", "<DTSTART>20240301", "<DTEND>20240310",
    "<STMTTRN>", "<TRNTYPE>DEBIT", "<DTPOSTED>2024-03-04", "<TRNAMT>-45.20", "<FITID>2024030401", "<NAME>AT&T WIRELESS", "<MEMO>Card purchase", "</STMTTRN>",
    "<STMTTRN>", "<TRNTYPE>CREDIT", "<DTPOSTED>20240308120000", "<TRNAMT>1250.00", "<FITID>2024030401", "<NAME>CLIENT PAYMENT", "</STMTTRN>",
    "<STMTTRN>", "<TRNTYPE>DEBIT", "<DTPOSTED>20240312120000", "<TRNAMT>-89,99", "<FITID>2024031203", "<NAME>OFFICE SUPPLIES AND ENTIRELY TOO LONG A PAYEE NAME", "</STMTTRN>",
    "<STMTTRN>", "<TRNTYPE>DEBIT", "<DTPOSTED>20240309", "<TRNAMT>-12.00", "<NAME>NO TRANSACTION ID", "</STMTTRN>",
    "</BANKTRANLIST>", "<LEDGERBAL>", "<BALAMT>4321.55", "<DTASOF>20240315120000", "</LEDGERBAL>", "</STMTRS>", "</STMTTRNRS>", "</BANKMSGSRSV1>", "",
  ].join("\r\n");
}
