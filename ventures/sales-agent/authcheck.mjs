// Email authentication record checker: SPF, DMARC and DKIM TXT records pasted
// as text. Pure parsing, no DNS lookups and no network. Rules follow RFC 7208
// (SPF), RFC 7489 (DMARC) and RFC 6376 (DKIM) as understood by the author;
// provider requirements (Google and Yahoo bulk sender rules since 2024) are
// from memory. A clean result means the text parses and avoids common
// mistakes, not that mail is delivered.

const unquote = (s) => String(s ?? "").trim().replace(/"\s+"/g, "").replace(/^"|"$/g, "").trim();

export function checkSpf(raw) {
  const t = unquote(raw);
  const issues = [];
  const add = (level, msg) => issues.push({ level, msg });
  if (!/^v=spf1(\s|$)/i.test(t)) return { ok: false, record: t, issues: [{ level: "error", msg: "Must start with v=spf1." }], lookups: 0 };
  const terms = t.split(/\s+/).slice(1);
  let lookups = 0, all = null;
  terms.forEach((term, i) => {
    const m = /^([+\-~?])?([a-z0-9]+)(?:[:=\/](.*))?$/i.exec(term);
    if (!m) { add("error", `Unreadable term "${term}".`); return; }
    const name = m[2].toLowerCase();
    if (["include", "a", "mx", "ptr", "exists", "redirect"].includes(name)) lookups++;
    if (name === "ptr") add("warn", "ptr is deprecated by RFC 7208; remove it.");
    if (name === "all") {
      all = (m[1] || "+") + "all";
      if (i !== terms.length - 1 && !terms.slice(i + 1).every((x) => /^redirect=/i.test(x))) add("warn", "Terms after 'all' are ignored.");
    }
  });
  if (lookups > 10) add("error", `${lookups} DNS-lookup terms; SPF allows at most 10, and receivers return permerror above that.`);
  else if (lookups >= 8) add("warn", `${lookups} DNS-lookup terms of 10 allowed; includes nest, so the real count can be higher.`);
  if (all === "+all") add("error", "+all lets anyone send as your domain.");
  else if (all === "?all") add("warn", "?all is neutral and gives no protection; use ~all or -all.");
  else if (!all && !terms.some((x) => /^redirect=/i.test(x))) add("warn", "No 'all' or redirect at the end; unlisted senders get a neutral result.");
  if (t.length > 450) add("warn", "Long record; keep it under 255 characters per string and 512 bytes in total so UDP DNS answers stay unsplit.");
  return { ok: !issues.some((x) => x.level === "error"), record: t, all, lookups, issues };
}

export function parseTags(t) {
  const tags = {};
  for (const part of t.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim().toLowerCase();
    if (k && !(k in tags)) tags[k] = part.slice(i + 1).trim();
  }
  return tags;
}

export function checkDmarc(raw) {
  const t = unquote(raw);
  const issues = [];
  const add = (level, msg) => issues.push({ level, msg });
  if (!/^v=DMARC1\s*;?/i.test(t)) return { ok: false, record: t, issues: [{ level: "error", msg: "Must start with v=DMARC1." }] };
  const tags = parseTags(t);
  const p = (tags.p || "").toLowerCase();
  if (!p) add("error", "Missing p= (policy): none, quarantine or reject.");
  else if (!["none", "quarantine", "reject"].includes(p)) add("error", `p=${tags.p} is not none, quarantine or reject.`);
  else if (p === "none") add("warn", "p=none only monitors. Fine to start, but it does not stop spoofing; move to quarantine then reject once reports look clean.");
  if (tags.pct !== undefined) {
    const n = Number(tags.pct);
    if (!Number.isInteger(n) || n < 0 || n > 100) add("error", "pct must be a whole number from 0 to 100.");
    else if (n < 100 && p !== "none") add("warn", `pct=${n}: the policy applies to only ${n}% of failing mail.`);
  }
  if (tags.rua) {
    for (const u of tags.rua.split(",")) if (!/^mailto:[^@\s]+@[^@\s]+$/i.test(u.trim())) add("error", `rua entry "${u.trim()}" should look like mailto:name@example.com.`);
  } else add("warn", "No rua= address, so you will not receive aggregate reports.");
  for (const k of ["adkim", "aspf"]) if (tags[k] && !["r", "s"].includes(tags[k].toLowerCase())) add("error", `${k} must be r or s.`);
  if (tags.sp && !["none", "quarantine", "reject"].includes(tags.sp.toLowerCase())) add("error", "sp must be none, quarantine or reject.");
  return { ok: !issues.some((x) => x.level === "error"), record: t, policy: p || null, tags, issues };
}

export function checkDkim(raw) {
  const t = unquote(raw);
  const issues = [];
  const add = (level, msg) => issues.push({ level, msg });
  const tags = parseTags(t);
  if (tags.v && tags.v.toUpperCase() !== "DKIM1") add("error", "v must be DKIM1 when present.");
  if (tags.k && !["rsa", "ed25519"].includes(tags.k.toLowerCase())) add("warn", `k=${tags.k} is unusual; rsa and ed25519 are the common key types.`);
  const key = (tags.p ?? "").replace(/\s+/g, "");
  let bits = null;
  if (tags.p === undefined) add("error", "Missing p= public key.");
  else if (key === "") add("error", "p= is empty: this selector's key is revoked, mail signed with it fails.");
  else if (!/^[A-Za-z0-9+/]+={0,2}$/.test(key)) add("error", "p= is not valid base64 (stray characters or a broken paste).");
  else if ((tags.k || "rsa").toLowerCase() === "rsa") {
    // A 1024-bit RSA SubjectPublicKeyInfo is ~216 base64 chars, 2048-bit ~392.
    const len = key.length;
    bits = len >= 380 ? 2048 : len >= 200 ? 1024 : 512;
    if (bits < 1024) add("error", "Key looks shorter than 1024 bits.");
    else if (bits === 1024) add("warn", "Key looks like 1024-bit RSA; 2048-bit is the current recommendation.");
  }
  if (tags.t && /(^|:)y(:|$)/i.test(tags.t)) add("warn", "t=y marks this selector as testing; receivers may treat failures as passes. Remove it in production.");
  if (tags.h && !/sha256/i.test(tags.h)) add("warn", "h= limits hash algorithms and does not list sha256.");
  return { ok: !issues.some((x) => x.level === "error"), record: t, approxBits: bits, issues };
}

// Dispatch on what the pasted text is.
export function checkRecord(raw) {
  const t = unquote(raw);
  if (/^v=spf1/i.test(t)) return { type: "SPF", ...checkSpf(t) };
  if (/^v=DMARC1/i.test(t)) return { type: "DMARC", ...checkDmarc(t) };
  if (/(^|;)\s*p\s*=/.test(t) && /(v=DKIM1|k=(rsa|ed25519))/i.test(t) || /^v=DKIM1/i.test(t)) return { type: "DKIM", ...checkDkim(t) };
  return { type: "unknown", ok: false, record: t, issues: [{ level: "error", msg: "Not recognised: expected a record starting v=spf1, v=DMARC1 or v=DKIM1." }] };
}

// One record per line; blank lines and # comments skipped.
export function checkAll(text) {
  return String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map(checkRecord);
}

// Bulk-sender summary: what Google and Yahoo ask for, as far as pasted records show.
export function bulkSenderGaps(results) {
  const gaps = [];
  const has = (ty) => results.find((r) => r.type === ty && r.ok);
  if (!has("SPF")) gaps.push("No valid SPF record pasted.");
  if (!has("DKIM")) gaps.push("No valid DKIM record pasted (look it up at selector._domainkey.yourdomain).");
  const d = has("DMARC");
  if (!d) gaps.push("No valid DMARC record pasted (at _dmarc.yourdomain); bulk senders need at least p=none.");
  return gaps;
}
