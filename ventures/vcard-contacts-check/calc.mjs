// vCard (.vcf) contacts-file checker. Pure functions, no I/O, no network.
// Rules are read from memory of RFC 6350 (vCard 4.0), RFC 2426 (3.0) and the 2.1 legacy format, and of the
// import behaviour commonly reported for Google Contacts, Apple Contacts and Outlook; confirm against the
// current documents.

const MAX_OCTETS = 75;
const enc = new TextEncoder();
const octets = (s) => enc.encode(s).length;

export function decodeBuffer(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  return new TextDecoder("utf-8").decode(b).replace(/^﻿/, "");
}

// Physical lines -> logical lines. A line starting with space/tab continues the previous one; in
// vCard 2.1 a quoted-printable value ending in "=" continues on the next line.
export function unfold(text) {
  const phys = text.split(/\r\n|\n|\r/);
  if (phys.length && phys.at(-1) === "") phys.pop();
  const out = [];
  let qp = false;
  phys.forEach((raw, i) => {
    if (qp && out.length) {
      out.at(-1).value += raw;
      qp = /=$/.test(raw);
      if (qp) out.at(-1).value = out.at(-1).value.slice(0, -1);
      return;
    }
    if ((raw.startsWith(" ") || raw.startsWith("\t")) && out.length) {
      out.at(-1).value += raw.slice(1);
    } else {
      out.push({ value: raw, line: i + 1 });
      if (/ENCODING=QUOTED-PRINTABLE/i.test(raw.split(":")[0]) && /=$/.test(raw)) {
        qp = true;
        out.at(-1).value = raw.slice(0, -1);
      }
    }
  });
  return out;
}

export function fold(line) {
  if (octets(line) <= MAX_OCTETS) return line;
  const parts = [];
  let cur = "", curLen = 0, limit = MAX_OCTETS;
  for (const ch of line) {
    const n = octets(ch);
    if (curLen + n > limit) { parts.push(cur); cur = ""; curLen = 0; limit = MAX_OCTETS - 1; }
    cur += ch; curLen += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

// "TEL;TYPE=work,voice:+1 555 0100" -> { name, group, params, value }. 2.1 bare parameters ("TEL;WORK;VOICE")
// are stored as TYPE values.
export function parseContentLine(s) {
  let inQ = false, colon = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') inQ = !inQ;
    else if (s[i] === ":" && !inQ) { colon = i; break; }
  }
  if (colon < 0) return null;
  const head = s.slice(0, colon), value = s.slice(colon + 1);
  const segs = []; let cur = ""; inQ = false;
  for (const ch of head) {
    if (ch === '"') inQ = !inQ;
    if (ch === ";" && !inQ) { segs.push(cur); cur = ""; } else cur += ch;
  }
  segs.push(cur);
  let name = segs.shift().toUpperCase();
  let group = null;
  const dot = name.indexOf(".");
  if (dot > 0) { group = name.slice(0, dot); name = name.slice(dot + 1); }
  if (!/^[A-Z0-9-]+$/.test(name)) return null;
  const params = {};
  for (const p of segs) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
    else if (p) params.TYPE = (params.TYPE ? params.TYPE + "," : "") + p;
  }
  return { name, group, params, value };
}

// Split on an unescaped separator.
export function splitUnescaped(v, sep) {
  const out = []; let cur = "";
  for (let i = 0; i < v.length; i++) {
    if (v[i] === "\\" && i + 1 < v.length) { cur += v[i] + v[i + 1]; i++; }
    else if (v[i] === sep) { out.push(cur); cur = ""; }
    else cur += v[i];
  }
  out.push(cur);
  return out;
}

const unescapeText = (s) => s.replace(/\\([nN,;\\])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));
const escapeText = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,");

function validYMD(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// BDAY / ANNIVERSARY: YYYY-MM-DD, YYYYMMDD, --MMDD / --MM-DD (no year, 3.0 draft + 4.0), optional time.
export function checkDate(value) {
  const v = value.trim();
  let m = /^(\d{4})-?(\d{2})-?(\d{2})(?:T.*)?$/.exec(v);
  if (m) return validYMD(+m[1], +m[2], +m[3]) ? null : `${v} is not a real calendar date`;
  m = /^--(\d{2})-?(\d{2})$/.exec(v);
  if (m) return validYMD(2000, +m[1], +m[2]) ? null : `${v} is not a real month and day`;
  return `"${v.slice(0, 30)}" is not a date (YYYY-MM-DD or YYYYMMDD)`;
}

export function parseVcards(text) {
  const lines = unfold(text);
  const cards = [];
  const problems = [];
  let cur = null;
  for (const l of lines) {
    if (!l.value.trim()) continue;
    const p = parseContentLine(l.value);
    if (!p) { problems.push({ line: l.line, kind: "unparsable", text: l.value }); continue; }
    p.line = l.line;
    if (p.name === "BEGIN" && p.value.trim().toUpperCase() === "VCARD") {
      if (cur) problems.push({ line: cur.line, kind: "unclosed" });
      cur = { line: l.line, props: [] };
    } else if (p.name === "END" && p.value.trim().toUpperCase() === "VCARD") {
      if (!cur) problems.push({ line: l.line, kind: "unmatched-end" });
      else { cur.endLine = l.line; cards.push(cur); cur = null; }
    } else if (cur) cur.props.push(p);
    else problems.push({ line: l.line, kind: "outside", text: l.value });
  }
  if (cur) problems.push({ line: cur.line, kind: "unclosed" });
  return { cards, problems, lines };
}

const get = (c, name) => c.props.find((p) => p.name === name);
const all = (c, name) => c.props.filter((p) => p.name === name);
const F = (severity, line, title, detail, extra = {}) => ({ severity, line, title, detail, ...extra });

export function nameOf(card) {
  const fn = get(card, "FN")?.value.trim();
  if (fn) return fn.slice(0, 40);
  const n = get(card, "N");
  if (n) { const g = splitUnescaped(n.value, ";"); const s = [g[1], g[0]].filter(Boolean).join(" ").trim(); if (s) return s.slice(0, 40); }
  return get(card, "ORG")?.value.replace(/;/g, " ").trim().slice(0, 40) || "(no name)";
}

// FN built from N: "Family;Given;Additional;Prefix;Suffix" -> "Prefix Given Additional Family Suffix".
export function fnFromN(value) {
  const g = splitUnescaped(value, ";").map((x) => unescapeText(x.split(",").join(" ")).trim());
  const s = [g[3], g[1], g[2], g[0], g[4]].filter(Boolean).join(" ").trim();
  return s ? escapeText(s) : "";
}

const normalizedCard = (c) => c.props.map((p) => `${p.name}|${Object.entries(p.params).sort().join(",")}|${p.value.trim()}`).filter((s) => !s.startsWith("REV|") && !s.startsWith("PRODID|")).sort().join("\n");

export function validate(text) {
  const findings = [];
  const { cards, problems } = parseVcards(text);

  if (/\r\n/.test(text) === false && /\n/.test(text)) {
    findings.push(F("warning", 0, "Line endings are LF, not CRLF", "The vCard standards require CRLF. Most importers cope, some strict ones reject the file. Fixed automatically.", { fixable: true, code: "crlf" }));
  } else if (/\n/.test(text.replace(/\r\n/g, ""))) {
    findings.push(F("warning", 0, "Mixed line endings", "Some lines end in CRLF and others in LF. Fixed automatically.", { fixable: true, code: "crlf" }));
  }
  let longCount = 0, firstLong = 0;
  text.split(/\r\n|\n|\r/).forEach((raw, i) => {
    if (octets(raw) > MAX_OCTETS) { longCount++; if (!firstLong) firstLong = i + 1; }
  });
  if (longCount) findings.push(F("info", firstLong, `${longCount} line${longCount === 1 ? "" : "s"} longer than 75 octets`, "vCards fold long lines at 75 octets with a leading space on the continuation. Readers accept longer lines more often than not, so this is only a note; the fixed file refolds them.", { fixable: true, code: "fold" }));

  for (const p of problems) {
    if (p.kind === "unparsable") findings.push(F("error", p.line, "Line is not a valid property", `"${p.text.slice(0, 60)}" has no NAME:value form. Often a NOTE or ADR whose line break was not folded (continuation lines must start with a space).`));
    else if (p.kind === "outside") findings.push(F("error", p.line, "Property outside any BEGIN:VCARD", `"${p.text.slice(0, 60)}" is not inside a card, so an importer skips it.`));
    else if (p.kind === "unmatched-end") findings.push(F("error", p.line, "END:VCARD without a matching BEGIN", "Nothing is open."));
    else findings.push(F("error", p.line, "BEGIN:VCARD is never closed", "Add END:VCARD. A truncated export or a copy that stopped early is the usual cause."));
  }
  if (!cards.length) {
    findings.push(F("error", 1, "No vCard found", "The file must contain BEGIN:VCARD ... END:VCARD. It may not be a vCard file, or may be a web page saved by mistake."));
    return finish(findings, { cards: 0 });
  }

  const versions = new Set();
  const seenUid = new Map(), seenCard = new Map(), seenEmail = new Map();
  for (const c of cards) {
    const label = nameOf(c);
    const at = `${label}: `;
    const ver = get(c, "VERSION")?.value.trim();
    const v = ver || "";
    if (!ver) findings.push(F("error", c.line, `${at}no VERSION`, "VERSION must be the first property in a card (2.1, 3.0 or 4.0). Not added automatically because the right version depends on how the other properties are written."));
    else if (!["2.1", "3.0", "4.0"].includes(ver)) findings.push(F("error", get(c, "VERSION").line, `${at}VERSION is ${ver}`, "Only 2.1, 3.0 and 4.0 exist. Importers skip the card or guess."));
    else versions.add(ver);
    if (ver && c.props[0] !== get(c, "VERSION")) findings.push(F("warning", get(c, "VERSION").line, `${at}VERSION is not the first property`, "The standards put VERSION first right after BEGIN. Some importers read a card by version and misparse it otherwise."));

    const fn = get(c, "FN"), n = get(c, "N");
    if (!fn || !fn.value.trim()) {
      const built = n ? fnFromN(n.value) : "";
      if (built) findings.push(F("error", c.line, `${at}no FN`, `FN (formatted name) is required in 3.0 and 4.0 and Google Contacts shows a card without one as blank or skips it. "${unescapeText(built)}" is built from N when you apply the fixes.`, { fixable: true, code: "fn" }));
      else if (v !== "2.1") findings.push(F("error", c.line, `${at}no FN`, "FN (formatted name) is required in 3.0 and 4.0 and there is no N to build it from. Add the person's or organisation's name."));
    }
    if (n) {
      const parts = splitUnescaped(n.value, ";").length;
      if (parts < 5 && parts > 0) findings.push(F("warning", n.line, `${at}N has ${parts} component${parts === 1 ? "" : "s"}, not 5`, "N is Family;Given;Additional;Prefix;Suffix. Missing trailing parts make some importers drop the given name or shift fields. Padded automatically.", { fixable: true, code: "n-pad" }));
      else if (parts > 5) findings.push(F("warning", n.line, `${at}N has ${parts} components, not 5`, "Probably an unescaped semicolon in a name or a stray field. Not fixed automatically because the intended split cannot be proven."));
    } else if (v === "3.0" || v === "2.1") {
      findings.push(F("warning", c.line, `${at}no N`, `N is required in vCard ${v}. Apple Contacts files the card under no surname and Outlook may show it blank.`));
    }
    if (!fn && !n && !get(c, "ORG")) findings.push(F("error", c.line, `${at}card has no name at all`, "No FN, N or ORG, so every importer will show a blank contact."));
    if (c.props.length <= 2 && c.props.every((p) => ["VERSION", "FN", "N"].includes(p.name))) findings.push(F("info", c.line, `${at}card has no way to reach the person`, "No EMAIL, TEL, ADR or URL; the import creates a contact you cannot use."));

    for (const e of all(c, "EMAIL")) {
      const val = e.value.trim();
      if (!val) findings.push(F("warning", e.line, `${at}empty EMAIL`, "An EMAIL property with no value."));
      else if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(val)) findings.push(F("warning", e.line, `${at}EMAIL does not look like an address`, `"${val.slice(0, 50)}" — expected name@example.com; a mailto: prefix, a space or a second address in one field breaks the match.`));
      else {
        const k = val.toLowerCase();
        if (seenEmail.has(k) && seenEmail.get(k).card !== c) findings.push(F("info", e.line, `${at}${val} also appears on the card at line ${seenEmail.get(k).line}`, "Two cards share an email address; Google Contacts and Apple Contacts offer to merge or silently create two entries."));
        else if (!seenEmail.has(k)) seenEmail.set(k, { line: c.line, card: c });
      }
    }
    for (const t of all(c, "TEL")) {
      const val = t.value.trim().replace(/^tel:/i, "");
      if (!val) findings.push(F("warning", t.line, `${at}empty TEL`, "A TEL property with no value."));
      else if (!/\d/.test(val)) findings.push(F("warning", t.line, `${at}TEL has no digits`, `"${val.slice(0, 40)}" is not a phone number.`));
      else if (val.replace(/\D/g, "").length < 5 || val.replace(/\D/g, "").length > 15) findings.push(F("info", t.line, `${at}TEL looks the wrong length`, `"${val.slice(0, 40)}" has ${val.replace(/\D/g, "").length} digits; international numbers are 5 to 15 including the country code. Extensions are the usual exception.`));
    }
    for (const k of ["BDAY", "ANNIVERSARY"]) {
      const d = get(c, k);
      if (d && d.value.trim()) { const err = checkDate(d.value); if (err) findings.push(F("error", d.line, `${at}bad ${k}`, err)); }
    }
    const rev = get(c, "REV");
    if (rev && !/^\d{4}-?\d{2}-?\d{2}(T\d{2}:?\d{2}(:?\d{2})?(Z|[+-]\d{2}:?\d{2})?)?$/.test(rev.value.trim())) findings.push(F("info", rev.line, `${at}REV is not a date-time`, `"${rev.value.slice(0, 30)}" — expected 20260105T090000Z.`));

    for (const p of c.props) {
      if (/QUOTED-PRINTABLE/i.test(p.params.ENCODING || "") && v !== "2.1" && ver) findings.push(F("warning", p.line, `${at}QUOTED-PRINTABLE in a ${v} card`, "Quoted-printable is a 2.1 encoding. 3.0 and 4.0 readers show the raw =C3=A9 codes. Not fixed automatically because decoding needs the card's charset."));
      if (v === "4.0" && p.params.CHARSET) findings.push(F("info", p.line, `${at}CHARSET parameter in a 4.0 card`, "vCard 4.0 is always UTF-8 and has no CHARSET parameter."));
      if (p.name === "PHOTO" || p.name === "LOGO") { if (p.value.length > 200000) findings.push(F("info", p.line, `${at}${p.name} is ${Math.round(p.value.length / 1024)} KB inline`, "A large embedded image makes the file slow to import and some apps truncate it.")); }
    }

    const uid = get(c, "UID")?.value.trim();
    if (uid) {
      if (seenUid.has(uid)) findings.push(F("warning", c.line, `${at}UID repeats the card on line ${seenUid.get(uid)}`, "Two cards share a UID, so an importer treats the second as an update of the first and one contact is lost."));
      else seenUid.set(uid, c.line);
    }
    const key = normalizedCard(c);
    if (seenCard.has(key)) findings.push(F("warning", c.line, `${at}identical to the card on line ${seenCard.get(key)}`, "Every property matches (ignoring REV and PRODID). The second copy is removed when you apply the fixes.", { fixable: true, code: "dup" }));
    else seenCard.set(key, c.line);
  }
  if (versions.size > 1) findings.push(F("info", 0, `Cards use ${[...versions].sort().join(", ")} together`, "A file mixing vCard versions is read in the first card's version by some importers, which misreads the rest."));
  return finish(findings, { cards: cards.length });
}

function finish(findings, base) {
  const order = { error: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.line || 0) - (b.line || 0));
  return { findings, summary: { ...base, errors: findings.filter((f) => f.severity === "error").length, warnings: findings.filter((f) => f.severity === "warning").length, fixable: findings.filter((f) => f.fixable).length } };
}

// Apply only provable fixes: FN built from N, N padded to 5 components, byte-identical duplicate cards
// dropped, lines refolded, CRLF endings. Everything else is written back unchanged.
export function repair(text) {
  const { cards, lines } = parseVcards(text);
  const changes = [];
  const replace = new Map(), addAfter = new Map(), dropFrom = new Map();
  const seen = new Set();
  for (const c of cards) {
    const label = nameOf(c);
    const key = normalizedCard(c);
    if (seen.has(key)) { dropFrom.set(c.line, c.endLine); changes.push(`${label}: removed an identical duplicate card`); continue; }
    seen.add(key);
    const fn = get(c, "FN"), n = get(c, "N");
    if ((!fn || !fn.value.trim()) && n) {
      const built = fnFromN(n.value);
      if (built) {
        if (fn) replace.set(fn.line, `FN:${built}`);
        else addAfter.set((get(c, "VERSION") || { line: c.line }).line, [`FN:${built}`]);
        changes.push(`${label}: added FN "${unescapeText(built)}" from N`);
      }
    }
    if (n) {
      const parts = splitUnescaped(n.value, ";").length;
      if (parts < 5) {
        const g = n.group ? n.group + "." : "";
        const ps = Object.entries(n.params).map(([k, val]) => `;${k}=${val}`).join("");
        replace.set(n.line, `${g}N${ps}:${n.value}${";".repeat(5 - parts)}`);
        changes.push(`${label}: N padded to 5 components`);
      }
    }
  }
  const out = [];
  let skipUntil = 0;
  for (const l of lines) {
    if (l.line <= skipUntil) continue;
    if (dropFrom.has(l.line)) { skipUntil = dropFrom.get(l.line); continue; }
    if (!l.value.trim()) continue;
    out.push(replace.get(l.line) ?? l.value);
    for (const a of addAfter.get(l.line) || []) out.push(a);
  }
  if (text.split(/\r\n|\n|\r/).some((raw) => octets(raw) > MAX_OCTETS)) changes.push("Refolded lines longer than 75 octets");
  if (/\n/.test(text.replace(/\r\n/g, ""))) changes.push("Line endings set to CRLF");
  return { text: out.map(fold).join("\r\n") + "\r\n", changes };
}

export function findingsCsv(result) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ["severity,line,title,detail,auto_fixed", ...result.findings.map((f) => [f.severity, f.line || "", q(f.title), q(f.detail), f.fixable ? "yes" : "no"].join(","))].join("\r\n") + "\r\n";
}

export function sampleFile() {
  return ["BEGIN:VCARD", "VERSION:3.0", "N:Rivera;Sam;;Dr.;", "FN:Dr. Sam Rivera", "ORG:Example Dental", "EMAIL;TYPE=work:sam@example.test", "TEL;TYPE=work,voice:+1 555 0100", "BDAY:1984-03-09", "END:VCARD", ""].join("\r\n");
}

export function sampleBrokenFile() {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Okafor;Ada",
    "EMAIL:ada.okafor@example.test",
    "TEL:+44 20 7946 0000",
    "BDAY:1990-02-30",
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:Lee Chen",
    "N:Chen;Lee;;;",
    "EMAIL:mailto:lee chen@example",
    "TEL:call me",
    "NOTE;ENCODING=QUOTED-PRINTABLE:Caf=C3=A9 owner",
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:3.0",
    "FN:Lee Chen",
    "N:Chen;Lee;;;",
    "EMAIL:mailto:lee chen@example",
    "TEL:call me",
    "NOTE;ENCODING=QUOTED-PRINTABLE:Caf=C3=A9 owner",
    "END:VCARD",
    "BEGIN:VCARD",
    "VERSION:3.0",
    "EMAIL:orphan@example.test",
    "",
  ].join("\n");
}
