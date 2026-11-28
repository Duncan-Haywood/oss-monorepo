// @ts-check
// Who provides the hosted service, published at /app/impressum (and /app/de/impressum,
// /app/fr/impressum): the provider identification a commercial online service aimed at German users
// must carry under § 5 DDG (Digitale-Dienste-Gesetz), and that France's LCEN art. 6 III asks of a
// publisher, plus the representative in the EU that GDPR Article 27 asks of a provider outside the EU
// that offers services to people in it. Launch review, docs/LAUNCH-REVIEW.md section 4.
//
// The values are code, not dashboard settings ("everything as code"): the owner supplies them, a run
// writes them here, and the next deploy publishes them. Until the required ones are filled in,
// a production host (APP_ENV=production) refuses trial sign-ups (pro/server.mjs, POST /v1/signup)
// and the page says which details are not yet published. Nothing is ever guessed.
// Proprietary (see ../LICENSE, part 2).

/**
 * @typedef {{
 *   name: string,
 *   postalAddress: string | null,
 *   representedBy: string | null,
 *   email: string,
 *   register: string | null,
 *   vatId: string | null,
 *   euRepresentative: { name: string, address: string, email: string | null } | null,
 * }} Provider
 */

/** @type {Provider} */
export const PROVIDER = {
  name: "Maris Stella Labs LLC",
  // The legal form is FORM below, in each page's language.
  // A postal address at which the provider can be served (§ 5 Abs. 1 Nr. 1 DDG). A registered
  // agent's address works. Lines separated by "\n". Owner-supplied: null until then.
  postalAddress: null,
  // The person or persons authorised to represent the LLC (its manager or managing member),
  // which § 5 Abs. 1 Nr. 1 DDG asks a legal person to name. Owner-supplied.
  representedBy: null,
  email: "hello@marisstella.app",
  // The register and the entity's number in it (§ 5 Abs. 1 Nr. 4 DDG), e.g. "Colorado Secretary of
  // State, ID 2025...". Shown when set; not required to open sign-up.
  register: null,
  // A VAT identification number, if the LLC has one (§ 5 Abs. 1 Nr. 6 DDG). Shown when set.
  vatId: null,
  // GDPR Article 27: the representative's name, postal address in an EU Member State and an email.
  // Owner decision and contract (LAUNCH-REVIEW.md section 4, item 2). Owner-supplied.
  euRepresentative: null,
};

/** The details that must be published before strangers can sign up, in the order listed. */
export const REQUIRED = /** @type {const} */ (["postalAddress", "representedBy", "euRepresentative"]);

/**
 * The required details still missing. A blank string or an EU representative without a name or an
 * address counts as missing.
 * @param {Provider} [p]
 * @returns {(typeof REQUIRED)[number][]}
 */
export function providerGaps(p = PROVIDER) {
  /** @param {unknown} v */
  const blank = (v) => typeof v !== "string" || !v.trim();
  return REQUIRED.filter((k) => {
    if (k === "euRepresentative") return !p.euRepresentative || blank(p.euRepresentative.name) || blank(p.euRepresentative.address);
    return blank(p[k]);
  });
}

/** @param {string} s */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Escape, keeping line breaks. @param {string} s */
const lines = (s) => s.trim().split(/\r?\n/).map((l) => esc(l.trim())).join("<br>");

export const IMPRESSUM_LANGS = /** @type {const} */ (["en", "de", "fr"]);
/** @typedef {(typeof IMPRESSUM_LANGS)[number]} ImpressumLang */

const FORM = {
  en: "limited liability company (LLC) organised under the laws of Colorado, USA",
  de: "Limited Liability Company (LLC) nach dem Recht des Bundesstaats Colorado, USA",
  fr: "société à responsabilité limitée de droit américain (LLC), État du Colorado, États-Unis",
};

/** @type {Record<ImpressumLang, Record<string, string>>} */
const T = {
  en: {
    title: "Provider identification (Impressum)",
    back: "← E-invoice workspace",
    intro: "The provider of E-invoice Fix & Explain, for § 5 DDG (Germany) and art. 6 III LCEN (France).",
    provider: "Provider",
    form: "Legal form",
    address: "Postal address",
    rep: "Represented by",
    contact: "Contact",
    register: "Register",
    vat: "VAT identification number",
    eurep: "Representative in the EU (GDPR Article 27)",
    eurepNote: "People in the EU may contact our representative, in addition to or instead of us, about any question on the processing of their personal data.",
    missing: "not yet published",
    closed: "Trial sign-ups open once the details marked “not yet published” are in place.",
    legal: "Terms · Privacy Policy · Data Processing Agreement",
    disputes: "We are neither obliged nor willing to take part in dispute resolution proceedings before a consumer arbitration board. The service is offered to businesses only.",
  },
  de: {
    title: "Impressum",
    back: "← E-Rechnungs-Arbeitsbereich",
    intro: "Anbieterkennzeichnung von E-invoice Fix & Explain nach § 5 DDG.",
    provider: "Anbieter",
    form: "Rechtsform",
    address: "Postanschrift",
    rep: "Vertreten durch",
    contact: "Kontakt",
    register: "Register",
    vat: "Umsatzsteuer-Identifikationsnummer",
    eurep: "Vertreter in der EU (Art. 27 DSGVO)",
    eurepNote: "Personen in der EU können sich zusätzlich zu uns oder an unserer Stelle mit allen Fragen zur Verarbeitung ihrer personenbezogenen Daten an unseren Vertreter wenden.",
    missing: "noch nicht veröffentlicht",
    closed: "Testkonten können angelegt werden, sobald die als „noch nicht veröffentlicht“ markierten Angaben vorliegen.",
    legal: "Nutzungsbedingungen · Datenschutzerklärung · Auftragsverarbeitungsvertrag",
    disputes: "Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Der Dienst richtet sich ausschließlich an Unternehmen.",
  },
  fr: {
    title: "Mentions légales",
    back: "← Espace e-facture",
    intro: "Identification du fournisseur d’E-invoice Fix & Explain (art. 6 III de la LCEN ; § 5 DDG pour l’Allemagne).",
    provider: "Éditeur",
    form: "Forme juridique",
    address: "Adresse postale",
    rep: "Représentée par",
    contact: "Contact",
    register: "Registre",
    vat: "Numéro de TVA intracommunautaire",
    eurep: "Représentant dans l’UE (article 27 du RGPD)",
    eurepNote: "Les personnes situées dans l’UE peuvent s’adresser à notre représentant, en plus de nous ou à notre place, pour toute question relative au traitement de leurs données personnelles.",
    missing: "pas encore publié",
    closed: "L’inscription à l’essai ouvrira dès que les informations marquées « pas encore publié » seront en place.",
    legal: "Conditions d’utilisation · Politique de confidentialité · Accord de traitement des données",
    disputes: "Le service est proposé exclusivement aux professionnels ; nous ne participons pas à une procédure de médiation de la consommation.",
  },
};

/**
 * The Impressum page in one language. Every value is escaped; a missing required value reads
 * "not yet published", and an unset optional one (register, VAT id) is left out.
 * @param {ImpressumLang} lang
 * @param {Provider} [p]
 */
export function impressumPage(lang, p = PROVIDER) {
  const L = T[lang];
  const gaps = providerGaps(p);
  const prefix = lang === "en" ? "/app" : `/app/${lang}`;
  const missing = `<em>${esc(L.missing)}</em>`;
  /** @type {[string, string][]} */
  const rows = [
    [L.provider, esc(p.name)],
    [L.form, esc(FORM[lang])],
    [L.address, p.postalAddress?.trim() ? lines(p.postalAddress) : missing],
    [L.rep, p.representedBy?.trim() ? esc(p.representedBy.trim()) : missing],
    [L.contact, `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`],
  ];
  if (p.register?.trim()) rows.push([L.register, esc(p.register.trim())]);
  if (p.vatId?.trim()) rows.push([L.vat, esc(p.vatId.trim())]);
  const rep = p.euRepresentative;
  const repHtml =
    rep && !gaps.includes("euRepresentative")
      ? `<p>${esc(rep.name.trim())}<br>${lines(rep.address)}${rep.email?.trim() ? `<br><a href="mailto:${esc(rep.email.trim())}">${esc(rep.email.trim())}</a>` : ""}</p><p>${esc(L.eurepNote)}</p>`
      : `<p>${missing}</p>`;
  const others = IMPRESSUM_LANGS.filter((l) => l !== lang)
    .map((l) => `<a href="${l === "en" ? "/app" : `/app/${l}`}/impressum" hreflang="${l}" lang="${l}">${{ en: "English", de: "Deutsch", fr: "Français" }[l]}</a>`)
    .join(" · ");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(L.title)} · ${esc(L.back.slice(2))}</title>
<link rel="stylesheet" href="/app/app.css">
</head>
<body>
<main class="legal">
<p><a href="/app">${esc(L.back)}</a> · ${others}</p>
<h1>${esc(L.title)}</h1>
<p>${esc(L.intro)}</p>
<table><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join("")}</tbody></table>
<h2>${esc(L.eurep)}</h2>
${repHtml}
<p class="small">${esc(L.disputes)}</p>
${gaps.length ? `<p class="small">${esc(L.closed)}</p>` : ""}
<footer><p class="small">${L.legal.split(" · ").map((name, i) => `<a href="${prefix}/${["terms", "privacy", "dpa"][i]}">${esc(name)}</a>`).join(" · ")}</p></footer>
</main>
</body>
</html>
`;
}
