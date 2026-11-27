// One page per state that sets lien waiver wording by statute: every statutory form printed in
// full with blank lines, ready to print, plus that state's rules from the hub page.
//
// Why: people search "texas lien waiver form", "florida waiver and release of lien upon progress
// payment", "california conditional waiver form". The hub (lien-waiver-forms-by-state.html) says
// what each state requires but never shows the forms. The forms are public law, and PayApps'
// lien-waiver package already holds each one word for word, checked against the statute by its own
// tests (ventures/payapps/packages/lien-waivers/test/whole-form.test.ts). So the pages print from
// that package instead of a second hand-typed copy that could drift from the statute.
//
// Sources, both read at build time:
// - the forms: ventures/payapps/packages/lien-waivers (statute text only reaches the pages;
//   none of the package's code does);
// - the state's rules, statute link and "how strict" wording: this folder's
//   lien-waiver-forms-by-state.html (its table row and its "What each state asks of you" entry),
//   so the two pages cannot disagree.
//
//   node state-forms.mjs          writes the pages and the hub's links to them
//   node state-forms.mjs --check  exits 1 if any page is out of date (state-forms.test.mjs)
//
// After adding a state: add it to STATES, run this, then `node nav.mjs`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { apply as applyCta } from "./cta.mjs";
import { apply } from "./nav.mjs";

const here = (name) => new URL(`./${name}`, import.meta.url);
const PACKAGE = new URL("../payapps/packages/lien-waivers/src/index.ts", import.meta.url);
export const HUB = "lien-waiver-forms-by-state.html";

// code, name, and the hub row's state name. Order: as the hub lists them.
export const STATES = [
  ["AZ", "Arizona"], ["NV", "Nevada"], ["TX", "Texas"], ["UT", "Utah"], ["FL", "Florida"],
  ["MI", "Michigan"], ["WY", "Wyoming"], ["GA", "Georgia"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MA", "Massachusetts"], ["CA", "California"],
];

export const slugOf = (name) => `${name.toLowerCase().replace(/ /g, "-")}-lien-waiver-forms.html`;


const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const stripTags = (html) => {
  let prev;
  let out = html;
  do { prev = out; out = out.replace(/<[^>]*>/g, ""); } while (out !== prev);
  return out;
};
const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const plain = (html) => unescape(stripTags(html)).replace(/\s+/g, " ").trim();
// The package's notes speak to developers ("this package"); on the page they speak for the page.
// Notes about what the app does are left out: the app is in development, and the CTA says so.
const forPage = (t) => t.replace(/this package prints/g, "this page lists").replace(/this package/g, "this page");
const pageNote = (t) => !/PayApps|integrator/.test(t);
const list = (items) => items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;

/** The hub's table row and "What each state asks of you" entry for one state. */
export function hubFacts(hub, name) {
  const row = new RegExp(`<tr role="row"><td role="cell" data-label="State">${name}</td><td role="cell" data-label="Statute"><a href="([^"]+)">([^<]+)</a></td><td role="cell" data-label="Forms">([^<]*)</td><td role="cell" data-label="How strict">([^<]*)</td></tr>`).exec(hub);
  if (!row) throw new Error(`${HUB}: no table row for ${name}`);
  const at = hub.indexOf(`<h3>${name}</h3>`, hub.indexOf("What each state asks of you"));
  if (at < 0) throw new Error(`${HUB}: no "What each state asks of you" entry for ${name}`);
  const ulStart = hub.indexOf("<ul>", at);
  const ul = hub.slice(ulStart, hub.indexOf("</ul>", ulStart) + 5);
  return { statuteUrl: row[1], statute: row[2], forms: row[3], strict: row[4], rules: ul };
}

// A blank: a rule with what goes there captioned under it. Inline, so it wraps with the sentence.
const blank = (label) => `<span class="blank"><span class="line"></span><span class="cap">${esc(label)}</span></span>`;

function fillText(text, labels) {
  return esc(text).replace(/\{\{(\w+)\}\}/g, (_, key) => blank(labels[key] ?? key));
}

function renderBody(form) {
  const labels = Object.fromEntries(form.fields.map((f) => [f.key, f.label]));
  return form.body.map((b) => {
    switch (b.type) {
      case "title": return `<h3 class="form-title">${fillText(b.text, labels)}</h3>`;
      case "heading": return `<h4>${fillText(b.text, labels)}</h4>`;
      case "paragraph": return `<p>${fillText(b.text, labels)}</p>`;
      case "notice": return `<p class="form-notice">${fillText(b.text, labels)}</p>`;
      case "field": return `<p class="form-field">${esc(b.label)}: ${fillText(b.value, labels)}</p>`;
      case "signature": return `<div class="form-sign">${(b.lines ?? []).map((l) => `<p>${esc(l.label)}: ${l.value ? fillText(l.value, labels) : blank("sign here")}</p>`).join("")}</div>`;
      case "spacer": return `<div class="form-space"></div>`;
      default: throw new Error(`${form.id}: unknown block ${b.type}`);
    }
  }).join("\n      ");
}

/** The state's printable forms: one per distinct statutory body, with the kinds it serves. */
export function statutoryForms(pkg, code) {
  const out = [];
  const absent = [];
  for (const f of pkg.allForms(code)) {
    if (f.source !== "statutory") continue;
    if (!f.body) { absent.push(f); continue; }
    if (f.citation?.verification?.status !== "verified") throw new Error(`${f.id}: citation not verified`);
    const key = JSON.stringify(f.body);
    const same = out.find((o) => o.key === key);
    if (same) same.kinds.push(f.kind);
    else out.push({ key, form: f, kinds: [f.kind] });
  }
  return { forms: out, absent };
}

const titleOf = (form) => {
  const t = form.body.find((b) => b.type === "title");
  return t ? t.text.replace(/\{\{\w+\}\}/g, "____") : form.title;
};
const toTitleCase = (s) => s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, p, c) => p + c.toUpperCase()).replace(/\b(Of|And|On|Upon|To|The|For|Or)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase()) : s;
const anchor = (form) => form.id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

function usesFor(entry) {
  if (entry.form.appliesTo) return entry.form.appliesTo;
  const parts = [];
  for (const stage of ["progress", "final"]) {
    const has = (c) => entry.kinds.includes(`${c}-${stage}`);
    if (has("conditional") && has("unconditional")) parts.push(`${stage} payments, before or after the money clears (the form itself is neither conditional nor unconditional)`);
    else if (has("conditional")) parts.push(`conditional ${stage} waivers`);
    else if (has("unconditional")) parts.push(`unconditional ${stage} waivers`);
  }
  return list(parts);
}

// The waivers a state with one narrow form leaves to the parties (from the hub's entry for it).
const OTHER = {
  MO: [["Every other waiver (partial, conditional, and anything on commercial work or on repairs to an owner-occupied home): no set wording", "RSMo § 429.016"]],
  MA: [["Final and unconditional waivers: Massachusetts prints no form for them", "M.G.L. c. 254, § 32"]],
};

// "Arizona's" / "Massachusetts'" / "Texas's": each state's own possessive, written out.
const POSSESSIVE = { Massachusetts: "Massachusetts'" };
const poss = (name) => POSSESSIVE[name] ?? `${name}'s`;

export function renderPage(pkg, hub, code, name) {
  const facts = hubFacts(hub, name);
  const { forms, absent } = statutoryForms(pkg, code);
  if (!forms.length) throw new Error(`${name}: no verified statutory form to print`);
  const file = slugOf(name);
  const checked = [...new Set(forms.map((e) => e.form.citation.verification.checkedOn))].sort();
  const citations = [...new Set(forms.map((e) => e.form.citation.text))];
  const count = forms.length;
  const countWord = ["no", "one", "two", "three", "four", "five", "six"][count] ?? String(count);
  const formsWord = count === 1 ? "form" : "forms";
  const title = `${name} Lien Waiver ${count === 1 ? "Form" : "Forms"}, Blank and Printable`;
  const long = `${poss(name)} statutory lien waiver ${formsWord} (${citations.join(", ")}) in full, word for word from the statute, to print, with ${poss(name)} rules and traps.`;
  const desc = long.length <= 160 ? long : `${poss(name)} statutory lien waiver ${formsWord} in full, word for word from the statute, to print, with ${poss(name)} rules and traps.`;
  const strict = plain(facts.strict);
  const formsPlain = plain(facts.forms);

  const faq = [
    [`Does ${name} have a statutory lien waiver form?`,
      `Yes. ${plain(facts.statute)} sets ${formsPlain.replace(/^(\d+): /, (m, n) => (n === "1" ? "one form: " : `${n} forms: `))}. How strict: ${strict}. The ${formsWord} on this page ${count === 1 ? "is" : "are"} printed word for word from the statute as read on ${list(checked)}.`],
    [`Which ${name} lien waiver form goes with which payment?`,
      forms.map((e) => `${toTitleCase(titleOf(e.form))}: ${usesFor(e)}.`).join(" ") + (absent.length ? ` ${forPage(absent.map((f) => f.absent).filter(Boolean)[0] ?? "")}`.trimEnd() : "")],
    [`When should I sign an unconditional lien waiver in ${name}?`,
      `Only once the payment it covers has cleared your bank. Before that, give the conditional form if ${name} has one, and keep retainage, unapproved change orders and disputed amounts out of a progress waiver. This page is not legal advice; ask a ${name} construction attorney before signing anything you are unsure of.`],
  ];

  const kindName = (k) => k.replace("-", " ");
  const absentGroups = new Map();
  for (const f of absent) {
    const why = forPage(f.absent ?? "the statute prints no form of this kind.");
    absentGroups.set(why, { kinds: [...(absentGroups.get(why)?.kinds ?? []), kindName(f.kind)], cite: f.citation?.text ?? "" });
  }
  const absentRows = [...absentGroups].map(([why, g]) => `      <tr role="row"><td role="cell" data-label="Form">No statutory form</td><td role="cell" data-label="Use it for">${esc(list(g.kinds))} waivers. ${esc(why)}</td><td role="cell" data-label="Statute">${esc(g.cite)}</td></tr>`);
  const otherRows = (OTHER[code] ?? []).map(([use, cite]) => `      <tr role="row"><td role="cell" data-label="Form">No statutory form</td><td role="cell" data-label="Use it for">${esc(use)}</td><td role="cell" data-label="Statute">${esc(cite)}</td></tr>`);
  const rows = forms.map((e) => `      <tr role="row"><td role="cell" data-label="Form"><a href="#${anchor(e.form)}">${esc(toTitleCase(titleOf(e.form)))}</a></td><td role="cell" data-label="Use it for">${esc(usesFor(e))}</td><td role="cell" data-label="Statute">${esc(e.form.citation.text)}</td></tr>`).concat(absentRows, otherRows).join("\n");

  const sections = forms.map((e) => {
    const f = e.form;
    const font = f.minFontPt ? ` style="font-size: max(1em, ${f.minFontPt}pt)"` : "";
    return `<section class="card" id="${anchor(f)}">
  <h2>${esc(toTitleCase(titleOf(f)))}</h2>
  <p class="note">Use it for: <strong>${esc(usesFor(e))}</strong>. From <a href="${esc(f.citation.officialUrl ?? f.citation.verification.sourceUrl)}">${esc(f.citation.text)}</a>, read ${esc(f.citation.verification.checkedOn)}.${f.minFontPt ? ` The statute requires at least ${f.minFontPt} point type; it prints that way here.` : ""}</p>
  <div class="statutory-form"${font}>
      ${renderBody(f)}
  </div>
  <button type="button" class="secondary print-form" data-form="${anchor(f)}">Print this form</button>
</section>`;
  }).join("\n\n");

  const notes = [...new Set(forms.flatMap((e) => e.form.notes))].filter(pageNote).map(forPage);
  const counter = `guide_waiver_form_${code.toLowerCase()}_viewed`;
  const ld = [
    { "@context": "https://schema.org", "@type": "Article", headline: title, datePublished: "2026-11-27", dateModified: "2026-11-27" },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"><link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Crect%20width='32'%20height='32'%20rx='7'%20fill='%237e1b51'/%3E%3Ctext%20x='16'%20y='23'%20font-size='20'%20font-family='system-ui,sans-serif'%20font-weight='700'%20text-anchor='middle'%20fill='%23fff'%3EP%3C/text%3E%3C/svg%3E">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <link rel="canonical" href="./${file}">
  <link rel="stylesheet" href="style.css">
${ld.map((d) => `  <script type="application/ld+json">${JSON.stringify(d).replace(/</g, "\\u003c")}</script>`).join("\n")}
</head>
<body>
<!-- generated by state-forms.mjs from the PayApps lien-waiver package and ${HUB}; do not edit by hand -->
<header>
  <p class="kicker">Pay app guides · <a href="${HUB}">lien waiver forms by state</a></p>
  <h1>${esc(name)} lien waiver ${formsWord}</h1>
  <p>${esc(name)} sets the wording of lien waivers in statute (<a href="${esc(facts.statuteUrl)}">${facts.statute}</a>). How strict: ${facts.strict}. Below ${count === 1 ? "is the" : count === 2 ? "are both" : `are all ${countWord}`} statutory ${formsWord}, word for word, with a blank line wherever the statute leaves one. Print ${count === 1 ? "it" : "the one you need"}, fill it in by hand, and keep a copy.</p>
  <nav class="guides" aria-label="Guides">
    <a href="${HUB}">All states</a>
    <a href="conditional-vs-unconditional-lien-waivers.html">Conditional vs unconditional waivers</a>
    <a href="lien-waiver-log.html">Lien waiver log</a>
    <a href="#all-guides" class="all">All guides</a>
  </nav>
</header>
<main>
<section class="card">
  <h2>The ${formsWord} on this page</h2>
  <div class="scroll"><table class="stack" role="table">
    <thead><tr role="row"><th role="columnheader" scope="col">Form</th><th role="columnheader" scope="col">Use it for</th><th role="columnheader" scope="col">Statute</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table></div>
  <p class="note">Each form is the statute's text as read on ${esc(list(checked))}, from the official source linked with it. The grey caption under each blank says what goes there; it is our guide, not part of the form. Statutes change: open the linked section before relying on a form, and have a ${esc(name)} construction attorney review anything you are unsure of.</p>
</section>

<section class="card">
  <h2>What ${esc(name)} asks of you</h2>
  ${facts.rules}
${notes.length ? `  <h3>Notes on the ${formsWord}</h3>\n  <ul>\n${notes.map((n) => `    <li>${esc(n)}</li>`).join("\n")}\n  </ul>` : ""}
</section>

${sections}

<section class="card" id="faq">
  <h2>Common questions</h2>
${faq.map(([q, a]) => `  <h3>${esc(q)}</h3>\n  <p>${esc(a)}</p>`).join("\n")}
</section>

<section class="card cta" id="early-access">
  <h2>Fill these in from your pay app instead</h2>
  <p>We are building hosted pay-app billing for specialty subcontractors that prints ${poss(name)} statutory waiver with each pay application, filled in from the job and the amount due, and holds the unconditional one until the payment has cleared. It is <strong>in development, with early access</strong>; nothing is for sale yet. <a href="https://marisstella.app/industries/construction/">See the construction tools and join early access</a>.</p>
</section>
</main>
<footer>
  <p><strong>No warranty.</strong> These forms and notes are provided free and as-is, without warranty of any kind, express or implied. They are not legal advice and do not replace an attorney licensed in ${esc(name)}; lien and waiver rules are strict, and courts read them in ways a summary cannot show. You are responsible for what you sign. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from their use.</p>
  <p><strong>Privacy.</strong> No accounts, cookies or analytics vendors. One anonymous counter (<code>${counter}</code>) is kept in local storage on your device only, and Do Not Track switches it off. <button type="button" class="secondary" id="optout">Turn usage counting off</button></p>
  <p>Free to use and source available under the <a href="LICENSE">FSL-1.1-MIT licence</a>. The statutory text is ${esc(name)} public law. <a href="https://github.com/sponsors/Duncan-Haywood" rel="noopener">Support</a> is optional.</p>
</footer>
<script type="module">
  import { record, setUsageOptOut, usageOptedOut } from "./usage.mjs";
  record("${counter}");
  const b = document.getElementById("optout");
  b.addEventListener("click", () => { setUsageOptOut(true); b.textContent = "Usage counting is off"; b.disabled = true; });
  if (usageOptedOut()) { b.textContent = "Usage counting is off"; b.disabled = true; }
  for (const btn of document.querySelectorAll(".print-form")) {
    btn.addEventListener("click", () => {
      document.body.dataset.print = "form";
      document.getElementById(btn.dataset.form).classList.add("printing");
      window.print();
    });
  }
  addEventListener("afterprint", () => {
    delete document.body.dataset.print;
    for (const s of document.querySelectorAll(".printing")) s.classList.remove("printing");
  });
</script>
</body>
</html>
`;
}

// The hub's "What each state asks of you" entries each end with a link to the state's page.
const LINK_START = "<!-- state-forms link -->";
export function linkHub(hub, counts) {
  let out = hub.replace(new RegExp(`\\n  ${LINK_START}[^\\n]*`, "g"), "");
  const start = out.indexOf("What each state asks of you");
  for (const [, name] of STATES) {
    const at = out.indexOf(`<h3>${name}</h3>`, start);
    const end = out.indexOf("</ul>", at) + 5;
    const link = `\n  ${LINK_START}<p><a href="${slugOf(name)}">${poss(name)} lien waiver ${counts[name] === 1 ? "form" : "forms"}, in full and printable</a></p>`;
    out = out.slice(0, end) + link + out.slice(end);
  }
  return out;
}

export async function build() {
  const pkg = await import(PACKAGE.href);
  const hub = readFileSync(here(HUB), "utf8");
  const counts = Object.fromEntries(STATES.map(([code, name]) => [name, statutoryForms(pkg, code).forms.length]));
  const files = { [HUB]: linkHub(hub, counts) };
// The CTA's status sentence comes from cta.mjs, so a rebuild keeps its markers and the launch switch.
  for (const [code, name] of STATES) {
    files[slugOf(name)] = applyCta(apply(renderPage(pkg, hub, code, name), slugOf(name)), slugOf(name));
  }
  return files;
}

// Node 22.18+ runs the package's .ts files directly; older Node, or a copy of this folder alone, cannot.
export const packagePresent = () => existsSync(PACKAGE) && Boolean(process.features.typescript);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const files = await build();
  let stale = 0;
  for (const [name, html] of Object.entries(files)) {
    const now = existsSync(here(name)) ? readFileSync(here(name), "utf8") : null;
    if (now === html) continue;
    stale++;
    if (check) console.log(`out of date: ${name}`);
    else { writeFileSync(here(name), html); console.log(`wrote ${name}`); }
  }
  if (check && stale) process.exit(1);
}
