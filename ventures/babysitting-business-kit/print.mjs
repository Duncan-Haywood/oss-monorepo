// Offline lead generation: printable pieces for church bulletin boards, school
// newsletters, coffee shops and library boards, plus referral cards families
// hand to friends. Each piece is a self-contained print-CSS HTML page built from
// the sitter's profile, which the app opens in a new window to print.
//
// Referral cards carry a code ("RIVERA-7KQ"). When an inquiry's "How did you
// hear about me?" answer contains that code (or names the family exactly),
// creditReferral() records which family sent it and rewrites the source as a
// referral, so scoreLead() gives it the referral bonus and sourceStats() credits
// the family. The QR code on a referral card opens the sitter's site with
// ?ref=CODE, which the site copies into that field.
//
// Faith wording appears only when the sitter turned on showFaith and wrote a
// statement; it is the sitter's own words, never added for them.

import { toSVG, encode } from "./qr.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---- referral codes
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L
function hash(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
export function familySurname(family) {
  const words = String(family?.name || "").replace(/\bfamily\b/gi, "").trim().split(/\s+/).filter(Boolean);
  return words.length ? words[words.length - 1] : "";
}
// A short code that is stable for a family: up to 8 letters of the surname and
// three characters from its id. A code the sitter typed (family.referralCode) wins.
export function referralCode(family) {
  if (family?.referralCode) return String(family.referralCode).toUpperCase();
  const name = familySurname(family).normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 8) || "FAMILY";
  let h = hash(family?.id || family?.name || "");
  let tail = "";
  for (let i = 0; i < 3; i++) { tail += ALPHABET[h % ALPHABET.length]; h = Math.floor(h / ALPHABET.length); }
  return `${name}-${tail}`;
}
const squash = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Which family, if any, a "How did you hear about me?" answer credits.
// A code match always counts; "the Rivera family" counts only when exactly one
// family on the desk has that surname.
export function findReferrer(source, families = []) {
  const text = String(source || "");
  if (!text.trim()) return null;
  const flat = squash(text);
  for (const f of families) {
    const code = squash(referralCode(f));
    if (code.length >= 4 && flat.includes(code)) return { family: f, by: "code" };
  }
  const named = families.filter((f) => {
    const s = familySurname(f);
    return s && new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+family\\b`, "i").test(text);
  });
  const surnames = new Set(named.map((f) => familySurname(f).toLowerCase()));
  if (named.length && surnames.size === 1) {
    const s = [...surnames][0];
    const all = families.filter((f) => familySurname(f).toLowerCase() === s);
    if (all.length === 1) return { family: all[0], by: "name" };
  }
  return null;
}

// Mark a lead as referred by a family when its source names one. Returns the
// same lead (mutated) so it can wrap leadFromForm() in place.
export function creditReferral(lead, desk) {
  if (!lead || lead.referredBy) return lead;
  const hit = findReferrer(lead.source, desk?.families || []);
  if (!hit) return lead;
  const orig = String(lead.source || "").trim();
  lead.referredBy = hit.family.id;
  lead.referralCode = referralCode(hit.family);
  lead.source = `referral from ${hit.family.name}${orig ? ` (${orig})` : ""}`.slice(0, 100);
  return lead;
}

// ---- where leads come from
export const SOURCE_BUCKETS = [
  ["referral", /referr|friend|mention|neighbou?r|word of mouth/],
  ["church", /church|parish|congregation|bulletin|ministry|youth group/],
  ["school", /school|pta|pto|newsletter|teacher|daycare/],
  ["print", /flyer|flier|poster|card|door ?hanger|qr|library|coffee|board/],
  ["Nextdoor", /nextdoor/],
  ["Facebook", /facebook|\bfb\b/],
  ["Instagram", /instagram|\big\b/],
  ["website", /website|google|search|site|online/],
];
export function sourceBucket(lead) {
  if (lead?.referredBy) return "referral";
  const s = String(lead?.source || "").toLowerCase();
  for (const [name, re] of SOURCE_BUCKETS) if (re.test(s)) return name;
  return s.trim() ? "other" : "unknown";
}

// Leads and bookings by source, and by referring family.
export function sourceStats(desk) {
  const leads = desk?.leads || [];
  const families = desk?.families || [];
  const by = new Map();
  for (const l of leads) {
    const b = sourceBucket(l);
    const row = by.get(b) || { source: b, leads: 0, booked: 0 };
    row.leads++;
    if (l.status === "booked") row.booked++;
    by.set(b, row);
  }
  const sources = [...by.values()].sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source));
  const referrers = families.map((f) => {
    const mine = leads.filter((l) => l.referredBy === f.id);
    return { familyId: f.id, family: f.name, code: referralCode(f), leads: mine.length, booked: mine.filter((l) => l.status === "booked").length };
  }).filter((r) => r.leads).sort((a, b) => b.leads - a.leads || a.family.localeCompare(b.family));
  return { total: leads.length, sources, referrers };
}

// ---- the link a QR code opens
export function withRef(url, ref) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (!ref) return u;
  const [base, hash] = u.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}ref=${encodeURIComponent(ref)}${hash !== undefined ? `#${hash}` : ""}`;
}
export function siteLink(profile = {}) {
  return String(profile.siteUrl || profile.bookingUrl || "").trim();
}
function qrBlock(url, size, caption) {
  if (!url) return "";
  try {
    encode(url);
  } catch {
    return `<p class="qrerr">Link too long for a QR code</p>`;
  }
  return `<figure class="qr">${toSVG(url, { size, label: `QR code for ${url}` })}${caption ? `<figcaption>${esc(caption)}</figcaption>` : ""}</figure>`;
}

// ---- shared wording
function facts(p, opts = {}) {
  const { showRate = true } = opts;
  const r = p.rates || {};
  const out = [];
  if ((p.certifications || []).length) out.push(`${p.certifications.join(", ")} certified`);
  const months = Number(p.youngestMonths);
  if (Number.isFinite(months)) out.push(`Children ${months < 12 ? `${months} months` : `${Math.floor(months / 12)} year${months >= 24 ? "s" : ""}`} and up, up to ${p.maxKids} at a time`);
  if (p.area) out.push(`Serving ${p.area}`);
  if (opts.availability && p.availability) out.push(`Available ${String(p.availability).replace(/;\s*/g, ", ")}`);
  if (showRate && r.hourly) out.push(`$${r.hourly}/hour${r.extraChild ? `, +$${r.extraChild} each extra child` : ""}`);
  return out;
}
function contactLine(p) {
  return [p.phone, p.email].filter(Boolean).join(" · ");
}
export function faithLine(p) {
  if (!p.showFaith || !String(p.faithStatement || "").trim()) return "";
  const first = String(p.faithStatement).trim().match(/^.*?[.!?](?=\s|$)/);
  return (first ? first[0] : String(p.faithStatement).trim()).slice(0, 200);
}
const title = (p) => p.businessName || `${p.name} Babysitting`;

function doc(name, css, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<style>
@page{size:letter;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#fff;color:#222;font-family:Georgia,"Times New Roman",serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:8.5in;height:11in;overflow:hidden;position:relative;page-break-after:always;break-after:page}
.sheet:last-child{page-break-after:auto;break-after:auto}
h1,h2,p{margin:0}
.qr{margin:0;text-align:center}.qr svg{display:block;margin:auto}.qr figcaption{font:600 8.5pt system-ui,sans-serif;margin-top:2pt}
.qrerr{font:8pt system-ui,sans-serif;color:#a00}
.tip{font:10pt system-ui,sans-serif;background:#fff6d6;border-bottom:1px solid #e2cf8f;padding:8px 12px}
@media print{.tip{display:none}}
@media screen{body{background:#eee}.sheet{background:#fff;margin:12px auto;box-shadow:0 1px 6px rgba(0,0,0,.25)}}
${css}
</style>
</head>
<body>
<p class="tip">Print at 100% (“Actual size”, not “Fit to page”), with margins set to none if your browser asks. Print one test page on plain paper first.</p>
${body}
</body>
</html>
`;
}

// ---- 1. letter flyer with tear-off tabs
export function flyer(desk, opts = {}) {
  const p = desk.profile;
  const url = opts.url ?? withRef(siteLink(p), opts.ref ?? "flyer");
  const contact = contactLine(p);
  const faith = opts.faith === false ? "" : faithLine(p);
  const tabs = Array.from({ length: 10 }, () => `<div class="tab"><span><b>${esc(p.name)}</b><br>${esc(p.phone || p.email || "")}<br>Babysitter</span></div>`).join("");
  const css = `
.flyer{padding:.55in .6in 0;height:8.6in;display:flex;flex-direction:column;gap:.18in}
.flyer h1{font-size:46pt;line-height:1.05;color:#7a2f52}
.flyer .sub{font-size:19pt;color:#555}
.flyer .row{display:flex;gap:.35in;align-items:flex-start}
.flyer .bio{font-size:17pt;line-height:1.45;flex:1}
.flyer ul{font-size:16pt;line-height:1.6;margin:.12in 0 0;padding-left:.28in}
.flyer .faith{font-size:15pt;font-style:italic;color:#444}
.flyer .scan{display:flex;align-items:center;gap:.35in;border:2px solid #e7d3dc;border-radius:.18in;padding:.2in .3in;font:600 15pt/1.4 system-ui,sans-serif;color:#444}
.flyer .contact{font:700 19pt system-ui,sans-serif;margin-top:auto;padding-bottom:.15in}
.tabs{position:absolute;left:0;right:0;bottom:0;height:2.4in;display:flex;border-top:2px dashed #888}
.tab{flex:1;border-left:1px dashed #888;display:flex;align-items:center;justify-content:center;padding:.08in 0}
.tab:first-child{border-left:0}
.tab span{writing-mode:vertical-rl;transform:rotate(180deg);font:10.5pt/1.25 system-ui,sans-serif;text-align:center;white-space:nowrap}`;
  const body = `<section class="sheet"><div class="flyer">
<h1>${esc(opts.headline || "Need a babysitter?")}</h1>
<p class="sub">${esc(title(p))}${p.city ? ` · ${esc(p.city)}` : ""}</p>
<div class="bio"><p>${esc(p.bio)}</p><ul>${facts(p, { availability: true, ...opts }).map((f) => `<li>${esc(f)}</li>`).join("")}</ul></div>
${url ? `<div class="scan">${qrBlock(url, "2.2in", "")}<p>Scan with your phone camera for my rates and a form to ask about a sit.</p></div>` : ""}
${faith ? `<p class="faith">${esc(faith)}</p>` : ""}
${contact ? `<p class="contact">${esc(contact)}</p>` : ""}
</div><div class="tabs">${tabs}</div></section>`;
  return doc(`Flyer: ${title(p)}`, css, body);
}

// ---- 2. business cards, Avery 8371 / 5371 layout
// 10 cards, 2 columns x 5 rows, each 3.5 x 2 in; 0.5 in top and bottom margins
// and 0.75 in side margins, no gutters (Avery's published template for 8371).
export const AVERY_8371 = { columns: 2, rows: 5, cardW: 3.5, cardH: 2, top: 0.5, side: 0.75 };
const cardCss = `
.cards{position:absolute;top:${AVERY_8371.top}in;left:${AVERY_8371.side}in;display:grid;grid-template-columns:repeat(${AVERY_8371.columns},${AVERY_8371.cardW}in);grid-auto-rows:${AVERY_8371.cardH}in}
.card{padding:.17in .2in;display:flex;gap:.12in;align-items:center;overflow:hidden;outline:1px dotted #ccc;outline-offset:-1px}
@media print{.card{outline:0}}
.card .txt{flex:1;min-width:0}
.card h2{font-size:13.5pt;line-height:1.15;color:#7a2f52}
.card p{font:8.5pt/1.35 system-ui,sans-serif;margin-top:3pt}
.card .big{font:700 10.5pt system-ui,sans-serif}
.card .code{font:700 12pt ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em;color:#7a2f52}`;

export function businessCards(desk, opts = {}) {
  const p = desk.profile;
  const url = opts.url ?? withRef(siteLink(p), opts.ref ?? "card");
  const card = `<div class="card"><div class="txt"><h2>${esc(title(p))}</h2><p>Babysitting${p.city ? ` in ${esc(p.city)}` : ""}</p>${(p.certifications || []).length ? `<p>${esc(p.certifications.join(", "))} certified</p>` : ""}${p.phone ? `<p class="big">${esc(p.phone)}</p>` : ""}${p.email ? `<p>${esc(p.email)}</p>` : ""}</div>${qrBlock(url, ".95in", "")}</div>`;
  return doc(`Business cards: ${title(p)}`, cardCss, `<section class="sheet"><div class="cards">${card.repeat(10)}</div></section>`);
}

// ---- 3. referral cards for one family, same Avery layout
export function referralCards(desk, familyId, opts = {}) {
  const p = desk.profile;
  const fam = (desk.families || []).find((f) => f.id === familyId);
  if (!fam) throw new Error("choose a family for the referral cards");
  const code = referralCode(fam);
  const url = opts.url ?? withRef(siteLink(p), code);
  const card = `<div class="card"><div class="txt"><p>Need a babysitter? Ask</p><h2>${esc(title(p))}</h2><p class="big">Mention the ${esc(fam.name.replace(/\s*family$/i, ""))} family</p><p>Code <span class="code">${esc(code)}</span></p>${contactLine(p) ? `<p>${esc(contactLine(p))}</p>` : ""}</div>${qrBlock(url, ".95in", "")}</div>`;
  return doc(`Referral cards: ${fam.name}`, cardCss, `<section class="sheet"><div class="cards">${card.repeat(10)}</div></section>`);
}

// ---- 4. quarter-page bulletin ad (4.25 x 5.5 in), four to a letter sheet
export function bulletinAd(desk, opts = {}) {
  const p = desk.profile;
  const url = opts.url ?? withRef(siteLink(p), opts.ref ?? "bulletin");
  const faith = opts.faith === false ? "" : faithLine(p);
  const css = `
.quad{display:grid;grid-template-columns:4.25in 4.25in;grid-template-rows:5.5in 5.5in}
.ad{padding:.32in .34in;display:flex;flex-direction:column;gap:.09in;border-right:1px dashed #999;border-bottom:1px dashed #999;overflow:hidden}
.ad:nth-child(2n){border-right:0}.ad:nth-child(n+3){border-bottom:0}
.ad h1{font-size:21pt;line-height:1.1;color:#7a2f52}
.ad .sub{font-size:11.5pt;color:#555}
.ad .bio{font-size:10.5pt;line-height:1.4}
.ad ul{font:9.5pt/1.4 system-ui,sans-serif;margin:0;padding-left:.18in}
.ad .faith{font-size:9.5pt;font-style:italic}
.ad .foot{margin-top:auto;display:flex;align-items:flex-end;gap:.15in}
.ad .contact{font:700 12pt system-ui,sans-serif;flex:1}`;
  const ad = `<div class="ad"><h1>${esc(opts.headline || "Babysitting")}</h1><p class="sub">${esc(title(p))}</p><p class="bio">${esc(p.bio)}</p><ul>${facts(p, opts).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>${faith ? `<p class="faith">${esc(faith)}</p>` : ""}<div class="foot"><p class="contact">${esc(contactLine(p))}</p>${qrBlock(url, "1.15in", "Scan to ask")}</div></div>`;
  return doc(`Bulletin ad: ${title(p)}`, css, `<section class="sheet"><div class="quad">${ad.repeat(4)}</div></section>`);
}

// ---- 5. door hanger (4.25 x 11 in), two to a sheet; also works as a small poster
export function doorHanger(desk, opts = {}) {
  const p = desk.profile;
  const url = opts.url ?? withRef(siteLink(p), opts.ref ?? "door hanger");
  const faith = opts.faith === false ? "" : faithLine(p);
  const css = `
.pair{display:grid;grid-template-columns:4.25in 4.25in;height:11in}
.hanger{position:relative;padding:2.15in .38in .4in;display:flex;flex-direction:column;gap:.13in;border-right:1px dashed #999;overflow:hidden}
.hanger:last-child{border-right:0}
.hole{position:absolute;top:.45in;left:50%;width:1.35in;height:1.35in;margin-left:-.675in;border:1px dashed #777;border-radius:50%}
.slit{position:absolute;top:1.12in;left:50%;width:0;height:.9in;border-left:1px dashed #777}
.hanger h1{font-size:25pt;line-height:1.1;color:#7a2f52}
.hanger .sub{font-size:12pt;color:#555}
.hanger .bio{font-size:11.5pt;line-height:1.45}
.hanger ul{font:10.5pt/1.45 system-ui,sans-serif;margin:0;padding-left:.2in}
.hanger .faith{font-size:10.5pt;font-style:italic}
.hanger .contact{font:700 14pt system-ui,sans-serif;text-align:center;margin-top:auto}`;
  const one = `<div class="hanger"><span class="hole" aria-hidden="true"></span><span class="slit" aria-hidden="true"></span><h1>${esc(opts.headline || "Hi, neighbor! Need a babysitter?")}</h1><p class="sub">${esc(title(p))}</p><p class="bio">${esc(p.bio)}</p><ul>${facts(p, opts).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>${faith ? `<p class="faith">${esc(faith)}</p>` : ""}${qrBlock(url, "1.5in", "Scan for rates and to ask about a sit")}<p class="contact">${esc(contactLine(p))}</p></div>`;
  return doc(`Door hanger: ${title(p)}`, css, `<section class="sheet"><div class="pair">${one}${one}</div></section>`);
}

export const PIECES = {
  flyer: { label: "Letter flyer with tear-off tabs", build: flyer },
  cards: { label: "Business cards (Avery 8371, 10 per sheet)", build: businessCards },
  bulletin: { label: "Church or school bulletin ad (quarter page, 4 per sheet)", build: bulletinAd },
  hanger: { label: "Door hanger or small poster (4.25 x 11 in, 2 per sheet)", build: doorHanger },
  referral: { label: "Referral cards for a family (Avery 8371)", build: (desk, opts = {}) => referralCards(desk, opts.familyId, opts) },
};
export function printPiece(kind, desk, opts = {}) {
  const piece = PIECES[kind];
  if (!piece) throw new Error(`unknown piece: ${kind}`);
  return piece.build(desk, opts);
}
