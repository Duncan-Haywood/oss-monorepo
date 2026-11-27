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
  "efacture.belgium.be",
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
  // Belgium: read directly from the federal e-invoicing site efacture.belgium.be (run by FPS BOSA
  // with FPS Finance) on 2026-11-27; the pages answered from the build environment, so
  // `checkedVia: "direct"`. Dates shown on the pages themselves: "Pour qui" 09/10/2024, tolerance
  // 18/12/2025, VAT measures 19/12/2025, end of tolerance 07/04/2026.
  beWho: {
    publisher: "SPF BOSA / SPF Finances (efacture.belgium.be)",
    title: "Pour qui la facturation électronique deviendra-t-elle obligatoire ?",
    url: "https://efacture.belgium.be/fr/article/pour-qui-la-facturation-electronique-deviendra-t-elle-obligatoire",
    checked: "2026-11-27",
    checkedVia: "direct",
  },
  beTolerance: {
    publisher: "SPF BOSA / SPF Finances (efacture.belgium.be)",
    title: "Période de tolérance pendant les trois premiers mois de 2026",
    url: "https://efacture.belgium.be/fr/news/periode-de-tolerance-pendant-les-trois-premiers-mois-de-2026",
    checked: "2026-11-27",
    checkedVia: "direct",
  },
  beToleranceEnd: {
    publisher: "SPF BOSA / SPF Finances (efacture.belgium.be)",
    title: "Fin de la période de tolérance pour l'e-facturation",
    url: "https://efacture.belgium.be/fr/news/fin-de-la-periode-de-tolerance-pour-le-facturation",
    checked: "2026-11-27",
    checkedVia: "direct",
  },
  beVatMeasures: {
    publisher: "SPF BOSA / SPF Finances (efacture.belgium.be)",
    title: "E-facturation : mesures en matière de TVA à partir du 1er janvier 2026",
    url: "https://efacture.belgium.be/fr/news/e-facturation-mesures-en-matiere-de-tva-partir-du-1er-janvier-2026",
    checked: "2026-11-27",
    checkedVia: "direct",
  },
  beReportingFaq: {
    publisher: "SPF BOSA / SPF Finances (efacture.belgium.be)",
    title: "Questions générales sur la future obligation en matière d'e-reporting",
    url: "https://efacture.belgium.be/fr/FAQ/questions-generales-sur-le-e-reporting",
    checked: "2026-11-27",
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
    name: { de: "Deutschland", fr: "Allemagne", en: "Germany", nl: "Duitsland" },
    slug: { de: "deutschland", fr: "allemagne", en: "germany", nl: "duitsland" },
    scope: {
      de: "Rechnungen zwischen inländischen Unternehmern (B2B) für Umsätze, die in Deutschland steuerbar sind.",
      fr: "Factures entre entreprises établies en Allemagne (B2B) pour des opérations imposables en Allemagne.",
      en: "Invoices between businesses established in Germany (B2B) for supplies taxable in Germany.",
      nl: "Facturen tussen ondernemingen die in Duitsland gevestigd zijn (B2B) voor handelingen die in Duitsland belastbaar zijn.",
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
          nl: "Elke in Duitsland gevestigde onderneming moet e-facturen kunnen ontvangen. Volgens het BMF volstaat daarvoor een e-mailbox.",
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
          nl: "Einde van de algemene overgangsperiode: tot deze dag mag elke uitreiker nog een 'andere factuur' (op papier of bijvoorbeeld een gewone pdf) versturen in plaats van een e-factuur.",
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
          nl: "Einde van de verlengde overgangsperiode voor uitreikers met een omzet van ten hoogste 800.000 euro in het voorgaande jaar. Tot dan is ook een EDI-procedure toegestaan die niet aan de eisen voor e-facturen voldoet. Daarna moet elke binnenlandse B2B-factuur een e-factuur zijn.",
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
          nl: "Alleen een factuur in een gestructureerd elektronisch formaat volgens EN 16931, dat automatische verwerking mogelijk maakt, is een e-factuur. Een gewone pdf is dat niet.",
        },
      },
      {
        source: "bmfFaq",
        text: {
          de: "XRechnung und ZUGFeRD ab Version 2.0.1 erfüllen die Anforderungen, mit Ausnahme der ZUGFeRD-Profile MINIMUM und BASIC-WL.",
          fr: "XRechnung et ZUGFeRD à partir de la version 2.0.1 satisfont aux exigences, à l'exception des profils ZUGFeRD MINIMUM et BASIC-WL.",
          en: "XRechnung and ZUGFeRD from version 2.0.1 meet the requirements, except the ZUGFeRD profiles MINIMUM and BASIC-WL.",
          nl: "XRechnung en ZUGFeRD vanaf versie 2.0.1 voldoen aan de eisen, behalve de ZUGFeRD-profielen MINIMUM en BASIC-WL.",
        },
      },
      {
        source: "bmfLetter2026",
        text: {
          de: "Das BMF-Schreiben vom 15. Oktober 2026 enthält weitere Nichtbeanstandungsregeln, u. a. zu E-Rechnungen auf Bruttopreisbasis bis 31. Dezember 2027. Lesen Sie den Wortlaut im Schreiben selbst.",
          fr: "La lettre du BMF du 15 octobre 2026 ajoute d'autres tolérances, notamment pour les e-factures établies en prix TTC jusqu'au 31 décembre 2027. Lisez le texte exact dans la lettre elle-même.",
          en: "The BMF letter of 15 October 2026 adds further tolerance rules, among them for e-invoices based on gross prices until 31 December 2027. Read the exact wording in the letter itself.",
          nl: "De BMF-brief van 15 oktober 2026 voegt verdere tolerantieregels toe, onder meer voor e-facturen op basis van brutoprijzen tot 31 december 2027. Lees de exacte tekst in de brief zelf.",
        },
      },
    ],
  },
  {
    key: "fr",
    name: { de: "Frankreich", fr: "France", en: "France", nl: "Frankrijk" },
    slug: { de: "frankreich", fr: "france", en: "france", nl: "frankrijk" },
    scope: {
      de: "Rechnungen zwischen in Frankreich umsatzsteuerpflichtigen Unternehmen (B2B) sowie das E-Reporting weiterer Umsatz- und Zahlungsdaten.",
      fr: "Factures entre entreprises assujetties à la TVA en France (B2B), et transmission (e-reporting) des autres données de transaction et de paiement.",
      en: "Invoices between businesses subject to VAT in France (B2B), plus e-reporting of other transaction and payment data.",
      nl: "Facturen tussen ondernemingen die in Frankrijk btw-plichtig zijn (B2B), en de doorgifte (e-reporting) van andere transactie- en betalingsgegevens.",
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
          nl: "Elke onderneming, ongeacht haar omvang, moet e-facturen kunnen ontvangen, via een erkend platform (plateforme agréée).",
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
          nl: "Grote ondernemingen (GE) en middelgrote ondernemingen (ETI) moeten e-facturen uitreiken en e-reportinggegevens doorgeven.",
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
          nl: "Kleine en middelgrote ondernemingen (PME) en micro-ondernemingen moeten uiterlijk vanaf deze datum e-facturen uitreiken en e-reportinggegevens doorgeven. Ze mogen vrijwillig eerder beginnen.",
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
          nl: "Erkende platforms versturen facturen in een van drie formaten: UBL, CII of Factur-X (een pdf met daarin een gestructureerd XML-bestand).",
        },
      },
      {
        source: "frImpotsMentions",
        text: {
          de: "Neue Pflichtangaben: die SIREN des Kunden, die Art des Umsatzes (Lieferung, Dienstleistung oder beides) und gegebenenfalls die Option zur Besteuerung nach vereinbarten Entgelten (TVA sur les débits).",
          fr: "Nouvelles mentions obligatoires : le SIREN du client, la catégorie de l'opération (livraison de biens, prestation de services ou les deux) et, le cas échéant, l'option pour le paiement de la TVA d'après les débits.",
          en: "New mandatory details: the customer's SIREN, the category of the transaction (goods, services or both) and, where it applies, the option to pay VAT on debits.",
          nl: "Nieuwe verplichte vermeldingen: het SIREN-nummer van de klant, de categorie van de handeling (levering van goederen, dienstverrichting of beide) en, waar van toepassing, de keuze om de btw te voldoen op basis van de facturering (TVA sur les débits).",
        },
      },
    ],
  },
  {
    key: "pl",
    name: { de: "Polen", fr: "Pologne", en: "Poland", nl: "Polen" },
    slug: { de: "polen", fr: "pologne", en: "poland", nl: "polen" },
    scope: {
      de: "Rechnungen, die nach polnischem Umsatzsteuerrecht ausgestellt werden, über das nationale System KSeF (Krajowy System e-Faktur), auch Rechnungen an ausländische Kunden.",
      fr: "Factures émises au sens du droit polonais de la TVA, via le système national KSeF (Krajowy System e-Faktur), y compris celles adressées à des clients étrangers.",
      en: "Invoices issued under Polish VAT law, through the national KSeF system (Krajowy System e-Faktur), including invoices to foreign customers.",
      nl: "Facturen die onder het Poolse btw-recht worden uitgereikt, via het nationale systeem KSeF (Krajowy System e-Faktur), ook facturen aan buitenlandse klanten.",
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
          nl: "Facturen worden in KSeF ontvangen. Volgens het ministerie geldt een factuur als ontvangen door de koper zodra KSeF er een nummer aan toekent.",
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
          nl: "Uitreiken in KSeF wordt verplicht voor ondernemingen waarvan de verkopen in 2024 meer dan 200 miljoen PLN (inclusief btw) bedroegen.",
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
          nl: "Uitreiken in KSeF wordt verplicht voor alle andere ondernemingen.",
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
          nl: "Laatste dag van de versoepeling: facturen buiten KSeF (op papier of elektronisch) blijven toegestaan als hun totaal inclusief btw in die maand niet hoger is dan 10.000 PLN.",
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
          nl: "KSeF wordt ook verplicht voor de ondernemingen die tot dan vrijgesteld waren (tot 10.000 PLN per maand).",
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
          nl: "De factuur is een gestructureerde factuur in de logische structuur FA(3). KSeF weigert een bestand met fouten, en de factuur geldt dan als niet uitgereikt: het document wordt pas een factuur zodra het zijn KSeF-nummer heeft (offline- en noodmodus buiten beschouwing).",
        },
      },
      {
        source: "plKsefFaq",
        text: {
          de: "Ein ausländisches Unternehmen, das in Polen umsatzsteuerlich registriert ist, muss nicht in KSeF ausstellen, wenn es in Polen weder Sitz noch feste Niederlassung hat oder wenn seine feste Niederlassung an dem Umsatz nicht beteiligt ist. Es darf KSeF freiwillig nutzen.",
          fr: "Une entreprise étrangère immatriculée à la TVA en Pologne n'est pas tenue d'émettre dans KSeF si elle n'a en Pologne ni siège ni établissement stable, ou si son établissement stable ne participe pas à l'opération facturée. Elle peut utiliser KSeF volontairement.",
          en: "A foreign business registered for VAT in Poland does not have to issue in KSeF if it has neither its seat nor a fixed establishment in Poland, or if its fixed establishment takes no part in the supply invoiced. It may use KSeF voluntarily.",
          nl: "Een buitenlandse onderneming die in Polen voor de btw geregistreerd is, hoeft niet in KSeF uit te reiken als ze in Polen geen zetel en geen vaste inrichting heeft, of als haar vaste inrichting niet betrokken is bij de gefactureerde handeling. Ze mag KSeF vrijwillig gebruiken.",
        },
      },
      {
        source: "plKsefFaq",
        text: {
          de: "Ein ausländischer Kunde ohne polnische NIP kann sich nicht bei KSeF anmelden. Der Verkäufer übermittelt ihm die Rechnung auf vereinbartem Weg (z. B. als PDF per E-Mail), versehen mit einem QR-Code, mit dem sich prüfen lässt, dass die Rechnung in KSeF existiert.",
          fr: "Un client étranger sans NIP polonais ne peut pas se connecter à KSeF. Le vendeur lui transmet la facture par le moyen convenu (par exemple en PDF par e-mail), avec un code QR permettant de vérifier qu'elle existe dans KSeF.",
          en: "A foreign customer without a Polish NIP cannot log in to KSeF. The seller passes the invoice on in an agreed way (a PDF by email, for example), with a QR code that lets the customer check the invoice exists in KSeF.",
          nl: "Een buitenlandse klant zonder Pools NIP kan niet inloggen op KSeF. De verkoper bezorgt hem de factuur op een afgesproken manier (bijvoorbeeld als pdf per e-mail), met een QR-code waarmee de klant kan nagaan dat de factuur in KSeF bestaat.",
        },
      },
    ],
  },
  {
    key: "be",
    name: { de: "Belgien", fr: "Belgique", en: "Belgium", nl: "België" },
    slug: { de: "belgien", fr: "belgique", en: "belgium", nl: "belgie" },
    scope: {
      de: "Rechnungen zwischen in Belgien ansässigen umsatzsteuerpflichtigen Unternehmen (B2B), als strukturierte E-Rechnung über das Peppol-Netz; dazu Rechnungen an öffentliche Auftraggeber (B2G).",
      fr: "Factures entre entreprises assujetties à la TVA établies en Belgique (B2B), sous forme de facture électronique structurée via le réseau Peppol, ainsi que les factures aux pouvoirs publics (B2G).",
      en: "Invoices between VAT-registered businesses established in Belgium (B2B), as structured e-invoices over the Peppol network, plus invoices to public bodies (B2G).",
      nl: "Facturen tussen btw-plichtige ondernemingen die in België gevestigd zijn (B2B), als gestructureerde e-factuur via het Peppol-netwerk, en facturen aan overheden (B2G).",
    },
    deadlines: [
      {
        date: "2024-03-01",
        kind: "issue",
        source: "beWho",
        text: {
          de: "Rechnungen an öffentliche Auftraggeber (B2G): strukturierte E-Rechnung über Peppol im Format Peppol BIS für Aufträge, die nach dem 1. März 2024 veröffentlicht wurden, in der Regel ab 3.000 € ohne MwSt. (föderale Auftraggeber auch darunter).",
          fr: "Factures aux pouvoirs publics (B2G) : facture électronique structurée via Peppol au format Peppol BIS pour les marchés publiés après le 1er mars 2024, en règle générale à partir de 3 000 € HTVA (les pouvoirs adjudicateurs fédéraux aussi en dessous).",
          en: "Invoices to public bodies (B2G): a structured e-invoice over Peppol in Peppol BIS format for contracts published after 1 March 2024, as a rule from €3,000 excluding VAT (federal contracting authorities below that too).",
          nl: "Facturen aan overheden (B2G): een gestructureerde e-factuur via Peppol in het formaat Peppol BIS voor opdrachten die na 1 maart 2024 zijn bekendgemaakt, in de regel vanaf 3.000 euro exclusief btw (federale aanbestedende overheden ook daaronder).",
        },
      },
      {
        date: "2026-01-01",
        kind: "receive",
        source: "beWho",
        text: {
          de: "Jedes in Belgien ansässige umsatzsteuerpflichtige Unternehmen muss strukturierte E-Rechnungen empfangen können, auch wenn es selbst nur an Privatkunden verkauft oder die Kleinunternehmerregelung (bis 25.000 € Jahresumsatz) nutzt.",
          fr: "Toute entreprise assujettie à la TVA établie en Belgique doit pouvoir recevoir des factures électroniques structurées, même si elle ne vend qu'à des particuliers ou applique le régime de la franchise pour petites entreprises (chiffre d'affaires annuel jusqu'à 25 000 €).",
          en: "Every VAT-registered business established in Belgium must be able to receive structured e-invoices, even if it sells only to consumers or uses the small-business exemption scheme (annual turnover up to €25,000).",
          nl: "Elke btw-plichtige onderneming die in België gevestigd is, moet gestructureerde e-facturen kunnen ontvangen, ook als ze alleen aan particulieren verkoopt of de vrijstellingsregeling voor kleine ondernemingen (jaaromzet tot 25.000 euro) toepast.",
        },
      },
      {
        date: "2026-01-01",
        kind: "issue",
        source: "beWho",
        text: {
          de: "Rechnungen zwischen belgischen umsatzsteuerpflichtigen Unternehmen müssen strukturierte E-Rechnungen sein, über Peppol im Format Peppol BIS (außer bei gegenseitiger Vereinbarung unter Einhaltung der EN 16931). Ein PDF per E-Mail oder über eine Plattform reicht nicht mehr.",
          fr: "Les factures entre entreprises belges assujetties à la TVA doivent être des factures électroniques structurées, via Peppol au format Peppol BIS (sauf accord mutuel et respect de la norme EN 16931). Un PDF envoyé par e-mail ou par une plateforme ne suffit plus.",
          en: "Invoices between Belgian VAT-registered businesses must be structured e-invoices, over Peppol in Peppol BIS format (unless both sides agree otherwise and EN 16931 is met). A PDF sent by email or through a portal no longer counts.",
          nl: "Facturen tussen Belgische btw-plichtige ondernemingen moeten gestructureerde e-facturen zijn, via Peppol in het formaat Peppol BIS (tenzij beide partijen iets anders afspreken en EN 16931 wordt nageleefd). Een pdf per e-mail of via een portaal volstaat niet meer.",
        },
      },
      {
        date: "2026-03-31",
        kind: "issue",
        source: "beTolerance",
        text: {
          de: "Ende der allgemeinen Toleranz: In den ersten drei Monaten 2026 verhängte der FÖD Finanzen keine Sanktionen für Verstöße gegen die neue Pflicht, wenn das Unternehmen rechtzeitig und angemessen vorgesorgt hatte. Laut der Meldung vom 7. April 2026 ist diese Toleranz beendet.",
          fr: "Fin de la tolérance générale : pendant les trois premiers mois de 2026, le SPF Finances n'a pas appliqué de sanctions pour les infractions à la nouvelle obligation lorsque l'entreprise avait pris des dispositions en temps utile et de manière raisonnable. Selon l'annonce du 7 avril 2026, cette tolérance est terminée.",
          en: "End of the general tolerance: during the first three months of 2026, FPS Finance applied no penalties for breaches of the new obligation where the business had prepared in good time and reasonably. According to the notice of 7 April 2026, that tolerance has ended.",
          nl: "Einde van de algemene tolerantie: in de eerste drie maanden van 2026 legde de FOD Financiën geen sancties op voor inbreuken op de nieuwe verplichting als de onderneming tijdig en redelijk de nodige stappen had gezet. Volgens het bericht van 7 april 2026 is die tolerantie afgelopen.",
        },
      },
      {
        date: "2026-06-30",
        kind: "issue",
        source: "beToleranceEnd",
        text: {
          de: "Letzter Tag der Toleranz für Gutschriftverfahren (Self-Billing): Konnte die Software des Unternehmens Self-Billing über Peppol noch nicht, wurde bis einschließlich zu diesem Tag keine Geldbuße verhängt.",
          fr: "Dernier jour de la tolérance pour l'autofacturation (self-billing) : lorsque le logiciel de l'entreprise ne permettait pas encore le self-billing via Peppol, aucune amende n'était infligée jusqu'à cette date incluse.",
          en: "Last day of the tolerance for self-billing: where the business's software could not yet do self-billing over Peppol, no fine was imposed up to and including this day.",
          nl: "Laatste dag van de tolerantie voor self-billing (zelffacturering): als de software van de onderneming self-billing via Peppol nog niet aankon, werd tot en met deze dag geen boete opgelegd.",
        },
      },
    ],
    rules: [
      {
        source: "beVatMeasures",
        text: {
          de: "Ausnahme bei technischer Unmöglichkeit: Kann der Empfänger technisch keine E-Rechnung empfangen, darf der Lieferant ausnahmsweise eine Rechnung auf Papier oder als einfache elektronische Datei (z. B. PDF) ausstellen. Der Empfänger bleibt verpflichtet, sich unverzüglich empfangsbereit zu machen.",
          fr: "Règle de repli : lorsque le destinataire n'est techniquement pas en mesure de recevoir une facture électronique, le fournisseur peut émettre une facture sur papier ou sous une autre forme électronique (par exemple en PDF). Le destinataire reste tenu de se mettre sans délai en mesure de recevoir.",
          en: "Fallback rule: where the recipient technically cannot receive an e-invoice, the supplier may issue the invoice on paper or in another electronic form (a PDF, for example). The recipient still has to become able to receive without delay.",
          nl: "Terugvalregel: als de ontvanger technisch geen e-factuur kan ontvangen, mag de leverancier de factuur op papier of in een andere elektronische vorm (bijvoorbeeld als pdf) uitreiken. De ontvanger moet zich wel onverwijld in staat stellen om te ontvangen.",
        },
      },
      {
        source: "beWho",
        text: {
          de: "Nicht erfasst sind umsatzsteuerpflichtige Unternehmen ohne Sitz und ohne feste Niederlassung in Belgien, auch wenn sie in Belgien für die Umsatzsteuer registriert sind, sowie Unternehmen, die nur nach Artikel 44 des MwSt.-Gesetzbuchs steuerbefreite Umsätze tätigen.",
          fr: "Ne sont pas concernés les assujettis non établis en Belgique sans établissement stable, même s'ils y sont identifiés à la TVA, ni les entreprises qui réalisent uniquement des opérations exemptées en vertu de l'article 44 du Code de la TVA.",
          en: "Not covered: VAT-registered businesses with neither their seat nor a fixed establishment in Belgium, even if they hold a Belgian VAT number, and businesses that make only supplies exempt under Article 44 of the VAT Code.",
          nl: "Niet gevat: btw-plichtigen zonder zetel en zonder vaste inrichting in België, ook als ze er een btw-nummer hebben, en ondernemingen die uitsluitend handelingen verrichten die vrijgesteld zijn op grond van artikel 44 van het Btw-wetboek.",
        },
      },
      {
        source: "beReportingFaq",
        text: {
          de: "E-Reporting: Seit dem 1. Januar 2026 werden noch keine Rechnungsdaten an die Verwaltung übermittelt. Ein laufendes Meldesystem ist im föderalen Koalitionsabkommen für 2028 vorgesehen, muss aber noch in belgisches Recht umgesetzt werden; es soll die jährliche Kundenliste ersetzen.",
          fr: "E-reporting : depuis le 1er janvier 2026, aucune information de la facture n'est encore envoyée à l'administration. Un reporting en temps quasi réel figure dans l'accord de coalition fédérale (timing : 2028) mais doit encore être transposé en droit belge ; il remplacera le listing clients annuel.",
          en: "E-reporting: since 1 January 2026, no invoice data is sent to the administration yet. Near real-time reporting is in the federal coalition agreement (timing: 2028) but still has to become Belgian law; it is to replace the annual client listing.",
          nl: "E-reporting: sinds 1 januari 2026 worden nog geen factuurgegevens naar de administratie gestuurd. Rapportering in bijna reële tijd staat in het federale regeerakkoord (timing: 2028), maar moet nog in Belgisch recht worden omgezet; ze moet de jaarlijkse klantenlisting vervangen.",
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
