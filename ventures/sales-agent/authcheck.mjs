// Sender authentication check (2026-11-03). Pure rules, no network, nothing sent.
// The user pastes the TXT records they already looked up (SPF at the domain, DMARC at _dmarc.domain,
// DKIM at selector._domainkey.domain); this reads them against RFC 7208 (SPF), RFC 7489 (DMARC) and
// RFC 6376 (DKIM), written from memory of those documents, not read against the texts.
const clean = (s) => String(s ?? "").trim().replace(/^"|"$/g, "").replace(/"\s+"/g, "").trim();
const tags = (s) => Object.fromEntries(clean(s).split(";").map((p) => p.trim()).filter(Boolean).map((p) => { const i = p.indexOf("="); return i < 0 ? [p.toLowerCase(), ""] : [p.slice(0, i).trim().toLowerCase(), p.slice(i + 1).trim()]; }));

/** @param {string|string[]} records every TXT record found at the domain; only the v=spf1 one counts */
export function checkSpf(records) {
  const out = { findings: [], lookups: 0, all: null };
  const f = (level, rule, text) => out.findings.push({ level, rule, text });
  const list = (Array.isArray(records) ? records : [records]).map(clean).filter((r) => /^v=spf1(\s|$)/i.test(r));
  if (!list.length) { f("error", "spf-missing", "No v=spf1 record. Receivers cannot tell which servers may send for this domain."); return out; }
  if (list.length > 1) f("error", "spf-multiple", `${list.length} SPF records. A domain must publish exactly one; with several, SPF evaluation fails with a permanent error. Merge them into one record.`);
  const rec = list[0];
  if (rec.length > 450) f("warn", "spf-long", "Record is over 450 characters; a UDP DNS answer may truncate and a TXT string over 255 characters must be split into quoted chunks.");
  const terms = rec.split(/\s+/).slice(1);
  for (const t of terms) {
    const m = /^([+\-~?]?)(all|include|a|mx|ptr|exists|ip4|ip6)([:/=].*)?$/i.exec(t);
    const red = /^redirect=/i.test(t);
    if (red) { out.lookups++; continue; }
    if (!m) { if (!/^exp=/i.test(t)) f("warn", "spf-term", `Unrecognised term "${t}"; a misspelt mechanism makes the whole record a permanent error.`); continue; }
    const name = m[2].toLowerCase();
    if (["include", "a", "mx", "exists", "ptr"].includes(name)) out.lookups++;
    if (name === "ptr") f("warn", "spf-ptr", "The ptr mechanism is discouraged (slow, unreliable); list the sending IPs or includes instead.");
    if (name === "include" && !m[3]) f("error", "spf-include", "An include with no domain.");
    if (name === "all") out.all = (m[1] || "+") + "all";
  }
  if (out.lookups > 10) f("error", "spf-lookups", `About ${out.lookups} DNS lookups counted in this record alone; the limit is 10 across the whole chain, and exceeding it is a permanent error. Includes inside each include also count, which this check cannot see: count those with a full resolver.`);
  else if (out.lookups >= 8) f("warn", "spf-lookups", `${out.lookups} lookups here; the includes you reference add more. The limit is 10 in total.`);
  if (out.all === "+all") f("error", "spf-plus-all", "+all authorises every server on the internet to send as you.");
  else if (out.all === "?all") f("warn", "spf-neutral", "?all is neutral, so SPF gives receivers no signal. Move to ~all, then -all when you are sure of every sender.");
  else if (out.all === null && !terms.some((t) => /^redirect=/i.test(t))) f("warn", "spf-no-all", "No closing all (or redirect=), so unlisted servers are neither passed nor failed.");
  else if (out.all === "~all") f("info", "spf-softfail", "~all (softfail) is the common safe setting; -all is stricter once every sender is listed.");
  return out;
}

/** @param {string} record the TXT record at _dmarc.<domain> */
export function checkDmarc(record) {
  const out = { findings: [], policy: null };
  const f = (level, rule, text) => out.findings.push({ level, rule, text });
  const r = clean(record);
  if (!r) { f("error", "dmarc-missing", "No DMARC record at _dmarc.<your domain>. Gmail and Yahoo expect one from bulk senders, and without it nobody can tell you when your mail is forged."); return out; }
  if (!/^v=DMARC1\s*(;|$)/i.test(r)) { f("error", "dmarc-version", "A DMARC record must start with v=DMARC1; any other first tag makes receivers ignore it."); return out; }
  const t = tags(r);
  out.policy = (t.p || "").toLowerCase() || null;
  if (!["none", "quarantine", "reject"].includes(out.policy)) f("error", "dmarc-policy", "The p= tag is missing or not none, quarantine or reject.");
  else if (out.policy === "none") f("warn", "dmarc-none", "p=none only monitors. It is the right start, but nothing is blocked; move to quarantine and then reject once the reports show every real sender passing.");
  else f("info", "dmarc-enforced", `p=${out.policy} is enforcing.`);
  if (!t.rua) f("warn", "dmarc-rua", "No rua= address, so you receive no aggregate reports and cannot see who sends as you.");
  else if (!/mailto:/i.test(t.rua)) f("error", "dmarc-rua-format", "rua= must be a mailto: URI.");
  if (t.pct !== undefined && Number(t.pct) < 100) f("warn", "dmarc-pct", `pct=${t.pct}: the policy applies to only that share of failing mail.`);
  if (t.sp && ["quarantine", "reject"].includes(out.policy) && t.sp.toLowerCase() === "none") f("warn", "dmarc-sp", "sp=none leaves subdomains unprotected, which attackers use.");
  if (t.adkim && !/^[rs]$/i.test(t.adkim)) f("error", "dmarc-adkim", "adkim must be r or s.");
  if (t.aspf && !/^[rs]$/i.test(t.aspf)) f("error", "dmarc-aspf", "aspf must be r or s.");
  return out;
}

/** @param {string} record the TXT record at <selector>._domainkey.<domain> */
export function checkDkim(record) {
  const out = { findings: [], bits: null };
  const f = (level, rule, text) => out.findings.push({ level, rule, text });
  const r = clean(record);
  if (!r) { f("error", "dkim-missing", "No DKIM record at <selector>._domainkey.<domain>. Check the selector in a sent message's DKIM-Signature header (s=)."); return out; }
  const t = tags(r);
  if (t.v && t.v.toUpperCase() !== "DKIM1") f("error", "dkim-version", "v= must be DKIM1 when present.");
  if (t.k && !/^(rsa|ed25519)$/i.test(t.k)) f("warn", "dkim-key-type", `Unknown key type k=${t.k}.`);
  const p = (t.p ?? "").replace(/\s+/g, "");
  if (t.p === undefined) f("error", "dkim-no-key", "No p= tag, so there is no public key.");
  else if (p === "") f("error", "dkim-revoked", "p= is empty, which means the key is revoked: signatures with this selector fail.");
  else if (!/^[A-Za-z0-9+/=]+$/.test(p)) f("error", "dkim-key-chars", "p= has characters that are not base64, often a stray quote or a line break from copy and paste.");
  else if (!t.k || t.k.toLowerCase() === "rsa") {
    // base64 of an RSA SubjectPublicKeyInfo: ~216 chars for 1024 bit, ~392 for 2048 bit.
    out.bits = p.length < 150 ? 512 : p.length < 300 ? 1024 : p.length < 600 ? 2048 : 4096;
    if (out.bits <= 1024) f("warn", "dkim-short-key", `The key looks like ${out.bits} bits (estimated from its length). Use 2048 where your DNS host allows it.`);
  }
  if (/(^|:)y(:|$)/i.test(t.t ?? "")) f("warn", "dkim-testing", "t=y marks the domain as testing; some receivers treat failures leniently, which also weakens DMARC. Remove it once signing works.");
  return out;
}

/** Runs all three on whatever the user pasted; any may be omitted. */
export function checkAuth({ spf, dmarc, dkim } = {}) {
  const parts = { spf: checkSpf(spf ?? []), dmarc: checkDmarc(dmarc), dkim: checkDkim(dkim) };
  const all = Object.entries(parts).flatMap(([k, v]) => v.findings.map((x) => ({ ...x, part: k })));
  const errors = all.filter((x) => x.level === "error"), warnings = all.filter((x) => x.level === "warn");
  return { ok: !errors.length, errors, warnings, info: all.filter((x) => x.level === "info"), parts };
}
