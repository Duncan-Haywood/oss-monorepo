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
  "ksef.podatki.gov.pl",
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
  // Poland: read directly from the Ministry of Finance's KSeF site on 2026-11-26 (the pages answered
  // from the build environment, so `checkedVia: "direct"`). Each page's own "Zmodyfikowano" date:
  // stages 29.05.2026, "od kiedy" 30.04.2026, FAQ 10.11.2026.
  plKsefStages: {
    publisher: "Ministerstwo Finansów (ksef.podatki.gov.pl)",
    title: "Etapy wdrożenia KSeF 2.0",
    url: "https://ksef.podatki.gov.pl/etapy-wdrozenia-ksef",
    checked: "2026-11-26",
    checkedVia: "direct",
  },
  plKsefFrom: {
    publisher: "Ministerstwo Finansów (ksef.podatki.gov.pl)",
    title: "Od kiedy trzeba wystawiać faktury w KSeF?",
    url: "https://ksef.podatki.gov.pl/od-kiedy-trzeba-wystawiac-faktury-w-ksef",
    checked: "2026-11-26",
    checkedVia: "direct",
  },
  plKsefFaq: {
    publisher: "Ministerstwo Finansów (ksef.podatki.gov.pl)",
    title: "Pytania i odpowiedzi KSeF 2.0",
    url: "https://ksef.podatki.gov.pl/pytania-i-odpowiedzi-ksef-20",
    checked: "2026-11-26",
    checkedVia: "direct",
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
  {
    key: "pl",
    name: { de: "Polen", fr: "Pologne", en: "Poland" },
    slug: { de: "polen", fr: "pologne", en: "poland" },
    scope: {
      de: "Rechnungen, die nach polnischem Umsatzsteuerrecht ausgestellt werden, über das nationale System KSeF (Krajowy System e-Faktur), auch Rechnungen an ausländische Kunden.",
      fr: "Factures émises au sens du droit polonais de la TVA, via le système national KSeF (Krajowy System e-Faktur), y compris celles adressées à des clients étrangers.",
      en: "Invoices issued under Polish VAT law, through the national KSeF system (Krajowy System e-Faktur), including invoices to foreign customers.",
    },
    deadlines: [
      {
        date: "2026-02-01",
        kind: "receive",
        source: "plKsefFaq",
        text: {
          de: "Rechnungen werden in KSeF empfangen. Laut Ministerium gilt eine Rechnung als beim Käufer eingegangen, sobald KSeF ihr eine Nummer zuteilt.",
          fr: "Les factures sont reçues dans KSeF. Selon le ministère, une facture est réputée reçue par l'acheteur dès que KSeF lui attribue un numéro.",
          en: "Invoices are received in KSeF. According to the Ministry, an invoice counts as received by the buyer the moment KSeF assigns it a number.",
        },
      },
      {
        date: "2026-02-01",
        kind: "issue",
        source: "plKsefFrom",
        text: {
          de: "Pflicht zur Ausstellung in KSeF für Unternehmen, deren Umsatz 2024 über 200 Mio. PLN (einschließlich Umsatzsteuer) lag.",
          fr: "Obligation d'émettre dans KSeF pour les entreprises dont les ventes de 2024 ont dépassé 200 millions de PLN (TVA comprise).",
          en: "Issuing in KSeF becomes mandatory for businesses whose 2024 sales exceeded PLN 200 million (including VAT).",
        },
      },
      {
        date: "2026-04-01",
        kind: "issue",
        source: "plKsefFrom",
        text: {
          de: "Pflicht zur Ausstellung in KSeF für alle übrigen Unternehmen.",
          fr: "Obligation d'émettre dans KSeF pour toutes les autres entreprises.",
          en: "Issuing in KSeF becomes mandatory for every other business.",
        },
      },
      {
        date: "2026-12-31",
        kind: "issue",
        source: "plKsefFrom",
        text: {
          de: "Letzter Tag der Erleichterung: Rechnungen außerhalb von KSeF (Papier oder elektronisch) sind noch zulässig, wenn ihre Summe einschließlich Umsatzsteuer in dem Monat 10.000 PLN nicht übersteigt.",
          fr: "Dernier jour de la tolérance : des factures hors KSeF (papier ou électroniques) restent possibles si leur total TVA comprise ne dépasse pas 10 000 PLN sur le mois.",
          en: "Last day of the relief: invoices outside KSeF (paper or electronic) are still allowed if their total including VAT stays at or below PLN 10,000 in the month.",
        },
      },
      {
        date: "2027-01-01",
        kind: "issue",
        source: "plKsefStages",
        text: {
          de: "KSeF wird auch für die bisher befreiten Unternehmen (bis 10.000 PLN im Monat) Pflicht.",
          fr: "KSeF devient obligatoire aussi pour les entreprises jusqu'ici dispensées (jusqu'à 10 000 PLN par mois).",
          en: "KSeF becomes mandatory for the businesses exempt until then (up to PLN 10,000 a month) as well.",
        },
      },
    ],
    rules: [
      {
        source: "plKsefFaq",
        text: {
          de: "Die Rechnung ist eine strukturierte Rechnung in der logischen Struktur FA(3). Eine Datei mit Fehlern weist KSeF zurück, und die Rechnung gilt dann als nicht ausgestellt: Erst mit der KSeF-Nummer ist das Dokument eine Rechnung (Ausnahmen: Offline- und Notfallmodus).",
          fr: "La facture est une facture structurée au format logique FA(3). KSeF rejette un fichier comportant des erreurs, et la facture n'est alors pas émise : le document ne devient une facture qu'avec son numéro KSeF (sauf modes hors ligne et de secours).",
          en: "The invoice is a structured invoice in the FA(3) logical structure. KSeF rejects a file with errors, and the invoice is then not issued: the document only becomes an invoice once it has its KSeF number (offline and emergency modes aside).",
        },
      },
      {
        source: "plKsefFaq",
        text: {
          de: "Ein ausländisches Unternehmen, das in Polen umsatzsteuerlich registriert ist, muss nicht in KSeF ausstellen, wenn es in Polen weder Sitz noch feste Niederlassung hat oder wenn seine feste Niederlassung an dem Umsatz nicht beteiligt ist. Es darf KSeF freiwillig nutzen.",
          fr: "Une entreprise étrangère immatriculée à la TVA en Pologne n'est pas tenue d'émettre dans KSeF si elle n'a en Pologne ni siège ni établissement stable, ou si son établissement stable ne participe pas à l'opération facturée. Elle peut utiliser KSeF volontairement.",
          en: "A foreign business registered for VAT in Poland does not have to issue in KSeF if it has neither its seat nor a fixed establishment in Poland, or if its fixed establishment takes no part in the supply invoiced. It may use KSeF voluntarily.",
        },
      },
      {
        source: "plKsefFaq",
        text: {
          de: "Ein ausländischer Kunde ohne polnische NIP kann sich nicht bei KSeF anmelden. Der Verkäufer übermittelt ihm die Rechnung auf vereinbartem Weg (z. B. als PDF per E-Mail), versehen mit einem QR-Code, mit dem sich prüfen lässt, dass die Rechnung in KSeF existiert.",
          fr: "Un client étranger sans NIP polonais ne peut pas se connecter à KSeF. Le vendeur lui transmet la facture par le moyen convenu (par exemple en PDF par e-mail), avec un code QR permettant de vérifier qu'elle existe dans KSeF.",
          en: "A foreign customer without a Polish NIP cannot log in to KSeF. The seller passes the invoice on in an agreed way (a PDF by email, for example), with a QR code that lets the customer check the invoice exists in KSeF.",
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
