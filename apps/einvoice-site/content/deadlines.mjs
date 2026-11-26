// Every deadline and rule the site states, with the official page it comes from and the date it was
// checked. Pages render ONLY from this file: a date that is not here cannot appear on the site, and
// test/build.test.mjs fails if an entry lacks an official source or a check date.
//
// How these were checked (2026-11-24): direct fetches of bundesfinanzministerium.de, impots.gouv.fr
// and economie.gouv.fr were blocked by the build environment's network policy (DNS refused), so each
// statement was matched against the official page's text as returned by a web search restricted to
// those domains. `checkedVia` says so, and the pages show it. Re-check by opening each URL in a
// browser before launch and set `checkedVia: "direct"` with the new date (README, "Before launch").

/** Official hosts a source may live on. Anything else fails the build test. */
export const OFFICIAL_HOSTS = [
  "www.bundesfinanzministerium.de",
  "bundesfinanzministerium.de",
  "www.impots.gouv.fr",
  "www.economie.gouv.fr",
];

export const SOURCES = {
  bmfFaq: {
    publisher: "Bundesministerium der Finanzen",
    title:
      "Fragen und Antworten zur Einführung der obligatorischen (verpflichtenden) E-Rechnung zum 1. Januar 2025",
    url: "https://www.bundesfinanzministerium.de/Content/DE/FAQ/e-rechnung.html",
    checked: "2026-11-24",
    checkedVia: "search-excerpt",
  },
  bmfLetter2025: {
    publisher: "Bundesministerium der Finanzen",
    title: "BMF-Schreiben vom 15. Oktober 2025: Einführung der obligatorischen E-Rechnung",
    url: "https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/Umsatzsteuer-Anwendungserlass/2025-10-15-einfuehrung-obligatorische-e-rechnung.pdf?__blob=publicationFile&v=3",
    checked: "2026-11-24",
    checkedVia: "search-excerpt",
  },
  bmfLetter2026: {
    publisher: "Bundesministerium der Finanzen",
    title: "BMF-Schreiben vom 15. Oktober 2026: Obligatorische elektronische Rechnung",
    url: "https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Umsatzsteuer/Umsatzsteuer-Anwendungserlass/2026-10-15-obligatorische-elektronische-rechnung.pdf?__blob=publicationFile",
    checked: "2026-11-24",
    checkedVia: "search-excerpt",
  },
  frEconomie: {
    publisher: "Ministère de l'Économie (economie.gouv.fr)",
    title: "Tout savoir sur la facturation électronique pour les entreprises",
    url: "https://www.economie.gouv.fr/tout-savoir-sur-la-facturation-electronique-pour-les-entreprises",
    checked: "2026-11-24",
    checkedVia: "search-excerpt",
  },
  frImpotsDecouvre: {
    publisher: "DGFiP (impots.gouv.fr)",
    title: "Je découvre la facturation électronique",
    url: "https://www.impots.gouv.fr/professionnel/je-decouvre-la-facturation-electronique",
    checked: "2026-11-24",
    checkedVia: "search-excerpt",
  },
  frImpotsGuide: {
    publisher: "DGFiP (impots.gouv.fr)",
    title: "Facturation électronique : guide pratique de démarrage au 1er septembre 2026",
    url: "https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/guide_pratique_facturation_electronique.pdf",
    checked: "2026-11-24",
    checkedVia: "search-excerpt",
  },
  frImpotsMentions: {
    publisher: "DGFiP (impots.gouv.fr)",
    title: "Facturation électronique : fiche 1-f (nouvelles mentions)",
    url: "https://www.impots.gouv.fr/sites/default/files/media/1_metier/2_professionnel/EV/2_gestion/290_facturation_electronique/fiches_reforme/fiche-1_f_ps.pdf",
    checked: "2026-11-24",
    checkedVia: "search-excerpt",
  },
};

/**
 * Countries with a deadline page. `date` is ISO; `kind` is receive | issue | rule.
 * Text is written per language here so the date and its wording never drift apart.
 */
export const COUNTRIES = [
  {
    key: "de",
    name: { de: "Deutschland", fr: "Allemagne", en: "Germany" },
    slug: { de: "deutschland", fr: "allemagne", en: "germany" },
    scope: {
      de: "Rechnungen zwischen inländischen Unternehmern (B2B) für Umsätze, die in Deutschland steuerbar sind.",
      fr: "Factures entre entreprises établies en Allemagne (B2B) pour des opérations imposables en Allemagne.",
      en: "Invoices between businesses established in Germany (B2B) for supplies taxable in Germany.",
    },
    deadlines: [
      {
        date: "2025-01-01",
        kind: "receive",
        source: "bmfFaq",
        text: {
          de: "Alle inländischen Unternehmer müssen E-Rechnungen empfangen können. Laut BMF genügt dafür ein E-Mail-Postfach.",
          fr: "Toutes les entreprises établies en Allemagne doivent pouvoir recevoir des e-factures. Selon le BMF, une simple boîte e-mail suffit.",
          en: "Every business established in Germany must be able to receive e-invoices. According to the BMF, an email inbox is enough.",
        },
      },
      {
        date: "2026-12-31",
        kind: "issue",
        source: "bmfFaq",
        text: {
          de: "Ende der allgemeinen Übergangsfrist: Bis zu diesem Tag dürfen alle Rechnungsaussteller statt einer E-Rechnung noch eine sonstige Rechnung (Papier oder z. B. einfaches PDF) ausstellen.",
          fr: "Fin de la période transitoire générale : jusqu'à cette date, tout émetteur peut encore émettre une « autre facture » (papier ou PDF simple, par exemple) au lieu d'une e-facture.",
          en: "End of the general transition period: until this day, any issuer may still send an 'other invoice' (paper or, for example, a plain PDF) instead of an e-invoice.",
        },
      },
      {
        date: "2027-12-31",
        kind: "issue",
        source: "bmfFaq",
        text: {
          de: "Ende der verlängerten Übergangsfrist für Aussteller, deren Vorjahresumsatz höchstens 800.000 Euro betrug. Bis dahin ist auch ein EDI-Verfahren zulässig, das die E-Rechnungs-Anforderungen nicht erfüllt. Danach müssen alle inländischen B2B-Rechnungen E-Rechnungen sein.",
          fr: "Fin de la période transitoire prolongée pour les émetteurs dont le chiffre d'affaires de l'année précédente n'a pas dépassé 800 000 euros. Jusque-là, un échange EDI non conforme aux exigences de l'e-facture reste admis. Ensuite, toutes les factures B2B nationales doivent être des e-factures.",
          en: "End of the extended transition period for issuers whose prior-year turnover was at most €800,000. Until then, an EDI procedure that does not meet the e-invoice requirements is also still allowed. After that, every domestic B2B invoice must be an e-invoice.",
        },
      },
    ],
    rules: [
      {
        source: "bmfFaq",
        text: {
          de: "Eine E-Rechnung ist nur eine Rechnung in einem strukturierten elektronischen Format nach EN 16931, das eine elektronische Verarbeitung ermöglicht. Ein einfaches PDF ist keine E-Rechnung.",
          fr: "Seule une facture dans un format électronique structuré conforme à la norme EN 16931, permettant un traitement automatisé, est une e-facture. Un PDF simple n'en est pas une.",
          en: "Only an invoice in a structured electronic format under EN 16931 that allows automated processing is an e-invoice. A plain PDF is not one.",
        },
      },
      {
        source: "bmfFaq",
        text: {
          de: "XRechnung und ZUGFeRD ab Version 2.0.1 erfüllen die Anforderungen, mit Ausnahme der ZUGFeRD-Profile MINIMUM und BASIC-WL.",
          fr: "XRechnung et ZUGFeRD à partir de la version 2.0.1 satisfont aux exigences, à l'exception des profils ZUGFeRD MINIMUM et BASIC-WL.",
          en: "XRechnung and ZUGFeRD from version 2.0.1 meet the requirements, except the ZUGFeRD profiles MINIMUM and BASIC-WL.",
        },
      },
      {
        source: "bmfLetter2026",
        text: {
          de: "Das BMF-Schreiben vom 15. Oktober 2026 enthält weitere Nichtbeanstandungsregeln, u. a. zu E-Rechnungen auf Bruttopreisbasis bis 31. Dezember 2027. Lesen Sie den Wortlaut im Schreiben selbst.",
          fr: "La lettre du BMF du 15 octobre 2026 ajoute d'autres tolérances, notamment pour les e-factures établies en prix TTC jusqu'au 31 décembre 2027. Lisez le texte exact dans la lettre elle-même.",
          en: "The BMF letter of 15 October 2026 adds further tolerance rules, among them for e-invoices based on gross prices until 31 December 2027. Read the exact wording in the letter itself.",
        },
      },
    ],
  },
  {
    key: "fr",
    name: { de: "Frankreich", fr: "France", en: "France" },
    slug: { de: "frankreich", fr: "france", en: "france" },
    scope: {
      de: "Rechnungen zwischen in Frankreich umsatzsteuerpflichtigen Unternehmen (B2B) sowie das E-Reporting weiterer Umsatz- und Zahlungsdaten.",
      fr: "Factures entre entreprises assujetties à la TVA en France (B2B), et transmission (e-reporting) des autres données de transaction et de paiement.",
      en: "Invoices between businesses subject to VAT in France (B2B), plus e-reporting of other transaction and payment data.",
    },
    deadlines: [
      {
        date: "2026-09-01",
        kind: "receive",
        source: "frImpotsGuide",
        text: {
          de: "Alle Unternehmen, unabhängig von ihrer Größe, müssen E-Rechnungen empfangen können, und zwar über eine zugelassene Plattform (plateforme agréée).",
          fr: "Toutes les entreprises, quelle que soit leur taille, doivent être en capacité de recevoir des factures électroniques, par l'intermédiaire d'une plateforme agréée.",
          en: "Every business, whatever its size, must be able to receive e-invoices, through an approved platform (plateforme agréée).",
        },
      },
      {
        date: "2026-09-01",
        kind: "issue",
        source: "frEconomie",
        text: {
          de: "Große Unternehmen (GE) und mittelgroße Unternehmen (ETI) müssen E-Rechnungen ausstellen und das E-Reporting übermitteln.",
          fr: "Les grandes entreprises (GE) et les entreprises de taille intermédiaire (ETI) doivent émettre leurs factures au format électronique et transmettre leurs données d'e-reporting.",
          en: "Large enterprises (GE) and mid-sized enterprises (ETI) must issue e-invoices and send e-reporting data.",
        },
      },
      {
        date: "2027-09-01",
        kind: "issue",
        source: "frEconomie",
        text: {
          de: "Kleine und mittlere Unternehmen (PME) und Kleinstunternehmen müssen spätestens ab diesem Tag E-Rechnungen ausstellen und das E-Reporting übermitteln. Ein freiwilliger früherer Einstieg ist möglich.",
          fr: "Les PME et les micro-entreprises doivent émettre leurs factures au format électronique, et transmettre leur e-reporting, au plus tard à cette date. Elles peuvent entrer volontairement plus tôt.",
          en: "Small and medium-sized enterprises (PME) and micro-enterprises must issue e-invoices and send e-reporting data from this date at the latest. They may start earlier voluntarily.",
        },
      },
    ],
    rules: [
      {
        source: "frImpotsDecouvre",
        text: {
          de: "Zugelassene Plattformen übermitteln Rechnungen in einem von drei Formaten: UBL, CII oder Factur-X (ein PDF mit eingebettetem strukturierten XML).",
          fr: "Les plateformes agréées transmettent les factures dans l'un de trois formats : UBL, CII ou Factur-X (un PDF auquel est joint un fichier XML structuré).",
          en: "Approved platforms transmit invoices in one of three formats: UBL, CII or Factur-X (a PDF with structured XML attached).",
        },
      },
      {
        source: "frImpotsMentions",
        text: {
          de: "Neue Pflichtangaben: die SIREN des Kunden, die Art des Umsatzes (Lieferung, Dienstleistung oder beides) und gegebenenfalls die Option zur Besteuerung nach vereinbarten Entgelten (TVA sur les débits).",
          fr: "Nouvelles mentions obligatoires : le SIREN du client, la catégorie de l'opération (livraison de biens, prestation de services ou les deux) et, le cas échéant, l'option pour le paiement de la TVA d'après les débits.",
          en: "New mandatory details: the customer's SIREN, the category of the transaction (goods, services or both) and, where it applies, the option to pay VAT on debits.",
        },
      },
    ],
  },
];

/** All source keys a page actually cites, in first-use order. */
export function sourcesFor(country) {
  const keys = [...country.deadlines, ...country.rules].map((d) => d.source);
  return [...new Set(keys)].map((k) => ({ key: k, ...SOURCES[k] }));
}
