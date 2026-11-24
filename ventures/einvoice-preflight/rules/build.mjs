// Writes one page per e-invoice validation rule in English, German and French
// (rules/en/, rules/de/, rules/fr/) plus a hub page per language, from the
// explanations in rules/data/*.json and the official rule text in ../plain/:
//   node rules/build.mjs
// rules.test.mjs fails when a committed page is not what this writes, and when a
// rule id is not in the official rule set version cited on its page.
//
// The official message and severity are read from the compiled official
// Schematron (../plain/<set>-ubl.json, -cii.json; ../build-plain-rules.mjs), so
// they cannot drift from what the checker runs. The explanation, causes, fix and
// XML snippet are this project's own words (rules/data/SCHEMA.md).
import { mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const here = new URL("./", import.meta.url);
const plain = new URL("../plain/", import.meta.url);
export const LANGS = ["en", "de", "fr"];
const ORIGIN = "https://example.invalid/einvoice-preflight/rules/";
// The form the site serves (platform/pages/served-path.mjs): no ".html", "dir/" for an index.
const served = (p) => p.replace(/(^|\/)index\.html$/, "$1").replace(/\.html$/, "");

// Each cited source, the release it is, and the upstream commit the compiled set was
// built from. rules.test.mjs checks the commit against ../plain/manifest.json, so a
// rebuild of the rule sets fails the test until the citation here is updated.
export const SOURCES = {
  en16931: {
    sets: ["en16931-ubl", "en16931-cii"],
    commit: "6e35e0ab8b09eb183f7d84b282e24ef95f9f5715",
    name: "CEN/TC 434 EN 16931 validation artefacts",
    version: "validation-1.3.17",
    licence: "EUPL-1.2",
    url: "https://github.com/ConnectingEurope/eInvoicing-EN16931/tree/validation-1.3.17",
    label: "EN 16931",
  },
  xrechnung: {
    sets: ["xrechnung-ubl", "xrechnung-cii"],
    // Master one commit after the v2.6.0 tag (217c6cb); that commit changed only
    // CHANGELOG.md and build.xml, so the rules are v2.6.0's.
    commit: "7e3ddbe224674427fd174a8406635708b0d50ed1",
    name: "KoSIT XRechnung Schematron",
    version: "v2.6.0 (for XRechnung 3.0)",
    licence: "Apache-2.0",
    url: "https://github.com/itplr-kosit/xrechnung-schematron/tree/v2.6.0",
    label: "XRechnung",
  },
  peppol: {
    sets: ["peppol-ubl", "peppol-cii"],
    commit: "38d693d71d28d813781323a6ca97324edcc4d239",
    name: "OpenPeppol BIS Billing 3 rules",
    version: "3.0.22",
    licence: "MPL-2.0",
    url: "https://github.com/OpenPEPPOL/peppol-bis-invoice-3/tree/3.0.22",
    label: "Peppol BIS",
  },
};

const T = {
  en: {
    htmlLang: "en", eyebrow: "E-invoice rule explained", official: "Official message", severity: "Severity",
    sev: { fatal: "Error (the invoice is rejected)", warning: "Warning (should be fixed; not a rejection on its own)", information: "Information (a hint, not an error)" },
    syntaxes: "Checked in", terms: "Business terms", meaningQ: (id) => `What does ${id} mean?`, causes: "Usual causes",
    fixQ: (id) => `How do I fix ${id}?`, snippet: "Corrected XML (minimal example we wrote)", snippetNote: "Example values only. Put the elements in place of, or beside, what your file has; element order matters in both syntaxes.",
    check: "Check your file for free", checkText: "The free checker runs the official EN 16931, XRechnung and Peppol rules in your browser. Your file is not uploaded.",
    checkLink: "Open the free checker", paid: "Fix-and-explain for accountants and invoicing teams", paidText: "A paid service that explains every failed rule in plain German, French or English and proposes a corrected file is in development.",
    paidLink: "Early access", paidState: "In development — early access", source: "Source", sourceText: (s, c) => `Rule id and official message from the ${s.name}, ${s.version} (${s.licence}), compiled from upstream commit ${c.slice(0, 7)}. The explanation, causes, fix and XML on this page are our own, not the rule publisher's.`,
    disclaimer: "<strong>Not tax or legal advice.</strong> This page explains what a validation rule checks and how to make a file pass it. It does not say which VAT treatment applies to your sale; ask a tax adviser. <strong>No warranty:</strong> provided free and as-is; check the result before you rely on it.",
    hubTitle: "E-invoice validation errors explained: XRechnung, EN 16931, Peppol", hubH1: "E-invoice validation errors, explained",
    hubLede: (n) => `${n} validation rules that reject or flag e-invoices, each with what it means, the usual causes, how to fix it and a corrected XML snippet. Rule ids and messages come from the official rule sets cited on each page.`,
    hubDesc: (n) => `What ${n} XRechnung (BR-DE), EN 16931 (BR-CO, BR-S) and Peppol (PEPPOL-EN16931) e-invoice errors mean and how to fix them, with corrected XML.`,
    groups: { xrechnung: "XRechnung (Germany, BR-DE)", en16931: "EN 16931 core rules (all EU e-invoices)", peppol: "Peppol BIS Billing 3" },
    hubFaq: [["Where do these rule ids come from?", "From the official validation artefacts: the KoSIT XRechnung Schematron for BR-DE rules, the CEN/TC 434 EN 16931 validation artefacts for BR- rules, and OpenPeppol's BIS Billing 3 rules for PEPPOL- rules. Each page names the release and links it."], ["Is a warning a rejection?", "No. A rule with severity warning or information does not reject the invoice on its own in the official rule sets, but a receiving platform may be stricter. An error (fatal) rejects it."]],
    licence: "Our code and explanations are MIT-licensed. Official rule messages are quoted under their publishers' licences (EUPL-1.2, Apache-2.0, MPL-2.0), named on each page.",
    others: "Other languages", titleTail: "explained", back: "All rules",
  },
  de: {
    htmlLang: "de", eyebrow: "E-Rechnungs-Prüfregel erklärt", official: "Offizielle Meldung", severity: "Schweregrad",
    sev: { fatal: "Fehler (die Rechnung wird abgewiesen)", warning: "Warnung (sollte behoben werden; allein kein Abweisungsgrund)", information: "Hinweis (kein Fehler)" },
    syntaxes: "Geprüft in", terms: "Geschäftsbegriffe", meaningQ: (id) => `Was bedeutet ${id}?`, causes: "Typische Ursachen",
    fixQ: (id) => `Wie behebe ich ${id}?`, snippet: "Korrigiertes XML (minimales Beispiel von uns)", snippetNote: "Nur Beispielwerte. Ersetzen oder ergänzen Sie die Elemente in Ihrer Datei; die Reihenfolge der Elemente ist in beiden Syntaxen vorgeschrieben.",
    check: "Datei kostenlos prüfen", checkText: "Der kostenlose Prüfer führt die offiziellen Regeln für EN 16931, XRechnung und Peppol in Ihrem Browser aus. Ihre Datei wird nicht hochgeladen.",
    checkLink: "Zum kostenlosen Prüfer", paid: "Prüfen und erklären für Steuerberater und Rechnungsteams", paidText: "Ein kostenpflichtiger Dienst, der jede verletzte Regel verständlich auf Deutsch, Französisch oder Englisch erklärt und eine korrigierte Datei vorschlägt, ist in Entwicklung.",
    paidLink: "Frühen Zugang anfragen", paidState: "In Entwicklung — früher Zugang", source: "Quelle", sourceText: (s, c) => `Regel-ID und offizielle Meldung aus: ${s.name}, ${s.version} (${s.licence}), kompiliert aus dem Upstream-Commit ${c.slice(0, 7)}. Erklärung, Ursachen, Lösung und XML auf dieser Seite stammen von uns, nicht vom Herausgeber der Regel.`,
    disclaimer: "<strong>Keine Steuer- oder Rechtsberatung.</strong> Diese Seite erklärt, was eine Prüfregel kontrolliert und wie eine Datei sie besteht. Sie sagt nicht, welche umsatzsteuerliche Behandlung für Ihren Umsatz gilt; fragen Sie dazu Ihre Steuerberatung. <strong>Ohne Gewähr (no warranty):</strong> kostenlos und wie besehen; prüfen Sie das Ergebnis, bevor Sie sich darauf verlassen.",
    hubTitle: "E-Rechnung Fehlermeldungen erklärt: XRechnung, EN 16931, Peppol", hubH1: "Fehlermeldungen bei E-Rechnungen, erklärt",
    hubLede: (n) => `${n} Prüfregeln, an denen E-Rechnungen scheitern oder die sie beanstanden, jeweils mit Bedeutung, typischen Ursachen, Lösung und korrigiertem XML-Ausschnitt. Regel-IDs und Meldungen stammen aus den offiziellen Regelwerken, die auf jeder Seite genannt sind.`,
    hubDesc: (n) => `Was ${n} Fehler bei XRechnung (BR-DE), EN 16931 (BR-CO, BR-S) und Peppol (PEPPOL-EN16931) bedeuten und wie Sie sie beheben, mit korrigiertem XML.`,
    groups: { xrechnung: "XRechnung (Deutschland, BR-DE)", en16931: "EN 16931 Grundregeln (alle E-Rechnungen in der EU)", peppol: "Peppol BIS Billing 3" },
    hubFaq: [["Woher stammen diese Regel-IDs?", "Aus den offiziellen Prüfartefakten: dem XRechnung-Schematron der KoSIT für BR-DE-Regeln, den EN-16931-Validierungsartefakten von CEN/TC 434 für BR-Regeln und den BIS-Billing-3-Regeln von OpenPeppol für PEPPOL-Regeln. Jede Seite nennt die Version und verlinkt sie."], ["Ist eine Warnung eine Abweisung?", "Nein. Eine Regel mit dem Schweregrad Warnung oder Hinweis weist die Rechnung in den offiziellen Regelwerken nicht allein ab, eine empfangende Plattform kann aber strenger sein. Ein Fehler (fatal) führt zur Abweisung."]],
    licence: "Unser Code und unsere Erklärungen stehen unter der MIT-Lizenz. Offizielle Regelmeldungen werden unter den Lizenzen ihrer Herausgeber zitiert (EUPL-1.2, Apache-2.0, MPL-2.0), die auf jeder Seite genannt sind.",
    others: "Andere Sprachen", titleTail: "erklärt", back: "Alle Regeln",
  },
  fr: {
    htmlLang: "fr", eyebrow: "Règle de facture électronique expliquée", official: "Message officiel", severity: "Gravité",
    sev: { fatal: "Erreur (la facture est rejetée)", warning: "Avertissement (à corriger ; pas un rejet à lui seul)", information: "Information (une indication, pas une erreur)" },
    syntaxes: "Vérifiée en", terms: "Termes métier", meaningQ: (id) => `Que signifie ${id} ?`, causes: "Causes fréquentes",
    fixQ: (id) => `Comment corriger ${id} ?`, snippet: "XML corrigé (exemple minimal rédigé par nous)", snippetNote: "Valeurs d'exemple uniquement. Remplacez ou complétez les éléments de votre fichier ; l'ordre des éléments est imposé dans les deux syntaxes.",
    check: "Vérifier votre fichier gratuitement", checkText: "Le vérificateur gratuit exécute les règles officielles EN 16931, XRechnung et Peppol dans votre navigateur. Votre fichier n'est pas envoyé.",
    checkLink: "Ouvrir le vérificateur gratuit", paid: "Corriger et expliquer, pour les experts-comptables et les équipes de facturation", paidText: "Un service payant qui explique chaque règle en échec en français, en allemand ou en anglais clair et propose un fichier corrigé est en cours de développement.",
    paidLink: "Accès anticipé", paidState: "En développement — accès anticipé", source: "Source", sourceText: (s, c) => `Identifiant et message officiel de la règle : ${s.name}, ${s.version} (${s.licence}), compilés depuis le commit amont ${c.slice(0, 7)}. L'explication, les causes, la correction et le XML de cette page sont les nôtres, pas ceux de l'éditeur de la règle.`,
    disclaimer: "<strong>Ni conseil fiscal ni conseil juridique.</strong> Cette page explique ce que vérifie une règle de validation et comment faire passer un fichier. Elle ne dit pas quel régime de TVA s'applique à votre vente ; demandez à votre expert-comptable. <strong>Sans garantie (no warranty) :</strong> gratuit et fourni en l'état ; vérifiez le résultat avant de vous y fier.",
    hubTitle: "Erreurs de facture électronique expliquées : EN 16931, Peppol", hubH1: "Erreurs de validation des factures électroniques, expliquées",
    hubLede: (n) => `${n} règles de validation qui rejettent ou signalent des factures électroniques, chacune avec sa signification, ses causes fréquentes, sa correction et un extrait XML corrigé. Les identifiants et messages viennent des référentiels officiels cités sur chaque page.`,
    hubDesc: (n) => `Ce que signifient ${n} erreurs XRechnung (BR-DE), EN 16931 (BR-CO, BR-S) et Peppol (PEPPOL-EN16931) et comment les corriger, avec XML corrigé.`,
    groups: { xrechnung: "XRechnung (Allemagne, BR-DE)", en16931: "Règles de base EN 16931 (toutes les factures électroniques de l'UE)", peppol: "Peppol BIS Billing 3" },
    hubFaq: [["D'où viennent ces identifiants de règles ?", "Des artefacts de validation officiels : le Schematron XRechnung de la KoSIT pour les règles BR-DE, les artefacts de validation EN 16931 du CEN/TC 434 pour les règles BR-, et les règles BIS Billing 3 d'OpenPeppol pour les règles PEPPOL-. Chaque page cite la version et donne le lien."], ["Un avertissement est-il un rejet ?", "Non. Dans les référentiels officiels, une règle de gravité avertissement ou information ne rejette pas la facture à elle seule, mais une plateforme destinataire peut être plus stricte. Une erreur (fatal) la rejette."]],
    licence: "Notre code et nos explications sont sous licence MIT. Les messages officiels des règles sont cités sous la licence de leur éditeur (EUPL-1.2, Apache-2.0, MPL-2.0), indiquée sur chaque page.",
    others: "Autres langues", titleTail: "expliquée", back: "Toutes les règles",
  },
};
/** The cited source of a rule; throws on an unknown key (a prototype name included). */
export const sourceOf = (key) => {
  if (!Object.hasOwn(SOURCES, key)) throw new Error(`unknown rule source "${key}"`);
  return SOURCES[key];
};
const LANG_NAME = { en: "English", de: "Deutsch", fr: "Français" };

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const slugOf = (id) => id.toLowerCase();
// Same tidying as the checker's report: no "[ID]-" prefix.
export const tidy = (t) => t.replace(/^\[[^\]]+\]\s*[-:,]*\s*/, "").replace(/\s+/g, " ").trim();
const ruleOrder = (id) => id.replace(/\d+/g, (d) => d.padStart(4, "0"));

/** Every check in a compiled set, by id: { flag, text }[] (a rule id can have several checks). */
const setCache = new Map();
export function officialChecks(set) {
  if (!setCache.has(set)) {
    const byId = new Map();
    const file = new URL(`${set}.json`, plain);
    if (existsSync(file)) {
      for (const p of JSON.parse(readFileSync(file, "utf8")).patterns) for (const r of p.rules) for (const c of r.checks) {
        if (!byId.has(c.id)) byId.set(c.id, []);
        byId.get(c.id).push({ flag: c.flag, text: tidy(c.text) });
      }
    }
    setCache.set(set, byId);
  }
  return setCache.get(set);
}

export function loadRules() {
  const dir = new URL("data/", here);
  const rules = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    for (const r of JSON.parse(readFileSync(new URL(f, dir), "utf8"))) rules.push({ ...r, file: f });
  }
  return rules.sort((a, b) => Object.keys(SOURCES).indexOf(a.source) - Object.keys(SOURCES).indexOf(b.source) || ruleOrder(a.id).localeCompare(ruleOrder(b.id)));
}

/** The official facts of a rule: the syntaxes it is in, its severity and its message(s). */
export function official(rule) {
  const src = sourceOf(rule.source);
  const syntaxes = [];
  const messages = new Set();
  const flags = new Set();
  for (const set of src.sets) {
    const checks = officialChecks(set).get(rule.id);
    if (!checks) continue;
    syntaxes.push(set.endsWith("-cii") ? "CII" : "UBL");
    for (const c of checks) { messages.add(c.text); flags.add(c.flag); }
  }
  // The most severe flag the rule carries anywhere.
  const flag = ["fatal", "error", "warning", "information"].find((f) => flags.has(f)) || [...flags][0];
  return { syntaxes, messages: [...messages], flag: flag === "error" ? "fatal" : flag };
}

const STYLE = `:root{color-scheme:light;font-family:system-ui,sans-serif;color:#15202b;background:#eef2f6}body{margin:0}main{max-width:860px;margin:auto;padding:1.5rem 16px}a{color:#0b5f8a;overflow-wrap:anywhere}.eyebrow{font-weight:700;letter-spacing:.04em;color:#0b5f8a;font-size:.85rem;margin:0}h1{font-size:clamp(1.6rem,5vw,2.3rem);line-height:1.12;margin:.3rem 0 .6rem}section{background:#fff;border:1px solid #d3dbe4;border-radius:14px;padding:1rem 1.2rem;margin:1rem 0}h2{margin:.2rem 0 .6rem;font-size:1.2rem}blockquote{margin:.4rem 0;padding:.5rem .8rem;border-left:4px solid #0b5f8a;background:#f5f8fb}dl{display:grid;grid-template-columns:max-content 1fr;gap:.3rem 1rem;margin:.6rem 0 0}dt{font-weight:600}dd{margin:0}pre{background:#15202b;color:#f1f5f9;padding:.8rem;border-radius:10px;overflow-x:auto;font-size:.85rem}.note,footer{color:#3d4f5f;font-size:.88rem}.cta{background:#fffaf0;border-color:#e2c48a}.button{display:inline-block;background:#0b5f8a;color:#fff;padding:.5rem .9rem;border-radius:8px;text-decoration:none;font-weight:600}.state{display:inline-block;font-size:.78rem;font-weight:700;background:#fde7b0;color:#5b3d00;border-radius:999px;padding:.1rem .6rem}nav.langs a{margin-right:.8rem}ul.rules{columns:2 260px;padding-left:1.1rem}ul.rules li{margin:.2rem 0;break-inside:avoid}`;

const head = ({ lang, title, desc, path, alternates, ld }) => `<!doctype html>
<html lang="${lang}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${ORIGIN}${served(path)}">
${alternates.map(([l, p]) => `<link rel="alternate" hreflang="${l}" href="${ORIGIN}${served(p)}">`).join("\n")}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>${STYLE}</style>
</head><body><main>`;

const faqLd = (pairs) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: pairs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });

const ctas = (t, up) => `<section>
<h2>${esc(t.check)}</h2>
<p>${esc(t.checkText)}</p>
<p><a class="button" href="${up}index.html">${esc(t.checkLink)}</a></p>
</section>
<section class="cta">
<p><span class="state">${esc(t.paidState)}</span></p>
<h2>${esc(t.paid)}</h2>
<p>${esc(t.paidText)} <a href="https://example.invalid/industries/e-invoicing/">${esc(t.paidLink)}</a></p>
</section>`;

const footer = (t) => `<footer>
<p>${t.disclaimer}</p>
<p>${esc(t.licence)}</p>
</footer>
</main></body></html>
`;

const clip = (s, n = 160) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`);

const titleFor = (rule, t) => {
  const full = `${rule.id}: ${rule[t.htmlLang].title}`;
  return [...full].length <= 70 ? full : `${rule.id}: ${sourceOf(rule.source).label} ${t.titleTail}`;
};

export function renderRule(rule, lang) {
  const t = T[lang];
  const c = rule[lang];
  const src = sourceOf(rule.source);
  const off = official(rule);
  const path = `${lang}/${slugOf(rule.id)}.html`;
  const alternates = [...LANGS.map((l) => [l, `${l}/${slugOf(rule.id)}.html`]), ["x-default", `en/${slugOf(rule.id)}.html`]];
  const fixText = c.fix.join(" ");
  const ld = faqLd([[t.meaningQ(rule.id), c.meaning], [t.fixQ(rule.id), fixText]]);
  const desc = clip(`${rule.id}: ${c.meaning}`);
  const snippets = [["UBL", rule.ubl], ["CII", rule.cii]].filter(([, x]) => x);
  return `${head({ lang: t.htmlLang, title: titleFor(rule, t), desc, path, alternates, ld })}
<header>
<p class="eyebrow">${esc(t.eyebrow)} · ${esc(src.label)}</p>
<h1>${esc(rule.id)}: ${esc(c.title)}</h1>
<nav class="langs" aria-label="${esc(t.others)}">${LANGS.filter((l) => l !== lang).map((l) => `<a href="../${l}/${slugOf(rule.id)}.html" hreflang="${l}" lang="${l}">${LANG_NAME[l]}</a>`).join("")}<a href="index.html">${esc(t.back)}</a></nav>
</header>
<section>
<h2>${esc(t.official)}</h2>
${off.messages.map((m) => `<blockquote lang="${rule.source === "xrechnung" ? "de" : "en"}">${esc(m)}</blockquote>`).join("\n")}
<dl>
<dt>${esc(t.severity)}</dt><dd>${esc(t.sev[off.flag] || off.flag)}</dd>
<dt>${esc(t.syntaxes)}</dt><dd>${off.syntaxes.join(", ")}</dd>
${rule.terms?.length ? `<dt>${esc(t.terms)}</dt><dd>${esc(rule.terms.join(", "))}</dd>` : ""}
</dl>
</section>
<section>
<h2>${esc(t.meaningQ(rule.id))}</h2>
<p>${esc(c.meaning)}</p>
<h2>${esc(t.causes)}</h2>
<ul>
${c.causes.map((x) => `<li>${esc(x)}</li>`).join("\n")}
</ul>
</section>
<section>
<h2>${esc(t.fixQ(rule.id))}</h2>
<ol>
${c.fix.map((x) => `<li>${esc(x)}</li>`).join("\n")}
</ol>
<h2>${esc(t.snippet)}</h2>
${snippets.map(([syn, x]) => `<p><strong>${syn}</strong></p>\n<pre><code>${esc(x)}</code></pre>`).join("\n")}
<p class="note">${esc(t.snippetNote)}</p>
</section>
${ctas(t, "../../")}
<section>
<h2>${esc(t.source)}</h2>
<p>${esc(t.sourceText(src, src.commit))} <a href="${src.url}" rel="noopener">${esc(src.name)} ${esc(src.version)}</a></p>
</section>
${footer(t)}`;
}

export function renderHub(rules, lang) {
  const t = T[lang];
  const path = `${lang}/index.html`;
  const alternates = [...LANGS.map((l) => [l, `${l}/index.html`]), ["x-default", "en/index.html"]];
  const groups = Object.keys(SOURCES).map((s) => {
    const list = rules.filter((r) => r.source === s);
    if (!list.length) return "";
    return `<section>
<h2>${esc(t.groups[s])}</h2>
<p class="note"><a href="${SOURCES[s].url}" rel="noopener">${esc(SOURCES[s].name)} ${esc(SOURCES[s].version)}</a></p>
<ul class="rules">
${list.map((r) => `<li><a href="${slugOf(r.id)}.html"><strong>${esc(r.id)}</strong></a>: ${esc(r[lang].title)}</li>`).join("\n")}
</ul>
</section>`;
  }).join("\n");
  return `${head({ lang: t.htmlLang, title: t.hubTitle, desc: t.hubDesc(rules.length), path, alternates, ld: faqLd(t.hubFaq) })}
<header>
<p class="eyebrow">E-invoice Preflight</p>
<h1>${esc(t.hubH1)}</h1>
<p>${esc(t.hubLede(rules.length))}</p>
<nav class="langs" aria-label="${esc(t.others)}">${LANGS.filter((l) => l !== lang).map((l) => `<a href="../${l}/index.html" hreflang="${l}" lang="${l}">${LANG_NAME[l]}</a>`).join("")}</nav>
</header>
${groups}
${ctas(t, "../../")}
<section>
${t.hubFaq.map(([q, a]) => `<h2>${esc(q)}</h2>\n<p>${esc(a)}</p>`).join("\n")}
</section>
${footer(t)}`;
}

/** Every page this build writes: [relative path, html]. */
export function renderAll() {
  const rules = loadRules();
  const out = [];
  for (const lang of LANGS) {
    out.push([`${lang}/index.html`, renderHub(rules, lang)]);
    for (const r of rules) out.push([`${lang}/${slugOf(r.id)}.html`, renderRule(r, lang)]);
  }
  out.push(["index.html", renderChooser(rules)]);
  return out;
}

/** rules/ itself: a language chooser, so the bare folder URL is not a 404. */
export function renderChooser(rules) {
  const n = rules.length;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>E-invoice errors explained / E-Rechnung Fehler / Erreurs</title>
<meta name="description" content="${n} e-invoice validation rules explained in English, German and French.">
<link rel="canonical" href="${ORIGIN}en/">
${LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${ORIGIN}${l}/">`).join("\n")}
<style>${STYLE}</style>
</head><body><main>
<h1>E-invoice validation errors explained</h1>
${LANGS.map((l) => `<section lang="${l}">
<h2><a href="${l}/index.html" hreflang="${l}">${esc(T[l].hubH1)}</a> (${LANG_NAME[l]})</h2>
<p>${esc(T[l].hubLede(n))}</p>
</section>`).join("\n")}
<section>
<h2>All rules</h2>
${Object.keys(SOURCES).map((s) => `<p><strong>${esc(T.en.groups[s])}:</strong> ${rules.filter((r) => r.source === s).map((r) => `<a href="en/${slugOf(r.id)}.html">${esc(r.id)}</a>`).join(", ")}</p>`).join("\n")}
</section>
<p>${T.en.disclaimer}</p>
</main></body></html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const lang of LANGS) {
    rmSync(new URL(`${lang}/`, here), { recursive: true, force: true });
    mkdirSync(new URL(`${lang}/`, here), { recursive: true });
  }
  const pages = renderAll();
  for (const [p, html] of pages) writeFileSync(new URL(p, here), html);
  console.log(`wrote ${pages.length} pages`);
}
