// Monastery site: one config file in, a complete static website out.
//
// `buildSite(config)` returns { files: Map<path, string>, findings } with
// every page a monastery or convent website usually needs: home, about,
// horarium, vocations (with an inquiry form), giving, visiting and retreats,
// events, news, prayer requests, shop, contact and privacy, plus
// sitemap.xml, robots.txt and llms.txt. It is pure: no clock, no network,
// no file system, so the same config always builds the same site, in Node
// or in the browser.
//
// `checkSite(config)` is the launch checklist: what a visitor, a donor or
// a discerner would find missing or broken, as findings with a level
// (high, medium, low) and the page they belong to.
//
// Nothing here handles money. The giving page links to the community's own
// processor (a payment page, a donation platform, its bank) and prints the
// details for a cheque or a bequest exactly as the community typed them.

// ---------------------------------------------------------------- themes

/**
 * Palettes named for the habits and buildings they recall. Every pair a page
 * draws text on is checked to WCAG AA (4.5:1) in site.test.mjs.
 * bg page, surface cards, ink text, muted secondary text, accent links and
 * buttons, onAccent text on buttons, line borders, band the header band.
 */
export const THEMES = {
  benedictine: { label: "Benedictine black and parchment", bg: "#f6f1e7", surface: "#fffdf8", ink: "#1d1a16", muted: "#544c42", accent: "#7a1f1f", onAccent: "#ffffff", line: "#ddd2bf", band: "#1d1a16", onBand: "#f6f1e7" },
  cistercian: { label: "Cistercian white and stone", bg: "#f4f3ef", surface: "#ffffff", ink: "#22242a", muted: "#4f535c", accent: "#3c5a6e", onAccent: "#ffffff", line: "#d9d8d1", band: "#e6e3da", onBand: "#22242a" },
  franciscan: { label: "Franciscan brown and linen", bg: "#f5efe6", surface: "#fffaf3", ink: "#2b2118", muted: "#5b4b3b", accent: "#6b4423", onAccent: "#ffffff", line: "#e0d3c1", band: "#4a3220", onBand: "#f8efe2" },
  carmelite: { label: "Carmelite brown, cream and gold", bg: "#f7f1e3", surface: "#fffcf4", ink: "#2a1f16", muted: "#58483a", accent: "#7d4b12", onAccent: "#ffffff", line: "#e3d5b8", band: "#3e2a1a", onBand: "#f3dfa8" },
  dominican: { label: "Dominican white and black", bg: "#ffffff", surface: "#f7f7f5", ink: "#111111", muted: "#4a4a4a", accent: "#1f3b70", onAccent: "#ffffff", line: "#dcdcd8", band: "#111111", onBand: "#ffffff" },
  marian: { label: "Marian blue and white", bg: "#f3f6fa", surface: "#ffffff", ink: "#18222f", muted: "#475569", accent: "#1d4f91", onAccent: "#ffffff", line: "#d6dfeb", band: "#183a68", onBand: "#ffffff" },
};

export const KINDS = {
  monks: { members: "monks", superiorHint: "Abbot or Prior", house: "monastery" },
  nuns: { members: "nuns", superiorHint: "Abbess or Prioress", house: "monastery" },
  sisters: { members: "sisters", superiorHint: "Mother Superior or Prioress", house: "convent" },
  brothers: { members: "brothers", superiorHint: "Superior", house: "house" },
  friars: { members: "friars", superiorHint: "Guardian or Prior", house: "friary" },
};

/** WCAG relative-luminance contrast ratio of two #rrggbb colours. */
export function contrast(a, b) {
  const lum = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return NaN;
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The pairs of colours text is drawn in, as [foreground, background, where]. */
export function textPairs(t) {
  return [
    [t.ink, t.bg, "body text"], [t.ink, t.surface, "card text"],
    [t.muted, t.bg, "secondary text"], [t.muted, t.surface, "secondary text on cards"],
    [t.accent, t.bg, "links"], [t.accent, t.surface, "links on cards"],
    [t.onAccent, t.accent, "button text"], [t.onBand, t.band, "header text"],
  ];
}

export function themeFor(config) {
  const site = config.site || {};
  const base = THEMES[site.theme] || THEMES.benedictine;
  const t = { ...base };
  if (isHex(site.accent)) t.accent = site.accent;
  return t;
}

const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim());

// ---------------------------------------------------------------- text helpers

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

/** A link target the site may print: http(s), mailto, tel, or a relative path. Anything else is dropped. */
export function safeUrl(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return ""; // javascript:, data: and the rest
  if (s.startsWith("//")) return "";
  return s;
}

const list = (v) => (Array.isArray(v) ? v.filter((x) => x != null && x !== "") : v ? [v] : []);
const paras = (v) => list(v).map((p) => `<p>${esc(p)}</p>`).join("\n");
const text = (v) => String(v ?? "").trim();
const has = (v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v).length > 0 : text(v) !== "");

/** Money as the community typed it, or from a number with a currency. */
function money(n, currency = "USD") {
  if (typeof n !== "number" || !Number.isFinite(n)) return text(n);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString("en-US")}`;
  }
}

function addressLines(a) {
  if (!a) return [];
  if (typeof a === "string") return a.split(/\n|,\s*(?=\S)/).map((s) => s.trim()).filter(Boolean);
  return [a.street, [a.city, a.region].filter(Boolean).join(", ") + (a.postalCode ? ` ${a.postalCode}` : ""), a.country]
    .map((s) => text(s)).filter(Boolean);
}

const formatDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return text(iso);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
};

// ---------------------------------------------------------------- pages

/** Which pages a config produces, in menu order. A page with nothing to say is left out. */
export function pagesFor(config) {
  const c = config || {};
  const pages = [
    { path: "index.html", nav: "Home", key: "home" },
    { path: "about.html", nav: "Our life", key: "about" },
    { path: "horarium.html", nav: "Horarium", key: "horarium", when: has(c.horarium?.days) },
    { path: "vocations.html", nav: "Vocations", key: "vocations", when: c.vocations !== false },
    { path: "visit.html", nav: "Visit", key: "visit", when: has(c.visit) },
    { path: "events.html", nav: "Events", key: "events", when: has(c.events) },
    { path: "news.html", nav: "News", key: "news", when: has(c.news) },
    { path: "prayer.html", nav: "Prayer requests", key: "prayer", when: c.prayer !== false },
    { path: "shop.html", nav: "Shop", key: "shop", when: has(c.shop) },
    { path: "give.html", nav: "Give", key: "give", when: c.giving !== false },
    { path: "contact.html", nav: "Contact", key: "contact" },
    { path: "privacy.html", nav: "Privacy", key: "privacy", footerOnly: true },
  ];
  return pages.filter((p) => p.when === undefined || p.when);
}

function css(t) {
  return `:root{--bg:${t.bg};--surface:${t.surface};--ink:${t.ink};--muted:${t.muted};--accent:${t.accent};--on-accent:${t.onAccent};--line:${t.line};--band:${t.band};--on-band:${t.onBand};--arcade:url("data:image/svg+xml,${arcade(t.line)}")}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 "Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,serif}
a{color:var(--accent);text-underline-offset:.15em}
a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.skip{position:absolute;left:-9999px}.skip:focus{left:12px;top:12px;background:var(--surface);padding:8px 12px;z-index:10}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header.site{background:var(--band);color:var(--on-band)}
header.site .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 24px;padding-top:16px;padding-bottom:16px}
.brand{color:var(--on-band);text-decoration:none;display:flex;align-items:center;gap:12px}
.brand .mark{width:38px;height:38px;flex:none}
.brand strong{display:block;font-size:1.18rem;letter-spacing:.02em;line-height:1.2}
.brand span{display:block;font:13px/1.3 system-ui,sans-serif;opacity:.85;letter-spacing:.06em;text-transform:uppercase}
nav.main ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 16px;font:15px/1.4 system-ui,sans-serif}
nav.main a{color:var(--on-band);text-decoration:none;padding:4px 0;border-bottom:2px solid transparent}
nav.main a[aria-current=page],nav.main a:hover{border-bottom-color:currentColor}
nav.main a.give{border:1px solid currentColor;border-radius:999px;padding:3px 12px}
.hero{padding:56px 0 96px;border-bottom:1px solid var(--line);background:var(--arcade) bottom left/120px 64px repeat-x}
.hero.image{padding-bottom:64px;background-size:cover;background-position:center;color:#fff;padding:120px 0 64px;position:relative}
.hero.image::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.25),rgba(0,0,0,.65))}
.hero.image .wrap{position:relative}
.hero.image p.lede{color:#fff}
h1,h2,h3{font-weight:600;line-height:1.2;letter-spacing:.005em}
h1{font-size:clamp(2rem,5vw,3.1rem);margin:0 0 14px}
h2{font-size:clamp(1.4rem,3vw,1.85rem);margin:40px 0 12px}
h3{font-size:1.15rem;margin:22px 0 6px}
p.lede{font-size:1.2rem;max-width:44em;color:var(--muted)}
.kicker{font:13px/1.4 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;margin:0 0 10px}
main{padding:8px 0 56px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px;margin:18px 0}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:20px 22px}
.card h3,.card h2.t{margin-top:0}
h2.t{font-size:1.15rem;margin:0 0 6px}
.btn{display:inline-block;background:var(--accent);color:var(--on-accent);text-decoration:none;font:600 15px/1.2 system-ui,sans-serif;padding:12px 20px;border-radius:999px;border:0;cursor:pointer;margin:6px 8px 6px 0}
.btn.ghost{background:transparent;color:var(--accent);border:1px solid var(--accent)}
.hero.image .btn.ghost{color:#fff;border-color:#fff}
table{width:100%;border-collapse:collapse;font:15px/1.5 system-ui,sans-serif}
th,td{text-align:left;padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
th.time{font-size:15px;letter-spacing:0;text-transform:none;color:var(--ink);font-weight:400}
td.time,th.time{white-space:nowrap;font-variant-numeric:tabular-nums;width:6.5em}
.tag{font:12px/1 system-ui,sans-serif;border:1px solid var(--line);border-radius:999px;padding:3px 8px;color:var(--muted);white-space:nowrap}
.steps{counter-reset:s;list-style:none;padding:0}
.steps li{counter-increment:s;position:relative;padding:0 0 18px 52px}
.steps li::before{content:counter(s);position:absolute;left:0;top:0;width:36px;height:36px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;font:600 15px system-ui,sans-serif}
.meter{height:12px;background:var(--line);border-radius:999px;overflow:hidden;margin:10px 0}
.meter span{display:block;height:100%;background:var(--accent)}
details{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:10px 0}
summary{cursor:pointer;font-weight:600}
form.site label{display:block;font:600 14px/1.4 system-ui,sans-serif;margin:14px 0 5px}
form.site input,form.site select,form.site textarea{width:100%;font:16px/1.4 system-ui,sans-serif;padding:10px 12px;border:1px solid var(--muted);border-radius:8px;background:var(--surface);color:var(--ink)}
form.site .check{display:flex;gap:10px;align-items:flex-start;font-weight:400}
form.site .check input{width:auto;margin-top:4px}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.note{font:14px/1.5 system-ui,sans-serif;color:var(--muted)}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.gallery img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;display:block}
.banner{background:#fff3c4;color:#3d3000;font:14px/1.45 system-ui,sans-serif;padding:8px 0;text-align:center}
.banner a{color:#3d3000}
footer.site{border-top:1px solid var(--line);padding:32px 0 40px;font:14px/1.6 system-ui,sans-serif;color:var(--muted)}
footer.site .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px}
footer.site h2{font-size:14px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px;color:var(--ink)}
footer.site ul{list-style:none;padding:0;margin:0}
.menu-btn{display:none;background:transparent;color:var(--on-band);border:1px solid currentColor;border-radius:999px;font:600 14px system-ui,sans-serif;padding:6px 14px;cursor:pointer}
.grid.two{grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))}
@media (max-width:760px){header.site .wrap{align-items:center}.js .menu-btn{display:block}.js nav.main{display:none;width:100%}.js nav.main.open{display:block}nav.main ul{flex-direction:column;gap:2px;font-size:17px}nav.main a{display:block;padding:8px 0}nav.main a.give{display:inline-block;margin-top:6px}.hero{padding:36px 0 84px}.hero.image{padding:80px 0 40px}}
@media print{header.site,footer.site,.banner,form.site{display:none}}`;
}

// A Romanesque arcade drawn along the bottom of every page heading, in the
// theme's line colour: the cloister walk, recognisable without a photograph.
function arcade(colour) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 64'><g fill='none' stroke='${colour}' stroke-width='3'><path d='M6 64V30a24 24 0 0 1 48 0v34M66 64V30a24 24 0 0 1 48 0v34'/><path d='M0 64V18M60 64V18M120 64V18' stroke-width='6'/><path d='M0 15h120' stroke-width='2'/></g></svg>`;
  return encodeURIComponent(svg).replace(/'/g, "%27");
}

// A simple cross in a circle; the community can replace it with its own logo file.
const MARK = `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M18.4 8h3.2v8.4H30v3.2h-8.4V32h-3.2V19.6H10v-3.2h8.4z" fill="currentColor"/></svg>`;

function layout(c, page, pages, { title, description, body, jsonld = [] }) {
  const t = themeFor(c);
  const name = text(c.community?.name) || "Our community";
  const url = text(c.site?.url).replace(/\/+$/, "");
  const canonical = url ? `${url}/${page.path === "index.html" ? "" : page.path}` : "";
  const logo = safeUrl(c.site?.logo);
  const nav = pages.filter((p) => !p.footerOnly && p.key !== "home").map((p) =>
    `<li><a href="${p.path}"${p.key === page.key ? ' aria-current="page"' : ""}${p.key === "give" ? ' class="give"' : ""}>${esc(p.nav)}</a></li>`).join("");
  const sub = [c.community?.order, c.community?.place].map(text).filter(Boolean).join(" · ");
  const fictional = c.community?.fictional
    ? `<div class="banner" role="note">${c.community.fictional === true ? `This is a made-up example community, built to show what the <a href="https://marisstella.app/monastery-site/">free monastery site template</a> does. Every name, address and detail on it is fictional. No warranty: the template is provided as-is.` : esc(c.community.fictional)}</div>`
    : "";
  const where = [c.community?.order, c.community?.place].map(text).filter(Boolean).join(", ");
  const fullTitle = page.key === "home" ? text(c.site?.title) || `${name}${where ? ` | ${where}` : ""}` : `${title} | ${name}`;
  const ld = jsonld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`).join("\n");
  const social = list(c.social).map((s) => ({ label: text(s.label), url: safeUrl(s.url) })).filter((s) => s.label && s.url);
  const contact = c.contact || {};
  return `<!doctype html>
<html lang="${esc(text(c.site?.language) || "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">\n` : ""}<meta property="og:title" content="${esc(page.key === "home" ? name : `${title} | ${name}`)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">\n` : ""}${safeUrl(c.images?.hero?.src) && url ? `<meta property="og:image" content="${esc(absolute(url, c.images.hero.src))}">\n` : ""}<meta name="theme-color" content="${esc(t.band)}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="${t.band}"/><path d="M18.4 8h3.2v8.4H30v3.2h-8.4V32h-3.2V19.6H10v-3.2h8.4z" fill="${t.onBand}"/></svg>`)}">
<style>${css(t)}</style>
<script>document.documentElement.classList.add("js")</script>
${ld}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${fictional}
<header class="site"><div class="wrap">
<a class="brand" href="index.html">${logo ? `<img class="mark" src="${esc(logo)}" alt="">` : MARK}<span><strong>${esc(name)}</strong>${sub ? `<span>${esc(sub)}</span>` : ""}</span></a>
<button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
<nav class="main" id="site-nav" aria-label="Main"><ul>${nav}</ul></nav>
</div></header>
${body}
<footer class="site"><div class="wrap cols">
<div><h2>${esc(name)}</h2>${addressLines(contact.address).map((l) => esc(l)).join("<br>")}${contact.phone ? `<br><a href="tel:${esc(text(contact.phone).replace(/[^+\d]/g, ""))}">${esc(contact.phone)}</a>` : ""}${contact.email ? `<br><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : ""}</div>
<div><h2>Pages</h2><ul>${pages.filter((p) => p.key !== "home").map((p) => `<li><a href="${p.path}">${esc(p.nav)}</a></li>`).join("")}</ul></div>
${social.length ? `<div><h2>Follow</h2><ul>${social.map((s) => `<li><a href="${esc(s.url)}" rel="me noopener">${esc(s.label)}</a></li>`).join("")}</ul></div>` : ""}
<div><h2>Pray with us</h2><p>${esc(text(c.footer?.text) || "Please remember us in your prayers, as we remember you in ours.")}</p>${c.prayer !== false ? `<p><a href="prayer.html">Send a prayer request</a></p>` : ""}</div>
</div><div class="wrap"><p>${esc(text(c.footer?.legal) || `© ${name}`)}. <a href="privacy.html">Privacy</a>. Website built with the free, open-source <a href="https://marisstella.app/monastery-site/">monastery site template</a>.</p></div></footer>
${FORM_SCRIPT}
</body>
</html>
`;
}

const absolute = (base, src) => (/^https?:\/\//i.test(src) ? src : `${base}/${String(src).replace(/^\.?\//, "")}`);

function hero(c, { kicker, title, lede, actions = "", image = false }) {
  const img = image && c.images?.hero && safeUrl(c.images.hero.src);
  return `<section class="hero${img ? " image" : ""}"${img ? ` style="background-image:url('${esc(img).replace(/'/g, "%27")}')" role="img" aria-label="${esc(text(c.images.hero.alt))}"` : ""}><div class="wrap">
${kicker ? `<p class="kicker">${esc(kicker)}</p>` : ""}<h1>${esc(title)}</h1>
${lede ? `<p class="lede">${esc(lede)}</p>` : ""}${actions}
</div></section>`;
}

const main = (inner) => `<main id="main"><div class="wrap">\n${inner}\n</div></main>`;

// ---- forms

/**
 * A form posts to the community's own form endpoint (`forms.action`, for
 * example a Formspree, Basin, Netlify or Cloudflare Worker URL) when one is
 * set. Without one, the script below turns the filled-in form into an email
 * in the visitor's own mail program, addressed to the right person, so the
 * site works on day one with no account anywhere.
 */
function form(c, { id, to, subject, fields, submit, intro = "" }) {
  const action = safeUrl(c.forms?.action);
  const email = text(to) || text(c.contact?.email);
  const attrs = action
    ? `action="${esc(action)}" method="post"`
    : `action="mailto:${esc(email)}" method="post" enctype="text/plain" data-mailto="${esc(email)}" data-subject="${esc(subject)}"`;
  const rows = fields.map((f) => {
    const fid = `${id}-${f.name}`;
    const req = f.required ? " required" : "";
    const label = `${esc(f.label)}${f.required ? "" : ' <span class="note">(optional)</span>'}`;
    if (f.type === "checkbox") return `<label class="check"><input type="checkbox" id="${fid}" name="${esc(f.name)}" value="yes"${req}> <span>${esc(f.label)}</span></label>`;
    if (f.type === "textarea") return `<label for="${fid}">${label}</label><textarea id="${fid}" name="${esc(f.name)}" rows="${f.rows || 5}"${req}></textarea>`;
    if (f.type === "select") return `<label for="${fid}">${label}</label><select id="${fid}" name="${esc(f.name)}"${req}><option value="">Choose…</option>${f.options.map((o) => `<option>${esc(o)}</option>`).join("")}</select>`;
    return `<label for="${fid}">${label}</label><input type="${f.type || "text"}" id="${fid}" name="${esc(f.name)}"${f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ""}${f.min ? ` min="${f.min}"` : ""}${f.max ? ` max="${f.max}"` : ""}${req}>`;
  }).join("\n");
  return `<form class="site card" id="${id}" ${attrs}>
${intro}<input type="hidden" name="_subject" value="${esc(subject)}">
<div class="hp" aria-hidden="true"><label for="${id}-gotcha">Leave this empty</label><input type="text" id="${id}-gotcha" name="_gotcha" tabindex="-1" autocomplete="off"></div>
${rows}
<button class="btn" type="submit">${esc(submit)}</button>
<p class="note">${action ? "Your message is sent to the community through its form service." : `This opens your email program with the message ready to send to ${esc(email)}. Nothing is sent until you press send there.`} See <a href="privacy.html">privacy</a>.</p>
</form>`;
}

// Turns a mailto form into a real email (most browsers no longer post
// text/plain forms to mail programs), and hides past events.
const FORM_SCRIPT = `<script>
var mb=document.querySelector(".menu-btn"),nv=document.getElementById("site-nav");if(mb&&nv)mb.addEventListener("click",function(){var o=nv.classList.toggle("open");mb.setAttribute("aria-expanded",o?"true":"false");});
document.querySelectorAll("form[data-mailto]").forEach(function(f){f.addEventListener("submit",function(e){e.preventDefault();if(f.querySelector('[name="_gotcha"]').value)return;var lines=[];f.querySelectorAll("input,select,textarea").forEach(function(el){if(!el.name||el.name.charAt(0)==="_")return;if(el.type==="checkbox"){lines.push(el.labels[0].textContent.trim()+": "+(el.checked?"yes":"no"));return;}if(el.value){var l=el.labels&&el.labels[0]?el.labels[0].textContent.replace("(optional)","").trim():el.name;lines.push(l+": "+el.value);}});location.href="mailto:"+f.dataset.mailto+"?subject="+encodeURIComponent(f.dataset.subject)+"&body="+encodeURIComponent(lines.join("\\n\\n"));});});
var today=new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);document.querySelectorAll("[data-ends]").forEach(function(el){if(el.dataset.ends<today)el.hidden=true;});
document.querySelectorAll("[data-empty-when-past]").forEach(function(el){var shown=el.parentNode.querySelectorAll("[data-ends]:not([hidden])").length;el.hidden=shown>0;});
</script>`;

// ---- structured data

function orgLd(c) {
  const contact = c.contact || {};
  const a = contact.address;
  const url = text(c.site?.url);
  const o = {
    "@context": "https://schema.org",
    "@type": ["Organization", "PlaceOfWorship"],
    name: text(c.community?.name),
    description: text(c.community?.tagline) || undefined,
    url: url || undefined,
    email: text(contact.email) || undefined,
    telephone: text(contact.phone) || undefined,
    foundingDate: text(c.community?.founded) || undefined,
    address: a && typeof a === "object" ? { "@type": "PostalAddress", streetAddress: a.street, addressLocality: a.city, addressRegion: a.region, postalCode: a.postalCode, addressCountry: a.country } : undefined,
    sameAs: list(c.social).map((s) => safeUrl(s.url)).filter((u) => /^https?:/.test(u)),
  };
  const give = list(c.giving?.online)[0];
  if (give && safeUrl(give.url)) o.potentialAction = { "@type": "DonateAction", target: safeUrl(give.url), name: text(give.label) || "Donate" };
  if (!o.sameAs.length) delete o.sameAs;
  return o;
}

function eventLd(c, e) {
  const contact = c.contact || {};
  return {
    "@context": "https://schema.org", "@type": "Event", name: text(e.name), startDate: text(e.start), endDate: text(e.end) || undefined,
    description: text(e.text) || undefined, eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", eventStatus: "https://schema.org/EventScheduled",
    location: { "@type": "Place", name: text(e.location) || text(c.community?.name), address: addressLines(contact.address).join(", ") || undefined },
    organizer: { "@type": "Organization", name: text(c.community?.name), url: text(c.site?.url) || undefined },
    url: safeUrl(e.url) && /^https?:/.test(safeUrl(e.url)) ? safeUrl(e.url) : undefined,
  };
}

function faqLd(faq) {
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: text(f.q), acceptedAnswer: { "@type": "Answer", text: text(f.a) } })) };
}

// ---- individual pages

function upcoming(events) {
  return list(events).filter((e) => text(e.name) && /^\d{4}-\d{2}-\d{2}/.test(text(e.start))).sort((a, b) => text(a.start).localeCompare(text(b.start)));
}

function eventCard(e, h = "h3") {
  const when = text(e.end) && text(e.end) !== text(e.start) ? `${formatDate(e.start)} to ${formatDate(e.end)}` : formatDate(e.start);
  const link = safeUrl(e.url);
  return `<article class="card" data-ends="${esc(text(e.end) || text(e.start)).slice(0, 10)}"><p class="kicker">${esc(when)}${e.time ? ` · ${esc(e.time)}` : ""}</p><${h}${h === "h2" ? ' class="t"' : ""}>${esc(e.name)}</${h}>${e.location ? `<p class="note">${esc(e.location)}</p>` : ""}${paras(e.text)}${link ? `<p><a href="${esc(link)}">${esc(text(e.linkText) || "Details and registration")}</a></p>` : ""}</article>`;
}

const PAGE = {
  home(c, pages) {
    const k = KINDS[c.community?.kind] || KINDS.monks;
    const name = text(c.community?.name) || "Our community";
    const firstGive = list(c.giving?.online)[0];
    const actions = [
      c.vocations !== false ? `<a class="btn" href="vocations.html">${esc(text(c.home?.vocationsButton) || "Discern a vocation")}</a>` : "",
      c.giving !== false ? `<a class="btn ghost" href="give.html">${esc(text(c.home?.giveButton) || "Support our community")}</a>` : "",
    ].join("");
    const today = list(c.horarium?.days)[0];
    const ev = upcoming(c.events).slice(0, 3);
    const news = list(c.news).slice().sort((a, b) => text(b.date).localeCompare(text(a.date))).slice(0, 3);
    const camp = c.giving?.campaign;
    const body = `${hero(c, { kicker: text(c.community?.kicker) || (new RegExp(`\\b${k.members}\\b`, "i").test(text(c.community?.order)) ? text(c.community?.order) : [c.community?.order, k.members].map(text).filter(Boolean).join(" ")), title: text(c.home?.headline) || name, lede: text(c.home?.lede) || text(c.community?.tagline), actions, image: true })}
${main(`${has(c.home?.welcome) ? `<h2>${esc(text(c.home?.welcomeTitle) || "Welcome")}</h2>\n${paras(c.home.welcome)}` : ""}
<div class="grid two">
${today ? `<section class="card"><h2 class="t">Pray with us</h2><p class="note">${esc(today.label)}</p><table><tbody>${list(today.items).filter((i) => i.public !== false).slice(0, 6).map((i) => `<tr><th scope="row" class="time">${esc(i.time)}</th><td>${esc(i.name)}</td></tr>`).join("")}</tbody></table><p><a href="horarium.html">The full horarium</a></p></section>` : ""}
${c.vocations !== false ? `<section class="card"><h2 class="t">${esc(text(c.home?.vocationsTitle) || "Is God calling you?")}</h2>${paras(c.home?.vocationsText || `If you are wondering whether you are called to this life, we would be glad to hear from you. You can write to us, visit, or come to a discernment retreat.`)}<p><a href="vocations.html">Vocations</a></p></section>` : ""}
${c.giving !== false ? `<section class="card"><h2 class="t">${esc(text(c.home?.giveTitle) || "Support our life of prayer")}</h2>${paras(c.home?.giveText || `We live from the work of our hands and the generosity of our friends. Every gift, large or small, keeps the life of prayer going here.`)}${camp && Number(camp.goal) > 0 ? meter(camp) : ""}<p>${firstGive && safeUrl(firstGive.url) ? `<a href="${esc(safeUrl(firstGive.url))}">${esc(text(firstGive.label) || "Give online")}</a> · ` : ""}<a href="give.html">Ways to give</a></p></section>` : ""}
${c.prayer !== false ? `<section class="card"><h2 class="t">Prayer requests</h2><p>We pray every day for the intentions entrusted to us. Send us yours.</p><p><a href="prayer.html">Send a prayer request</a></p></section>` : ""}
</div>
${ev.length ? `<h2>Coming up</h2><div class="grid">${ev.map((e) => eventCard(e)).join("\n")}<p class="note" data-empty-when-past hidden>Nothing scheduled right now. Check back soon.</p></div><p><a href="events.html">All events</a></p>` : ""}
${news.length ? `<h2>News</h2><div class="grid">${news.map((n) => `<article class="card"><p class="kicker">${esc(formatDate(n.date))}</p><h3><a href="news.html#${slug(n.title)}">${esc(n.title)}</a></h3><p>${esc(list(n.body)[0] || "")}</p></article>`).join("\n")}</div>` : ""}
${gallery(c)}`)}`;
    return { title: name, description: text(c.home?.description) || [text(c.community?.tagline), `${name}: horarium, vocations, retreats and ways to support the community.`].filter(Boolean).join(" ").slice(0, 160), body, jsonld: [orgLd(c)] };
  },

  about(c) {
    const a = c.about || {};
    const name = text(c.community?.name);
    const facts = [["Order", c.community?.order], ["Founded", c.community?.founded], ["Patron", c.community?.patron], ["Diocese", c.community?.diocese], ["Motto", c.community?.motto], ["Superior", c.community?.superior]]
      .filter(([, v]) => text(v));
    const body = `${hero(c, { kicker: "Our life", title: text(a.title) || `About ${name}`, lede: text(a.lede) })}
${main(`${paras(a.intro)}
${facts.length ? `<div class="card"><table><tbody>${facts.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${esc(v)}</td></tr>`).join("")}</tbody></table></div>` : ""}
${has(a.charism) ? `<h2>Our charism</h2>${paras(a.charism)}` : ""}
${has(a.values) ? `<div class="grid">${list(a.values).map((v) => `<section class="card"><h2 class="t">${esc(v.title)}</h2>${paras(v.text)}</section>`).join("")}</div>` : ""}
${has(a.dailyLife) ? `<h2>A day in the ${esc((KINDS[c.community?.kind] || KINDS.monks).house)}</h2>${paras(a.dailyLife)}${has(c.horarium?.days) ? `<p><a href="horarium.html">See the horarium</a></p>` : ""}` : ""}
${has(a.history) ? `<h2>Our history</h2>${list(a.history).map((h) => (typeof h === "object" ? `<h3>${esc(h.year)}</h3>${paras(h.text)}` : `<p>${esc(h)}</p>`)).join("\n")}` : ""}
${has(a.community) ? `<h2>The community</h2><div class="grid">${list(a.community).map((m) => `<section class="card"><h3>${esc(m.name)}</h3>${m.role ? `<p class="note">${esc(m.role)}</p>` : ""}${paras(m.text)}</section>`).join("")}</div>` : ""}
${gallery(c)}`)}`;
    return { title: text(a.title) || "Our life", description: text(a.description) || `The life, charism and history of ${name}.`, body, jsonld: [orgLd(c)] };
  },

  horarium(c) {
    const h = c.horarium || {};
    const body = `${hero(c, { kicker: "Horarium", title: text(h.title) || "Our daily schedule", lede: text(h.lede) || "The hours of prayer and work that shape each day. Visitors are welcome at the times marked open to the public." })}
${main(`${paras(h.intro)}
<div class="grid">${list(h.days).map((d) => `<section class="card"><h2 style="margin-top:0;font-size:1.25rem">${esc(d.label)}</h2><table><thead><tr><th scope="col">Time</th><th scope="col">Hour</th><th scope="col"><span class="hp">Open to the public</span></th></tr></thead><tbody>${list(d.items).map((i) => `<tr><td class="time">${esc(i.time)}</td><td>${esc(i.name)}${i.note ? `<br><span class="note">${esc(i.note)}</span>` : ""}</td><td>${i.public ? '<span class="tag">Open to the public</span>' : ""}</td></tr>`).join("")}</tbody></table></section>`).join("\n")}</div>
${h.note ? `<p class="note">${esc(h.note)}</p>` : ""}
${safeUrl(c.media?.livestream) ? `<p><a class="btn" href="${esc(safeUrl(c.media.livestream))}">Pray with us on the livestream</a></p>` : ""}`)}`;
    return { title: "Horarium", description: `The daily horarium of ${text(c.community?.name)}: the Divine Office, Mass and the hours open to visitors.`, body };
  },

  vocations(c) {
    const v = c.vocations || {};
    const k = KINDS[c.community?.kind] || KINDS.monks;
    const d = v.director || {};
    const to = text(d.email) || text(c.contact?.vocationsEmail) || text(c.contact?.email);
    const faq = list(v.faq).filter((f) => text(f.q) && text(f.a));
    const kindWord = c.community?.kind === "monks" || c.community?.kind === "brothers" || c.community?.kind === "friars" ? "men" : "women";
    const body = `${hero(c, { kicker: "Vocations", title: text(v.title) || "Is God calling you to this life?", lede: text(v.lede) || `We welcome ${kindWord} who are discerning a call to religious life. The first step is simply to write to us.`, actions: `<a class="btn" href="#inquiry">Write to the vocation director</a>${has(v.retreats) ? `<a class="btn ghost" href="#retreats">Come and see</a>` : ""}` })}
${main(`${paras(v.intro)}
${has(v.requirements) ? `<h2>${esc(text(v.requirementsTitle) || "Who may apply")}</h2><div class="card"><ul>${list(v.requirements).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${v.requirementsNote ? `<p class="note">${esc(v.requirementsNote)}</p>` : ""}</div>` : ""}
${has(v.stages) ? `<h2>${esc(text(v.stagesTitle) || "The path of formation")}</h2><ol class="steps">${list(v.stages).map((s) => `<li><h3 style="margin-top:4px">${esc(s.name)}${s.duration ? ` <span class="tag">${esc(s.duration)}</span>` : ""}</h3>${paras(s.text)}</li>`).join("")}</ol>` : ""}
${has(v.retreats) ? `<h2 id="retreats">${esc(text(v.retreatsTitle) || "Come and see")}</h2><div class="grid">${list(v.retreats).map((r) => `<section class="card"${/^\d{4}-\d{2}-\d{2}/.test(text(r.end) || text(r.start)) ? ` data-ends="${esc((text(r.end) || text(r.start)).slice(0, 10))}"` : ""}><h3>${esc(r.name)}</h3>${r.start ? `<p class="kicker">${esc(r.end && r.end !== r.start ? `${formatDate(r.start)} to ${formatDate(r.end)}` : formatDate(r.start))}</p>` : r.when ? `<p class="kicker">${esc(r.when)}</p>` : ""}${paras(r.text)}</section>`).join("")}</div>` : ""}
${has(v.stories) ? `<h2>${esc(text(v.storiesTitle) || "How we came here")}</h2><div class="grid">${list(v.stories).map((s) => `<blockquote class="card"><p>${esc(s.text)}</p><footer class="note">${esc(s.name)}</footer></blockquote>`).join("")}</div>` : ""}
${faq.length ? `<h2>Questions people ask</h2>${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n")}` : ""}
<h2 id="inquiry">Write to us</h2>
${text(d.name) ? `<p>${esc(d.name)}${d.title ? `, ${esc(d.title)}` : ""}, reads every letter.${to ? ` You can also write directly to <a href="mailto:${esc(to)}">${esc(to)}</a>` : ""}${d.phone ? ` or call <a href="tel:${esc(text(d.phone).replace(/[^+\d]/g, ""))}">${esc(d.phone)}</a>` : ""}.</p>` : to ? `<p>You can also write directly to <a href="mailto:${esc(to)}">${esc(to)}</a>.</p>` : ""}
${form(c, {
      id: "vocation", to, subject: `Vocation inquiry: ${text(c.community?.name)}`, submit: "Send my inquiry",
      fields: [
        { name: "name", label: "Your name", required: true, autocomplete: "name" },
        { name: "email", label: "Email", type: "email", required: true, autocomplete: "email" },
        { name: "phone", label: "Phone", type: "tel", autocomplete: "tel" },
        { name: "age", label: "Age", type: "number", min: "14", max: "99" },
        { name: "location", label: "Where you live (city, country)", autocomplete: "address-level2" },
        { name: "state", label: "Where you are now", type: "select", options: list(v.stateOptions).length ? list(v.stateOptions) : ["In high school", "In college or university", "Working", "In the seminary or another community", "Other"] },
        { name: "catholic", label: "Are you a practising Catholic?", type: "select", options: ["Yes, baptised and confirmed", "Yes, baptised, not yet confirmed", "I am becoming Catholic", "Other"] },
        { name: "visit", label: "Would you like to visit?", type: "select", options: ["Yes, as soon as possible", has(v.retreats) ? "Yes, at a Come and See retreat" : "Yes, later on", "Not yet, I would like to write first"] },
        { name: "message", label: `Tell us a little about yourself and what draws you to the ${k.house}`, type: "textarea", required: true, rows: 7 },
        { name: "consent", label: "I agree that the community may keep my message to reply to me and to accompany my discernment.", type: "checkbox", required: true },
      ],
    })}`)}`;
    return { title: "Vocations", description: text(v.description) || `Discerning a vocation with ${text(c.community?.name)}: who may apply, the stages of formation, Come and See retreats and how to write to the vocation director.`.slice(0, 160), body, jsonld: faq.length ? [faqLd(faq)] : [] };
  },

  give(c) {
    const g = c.giving || {};
    const online = list(g.online).map((o) => ({ ...o, url: safeUrl(o.url) })).filter((o) => o.url);
    const contact = c.contact || {};
    const chequeTo = text(g.check?.payableTo) || text(g.legalName) || text(c.community?.name);
    const chequeAddr = addressLines(g.check?.address || contact.address);
    const pg = g.plannedGiving || {};
    const camp = g.campaign;
    const body = `${hero(c, { kicker: "Give", title: text(g.title) || "Support our life of prayer", lede: text(g.lede) || "Your gifts provide for the community's daily needs, the care of our elderly members, the formation of new vocations and the upkeep of the house.", actions: online.length ? `<a class="btn" href="${esc(online[0].url)}">${esc(text(online[0].label) || "Give online")}</a>` : "" })}
${main(`${paras(g.intro)}
${camp && text(camp.name) ? `<section class="card"><p class="kicker">Campaign</p><h2 style="margin-top:0">${esc(camp.name)}</h2>${paras(camp.text)}${Number(camp.goal) > 0 ? meter(camp) : ""}${safeUrl(camp.url) ? `<p><a class="btn" href="${esc(safeUrl(camp.url))}">Give to the campaign</a></p>` : ""}</section>` : ""}
<h2>Ways to give</h2>
<div class="grid">
${online.length ? `<section class="card"><h3>Online</h3><p>${esc(text(g.onlineText) || "Give securely online by card, bank transfer or wallet. A monthly gift is the steadiest help you can give.")}</p>${online.map((o, i) => `<p><a class="btn${i ? " ghost" : ""}" href="${esc(o.url)}">${esc(text(o.label) || "Give online")}</a>${o.recurring ? ' <span class="tag">Monthly gifts</span>' : ""}</p>`).join("")}</section>` : ""}
${chequeTo && chequeAddr.length && g.check !== false ? `<section class="card"><h3>By cheque</h3><p>Please make cheques payable to <strong>${esc(chequeTo)}</strong> and send them to:</p><p>${chequeAddr.map(esc).join("<br>")}</p>${g.check?.memo ? `<p class="note">${esc(g.check.memo)}</p>` : ""}</section>` : ""}
${has(g.bank) ? `<section class="card"><h3>Bank transfer</h3>${paras(g.bank)}</section>` : ""}
${has(g.massIntentions) ? `<section class="card"><h3>${esc(text(g.massIntentions.title) || "Mass intentions and enrollments")}</h3>${paras(g.massIntentions.text)}${safeUrl(g.massIntentions.url) ? `<p><a href="${esc(safeUrl(g.massIntentions.url))}">${esc(text(g.massIntentions.linkText) || "Request a Mass")}</a></p>` : ""}</section>` : ""}
${list(g.otherWays).map((w) => `<section class="card"><h3>${esc(w.title)}</h3>${paras(w.text)}${safeUrl(w.url) ? `<p><a href="${esc(safeUrl(w.url))}">${esc(text(w.linkText) || "Learn more")}</a></p>` : ""}</section>`).join("\n")}
</div>
${has(g.needs) ? `<h2>${esc(text(g.needsTitle) || "Our current needs")}</h2><div class="grid">${list(g.needs).map((n) => `<section class="card"><h3>${esc(n.title)}</h3>${paras(n.text)}${safeUrl(n.url) ? `<p><a href="${esc(safeUrl(n.url))}">${esc(text(n.linkText) || "Help with this")}</a></p>` : ""}</section>`).join("")}</div>` : ""}
${has(pg) ? `<h2>${esc(text(pg.title) || "Remember us in your will")}</h2><div class="card">${paras(pg.text || "A bequest is a lasting way to support the life of prayer here. Please speak with your own attorney or adviser. For a will or beneficiary designation you will need our legal name and address below.")}${text(pg.legalName) || text(g.legalName) ? `<p><strong>Legal name:</strong> ${esc(text(pg.legalName) || text(g.legalName))}</p>` : ""}${text(pg.taxId) || text(g.taxId) ? `<p><strong>Tax ID:</strong> ${esc(text(pg.taxId) || text(g.taxId))}</p>` : ""}${addressLines(contact.address).length ? `<p><strong>Address:</strong> ${addressLines(contact.address).map(esc).join(", ")}</p>` : ""}${pg.contact ? `<p>${esc(pg.contact)}</p>` : ""}</div>` : ""}
${text(g.taxStatement) ? `<p class="note">${esc(g.taxStatement)}</p>` : ""}
${has(g.faq) ? `<h2>Questions about giving</h2>${list(g.faq).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("\n")}` : ""}
<p class="note">Questions about a gift? Write to <a href="mailto:${esc(text(g.email) || text(contact.email))}">${esc(text(g.email) || text(contact.email))}</a>.</p>`)}`;
    const faq = list(g.faq).filter((f) => text(f.q) && text(f.a));
    return { title: "Give", description: text(g.description) || `Ways to support ${text(c.community?.name)}: online gifts, monthly giving, cheques, Mass intentions, current needs and bequests.`.slice(0, 160), body, jsonld: [orgLd(c), ...(faq.length ? [faqLd(faq)] : [])] };
  },

  visit(c) {
    const v = c.visit || {};
    const gh = v.guesthouse || {};
    const to = text(gh.email) || text(c.contact?.guestEmail) || text(c.contact?.email);
    const map = safeUrl(c.contact?.mapUrl);
    const body = `${hero(c, { kicker: "Visit", title: text(v.title) || "Visit us", lede: text(v.lede) || "Guests are received as Christ. You are welcome to join us for Mass and the Divine Office, or to stay for a few days of quiet." })}
${main(`${paras(v.intro)}
<div class="grid">
${has(v.publicPrayer) ? `<section class="card"><h2 class="t">Mass and the Office</h2>${paras(v.publicPrayer)}${has(c.horarium?.days) ? `<p><a href="horarium.html">Times of prayer</a></p>` : ""}</section>` : ""}
${has(gh) ? `<section class="card"><h2 class="t">${esc(text(gh.title) || "The guesthouse")}</h2>${paras(gh.text)}${has(gh.details) ? `<ul>${list(gh.details).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}${safeUrl(gh.bookingUrl) ? `<p><a class="btn" href="${esc(safeUrl(gh.bookingUrl))}">Book a stay</a></p>` : to ? `<p><a class="btn" href="#stay">Ask about a stay</a></p>` : ""}</section>` : ""}
${has(v.directions) || map ? `<section class="card"><h2 class="t">Getting here</h2>${addressLines(c.contact?.address).length ? `<p>${addressLines(c.contact.address).map(esc).join("<br>")}</p>` : ""}${paras(v.directions)}${map ? `<p><a href="${esc(map)}">Open in a map</a></p>` : ""}</section>` : ""}
${has(v.etiquette) ? `<section class="card"><h2 class="t">${esc(text(v.etiquetteTitle) || "While you are here")}</h2><ul>${list(v.etiquette).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>` : ""}
</div>
${has(v.retreats) ? `<h2>Retreats</h2><div class="grid">${list(v.retreats).map((r) => `<section class="card"><h3>${esc(r.name)}</h3>${r.when ? `<p class="kicker">${esc(r.when)}</p>` : ""}${paras(r.text)}</section>`).join("")}</div>` : ""}
${has(gh) && !safeUrl(gh.bookingUrl) ? `<h2 id="stay">Ask about a stay</h2>${form(c, {
      id: "stayform", to, subject: `Guesthouse request: ${text(c.community?.name)}`, submit: "Send my request",
      fields: [
        { name: "name", label: "Your name", required: true, autocomplete: "name" },
        { name: "email", label: "Email", type: "email", required: true, autocomplete: "email" },
        { name: "phone", label: "Phone", type: "tel", autocomplete: "tel" },
        { name: "arrive", label: "Arriving", type: "date", required: true },
        { name: "leave", label: "Leaving", type: "date", required: true },
        { name: "guests", label: "Number of guests", type: "number", min: "1", max: "40" },
        { name: "message", label: "Anything we should know (a retreat you are making, a diet, access needs)", type: "textarea" },
      ],
    })}` : ""}`)}`;
    return { title: "Visit", description: text(v.description) || `Visiting ${text(c.community?.name)}: Mass and the Office, the guesthouse, retreats and directions.`.slice(0, 160), body };
  },

  events(c) {
    const ev = upcoming(c.events);
    const body = `${hero(c, { kicker: "Events", title: "Events and retreats", lede: text(c.eventsLede) || "Feasts, retreats and days of recollection open to friends of the community." })}
${main(`<div class="grid">${ev.map((e) => eventCard(e, "h2")).join("\n")}<p class="note" data-empty-when-past hidden>Nothing scheduled right now. Check back soon, or write to us.</p></div>`)}`;
    return { title: "Events", description: `Upcoming feasts, retreats and events at ${text(c.community?.name)}.`, body, jsonld: ev.map((e) => eventLd(c, e)) };
  },

  news(c) {
    const items = list(c.news).slice().sort((a, b) => text(b.date).localeCompare(text(a.date)));
    const body = `${hero(c, { kicker: "News", title: text(c.newsTitle) || "News from the community" })}
${main(`${items.map((n) => `<article class="card" id="${slug(n.title)}" style="margin:18px 0"><p class="kicker">${esc(formatDate(n.date))}${n.author ? ` · ${esc(n.author)}` : ""}</p><h2 style="margin-top:0">${esc(n.title)}</h2>${paras(n.body)}</article>`).join("\n")}
${safeUrl(c.newsletter?.url) ? `<div class="card"><h3>${esc(text(c.newsletter.title) || "Our newsletter")}</h3>${paras(c.newsletter.text || "Letters from the community a few times a year.")}<p><a class="btn" href="${esc(safeUrl(c.newsletter.url))}">Sign up</a></p></div>` : ""}`)}`;
    return { title: "News", description: `News and letters from ${text(c.community?.name)}.`, body,
      jsonld: items.slice(0, 10).map((n) => ({ "@context": "https://schema.org", "@type": "NewsArticle", headline: text(n.title), datePublished: text(n.date), author: { "@type": n.author ? "Person" : "Organization", name: text(n.author) || text(c.community?.name) } })) };
  },

  prayer(c) {
    const p = c.prayer || {};
    const to = text(p.email) || text(c.contact?.email);
    const body = `${hero(c, { kicker: "Prayer requests", title: text(p.title) || "Send us your prayer intentions", lede: text(p.lede) || "Every intention sent to us is remembered in our prayer. You do not need to give your name." })}
${main(`${paras(p.intro)}
${form(c, {
      id: "prayer", to, subject: `Prayer request: ${text(c.community?.name)}`, submit: "Send my intention",
      fields: [
        { name: "intention", label: "Your intention", type: "textarea", required: true, rows: 6 },
        { name: "name", label: "Your first name", autocomplete: "given-name" },
        { name: "email", label: "Email, if you would like a reply", type: "email", autocomplete: "email" },
      ],
    })}
${has(p.after) ? paras(p.after) : `<p class="note">We do not publish intentions or share them with anyone outside the community.</p>`}`)}`;
    return { title: "Prayer requests", description: `Send a prayer intention to ${text(c.community?.name)}. Every intention is remembered in the community's prayer.`.slice(0, 160), body };
  },

  shop(c) {
    const s = c.shop || {};
    const body = `${hero(c, { kicker: "Shop", title: text(s.title) || "From our workshop", lede: text(s.lede) || "We support ourselves by the work of our hands. Every purchase helps the community.", actions: safeUrl(s.url) ? `<a class="btn" href="${esc(safeUrl(s.url))}">${esc(text(s.linkText) || "Visit the shop")}</a>` : "" })}
${main(`${paras(s.intro)}
<div class="grid">${list(s.items).map((i) => `<section class="card">${safeUrl(i.image) ? `<img src="${esc(safeUrl(i.image))}" alt="${esc(text(i.alt))}" loading="lazy" style="width:100%;border-radius:8px">` : ""}<h2 class="t">${esc(i.name)}</h2>${paras(i.text)}${safeUrl(i.url) ? `<p><a href="${esc(safeUrl(i.url))}">${esc(text(i.linkText) || "Order")}</a></p>` : ""}</section>`).join("")}</div>
${has(s.hours) ? `<p class="note">${esc(s.hours)}</p>` : ""}`)}`;
    return { title: "Shop", description: text(s.description) || `Goods made by ${text(c.community?.name)}. Every purchase supports the community.`, body };
  },

  contact(c) {
    const ct = c.contact || {};
    const map = safeUrl(ct.mapUrl);
    const rows = [
      ["General", ct.email], ["Vocations", ct.vocationsEmail || c.vocations?.director?.email], ["Guesthouse", ct.guestEmail || c.visit?.guesthouse?.email], ["Giving", c.giving?.email],
    ].filter(([, e]) => text(e));
    const body = `${hero(c, { kicker: "Contact", title: "Contact us" })}
${main(`<div class="grid">
<section class="card"><h2 class="t">Write or call</h2>${addressLines(ct.address).length ? `<p>${addressLines(ct.address).map(esc).join("<br>")}</p>` : ""}${ct.phone ? `<p><a href="tel:${esc(text(ct.phone).replace(/[^+\d]/g, ""))}">${esc(ct.phone)}</a>${ct.phoneHours ? `<br><span class="note">${esc(ct.phoneHours)}</span>` : ""}</p>` : ""}${map ? `<p><a href="${esc(map)}">Open in a map</a></p>` : ""}</section>
${rows.length ? `<section class="card"><h2 class="t">Email</h2><table><tbody>${rows.map(([k, e]) => `<tr><th scope="row">${k}</th><td><a href="mailto:${esc(e)}">${esc(e)}</a></td></tr>`).join("")}</tbody></table></section>` : ""}
</div>
<h2>Send a message</h2>
${form(c, {
      id: "contact", to: ct.email, subject: `Message for ${text(c.community?.name)}`, submit: "Send",
      fields: [
        { name: "name", label: "Your name", required: true, autocomplete: "name" },
        { name: "email", label: "Email", type: "email", required: true, autocomplete: "email" },
        { name: "message", label: "Message", type: "textarea", required: true },
      ],
    })}`)}`;
    return { title: "Contact", description: `How to reach ${text(c.community?.name)}: address, phone, email for vocations, the guesthouse and giving.`.slice(0, 160), body, jsonld: [orgLd(c)] };
  },

  privacy(c) {
    const name = text(c.community?.name);
    const action = safeUrl(c.forms?.action);
    const body = `${hero(c, { kicker: "Privacy", title: "Privacy" })}
${main(`<p>This website is run by ${esc(name)}. This page says what happens to what you send us.</p>
<h2>Forms</h2>
<p>${action ? `The vocation, prayer, guesthouse and contact forms send what you type to the community through a form service (${esc(new URL(action, "https://x.invalid").hostname)}), which passes it on to us by email.` : "The vocation, prayer, guesthouse and contact forms do not send anything by themselves: they open your own email program with your message ready, and nothing leaves your device until you press send there."} We use what you send only to reply to you, to pray for your intention, or, for a vocation inquiry, to accompany your discernment. We do not sell it or share it outside the community.</p>
<h2>Gifts</h2>
<p>Online gifts are made on our payment provider's own pages, under its privacy policy. We receive your name, contact details and gift so we can thank you and, where the law allows, send a receipt.</p>
<h2>Cookies and tracking</h2>
<p>${esc(text(c.privacy?.tracking) || "This website sets no cookies of its own and uses no analytics. Pages that link to a payment provider, a map, a video or a shop take you to that service, which has its own policy.")}</p>
<h2>Your rights</h2>
<p>You can ask us at any time what we hold about you, or ask us to correct or delete it, by writing to <a href="mailto:${esc(text(c.contact?.email))}">${esc(text(c.contact?.email))}</a>.</p>
${paras(c.privacy?.extra)}`)}`;
    return { title: "Privacy", description: `What ${name} does with what you send through this website.`, body };
  },
};

function meter(camp) {
  const goal = Number(camp.goal), raised = Math.max(0, Number(camp.raised) || 0);
  const pct = Math.min(100, Math.round((raised / goal) * 100));
  return `<div class="meter" role="img" aria-label="${pct}% of the goal raised"><span style="width:${pct}%"></span></div><p class="note">${esc(money(raised, camp.currency))} of ${esc(money(goal, camp.currency))}${camp.asOf ? ` as of ${esc(formatDate(camp.asOf))}` : ""}</p>`;
}

function gallery(c) {
  const imgs = list(c.images?.gallery).map((g) => ({ src: safeUrl(g.src), alt: text(g.alt) })).filter((g) => g.src);
  return imgs.length ? `<h2>${esc(text(c.images?.galleryTitle) || "Photographs")}</h2><div class="gallery">${imgs.map((g) => `<img src="${esc(g.src)}" alt="${esc(g.alt)}" loading="lazy">`).join("")}</div>` : "";
}

export const slug = (s) => String(s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";

// ---------------------------------------------------------------- build

/**
 * Build every page. Returns { files: Map<path, contents>, pages, findings }.
 * `notFound: false` leaves out 404.html, for a copy served inside another site
 * (the demos in the catalogue), where nothing links to it.
 */
export function buildSite(config, { notFound = true } = {}) {
  const c = normalize(config);
  const pages = pagesFor(c);
  const files = new Map();
  for (const p of pages) {
    const out = PAGE[p.key](c, pages);
    files.set(p.path, layout(c, p, pages, out));
  }
  const url = text(c.site?.url).replace(/\/+$/, "");
  files.set("robots.txt", `User-agent: *\nAllow: /\n${url ? `Sitemap: ${url}/sitemap.xml\n` : ""}`);
  files.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${esc(url ? `${url}/${p.path === "index.html" ? "" : p.path}` : `./${p.path}`)}</loc></url>`).join("\n")}\n</urlset>\n`);
  files.set("llms.txt", llms(c, pages));
  if (notFound) files.set("404.html", layout(c, { path: "404.html", key: "404" }, pages, {
    title: "Page not found", description: "This page could not be found.",
    body: `${hero(c, { title: "This page could not be found", lede: "It may have moved. The links above lead to every page on the site." })}${main(`<p><a class="btn" href="index.html">Go to the home page</a></p>`)}`,
  }));
  return { files, pages, findings: checkSite(c) };
}

function llms(c, pages) {
  const name = text(c.community?.name);
  const ct = c.contact || {};
  const lines = [`# ${name}`, "", `> ${text(c.community?.tagline) || `${text(c.community?.order)} ${(KINDS[c.community?.kind] || KINDS.monks).members}`.trim()}`, ""];
  const facts = [["Order", c.community?.order], ["Place", c.community?.place], ["Founded", c.community?.founded], ["Diocese", c.community?.diocese], ["Address", addressLines(ct.address).join(", ")], ["Email", ct.email], ["Vocations", ct.vocationsEmail || c.vocations?.director?.email], ["Phone", ct.phone]].filter(([, v]) => text(v));
  lines.push(...facts.map(([k, v]) => `- ${k}: ${text(v)}`), "", "## Pages", "");
  const blurb = { home: "welcome, times of prayer, coming events", about: "charism, daily life and history", horarium: "the daily schedule of prayer, with the hours open to the public", vocations: "who may apply, the stages of formation, Come and See retreats, the inquiry form", visit: "Mass, the guesthouse, retreats and directions", events: "upcoming feasts and retreats", news: "news and letters", prayer: "send a prayer intention", shop: "goods the community makes", give: "online giving, cheques, Mass intentions, current needs, bequests", contact: "address, phone and email", privacy: "what the site does with what you send" };
  lines.push(...pages.map((p) => `- [${p.nav}](${p.path}): ${blurb[p.key] || ""}`));
  return lines.join("\n") + "\n";
}

/** Fill gaps a hand-written config often leaves, without inventing facts. */
export function normalize(config) {
  const c = structuredClone(config || {});
  c.community = c.community || {};
  c.site = c.site || {};
  c.contact = c.contact || {};
  if (!KINDS[c.community.kind]) c.community.kind = "monks";
  return c;
}

// ---------------------------------------------------------------- launch checklist

/**
 * What would stop a visitor, a donor or a discerner, as findings:
 * { level: "high" | "medium" | "low", page, message }.
 * High means a page would be broken or misleading; medium means a feature a
 * good community site has is missing; low is polish.
 */
export function checkSite(config) {
  const c = normalize(config);
  const f = [];
  const add = (level, page, message) => f.push({ level, page, message });
  const ct = c.contact;
  if (!text(c.community.name)) add("high", "all", "The community has no name (community.name).");
  if (!text(ct.email)) add("high", "contact", "No general email address (contact.email). The forms and the contact page need one.");
  else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text(ct.email))) add("high", "contact", `contact.email "${text(ct.email)}" does not look like an email address.`);
  if (!addressLines(ct.address).length) add("medium", "contact", "No postal address (contact.address). Visitors, cheques and bequests need one.");
  if (!text(c.site.url)) add("low", "all", "No site address (site.url). Set it once the domain is chosen, so search engines get canonical links and a sitemap with full URLs.");
  else if (!/^https:\/\//.test(text(c.site.url))) add("medium", "all", "site.url should start with https://.");
  if (text(c.site.theme) && !THEMES[c.site.theme]) add("low", "all", `Unknown theme "${c.site.theme}"; using benedictine. Themes: ${Object.keys(THEMES).join(", ")}.`);
  if (text(c.site.accent)) {
    if (!isHex(c.site.accent)) add("medium", "all", `site.accent "${c.site.accent}" is not a #rrggbb colour; it is ignored.`);
    else {
      const t = themeFor(c);
      for (const [fg, bg, where] of textPairs(t)) {
        const r = contrast(fg, bg);
        if (r < 4.5) add("medium", "all", `With accent ${c.site.accent}, ${where} has a contrast of ${r.toFixed(2)}:1, under the 4.5:1 that people with low vision need. Pick a darker accent.`);
      }
    }
  }

  // Forms
  const action = text(c.forms?.action);
  if (action && !/^https:\/\//.test(action)) add("high", "forms", "forms.action must be an https:// address, or the forms would send in the clear.");
  if (!action) add("low", "forms", "Forms open the visitor's email program (no forms.action set). That works everywhere, but a form service (Formspree, Basin, a Cloudflare Worker) delivers more messages: some visitors have no mail program set up.");

  // Vocations
  if (c.vocations !== false) {
    const v = c.vocations || {};
    if (!text(v.director?.email) && !text(ct.vocationsEmail)) add("medium", "vocations", "No vocation director email (vocations.director.email or contact.vocationsEmail); inquiries go to the general address.");
    if (!has(v.stages)) add("medium", "vocations", "No stages of formation (vocations.stages). Discerners want to know the path: aspirancy or postulancy, novitiate, temporary vows, solemn vows.");
    if (!has(v.requirements)) add("medium", "vocations", "No requirements (vocations.requirements): age range, education, health, debts. A discerner reads these first.");
    if (!has(v.faq)) add("low", "vocations", "No vocation FAQ (vocations.faq). Questions people ask (debt, age, visiting, family) answered on the page save letters.");
    if (!has(v.retreats)) add("low", "vocations", "No Come and See retreats listed (vocations.retreats).");
  }

  // Giving
  if (c.giving !== false) {
    const g = c.giving || {};
    const online = list(g.online);
    if (!online.length) add("high", "give", "No online giving link (giving.online). Most gifts to religious communities are now made online; add the community's own donation page.");
    for (const o of online) {
      const u = text(o.url);
      if (!safeUrl(u)) add("high", "give", `Giving link "${text(o.label) || u}" is not a web address; it is left off the page.`);
      else if (!/^https:\/\//.test(u)) add("high", "give", `Giving link "${text(o.label) || u}" is not https://. Donors should never be sent to an insecure payment page.`);
    }
    if (online.length && !online.some((o) => o.recurring)) add("medium", "give", "No monthly giving option marked (giving.online[].recurring). Monthly gifts are the steadiest income a community has; most donation platforms offer them.");
    if (!text(g.check?.payableTo) && !text(g.legalName)) add("low", "give", "No name for cheques (giving.check.payableTo or giving.legalName); the community name is printed.");
    if (!has(g.plannedGiving)) add("medium", "give", "No bequest section (giving.plannedGiving). It needs the community's exact legal name.");
    else if (!text(g.plannedGiving.legalName) && !text(g.legalName)) add("medium", "give", "The bequest section has no legal name (giving.plannedGiving.legalName). A will needs the exact legal name of the corporation.");
    if (!text(g.taxStatement)) add("low", "give", "No tax statement (giving.taxStatement). If gifts are tax-deductible where you are, say so in the words your accountant gives you; the template never writes one for you.");
    const camp = g.campaign;
    if (camp && Number(camp.goal) > 0 && !text(camp.asOf)) add("medium", "give", "The campaign total has no date (giving.campaign.asOf). A total with no date reads as current when it may not be.");
  }

  // Events and dates
  for (const e of list(c.events)) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(text(e.start))) add("medium", "events", `Event "${text(e.name)}" has no start date as YYYY-MM-DD; it is left off.`);
    else if (text(e.end) && text(e.end) < text(e.start)) add("medium", "events", `Event "${text(e.name)}" ends before it starts.`);
  }
  for (const n of list(c.news)) if (!/^\d{4}-\d{2}-\d{2}/.test(text(n.date))) add("low", "news", `News item "${text(n.title)}" has no date as YYYY-MM-DD.`);

  // Images
  const hero = c.images?.hero;
  if (hero && safeUrl(hero.src) && !text(hero.alt)) add("medium", "home", "The hero photograph has no description (images.hero.alt) for blind visitors.");
  for (const g of list(c.images?.gallery)) if (safeUrl(g.src) && !text(g.alt)) add("medium", "home", `Photograph ${text(g.src)} has no description (alt).`);
  if (!hero) add("low", "home", "No hero photograph (images.hero). A photograph of the church or the community at prayer is the first thing a good monastery site shows.");

  // Horarium
  if (!has(c.horarium?.days)) add("medium", "horarium", "No horarium (horarium.days). Visitors want to know when they can join the Office and Mass.");
  else if (!list(c.horarium.days).some((d) => list(d.items).some((i) => i.public))) add("low", "horarium", "No hour is marked open to the public (horarium.days[].items[].public).");

  // Links everywhere: a scheme the site would drop.
  walk(c, (v, key) => {
    if (/^(url|src|bookingUrl|mapUrl|livestream|logo|image)$/.test(key) && typeof v === "string" && v.trim() && !safeUrl(v)) add("high", "all", `${key} "${v}" is not a link the site will print (only https, http, mailto, tel and relative links are kept).`);
  });
  return f;
}

function walk(o, fn, key = "") {
  if (Array.isArray(o)) o.forEach((x) => walk(x, fn, key));
  else if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, fn, k);
  else fn(o, key);
}

// ---------------------------------------------------------------- simple line formats (for the builder form)

/**
 * The builder lets a sister or brother type lists one per line, with " | "
 * between parts, instead of editing JSON. `parseLines` and `toLines` convert
 * between that and the config's arrays, so the form and the file stay in step.
 * Example for the horarium: "4:30 | Vigils | public".
 */
export function parseLines(textValue, fields) {
  return String(textValue || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/\s+\|\s+|\s*\|\s*/);
    const o = {};
    fields.forEach((fname, i) => {
      const last = i === fields.length - 1;
      const v = last ? parts.slice(i).join(" | ") : parts[i];
      if (v === undefined || v === "") return;
      if (fname === "public" || fname === "recurring") o[fname] = /^(public|yes|true|open|monthly|y)$/i.test(v.trim());
      else o[fname] = v.trim();
    });
    return o;
  });
}

export function toLines(items, fields) {
  return list(items).map((o) => fields.map((fname) => {
    const v = o[fname];
    if (fname === "public") return v ? "public" : "";
    if (fname === "recurring") return v ? "monthly" : "";
    return Array.isArray(v) ? v.join(" ") : text(v);
  }).join(" | ").replace(/(\s\|\s)+$/, "").replace(/ \| $/, "")).join("\n");
}
