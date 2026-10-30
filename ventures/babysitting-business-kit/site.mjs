// Babysitting Business Kit: the sitter's own marketing website, v2. Pure functions:
// desk in, files out. Every word on the site comes from the sitter's desk (profile,
// profile.site, consented testimonials); a field left empty hides its section, so the
// site never says something the sitter did not.
//
//   buildSiteFiles(desk, { formAction, today }) -> { "index.html": "...", "faq.html": ..., "robots.txt": ..., ... }
//   zipFiles(files, date) -> Uint8Array   (a store-only .zip for Netlify, Cloudflare Pages, GitHub Pages)
//
// profile.site (all optional):
//   theme        "warm" | "bright" | "simple"
//   url          the site's own address, e.g. https://gracenotes.example (canonical, og:url, sitemap)
//   towns        towns or neighbourhoods served, comma or newline separated
//   sitSteps     "what a sit looks like", one step per line
//   firstSit     what to expect at the first sit
//   safety       how the sitter keeps kids safe
//   cancellation, payment, sick   policies in the sitter's words
//   certs        one per line: "CPR and First Aid | 2026-03 | 2028-03" (name | earned | valid through)
//   faq          extra questions, one per line: "Do you drive? | Yes, with a car seat you provide."
//   done         ids of finished "get found locally" steps
//
// A family's beliefs are never asked or scored here; the faith section is the sitter's
// own statement, shown only when they tick it.

import { publishableTestimonials, fmtAge } from "./engine.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const str = (s) => String(s ?? "").trim();
const lines = (s) => str(s).split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const list = (s) => (Array.isArray(s) ? s : str(s).split(/[,\n]/)).map((x) => String(x).trim()).filter(Boolean);
const ldJSON = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;

// ---------- themes and contrast ----------

// Each theme: page background, card, body text, secondary text, accent (headings,
// links, button background), text on the accent, field border. Every text colour is
// checked against both backgrounds at WCAG AA (4.5:1) in site.test.mjs.
export const THEMES = {
  warm: { label: "Warm and classic", bg: "#fffaf6", card: "#ffffff", ink: "#2b2433", soft: "#5f5669", accent: "#9b3f68", onAccent: "#ffffff", line: "#eadfd8", field: "#8a7d88", font: "Georgia, 'Times New Roman', serif", head: "Georgia, 'Times New Roman', serif", radius: "14px" },
  bright: { label: "Bright and playful", bg: "#f2fbff", card: "#ffffff", ink: "#16243a", soft: "#3f5068", accent: "#0b6e4f", onAccent: "#ffffff", line: "#cfe8f2", field: "#6b8296", font: "system-ui, -apple-system, 'Segoe UI', sans-serif", head: "'Trebuchet MS', system-ui, sans-serif", radius: "22px" },
  simple: { label: "Simple and minimal", bg: "#ffffff", card: "#ffffff", ink: "#1a1a1a", soft: "#555555", accent: "#1f4e99", onAccent: "#ffffff", line: "#dddddd", field: "#767676", font: "system-ui, -apple-system, 'Segoe UI', sans-serif", head: "system-ui, -apple-system, 'Segoe UI', sans-serif", radius: "4px" },
};

function luminance(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// WCAG 2 contrast ratio between two "#rrggbb" colours, 1 to 21.
export function contrastRatio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
// The text/background pairs a theme draws, for the contrast check.
export function themePairs(t) {
  return [["ink", "bg"], ["ink", "card"], ["soft", "bg"], ["soft", "card"], ["accent", "bg"], ["accent", "card"], ["onAccent", "accent"]].map(([f, g]) => ({ pair: `${f} on ${g}`, ratio: contrastRatio(t[f], t[g]) }));
}

// ---------- the sitter's data, read once ----------

const isoish = (s) => /^\d{4}-\d{2}(-\d{2})?$/.test(s);
// "CPR and First Aid | 2026-03 | 2028-03" -> { name, earned, expires }
export function parseCerts(text) {
  return lines(text).map((l) => {
    const [name, earned = "", expires = ""] = l.split("|").map((x) => x.trim());
    return { name, earned: isoish(earned) ? earned : "", expires: isoish(expires) ? expires : "" };
  }).filter((c) => c.name);
}
// A certificate whose "valid through" month or day has passed is left off the site.
export function certCurrent(c, today) {
  if (!c.expires || !today) return true;
  return c.expires.length === 7 ? c.expires >= today.slice(0, 7) : c.expires >= today;
}
const monthName = (s) => {
  const [y, m] = s.split("-");
  return `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][Number(m) - 1] || ""} ${y}`.trim();
};

export function parseFaq(text) {
  return lines(text).map((l) => { const i = l.indexOf("|"); return i < 0 ? null : { q: l.slice(0, i).trim(), a: l.slice(i + 1).trim() }; }).filter((x) => x && x.q && x.a);
}

export function siteData(desk, { today } = {}) {
  const p = desk.profile;
  const s = p.site && typeof p.site === "object" ? p.site : {};
  const r = p.rates || {};
  const theme = THEMES[s.theme] ? s.theme : "warm";
  const dated = parseCerts(s.certs);
  const certs = dated.length ? dated.filter((c) => certCurrent(c, today)) : list(p.certifications).map((name) => ({ name, earned: "", expires: "" }));
  const towns = list(s.towns);
  const title = str(p.businessName) || `${str(p.name)} Babysitting`;
  const city = str(p.city);
  const url = /^https?:\/\/[^\s/]+/i.test(str(s.url)) ? str(s.url).replace(/\/+$/, "") : "";
  const rateLine = r.hourly ? `$${r.hourly}/hour for one child${r.extraChild ? `, plus $${r.extraChild}/hour for each additional child` : ""}.${r.minimumHours ? ` ${r.minimumHours}-hour minimum.` : ""}` : "";
  const extras = [r.lateAfter && r.lateExtra ? `After ${r.lateAfter}: +$${r.lateExtra}/hour.` : "", r.holidayMultiplier && Number(r.holidayMultiplier) !== 1 ? `Holidays: ${r.holidayMultiplier}× rate.` : "", r.lastMinuteFee && r.lastMinuteHours ? `Booked with less than ${r.lastMinuteHours} hours' notice: $${r.lastMinuteFee} extra.` : ""].filter(Boolean).join(" ");
  const cancelFromRates = r.cancelHours && r.cancelFeePct ? `Cancelling with less than ${r.cancelHours} hours' notice: ${r.cancelFeePct}% of the booked sit.` : "";
  const policies = [
    { id: "cancellation", h: "Cancellations", text: str(s.cancellation) || cancelFromRates },
    { id: "payment", h: "Payment", text: str(s.payment) },
    { id: "sick", h: "If your child is sick", text: str(s.sick) },
  ].filter((x) => x.text);
  const faq = [];
  if (rateLine) faq.push({ q: "How much do you charge?", a: `${rateLine}${extras ? ` ${extras}` : ""}` });
  if (p.youngestMonths !== "" && p.youngestMonths != null && p.maxKids) faq.push({ q: "What ages do you care for?", a: `Children ${fmtAge(p.youngestMonths)} and older, up to ${p.maxKids} at a time.` });
  if (towns.length) faq.push({ q: "Where do you babysit?", a: `${towns.join(", ")}.` });
  if (str(s.safety) || certs.length) faq.push({ q: "How do you keep children safe?", a: [str(s.safety), certs.length ? `I hold ${certs.map((c) => c.name).join(", ")}.` : ""].filter(Boolean).join(" ") });
  if (str(s.firstSit)) faq.push({ q: "What happens at the first sit?", a: str(s.firstSit) });
  for (const x of policies) faq.push({ q: { cancellation: "What is your cancellation policy?", payment: "How can I pay?", sick: "What if my child is sick?" }[x.id], a: x.text });
  faq.push(...parseFaq(s.faq));
  return {
    p, s, r, theme, t: THEMES[theme], certs, towns, title, city, url, rateLine, extras, policies, faq,
    sitSteps: lines(s.sitSteps),
    faith: p.showFaith && str(p.faithStatement) ? { statement: str(p.faithStatement), activities: str(p.faithActivities) } : null,
    quotes: publishableTestimonials(desk),
  };
}

// ---------- pages ----------

function css(t) {
  // Mobile first: one column and full-width buttons; wider screens get more air.
  return `:root{--bg:${t.bg};--card:${t.card};--ink:${t.ink};--soft:${t.soft};--accent:${t.accent};--on:${t.onAccent};--line:${t.line};--field:${t.field};--r:${t.radius}}
*{box-sizing:border-box}body{margin:0;font:17px/1.6 ${t.font};color:var(--ink);background:var(--bg)}
a{color:var(--accent)}main{padding:16px;max-width:760px;margin:auto}
.top{background:var(--card);border-bottom:1px solid var(--line);padding:10px 16px}.top a.brand{font:700 1.1rem ${t.head};text-decoration:none;color:var(--ink)}
nav ul{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:4px 14px}nav a{display:inline-block;padding:6px 0}nav a[aria-current]{font-weight:700;color:var(--ink)}
h1,h2,h3{font-family:${t.head};line-height:1.2}h1{font-size:1.8rem;margin:18px 0 4px}h2{color:var(--accent);font-size:1.35rem;margin:1.6em 0 .4em}h3{font-size:1.05rem;margin:1.1em 0 .2em}
.lede{color:var(--soft);margin:0 0 12px}.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:16px;margin:12px 0}
blockquote{margin:0 0 14px;font-style:italic}blockquote cite{display:block;font-style:normal;color:var(--soft);font-size:.9rem}
ul.towns{padding-left:1.2em;columns:2}ol.steps{padding-left:1.3em}ol.steps li{margin:.3em 0}
label{display:block;margin-top:12px;font-weight:600}input,textarea{width:100%;padding:11px;border:1px solid var(--field);border-radius:8px;font:inherit;background:#fff;color:#1a1a1a}
.btn,button{display:block;width:100%;margin-top:16px;background:var(--accent);color:var(--on);border:0;border-radius:8px;padding:13px 18px;font:inherit;font-weight:700;cursor:pointer;text-align:center;text-decoration:none}
.hp{position:absolute;left:-9999px}footer{color:var(--soft);font-size:.9rem;text-align:center;padding:28px 16px}
@media (min-width:700px){main{padding:28px 24px}h1{font-size:2.3rem}.top{display:flex;justify-content:space-between;align-items:center;padding:12px 24px}nav ul{margin:0}.btn,button{display:inline-block;width:auto}ul.towns{columns:3}}`;
}

function head(d, page, { title, description, extraLd = [] }) {
  const canonical = d.url ? `${d.url}/${page === "index.html" ? "" : page}` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ""}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ""}<meta property="og:site_name" content="${esc(d.title)}">
${[childCareLd(d), ...extraLd].map(ldJSON).join("\n")}
<style>${css(d.t)}</style>
</head>`;
}

export function childCareLd(d) {
  const { p, r } = d;
  return {
    "@context": "https://schema.org",
    "@type": "ChildCare",
    name: d.title,
    ...(str(p.bio) ? { description: str(p.bio) } : {}),
    ...(d.url ? { url: `${d.url}/` } : {}),
    areaServed: d.towns.length ? d.towns.map((name) => ({ "@type": "Place", name })) : str(p.area) || d.city,
    ...(str(p.phone) ? { telephone: str(p.phone) } : {}),
    ...(str(p.email) ? { email: str(p.email) } : {}),
    ...(d.city ? { address: { "@type": "PostalAddress", addressLocality: d.city } } : {}),
    ...(r.hourly ? { priceRange: `$${r.hourly}/hour` } : {}),
  };
}

const NAV = [["index.html", "Home"], ["about.html", "About"], ["policies.html", "Rates & policies"], ["faq.html", "FAQ"]];

function shell(d, page, meta, body) {
  const { p } = d;
  return `${head(d, page, meta)}
<body>
<header class="top"><a class="brand" href="index.html">${esc(d.title)}</a>
<nav aria-label="Site"><ul>${NAV.map(([f, label]) => `<li><a href="${f}"${f === page ? ' aria-current="page"' : ""}>${label}</a></li>`).join("")}<li><a href="index.html#ask">Ask about a sit</a></li></ul></nav></header>
<main>
${body}
</main>
<footer>${esc(d.title)}${d.city ? ` · ${esc(d.city)}` : ""}${str(p.phone) ? ` · <a href="tel:${esc(str(p.phone).replace(/[^\d+]/g, ""))}">${esc(p.phone)}</a>` : ""}${str(p.email) ? ` · <a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : ""}</footer>
</body></html>
`;
}

function form(d, formAction) {
  const { p } = d;
  const action = formAction ?? p.formAction ?? "";
  const tag = action
    ? `<form method="post" action="${esc(action)}">`
    : `<form onsubmit="event.preventDefault();var f=new FormData(this),b=[];f.forEach(function(v,k){if(k!=='website')b.push(k+': '+v)});location.href='mailto:${esc(p.email)}?subject='+encodeURIComponent('Babysitting inquiry')+'&body='+encodeURIComponent(b.join('\\n'))">`;
  return `<section id="ask"><h2>Ask about a sit</h2><div class="card">${tag}
<label for="n">Your name</label><input id="n" name="name" required autocomplete="name">
<label for="c">Phone or email</label><input id="c" name="contact" required>
<label for="k">Children's ages (e.g. 4, 18 months)</label><input id="k" name="kids">
<label for="s">When do you need a sitter? (e.g. Fri 18-23, or weekdays 15-18)</label><input id="s" name="schedule">
<label for="w">One-time or regular?</label><input id="w" name="wants">
<label for="h">How did you hear about me?</label><input id="h" name="source">
<label for="m">Anything else?</label><textarea id="m" name="notes" rows="3"></textarea>
<label class="hp" for="hp">Leave this empty</label><input class="hp" id="hp" name="website" tabindex="-1" autocomplete="off">
<button type="submit">Send</button></form></div></section>`;
}

const certLine = (c) => `${esc(c.name)}${c.earned ? `, since ${esc(monthName(c.earned))}` : ""}${c.expires ? ` (valid through ${esc(monthName(c.expires))})` : ""}`;
const faithBlock = (d) => (d.faith ? `<section><h2>My faith</h2><div class="card"><p>${esc(d.faith.statement)}</p>${d.faith.activities ? `<p>${esc(d.faith.activities)}</p>` : ""}</div></section>` : "");

// SEO title and description: business, "babysitter", town. Kept under ~60 and ~160 characters where the data allows.
export function seo(d) {
  const place = d.city || d.towns[0] || "";
  const title = place ? `${d.title}: babysitter in ${place}` : `${d.title}: babysitter`;
  const where = d.towns.length ? d.towns.slice(0, 4).join(", ") : str(d.p.area) || place;
  const description = [`${str(d.p.name)}, babysitter${where ? ` serving ${where}` : ""}.`, d.certs.length ? `${d.certs.map((c) => c.name).join(", ")}.` : "", d.r.hourly ? `$${d.r.hourly}/hour.` : "", "Ask about a sit online."].filter(Boolean).join(" ");
  return { title, description: description.length > 160 ? `${description.slice(0, 157).replace(/\s+\S*$/, "")}...` : description };
}

function home(d, formAction) {
  const { p } = d;
  const s = seo(d);
  return shell(d, "index.html", s, `<h1>${esc(d.title)}</h1>
<p class="lede">Babysitting for families in ${esc(d.towns.length ? d.towns.join(", ") : str(p.area) || d.city)}</p>
${str(p.bio) || d.certs.length ? `<section class="card">${str(p.bio) ? `<p>${esc(p.bio)}</p>` : ""}${d.certs.length ? `<p><strong>Certified:</strong> ${esc(d.certs.map((c) => c.name).join(", "))}</p>` : ""}</section>` : ""}
${d.rateLine ? `<section><h2>Rates</h2><div class="card"><p>${esc(d.rateLine)}</p>${d.extras ? `<p>${esc(d.extras)}</p>` : ""}${p.maxKids ? `<p>I care for children ${esc(fmtAge(p.youngestMonths))} and older, up to ${esc(p.maxKids)} at a time.</p>` : ""}<p><a href="policies.html">Cancellation, payment and sick-day policies</a></p></div></section>` : ""}
${d.towns.length ? `<section><h2>Where I babysit</h2><ul class="towns">${d.towns.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
${faithBlock(d)}
${d.quotes.length ? `<section><h2>What families say</h2><div class="card">${d.quotes.map((q) => `<blockquote>“${esc(q.quote)}”<cite>${esc(q.by)}${q.relation ? `, ${esc(q.relation)}` : ""}</cite></blockquote>`).join("")}</div></section>` : ""}
${form(d, formAction)}`);
}

function about(d) {
  const { p } = d;
  const datedCerts = d.certs.some((c) => c.earned || c.expires);
  return shell(d, "about.html", { title: `About ${str(p.name)}, babysitter${d.city ? ` in ${d.city}` : ""}`, description: seo(d).description }, `<h1>About me</h1>
${str(p.bio) ? `<div class="card"><p>${esc(p.bio)}</p></div>` : ""}
${d.sitSteps.length ? `<section><h2>What a sit looks like</h2><ol class="steps">${d.sitSteps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></section>` : ""}
${str(d.s.firstSit) ? `<section><h2>The first sit</h2><div class="card"><p>${esc(d.s.firstSit)}</p></div></section>` : ""}
${str(d.s.safety) ? `<section><h2>Safety</h2><div class="card"><p>${esc(d.s.safety)}</p></div></section>` : ""}
${d.certs.length ? `<section><h2>Certifications</h2><ul>${d.certs.map((c) => `<li>${datedCerts ? certLine(c) : esc(c.name)}</li>`).join("")}</ul></section>` : ""}
${faithBlock(d)}
<p><a class="btn" href="index.html#ask">Ask about a sit</a></p>`);
}

function policiesPage(d) {
  return shell(d, "policies.html", { title: `Rates and policies: ${d.title}`, description: seo(d).description }, `<h1>Rates and policies</h1>
${d.rateLine ? `<section><h2>Rates</h2><div class="card"><p>${esc(d.rateLine)}</p>${d.extras ? `<p>${esc(d.extras)}</p>` : ""}</div></section>` : ""}
${d.policies.map((x) => `<section><h2>${esc(x.h)}</h2><div class="card"><p>${esc(x.text)}</p></div></section>`).join("\n")}
<p><a class="btn" href="index.html#ask">Ask about a sit</a></p>`);
}

function faqPage(d) {
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: d.faq.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) };
  return shell(d, "faq.html", { title: `Babysitting questions answered: ${d.title}`, description: seo(d).description, extraLd: [ld] }, `<h1>Questions families ask</h1>
${d.faq.map((x) => `<h3>${esc(x.q)}</h3><p>${esc(x.a)}</p>`).join("\n")}
<p><a class="btn" href="index.html#ask">Ask about a sit</a></p>`);
}

// All the site's files. Pages with nothing from the sitter's data are left out.
export function buildSiteFiles(desk, { formAction, today } = {}) {
  const d = siteData(desk, { today });
  const files = { "index.html": home(d, formAction) };
  if (d.sitSteps.length || str(d.s.firstSit) || str(d.s.safety) || d.certs.length || str(d.p.bio)) files["about.html"] = about(d);
  if (d.rateLine || d.policies.length) files["policies.html"] = policiesPage(d);
  if (d.faq.length) files["faq.html"] = faqPage(d);
  // Drop nav links to pages that were not built.
  for (const f of Object.keys(files)) files[f] = files[f].replace(/<li><a href="(\w+\.html)"[^>]*>[^<]*<\/a><\/li>/g, (m, href) => (files[href] || href === f ? m : ""));
  const pages = Object.keys(files);
  files["robots.txt"] = `User-agent: *\nAllow: /\n${d.url ? `Sitemap: ${d.url}/sitemap.xml\n` : ""}`;
  if (d.url) files["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((f) => `  <url><loc>${esc(`${d.url}/${f === "index.html" ? "" : f}`)}</loc>${today ? `<lastmod>${esc(today)}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
  return files;
}

// What the Website tab tells the sitter is missing, in plain words.
export function siteGaps(desk, { today } = {}) {
  const d = siteData(desk, { today });
  const out = [];
  if (!d.url) out.push("Add your site's address to get a sitemap.xml and canonical links (search engines use them).");
  if (!d.towns.length) out.push("List the towns or neighborhoods you serve: they show on the home page and in search data.");
  if (!d.sitSteps.length) out.push('Describe "what a sit looks like" so parents know what to expect.');
  if (!d.policies.some((x) => x.id === "sick")) out.push("Add a sick-child policy.");
  if (!d.policies.some((x) => x.id === "payment")) out.push("Say how families can pay.");
  for (const c of parseCerts(d.s.certs)) if (!certCurrent(c, today)) out.push(`${c.name} expired (${c.expires}) and is hidden from your site until you renew it.`);
  if (!d.quotes.length) out.push("No testimonials yet: ask a family in the References tab (only quotes they agree to share appear).");
  return out;
}

// ---------- "get found locally" ----------

// Plain steps; the kit makes no claim about what any of them will bring in.
export const LOCAL_CHECKLIST = [
  { id: "nap", title: "Use the same name, phone and town everywhere", steps: "Copy your business name, phone and town exactly as they appear on your site into every listing below, so people and search engines can tell they are the same business." },
  { id: "gbp", title: "Google Business Profile", steps: "At business.google.com, create a profile with the category that fits your work (for example 'Babysitter'). You work at families' homes, so set it up as a service-area business: list your towns and hide your home address. Add your site's address and hours, then follow Google's verification steps." },
  { id: "nextdoor", title: "Nextdoor business page", steps: "From your Nextdoor account, create a business page, add your service area and link your site. Neighbors can then recommend you; ask families you sit for, rather than posting for recommendations yourself." },
  { id: "facebook", title: "Facebook page", steps: "Create a Page (not a personal profile) with your business name, link your site in the intro, and share the posts from the Content tab. Never post a child's name or photo without the parents' yes." },
  { id: "church", title: "Church directory or bulletin", steps: "Ask your church office whether members can list services in the directory, bulletin or noticeboard, and what they need from you. Follow their rules on what can be posted." },
  { id: "school", title: "School and parent-group directories", steps: "Ask the school office or parent-teacher group whether they keep a sitter list or newsletter classifieds. Many need parents to vouch for you, so ask a family you sit for." },
  { id: "cards", title: "Printed cards with your site's address", steps: "Leave a few cards with each family after a sit so they can pass your site on." },
];

// ---------- a store-only zip ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// files: { "name": string | Uint8Array }. date: a Date for the entries' timestamps.
// No compression ("stored"), which every unzip tool and hosting upload accepts.
export function zipFiles(files, date = new Date(Date.UTC(2026, 0, 1))) {
  const enc = new TextEncoder();
  const dosTime = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1);
  const dosDate = ((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = typeof content === "string" ? enc.encode(content) : content;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, centrals.length, true); ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) { out.set(part, at); at += part.length; }
  return out;
}
