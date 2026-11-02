// One reader for the suppression list, shared by the inbox agent, the daily run, call prep and research.
// Fail closed: a person who asked to stop must not slip through because of how the list was written.
// Accepts one entry per line or separated by commas or semicolons, in any of these forms:
//   bob@x.com   "bob@x.com"   Bob <bob@x.com>   BOB@X.COM   bob+sales@x.com   @x.com (a whole domain)   +1 555 010 1234
// and the CSV the agent itself writes (suppression-add.csv: header `email,reason,date,evidence`), where only the
// email (and phone) column counts, so an address quoted inside someone's reply (the evidence) suppresses nobody.
const EMAIL = /[^\s<>"',;()[\]]+@[^\s<>"',;()[\]]+\.[^\s<>"',;()[\]]+/g;
const digits = (s) => String(s || "").replace(/\D/g, "");

/** Lower-case, and drop a +tag so bob+sales@x.com and bob@x.com are one person. */
export function emailKey(e) {
  const s = String(e || "").trim().toLowerCase().replace(/^mailto:/, "");
  const at = s.lastIndexOf("@");
  if (at < 1) return s;
  return s.slice(0, at).replace(/\+.*$/, "") + s.slice(at);
}

function csvRecords(text) {
  const out = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); out.push(row); row = []; f = ""; }
    else f += c;
  }
  row.push(f); out.push(row);
  return out.filter((r) => r.some((x) => x.trim()));
}

export function parseSuppression(text) {
  const emails = new Set(), domains = new Set(), phones = new Set();
  const addToken = (raw) => {
    const s = String(raw || "").trim().toLowerCase();
    if (!s) return;
    const found = s.match(EMAIL); EMAIL.lastIndex = 0;
    if (found) { for (const e of found) emails.add(emailKey(e)); return; }
    const d = s.replace(/^["'<]+|[>"']+$/g, "");
    if (d.startsWith("@") && d.length > 1) domains.add(d.slice(1));
    else if (!d.includes("@") && digits(d).length >= 7 && /^[+\d\s().-]+$/.test(d)) phones.add(digits(d).slice(-10));
  };
  const src = String(text || "");
  const first = src.split(/\r?\n/).find((l) => l.trim()) || "";
  if (/^\s*"?email"?\s*[,;]/i.test(first)) {
    const [head, ...rows] = csvRecords(src.replace(/;/, ","));
    const cols = head.map((h) => h.trim().toLowerCase());
    const ci = cols.indexOf("email"), pi = cols.findIndex((h) => h === "phone");
    for (const r of rows) { if (ci >= 0) addToken(r[ci]); if (pi >= 0) addToken(r[pi]); }
  } else {
    for (const t of src.split(/[\n\r,;]+/)) addToken(t);
  }
  return { emails, domains, phones };
}

/** Returns a checker: (email, phone) => reason string or null. */
export function suppressionIndex(text) {
  const { emails, domains, phones } = parseSuppression(text);
  return (email, phone) => {
    const e = emailKey(email);
    if (e && emails.has(e)) return "on your suppression list";
    const dom = e.split("@")[1];
    if (dom && domains.has(dom)) return `domain @${dom} is on your suppression list`;
    if (phone && digits(phone).length >= 7 && phones.has(digits(phone).slice(-10))) return "phone number is on your suppression list";
    return null;
  };
}
