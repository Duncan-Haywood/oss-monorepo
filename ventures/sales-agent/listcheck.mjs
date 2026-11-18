// Cold email list hygiene check (2026-11-06). Pure rules, no network, no DNS, nothing sent.
// Reads a pasted list (one address per line, or a CSV with an email column) and sorts each row into
// send / review / drop before the first touch: bad syntax, typo'd domains (gmial.com), disposable
// domains, role accounts (info@, sales@), duplicates (case and +tag folded), and anyone on the
// user's own suppression list. It cannot tell whether a mailbox exists; only a mail server can.
import { emailKey, parseSuppression } from "./suppression.mjs";

const ROLE = new Set(["info", "sales", "support", "admin", "contact", "hello", "office", "help", "billing", "marketing", "team", "hr", "jobs", "careers", "press", "media", "abuse", "postmaster", "webmaster", "noreply", "no-reply", "donotreply", "do-not-reply", "legal", "privacy", "security", "accounts", "enquiries", "inquiries", "mail", "service"]);
const DISPOSABLE = new Set(["mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com", "temp-mail.org", "yopmail.com", "trashmail.com", "sharklasers.com", "getnada.com", "dispostable.com", "throwawaymail.com", "maildrop.cc", "fakeinbox.com", "mintemail.com", "mohmal.com"]);
const TYPOS = { "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com", "hotmial.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmal.com": "hotmail.com", "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com", "yahooo.com": "yahoo.com", "outlok.com": "outlook.com", "outlook.con": "outlook.com", "iclod.com": "icloud.com", "icloud.con": "icloud.com" };
const FREE = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "aol.com", "proton.me", "protonmail.com", "live.com", "msn.com"]);
const SYNTAX = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@([a-z0-9-]+\.)+[a-z]{2,}$/i;

/** Pull an address from one line: `a@b.com`, `Name <a@b.com>`, `mailto:a@b.com`. */
export function extractAddress(line) {
  const s = String(line || "").trim();
  const angle = s.match(/<([^<>\s]+)>/);
  if (angle) return angle[1].trim().replace(/^mailto:/i, "");
  const m = s.match(/[^\s<>"',;()[\]]+@[^\s<>"',;()[\]]+/);
  return (m ? m[0] : s.replace(/^["']|["']$/g, "")).replace(/^mailto:/i, "");
}

/**
 * @param {string|string[]} input list text or array of lines
 * @param {{suppression?:string}} [opts] the user's own suppression text (emails, @domains)
 */
export function checkList(input, opts = {}) {
  let lines = Array.isArray(input) ? input.map(String) : String(input || "").split(/\r?\n/);
  lines = lines.map((l) => l.trim()).filter(Boolean);
  let col = -1;
  if (lines.length && !lines[0].includes("@")) {
    const c = lines[0].split(",").findIndex((h) => /^"?e-?mail( address)?"?$/i.test(h.trim()));
    if (c >= 0) { col = c; lines = lines.slice(1); }
  }
  const sup = parseSuppression(opts.suppression || "");
  const seen = new Map();
  const off = col >= 0 ? 1 : 0;
  const rows = lines.map((line, i) => {
    const raw = col >= 0 ? (line.split(",")[col] ?? "") : line;
    const addr = extractAddress(raw).toLowerCase();
    const reasons = [];
    const add = (level, text) => reasons.push({ level, text });
    const at = addr.lastIndexOf("@");
    const local = at > 0 ? addr.slice(0, at) : "";
    const domain = at > 0 ? addr.slice(at + 1) : "";
    if (!SYNTAX.test(addr) || addr.includes("..") || local.startsWith(".") || local.endsWith(".") || local.length > 64) {
      add("drop", "Not a valid address");
    } else {
      if (TYPOS[domain]) add("review", `Domain looks mistyped; did you mean ${local}@${TYPOS[domain]}?`);
      if (DISPOSABLE.has(domain)) add("drop", "Disposable-mail domain");
      if (ROLE.has(local.replace(/\+.*$/, ""))) add("review", "Role account (a shared inbox, not a person); often filtered and a poor first-touch target");
      if (FREE.has(domain)) add("review", "Free mailbox domain; for B2B outreach a work address is usually better");
      const key = emailKey(addr);
      if (sup.emails.has(key) || sup.domains.has(domain)) add("drop", "On your suppression list");
      if (seen.has(key)) add("drop", `Duplicate of line ${seen.get(key)}`); else seen.set(key, i + 1 + off);
    }
    const verdict = reasons.some((r) => r.level === "drop") ? "drop" : reasons.length ? "review" : "send";
    return { line: i + 1 + off, address: addr, verdict, reasons: reasons.map((r) => r.text) };
  });
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  return { total: rows.length, send: count("send"), review: count("review"), drop: count("drop"), rows };
}

/** CSV of the rows that are safe to send, plus the review rows if asked. Dropped rows never appear. */
export function toCsv(result, includeReview = false) {
  const keep = result.rows.filter((r) => r.verdict === "send" || (includeReview && r.verdict === "review"));
  return "email\n" + keep.map((r) => r.address).join("\n") + (keep.length ? "\n" : "");
}
