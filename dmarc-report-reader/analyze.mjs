// DMARC aggregate (RFC 7489 appendix C) report reader. Pure functions, no DOM,
// no network: the page and the tests share this file.

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1].trim()) : "";
};
const blocks = (xml, name) => [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);
function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function parseReport(xml) {
  if (!/<feedback[\s>]/.test(xml)) throw new Error("Not a DMARC aggregate report: no <feedback> element found.");
  const meta = blocks(xml, "report_metadata")[0] || "";
  const pol = blocks(xml, "policy_published")[0] || "";
  const range = blocks(meta, "date_range")[0] || "";
  const records = blocks(xml, "record").map((r) => {
    const row = blocks(r, "row")[0] || "";
    const pe = blocks(row, "policy_evaluated")[0] || "";
    const ids = blocks(r, "identifiers")[0] || "";
    const auth = blocks(r, "auth_results")[0] || "";
    return {
      ip: tag(row, "source_ip"),
      count: Number(tag(row, "count")) || 0,
      disposition: tag(pe, "disposition") || "none",
      dkimAligned: tag(pe, "dkim") === "pass",
      spfAligned: tag(pe, "spf") === "pass",
      overrides: blocks(pe, "reason").map((x) => tag(x, "type")).filter(Boolean),
      headerFrom: tag(ids, "header_from"),
      envelopeFrom: tag(ids, "envelope_from"),
      dkimAuth: blocks(auth, "dkim").map((d) => ({ domain: tag(d, "domain"), selector: tag(d, "selector"), result: tag(d, "result") })),
      spfAuth: blocks(auth, "spf").map((s) => ({ domain: tag(s, "domain"), result: tag(s, "result") })),
    };
  });
  return {
    org: tag(meta, "org_name"),
    reportId: tag(meta, "report_id"),
    begin: Number(tag(range, "begin")) || 0,
    end: Number(tag(range, "end")) || 0,
    domain: tag(pol, "domain"),
    policy: { p: tag(pol, "p") || "none", sp: tag(pol, "sp"), pct: tag(pol, "pct") === "" ? 100 : Number(tag(pol, "pct")), adkim: tag(pol, "adkim") || "r", aspf: tag(pol, "aspf") || "r" },
    records,
  };
}

// Why a row failed, in the words someone fixing DNS needs.
export function diagnose(rec) {
  if (rec.dkimAligned || rec.spfAligned) return null;
  const hints = [];
  const dkimPass = rec.dkimAuth.filter((d) => d.result === "pass");
  const spfPass = rec.spfAuth.filter((s) => s.result === "pass");
  if (!rec.dkimAuth.length) hints.push("No DKIM signature seen. Turn on DKIM signing at this sender.");
  else if (dkimPass.length) hints.push(`DKIM passes but signs as ${[...new Set(dkimPass.map((d) => d.domain))].join(", ")}, not ${rec.headerFrom}. Publish a custom DKIM key so the signing domain (d=) is your domain.`);
  else hints.push("DKIM signature present but does not verify. The key in DNS is missing/rotated or the message was modified in transit.");
  if (spfPass.length) hints.push(`SPF passes for ${[...new Set(spfPass.map((s) => s.domain))].join(", ")}, which is not your From domain. Set a custom return-path (bounce domain) at this sender so SPF aligns.`);
  else hints.push("SPF did not pass for this IP. Add it (or the sender's include:) to your SPF record if it is yours; if you do not recognise it, it is likely spoofing.");
  return hints;
}

export function summarize(reports) {
  const sources = new Map();
  let total = 0, pass = 0, quarantined = 0, rejected = 0, forwarded = 0;
  for (const rep of reports) {
    for (const r of rep.records) {
      total += r.count;
      const ok = r.dkimAligned || r.spfAligned;
      if (ok) pass += r.count;
      if (r.disposition === "quarantine") quarantined += r.count;
      if (r.disposition === "reject") rejected += r.count;
      const key = r.ip + "|" + r.headerFrom;
      let s = sources.get(key);
      if (!s) sources.set(key, (s = { ip: r.ip, headerFrom: r.headerFrom, count: 0, pass: 0, dkimOnly: 0, spfOnly: 0, both: 0, fail: 0, hints: [], orgs: new Set(), dkimDomains: new Set() }));
      s.count += r.count;
      s.orgs.add(rep.org);
      r.dkimAuth.forEach((d) => d.domain && s.dkimDomains.add(d.domain));
      if (r.dkimAligned && r.spfAligned) { s.both += r.count; s.pass += r.count; }
      else if (r.dkimAligned) { s.dkimOnly += r.count; s.pass += r.count; }
      else if (r.spfAligned) { s.spfOnly += r.count; s.pass += r.count; }
      else { s.fail += r.count; if (!s.hints.length) s.hints = diagnose(r) || []; }
    }
  }
  const list = [...sources.values()].map((s) => ({
    ...s, orgs: [...s.orgs], dkimDomains: [...s.dkimDomains],
    status: s.fail === 0 ? "aligned" : s.pass === 0 ? "failing" : "partial",
    // Forwarders and mailing lists break SPF but keep DKIM: only-DKIM is fine.
    fragile: s.fail === 0 && s.both === 0 && s.dkimOnly === 0 ? "SPF-only: breaks when the message is forwarded. Add DKIM." : "",
  })).sort((a, b) => b.count - a.count);
  const policies = [...new Set(reports.map((r) => `p=${r.policy.p}`))];
  const policy = reports[0]?.policy || { p: "none", pct: 100 };
  const failVolume = total - pass;
  const failingSources = list.filter((s) => s.status !== "aligned");
  return {
    domain: reports[0]?.domain || "", reports: reports.length, total, pass, failVolume,
    passRate: total ? pass / total : 0, quarantined, rejected, forwarded,
    sources: list, failingSources, policies, policy,
    recommendation: recommend(policy, total, pass, failingSources),
    period: [Math.min(...reports.map((r) => r.begin).filter(Boolean)), Math.max(...reports.map((r) => r.end))],
  };
}

export function recommend(policy, total, pass, failing) {
  if (!total) return "No messages in these reports.";
  const rate = pass / total;
  const unknown = failing.length;
  if (policy.p === "none") {
    if (rate >= 0.98) return `${(rate * 100).toFixed(1)}% of mail aligns while the policy is still p=none. Move to p=quarantine; pct=10, watch a week of reports, then raise pct.`;
    return `Stay at p=none for now. ${unknown} source(s) still fail alignment (${(100 - rate * 100).toFixed(1)}% of volume). Fix legitimate senders first, otherwise enforcing will send real mail to spam.`;
  }
  if (policy.p === "quarantine") {
    if (rate >= 0.99 && policy.pct >= 100) return "Aligned and enforced at quarantine for all mail. Consider p=reject once a few more weeks of reports stay clean.";
    if (rate >= 0.98) return `Raise pct toward 100 (now ${policy.pct}); alignment is ${(rate * 100).toFixed(1)}%.`;
    return `Do not tighten yet: ${(100 - rate * 100).toFixed(1)}% of volume fails and is already being quarantined. Check the failing sources for legitimate senders.`;
  }
  return rate >= 0.99 ? "At p=reject with clean alignment. Keep monitoring reports for new senders." : `At p=reject but ${(100 - rate * 100).toFixed(1)}% of volume fails: confirm none of it is legitimate, it is being refused.`;
}

// ---- input decoding: .xml, .xml.gz and .zip (what mail providers send) ----
async function inflate(bytes, format) {
  const ds = new DecompressionStream(format);
  const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

export async function bytesToXml(bytes) {
  const dec = new TextDecoder();
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return dec.decode(await inflate(bytes, "gzip"));
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (v.getUint32(0, true) !== 0x04034b50) throw new Error("Unsupported zip layout.");
    const method = v.getUint16(8, true), csize = v.getUint32(18, true);
    const nlen = v.getUint16(26, true), xlen = v.getUint16(28, true);
    const start = 30 + nlen + xlen;
    if (csize === 0 && (v.getUint16(6, true) & 8)) throw new Error("Zip uses a data descriptor; unzip it first and drop the .xml.");
    const data = bytes.subarray(start, start + csize);
    if (method === 0) return dec.decode(data);
    if (method === 8) return dec.decode(await inflate(data, "deflate-raw"));
    throw new Error("Unsupported zip compression method " + method);
  }
  return dec.decode(bytes);
}

export function toCsv(summary) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["source_ip", "header_from", "messages", "aligned", "failing", "status", "fix"]];
  for (const s of summary.sources) rows.push([s.ip, s.headerFrom, s.count, s.pass, s.fail, s.status, s.hints.join(" ")]);
  return rows.map((r) => r.map(q).join(",")).join("\n");
}
