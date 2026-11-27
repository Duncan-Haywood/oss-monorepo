// Dutch copy, written for Belgian (Flemish) accountants and businesses first, in neutral standard
// Dutch with the formal "u" so it also reads right in the Netherlands. Facts (dates, rules, prices)
// come from content/deadlines.mjs and content/pricing.mjs through ctx; never type a date or a price
// in here. Drafted by the agent from the English text (2026-11-27), not yet read by a native
// speaker: README, "Native review required before launch".

const ui = {
  skip: "Naar de inhoud",
  banner:
    "Vroege toegang: de dienst is nog niet algemeen beschikbaar. Niets op deze site is fiscaal advies.",
  navLabel: "Hoofdmenu",
  langLabel: "Taal",
  nav: {
    accountants: "Boekhouders",
    api: "API",
    pricing: "Prijzen",
    "deadlines-de": "Duitsland",
    "deadlines-fr": "Frankrijk",
    "deadlines-pl": "Polen",
    "deadlines-be": "België",
    "early-access": "Vroege toegang",
    privacy: "Privacy",
  },
  footer:
    "Vroege toegang. Termijnen zijn overgenomen uit officiële bronnen, met de datum waarop we ze hebben nagekeken; de officiële tekst gaat altijd voor. Geen fiscaal advies.",
  chooser: "Nederlands",
  notFound: "Pagina niet gevonden. Naar de Nederlandstalige startpagina",
  kind: { receive: "Ontvangen", issue: "Uitreiken" },
  date: "Datum",
  what: "Geldt voor",
  detail: "Wat verandert",
  source: "Bron",
  sourcesHeading: "Officiële bronnen",
  checkedOn: "Nagekeken op",
  checkedViaSearch:
    "Nagekeken aan de hand van de tekst van de officiële pagina zoals een zoekopdracht beperkt tot de officiële site die teruggaf; open de link voor de actuele tekst",
  notTaxAdvice:
    "Deze pagina vat officiële richtlijnen samen. Ze is geen fiscaal advies en vervangt de officiële tekst of uw fiscaal adviseur niet.",
  plan: "Formule",
  perMonth: "Per maand",
  clients: "Klantbedrijven",
  invoicesChecked: "Gecontroleerde facturen / maand",
  explanations: "Uitgelegde facturen / maand",
  meterValidation: "Validatie (geslaagd/mislukt met regelcodes)",
  meterExplanation: "Validatie + uitleg in gewone taal en voorgestelde correctie",
  meterMinimum: "Maandelijks minimum",
  per1000: "per 1.000 facturen",
  perInvoice: "per factuur",
  perMonthCredited: "per maand, verrekend met het verbruik",
  ldPricing: "Voorgestelde formules voor boekhouders tijdens de vroege toegang; prijzen exclusief btw.",
  roles: {
    accountant: "Boekhouder, accountant of fiscaal adviseur",
    vendor: "Leverancier van facturatie- of boekhoudsoftware",
    business: "Onderneming die facturen verstuurt of ontvangt",
    other: "Andere",
  },
  form: {
    email: "Zakelijk e-mailadres",
    role: "U bent",
    countries: "Landen die u nodig hebt (optioneel)",
    consent: (privacyLink) =>
      `Ik ga ermee akkoord dat mijn e-mailadres, mijn rol, de taal en de gekozen landen worden bewaard, zodat u mij een bevestigingsmail en daarna nieuws over de vroege toegang tot dit product kunt sturen. Ik kan mijn toestemming altijd intrekken via de link in elke e-mail. Details: ${privacyLink}.`,
    submit: "Vroege toegang aanvragen",
    afterSubmit:
      "We sturen één e-mail met een bevestigingslink. Pas als u erop klikt, geldt uw aanvraag als bevestigd.",
  },
  mail: {
    subject: "Bevestig uw aanvraag voor vroege toegang",
    body: (confirmUrl, deleteUrl, siteName) =>
      `Goeddag,\n\niemand (hopelijk u) heeft met dit adres vroege toegang tot ${siteName} aangevraagd.\n\nBevestig hier (de link werkt 7 dagen):\n${confirmUrl}\n\nWas u dit niet? Dan kunt u deze e-mail negeren: de aanvraag wordt na 7 dagen automatisch verwijderd.\n\nUw gegevens nu verwijderen:\n${deleteUrl}\n\n${siteName}`,
  },
  confirmPage: {
    title: "Bevestig uw aanvraag voor vroege toegang",
    text: "Klik op de knop om te bevestigen. We vragen een klik omdat beveiligingsscanners voor e-mail links automatisch openen.",
    button: "Bevestigen",
  },
  deletePage: {
    title: "Uw gegevens voor vroege toegang verwijderen",
    text: "Hiermee verwijdert u uw e-mailadres en alles wat ermee is opgeslagen. Dit kan niet ongedaan worden gemaakt.",
    button: "Mijn gegevens verwijderen",
  },
};

const pages = {
  home: (c) => ({
    title: "E-facturen die slagen, elke fout uitgelegd",
    description:
      "Vroege toegang: controleer Peppol BIS-, UBL-, XRechnung-, ZUGFeRD- en Factur-X-e-facturen voor België, Duitsland en Frankrijk, met elke validatiefout uitgelegd in gewoon Nederlands, Frans, Duits of Engels.",
    body: `<h1>E-facturen die slagen. Elke fout uitgelegd.</h1>
<p class="lead">Sinds ${c.when("be", "receive")} moeten Belgische btw-plichtige ondernemingen elkaar gestructureerde e-facturen sturen via Peppol, en Duitsland en Frankrijk eisen ze ook. Wordt een Peppol BIS-, UBL-, XRechnung-, ZUGFeRD- of Factur-X-bestand geweigerd, dan zegt de melding van de validator zelden wat u moet aanpassen. Wij controleren het bestand, leggen elke fout uit in gewone taal en stellen een correctie voor wanneer daar geen nieuwe gegevens voor nodig zijn.</p>
<p><a class="cta" href="${c.link("early-access")}">Vroege toegang aanvragen</a></p>

<h2>De termijnen</h2>
<p>Elke datum hieronder linkt naar de officiële pagina waar ze vandaan komt. De landenpagina's geven de details en de datum waarop we elke bron het laatst hebben nagekeken.</p>
<div class="grid">
${c.deadlineSummary()}
</div>

<h2>Wat fix-and-explain doet</h2>
<ol>
<li><strong>Controleren.</strong> Upload een factuurbestand (of stuur het via de API). We herkennen het formaat en het profiel en voeren de validatieregels uit.</li>
<li><strong>Uitleggen.</strong> Bij elke fout krijgt u de regel die wordt overtreden, waar in de factuur het probleem zit en wat het betekent, in gewone taal, in het Nederlands, Frans, Duits of Engels.</li>
<li><strong>Voorzichtig corrigeren.</strong> Als de correctie geen nieuwe gegevens vraagt, stellen we een gecorrigeerd XML-bestand voor, met een overzicht van de wijzigingen: een datum in de verkeerde vorm (24.08.2026 wordt 2026-08-24), een bedrag met meer dan twee decimalen, een valutacode in kleine letters, een ontbrekende valutacode waar de bedragen één valuta noemen, en een ontbrekende Peppol-procesidentificatie. Een correctie blijft alleen behouden als het gecorrigeerde bestand slaagt voor de regel waarop ze gericht is en geen nieuwe bevinding oplevert. Totalen, identificatienummers en ontbrekende zakelijke gegevens worden nooit gewijzigd: ontbreekt er een gegeven, zoals het ondernemingsnummer van een klant, dan zeggen we welk en vragen we het u. Pdf's worden gerapporteerd, niet herschreven.</li>
<li><strong>Vanuit een pdf.</strong> Een factuur die nog een pdf uit Word, Excel of een ouder programma is, kan in de werkruimte een e-factuur worden. Elke waarde wordt van de pagina gelezen en naast de regel getoond waar ze vandaan komt, nooit geraden. Rijen worden alleen overgenomen als hoeveelheid maal prijs het bedrag geeft, en de totalen op de pdf zijn de toets. U bevestigt de waarden waarvoor een inschatting nodig was en vult aan wat de pdf mist (meestal het e-factuuradres van de koper). Daarna downloadt u een Factur-X- / ZUGFeRD-, CII- of UBL-bestand dat de controles hierboven heeft doorlopen. De download blijft geblokkeerd tot de totalen overeenkomen met de pdf. Gescande pdf's worden nog niet gelezen.</li>
</ol>

<h2>Wat wordt gecontroleerd, en wat niet</h2>
<p>Deze lijst komt overeen met wat de dienst vandaag controleert. Geslaagd of mislukt volgt alleen uit deterministische regels; een uitleg verandert nooit een resultaat.</p>
<div class="checks">
<div class="card"><h3>Gecontroleerd</h3><ul>
<li>België: Belgische ondernemingsnummers (schema 0208) die als Peppol-adres, partij-identificatie of wettelijke registratie worden gebruikt, getoetst aan de 10 cijfers en de modulo-97-controle die Peppol toepast, in elk bestand; Peppol BIS Billing 3.0-bestanden met de officiële Peppol-regels waar de server die geïnstalleerd heeft (${c.a("deadlines-be", "pagina België")}).</li>
<li>Het UBL 2.1-schema (XSD) bij elke UBL-factuur en creditnota, vóór elke bedrijfsregel: onbekende of herhaalde elementen, de volgorde van elementen, ontbrekende elementen, waarden die geen getal, datum, tijd of waar/onwaar zijn, een ontbrekend <code>currencyID</code> en andere attributen, en de namespace van elk element.</li>
<li>Het CII-XSD-schema (UN/CEFACT D16B, de EN 16931-subset die CEN publiceert) voor EN 16931-bestanden en hun CIUS'en zoals XRechnung en Factur-X BASIC: volgorde van elementen, verplichte en onbekende elementen, getallen, datums en waar/onwaar-waarden, en namespaces (udt: waar het schema qdt: verwacht). Op 499 gewijzigde testbestanden kwam elk oordeel overeen met xmllint met hetzelfde schema.</li>
<li>Factur-X- / ZUGFeRD-bestanden in de profielen MINIMUM, BASIC WL en EXTENDED tegen het schema van hun eigen profiel uit het Factur-X 1.0.9-pakket, met dezelfde controles plus attributen die het profiel niet toestaat (bijvoorbeeld listID bij een valutacode in BASIC WL). Op 1.199 gewijzigde testbestanden kwam elk oordeel overeen met xmllint met dezelfde schema's. Bestanden die als het Franse profiel EXTENDED-CTC-FR zijn aangemerkt, worden gecontroleerd tegen het eigen UN/CEFACT D22B-schema uit dezelfde bron; op 1.499 gewijzigde kopieën van de vijf voorbeelden van FNFE-MPE kwam elk oordeel overeen met xmllint.</li>
<li>Het bestand lezen: UBL 2.1- en UN/CEFACT CII-XML, de XML die aan een Factur-X- / ZUGFeRD-pdf hangt, en de pdf eromheen (PDF/A-3-markering, naam en relatie van de bijlage, het profiel dat in de metadata van de pdf staat).</li>
<li>De bedrijfsregels van EN 16931 (BR-…) via de officiële CEN-Schematron, en de officiële aanvulling voor XRechnung of Peppol BIS wanneer het bestand er een aangeeft, overal waar de server die geïnstalleerd heeft; elk resultaat zegt of ze zijn uitgevoerd. Daarnaast onze eigen controles: verplichte velden, totalen tot op de cent, hoogstens twee decimalen, datum- en valutacodes, en de controlecijfers van btw-nummers en IBAN's.</li>
<li>Duitsland: een ZUGFeRD- / Factur-X-bestand in MINIMUM of BASIC WL van een Duitse verkoper wordt gemeld als geen e-factuur. Met de XRechnung-regels (gekozen, of herkend aan de specificatie-identificatie van het bestand) negen controles na BR-DE: controlecijfers van de kopersreferentie en de Leitweg-ID, betalingsinstructies, contactgegevens van de verkoper, adres van verkoper en koper, factuurtypecode, specificatie-identificatie en het belastingnummer van de verkoper.</li>
<li>Frankrijk: met de Franse regels (gekozen, of herkend wanneer verkoper en koper allebei in Frankrijk zijn) het SIREN- of SIRET-nummer van verkoper en koper en hun controlecijfer, het SIREN-nummer in het Franse btw-nummer van de verkoper, de categorie van de handeling (een van de nieuwe vermeldingen op de ${c.a("deadlines-fr", "pagina Frankrijk")}), en de vermeldingen over verwijlinteresten, de forfaitaire invorderingsvergoeding van 40 euro en de korting voor vroege betaling.</li>
<li>Polen: KSeF FA(3)-bestanden tegen het FA(3)-schema, de controles die KSeF uitvoert op elk bestand dat het ontvangt en die een bestand kan tonen (codering, verboden tekens, grootte, een uitreikingsdatum in de toekomst, eenzelfde factuurnummer twee keer in één batch), de controlecijfers van het NIP, en de totalen per tarief, ook bij correcties, voorschotten en afrekeningen (${c.a("deadlines-pl", "pagina Polen")}).</li>
</ul></div>
<div class="card"><h3>Niet gecontroleerd</h3><ul>
<li>Of het btw-tarief of de btw-behandeling juist is voor de handeling.</li>
<li>Of een btw-nummer, ondernemingsnummer, SIREN of Leitweg-ID bestaat of actief is: alleen de vorm en de controlecijfers.</li>
<li>Frankrijk: of de keuze om de btw op basis van de facturering te voldoen van toepassing is en vermeld staat.</li>
<li>Of de pdf als geheel aan PDF/A-3 voldoet: wij zijn geen PDF/A-validator.</li>
<li>Of de goederen of diensten echt geleverd zijn, of de bedragen zo afgesproken waren.</li>
<li>Verzending: wij zijn geen Peppol-toegangspunt en geen Franse <em>plateforme agréée</em>, en sturen geen facturen of e-reportinggegevens naar een belastingadministratie.</li>
<li>Bewaarverplichtingen.</li>
</ul></div>
</div>

<h2>Voor wie</h2>
<div class="grid">
<div class="card"><h3>${c.a("accountants", "Boekhouders en accountants")}</h3><p>Een plan per klant: welke termijn geldt, wat de software van de klant produceert, en welke fouten eerst moeten worden opgelost.</p></div>
<div class="card"><h3>${c.a("api", "Leveranciers van facturatiesoftware")}</h3><p>Een API met verbruiksprijs die elke fout teruggeeft met een uitleg waarmee uw gebruikers aan de slag kunnen.</p></div>
<div class="card"><h3>${c.a("pricing", "Prijzen")}</h3><p>Voorgestelde formules vanaf ${c.euro(c.minPlanCents)} per maand, op basis van kostprijs plus marge. Prijzen voor de vroege toegang.</p></div>
</div>
`,
  }),

  accountants: (c) => ({
    title: "E-facturatieplan per klant, voor boekhouders",
    description:
      "Voor boekhouders, accountants en fiscaal adviseurs: één e-facturatieplan per klant voor België, Duitsland en Frankrijk, met de geldende termijn, een controle van het formaat en elke fout uitgelegd. Vroege toegang.",
    body: `<h1>Eén e-facturatieplan per klant</h1>
<p class="lead">Uw klanten vragen u of hun facturen klaar zijn voor Peppol. Het antwoord hangt af van de klant: waar hij gevestigd is, hoe groot hij is en wat zijn facturatiesoftware produceert. Vroege toegang.</p>

<h2>Wat het plan bevat</h2>
<ol>
<li><strong>De termijn die geldt.</strong> Op basis van wat u invult (land, omzetschijf van het voorgaande jaar in Duitsland, groottecategorie in Frankrijk) kiest het plan de bijbehorende datum uit de officiële kalender. In België geldt de verplichting voor elke btw-plichtige onderneming die er gevestigd is, ook voor wie de vrijstellingsregeling voor kleine ondernemingen toepast (${c.a("deadlines-be", "pagina België")}).</li>
<li><strong>Ontvangen.</strong> Of de klant al e-facturen kan ontvangen: verplicht in België sinds ${c.when("be", "receive")}, in Duitsland sinds ${c.when("de", "receive")} en in Frankrijk sinds ${c.when("fr", "receive")}, volgens de officiële bronnen op de landenpagina's.</li>
<li><strong>Steekproef.</strong> Upload enkele facturen die de software van de klant produceert. U ziet het formaat, het profiel en elke fout uitgelegd.</li>
<li><strong>Wat eerst moet worden opgelost.</strong> Eerst de fouten waardoor de factuur niet als e-factuur geldt, daarna de rest. Bij elk punt staat of het om een instelling in de software gaat, een ontbrekend stamgegeven (bijvoorbeeld het ondernemingsnummer van de klant) of een eenmalige vergissing.</li>
<li><strong>Een gedateerde checklist</strong> die u naar de klant kunt sturen.</li>
</ol>
<p>Het plan vermeldt alleen termijnen uit onze tabel met bronnen en gegevens die u hebt ingevuld. Het beslist niet over de btw-behandeling van een klant: dat blijft uw professionele oordeel.</p>

<h2>Al uw klanten in één oogopslag</h2>
<p>De werkruimte toont elke klant met zijn status over de laatste 7 tot 365 dagen: welke klanten facturen hebben gestuurd die nog falen, welke regels het vaakst falen, en wie al een tijd niet is gecontroleerd. De klanten die u nodig hebben, staan bovenaan. Download dezelfde tabel als csv voor uw eigen dossier. Ze wordt opgebouwd uit de controlegeschiedenis alleen (bestandsnamen, controlesommen en regel-id's), dus ze telt niet mee voor uw factuurtegoed.</p>

<h2>Prijzen voor kantoren</h2>
${c.plansTable()}
<p class="small">Voorgestelde prijzen voor de vroege toegang, exclusief btw. Hoe we ze bepalen: ${c.a("pricing", "prijzen")}.</p>
<p><a class="cta" href="${c.link("early-access")}">Vroege toegang aanvragen</a></p>
`,
  }),

  api: (c) => ({
    title: "Validatie-API voor e-facturen met uitleg",
    description:
      "API met verbruiksprijs voor leveranciers van facturatiesoftware: valideer Peppol BIS-, UBL-, CII-, XRechnung-, ZUGFeRD- en Factur-X-facturen en krijg elke fout uitgelegd in het Nederlands, Frans, Duits of Engels.",
    body: `<h1>Een API die uitlegt waarom een e-factuur faalt</h1>
<p class="lead">Uw gebruikers zien "BR-CO-15" en bellen de support. Stuur ons de factuur; u krijgt elke fout terug met de plaats waar ze zit en een uitleg waarmee ze aan de slag kunnen, in hun taal. Vroege toegang.</p>

<h2>Aanvraag en antwoord</h2>
<p>Dit is het antwoord dat de dienst vandaag teruggeeft, ingekort (één bevinding van vier getoond; de datumcorrectie lost er twee op, en de contactgegevens van de verkoper en het adres van de koper, XR-004 en XR-006, vragen gegevens die alleen u hebt). Veldnamen kunnen vóór de release nog veranderen; partners in de vroege toegang horen het vóór elke wijziging.</p>
<pre><code>POST /v1/check?lang=nl&amp;fix=1&amp;profile=auto&amp;name=rechnung.xml
Authorization: Bearer epk_…
Content-Type: application/xml   (of application/pdf voor Factur-X / ZUGFeRD)

200 OK
{
  "file": "rechnung.xml",
  "sha256": "04f41338…",
  "profile": "xrechnung",
  "profileDetected": true,
  "status": "fail",
  "findings": [
    {
      "rule": "PRO-DATE-001",
      "message": "IssueDate \\"24.08.2026\\" is not a date in the form YYYY-MM-DD.",
      "path": "/IssueDate@1367",
      "explanation": {
        "lang": "nl",
        "source": "template",
        "title": "Een datum staat niet in de enige vorm die het e-factuurschema accepteert …",
        "action": "Schrijf de datum in die vorm; het schema weigert 24.08.2026 of 24/08/2026."
      }
    }
  ],
  "fixes": {
    "applied": [{ "id": "date-format", "resolves": ["INV-003", "PRO-DATE-001"],
                  "changes": [{ "element": "IssueDate", "before": "24.08.2026", "after": "2026-08-24" }] }],
    "skipped": [],
    "diff": "--- a/rechnung.xml\\n+++ b/rechnung.xml\\n…",
    "content": "&lt;?xml …",
    "revalidation": { "status": "fail", "findings": [ … XR-004, XR-006 … ] }
  }
}</code></pre>
<ul>
<li>Een correctie komt alleen uit de lijst hieronder (datums, decimalen, valutacode, Peppol-procesidentificatie), en alleen als het gecorrigeerde bestand slaagt voor de regel waarop ze gericht is en geen nieuwe bevinding oplevert. Totalen, identificatienummers en ontbrekende zakelijke gegevens worden nooit gewijzigd; een correctie die ze nodig zou hebben, staat onder <code>skipped</code> met de reden.</li>
<li><code>status</code> volgt alleen uit deterministische regels. <code>explanation.source</code> is <code>template</code> (door ons geschreven), <code>llm</code> (de formulering van een model voor een regel zonder sjabloon, als zodanig gemarkeerd en nooit in staat het resultaat te wijzigen) of <code>checker</code>.</li>
<li><code>schematron</code> zegt of de officiële EN 16931-Schematron is uitgevoerd (<code>ok</code>) of niet beschikbaar was op die server (<code>unavailable</code>); in dat laatste geval zijn alleen de ingebouwde controles uitgevoerd.</li>
<li>Omgang met gegevens: de inhoud van facturen wordt niet bewaard. De geschiedenis bewaart bestandsnamen, SHA-256-hashes, regel-id's en correctie-id's. Heeft een regel geen sjabloon, dan gaan alleen het regel-id en de melding naar het model, niet de factuur.</li>
</ul>

<h2>Alleen validatie: <code>explain=0</code></h2>
<p>Toont uw software haar eigen foutmeldingen, dan kunt u alleen het oordeel kopen. Voeg <code>explain=0</code> toe aan <code>/v1/check</code> of aan een batch: dezelfde <code>status</code> en bevindingen komen terug, elk met de eigen Engelse tekst van de controle als uitleg, zonder correcties, en met <code>"explained": false</code>. Die factuur wordt aangerekend tegen het validatietarief, ook als ze faalt. <code>explain=0&amp;fix=1</code> wordt geweigerd (400) voordat er iets wordt geteld, omdat correcties bij de uitgelegde factuur horen.</p>
<pre><code>POST /v1/check?explain=0&amp;profile=auto&amp;name=rechnung.xml
Authorization: Bearer epk_…

200 OK
{
  "status": "fail",
  "explained": false,
  "findings": [
    { "rule": "PRO-DATE-001",
      "message": "IssueDate \\"24.08.2026\\" is not a date in the form YYYY-MM-DD.",
      "explanation": { "lang": "en", "source": "checker", "title": "IssueDate \\"24.08.2026\\" is …", "action": "…" } }
  ]
}</code></pre>

<h2>Prijzen per verbruik</h2>
${c.meterTable()}
<p class="small">Voorgestelde prijzen voor de vroege toegang, exclusief btw. Hoe we ze bepalen: ${c.a("pricing", "prijzen")}.</p>

<h2>Hoe het verbruik wordt geteld en aangerekend</h2>
<ul>
<li><strong>Eén factuur, één keer per maand.</strong> Een factuur wordt herkend aan de SHA-256 van haar bytes. Hetzelfde bestand die maand opnieuw controleren, alleen of in een batch, kost niets extra.</li>
<li><strong>Gevalideerd of uitgelegd.</strong> Een factuur zonder fouten (of met alleen waarschuwingen) is een validatie. De eerste uitgelegde controle die maand die fouten vindt, maakt er één keer een uitgelegde factuur van; de prijs voor uitleg omvat de validatie. Met <code>explain=0</code> blijft het een validatie.</li>
<li><strong>Het minimum.</strong> Het maandelijkse minimum wordt vooraf betaald en verrekend met het verbruik. Na afloop van de maand wordt alleen het verbruik daarboven aangerekend, één keer, bij de volgende verlenging.</li>
<li><strong>Uw rekening lezen.</strong> Elk antwoord met verbruik bevat <code>x-usage-amount-cents</code> (deze maand tot nu toe, vóór het minimum). <code>GET /v1/billing/usage?period=YYYY-MM</code> geeft het overzicht van elke maand, en <code>GET /v1/account</code> dat van deze maand.</li>
<li><strong>Veiligheidsgrenzen, geen schijven.</strong> 200.000 facturen en 20.000 door een model geschreven uitleggen per maand, tegen een op hol geslagen client; daarboven antwoordt de API <code>429 quota_exceeded</code>.</li>
</ul>

<h2>Vroege toegang tot de API aanvragen</h2>
<p>De API is nog niet publiek. Laat uw adres achter en we schrijven u zodra een account voor leveranciers kan worden geopend; in het formulier hieronder is "leverancier" al gekozen.</p>
${c.form({ role: "vendor" })}
`,
  }),

  pricing: (c) => ({
    title: "Prijzen",
    description: `Voorgestelde prijzen voor de vroege toegang tot controles van e-facturen met uitleg: formules voor boekhoudkantoren vanaf ${c.euro(c.minPlanCents)} per maand en een API met verbruiksprijs voor softwareleveranciers. Kostprijs plus marge.`,
    body: `<h1>Prijzen</h1>
<p class="lead">Voorgestelde prijzen voor de vroege toegang, exclusief btw. We rekenen kostprijs plus marge: elke formule kost 1,3 tot 2 keer wat het ons kost om een klant te bedienen die ze volledig gebruikt.</p>

<h2>Boekhoudkantoren</h2>
${c.plansTable()}
<p>Een factuur telt één keer per maand, hoe vaak u ze ook opnieuw controleert. "Uitgelegd" betekent een factuur met fouten die we in gewone taal hebben uitgelegd; geldige facturen gebruiken alleen het tegoed "gecontroleerd".</p>

<h2>API voor softwareleveranciers</h2>
${c.meterTable()}

<h2>Waarom deze bedragen</h2>
<p>Het dure deel is de uitleg in gewone taal, waarvoor een groot taalmodel wordt gebruikt. De validatie met regels zelf is goedkoop. Onze kostenraming per formule dekt die modelaanroepen, de hosting, de kosten van de betaalprovider en een reserve voor terugbetalingen, en gaat ervan uit dat u het hele tegoed gebruikt. Dalen onze kosten, dan dalen de prijzen.</p>
<p><a class="cta" href="${c.link("early-access")}">Vroege toegang aanvragen</a></p>
`,
  }),

  "deadlines-de": (c) => ({
    title: "Termijnen voor e-facturatie in Duitsland",
    description:
      "De Duitse termijnen voor B2B-e-facturen: ontvangen sinds 1 januari 2025, overgangsperiodes tot eind 2026 en 2027, aanvaarde formaten. Elke datum met verwijzing naar het BMF.",
    body: `<h1>Termijnen voor e-facturatie in Duitsland</h1>
<p class="lead">${c.esc(c.COUNTRIES[0].scope.nl)}</p>
${c.deadlineTable("de")}
<h2>Wat telt als e-factuur</h2>
${c.rulesList("de")}
<h2>Hoe wij helpen</h2>
<p>We controleren XRechnung- en ZUGFeRD-bestanden aan de hand van deze regels en leggen elke fout uit. Handig voor Belgische en Nederlandse ondernemingen die aan Duitse klanten factureren. ${c.a("accountants", "Voor boekhouders")} · ${c.a("early-access", "Vroege toegang")}</p>
${c.sourcesBlock("de")}
`,
  }),

  "deadlines-fr": (c) => ({
    title: "Termijnen voor e-facturatie in Frankrijk",
    description:
      "De Franse termijnen voor B2B-e-facturatie en e-reporting: ontvangen voor iedereen vanaf 1 september 2026, uitreiken vanaf 2026 of 2027 naargelang de grootte, formaten en nieuwe verplichte vermeldingen.",
    body: `<h1>Termijnen voor e-facturatie in Frankrijk</h1>
<p class="lead">${c.esc(c.COUNTRIES[1].scope.nl)}</p>
${c.deadlineTable("fr")}
<h2>Formaten en nieuwe verplichte vermeldingen</h2>
${c.rulesList("fr")}
<h2>Hoe wij helpen</h2>
<p>We controleren Factur-X-, UBL- en CII-bestanden en leggen elke fout uit. Wij zijn geen <em>plateforme agréée</em>: u hebt nog altijd een erkend platform nodig om facturen te versturen en te ontvangen. ${c.a("early-access", "Vroege toegang")}</p>
${c.sourcesBlock("fr")}
`,
  }),

  "deadlines-pl": (c) => ({
    title: "KSeF-termijnen voor e-facturatie in Polen",
    description:
      "De Poolse KSeF-termijnen: ontvangen en uitreiken voor grote ondernemingen vanaf 1 februari 2026, voor alle andere vanaf 1 april 2026, de versoepeling tot 10.000 PLN tot eind 2026. Elke datum met verwijzing naar het ministerie van Financiën.",
    body: `<h1>KSeF-termijnen voor e-facturatie in Polen</h1>
<p class="lead">${c.esc(c.COUNTRIES.find((x) => x.key === "pl").scope.nl)}</p>
${c.deadlineTable("pl")}
<h2>Hoe KSeF werkt, en wat het betekent voor buitenlandse ondernemingen</h2>
${c.rulesList("pl")}
<h2>Hoe wij helpen</h2>
<p>We controleren FA(3)-bestanden voordat ze worden verstuurd: het FA(3)-schema, de controles die KSeF uitvoert op elk bestand dat het ontvangt en die een bestand kan tonen (codering, verboden tekens, grootte, een uitreikingsdatum in de toekomst, eenzelfde factuurnummer twee keer in één batch), de controlecijfers van het NIP en de totalen per tarief, ook bij correcties, voorschotten en afrekeningen. Elke fout wordt uitgelegd in gewoon Engels, Duits, Frans of Pools (de KSeF-regels hebben nog geen Nederlandse uitleg). Wij sturen geen facturen naar KSeF en kunnen geen KSeF-nummer geven: dat doet uw facturatieprogramma of de eigen tools van het ministerie. ${c.a("accountants", "Voor boekhouders")} · ${c.a("early-access", "Vroege toegang")}</p>
${c.sourcesBlock("pl")}
`,
  }),

  "deadlines-be": (c) => ({
    title: "Peppol: termijnen voor e-facturatie in België",
    description:
      "De Belgische verplichting tot e-facturatie tussen ondernemingen: gestructureerde Peppol BIS-e-facturen tussen Belgische btw-plichtigen sinds 1 januari 2026, de tolerantieperiodes die afgelopen zijn, de terugvalregel en de e-reporting die voor 2028 gepland is.",
    body: `<h1>Peppol: termijnen voor e-facturatie in België</h1>
<p class="lead">${c.esc(c.COUNTRIES.find((x) => x.key === "be").scope.nl)}</p>
${c.deadlineTable("be")}
<h2>Wie gevat is, de terugvalregel, en wat er nog komt</h2>
${c.rulesList("be")}
<h2>Waarom een Peppol-factuur geweigerd wordt</h2>
<p>Een factuur via Peppol wordt getoetst aan regels die het toegangspunt of de ontvanger toepast: de EN 16931-regels (BR-…, bijvoorbeeld BR-CO-15 wanneer het totaal met btw niet gelijk is aan het totaal zonder btw plus de btw), de Peppol BIS-regels (PEPPOL-EN16931-…) en het schema van het bestand. Een typisch Belgisch geval is een ondernemingsnummer met het verkeerde aantal cijfers of een verkeerd controlegetal achter schema 0208. De melding noemt dan de regel, maar niet wat er in uw boekhoudprogramma moet veranderen. Dat is precies wat wij uitleggen.</p>
<h2>Hoe wij helpen</h2>
<p>We controleren Peppol BIS Billing 3.0-bestanden (UBL) voordat ze worden verstuurd: het UBL-schema, de EN 16931-regels, de officiële Peppol-regels waar de server die geïnstalleerd heeft, en het Belgische ondernemingsnummer (schema 0208) overal waar het voorkomt, getoetst aan de 10 cijfers en de modulo-97-controle die het Peppol-netwerk toepast. Elke fout wordt uitgelegd in gewoon Nederlands, Frans, Duits of Engels. Wij zijn geen Peppol-toegangspunt en versturen of ontvangen geen facturen: dat doen uw facturatieprogramma en zijn Peppol-provider. ${c.a("accountants", "Voor boekhouders")} · ${c.a("early-access", "Vroege toegang")}</p>
${c.sourcesBlock("be")}
`,
  }),

  "early-access": (c) => ({
    title: "Vroege toegang aanvragen",
    description:
      "Vraag vroege toegang aan tot controles van e-facturen met uitleg voor België, Duitsland, Frankrijk en Polen. Dubbele opt-in; we bewaren alleen wat het formulier vraagt.",
    body: `<h1>Vroege toegang aanvragen</h1>
<p class="lead">Zeg ons wie u bent en welke landen u nodig hebt. We mailen u zodra er een plaats voor u is.</p>
${c.form()}
`,
  }),

  privacy: (c) => privacy(c),

  "check-inbox": () => ({
    title: "Kijk in uw mailbox",
    description: "Bevestig uw aanvraag voor vroege toegang met de link die we u hebben gemaild.",
    body: `<h1>Kijk in uw mailbox</h1><p>Als het adres geldig is, hebben we u een bevestigingslink gestuurd. Die werkt 7 dagen. Onbevestigde aanvragen worden na 7 dagen automatisch verwijderd.</p>`,
  }),
  confirmed: (c) => ({
    title: "Bevestigd",
    description: "Uw aanvraag voor vroege toegang is bevestigd.",
    body: `<h1>Bevestigd</h1><p>Dank u. We mailen u over de vroege toegang. Elke e-mail bevat een link om uw gegevens te verwijderen.</p><p>${c.a("home", "Terug naar de startpagina")}</p>`,
  }),
  deleted: (c) => ({
    title: "Verwijderd",
    description: "Uw gegevens voor vroege toegang zijn verwijderd.",
    body: `<h1>Verwijderd</h1><p>Uw e-mailadres en alles wat ermee was opgeslagen, zijn verwijderd.</p><p>${c.a("home", "Terug naar de startpagina")}</p>`,
  }),
  "form-error": (c) => ({
    title: "Er ging iets mis",
    description: "De aanvraag kon niet worden verwerkt.",
    body: `<h1>Er ging iets mis</h1><p>De link is misschien verlopen, of het formulier was onvolledig. ${c.a("early-access", "Probeer het opnieuw")}.</p>`,
  }),
};

function privacy(c) {
  const ctl = c.cfg.controller;
  const controller = ctl.name
    ? `${c.esc(ctl.name)}, ${c.esc(ctl.address)}, <a href="mailto:${c.esc(ctl.email)}">${c.esc(ctl.email)}</a>`
    : "[Naam, adres en e-mail van de verwerkingsverantwoordelijke: in te vullen vóór de lancering. Een productiebuild faalt zonder.]";
  return {
    title: "Privacy",
    description:
      "Wat deze site bewaart wanneer u vroege toegang aanvraagt, waarom, hoe lang, wie het verwerkt, en uw rechten onder de AVG.",
    body: `<h1>Privacy</h1>
<p>Deze verklaring geldt voor deze website en het formulier voor vroege toegang. Vóór de lancering wordt ze vervangen door een volledige verklaring voor de dienst zelf.</p>

<h2>Verwerkingsverantwoordelijke</h2>
<p>${controller}</p>

<h2>De site bezoeken</h2>
<p>Geen cookies, geen analytics, geen trackingpixels, geen lettertypen of scripts van andere servers. De site wordt gehost door Cloudflare, dat uw IP-adres en de gegevens van uw verzoek verwerkt om pagina's te leveren en ze tegen aanvallen te beschermen. Wij bewaren die gegevens niet in onze database en hebben geen logging van verzoeken ingeschakeld.</p>

<h2>Het formulier voor vroege toegang</h2>
<p>Wanneer u het formulier verstuurt, bewaren we:</p>
<ul>
<li>uw e-mailadres;</li>
<li>de rol die u koos, de landen die u aanvinkte en de taal van de pagina;</li>
<li>de versie van de toestemmingstekst waarmee u akkoord ging en het tijdstip waarop u het formulier verstuurde en bevestigde (bewijs van toestemming, art. 7, lid 1, AVG);</li>
<li>een hash van de bevestigingslink (niet de link zelf), de vervaldatum ervan, en wanneer en hoeveel bevestigingsmails zijn verstuurd (om opnieuw versturen te beperken).</li>
</ul>
<p>We bewaren uw IP-adres niet. Doel: uw adres bevestigen (dubbele opt-in) en u daarna mailen over de vroege toegang tot dit product. Rechtsgrond: uw toestemming, art. 6, lid 1, punt a), AVG. U kunt die op elk moment intrekken met de verwijderlink in elke e-mail; dat doet niets af aan wat eerder gebeurde.</p>
<p>Wie de lijst kan zien: alleen de mensen die deze dienst uitbaten (de verwerkingsverantwoordelijke hierboven), in een intern overzicht met uw e-mailadres, of u hebt bevestigd, en de datum. Elke raadpleging wordt gelogd.</p>

<h2>Hoe lang</h2>
<ul>
<li>Onbevestigde aanvragen: automatisch verwijderd na 7 dagen.</li>
<li>Bevestigde aanvragen: tot u ze verwijdert, en hoogstens 24 maanden na uw bevestiging.</li>
<li>Verwijderen wist de hele vermelding onmiddellijk.</li>
</ul>

<h2>Wie het verwerkt</h2>
<p>Cloudflare, Inc. host de site en de database (Cloudflare D1) en verstuurt de e-mails (Cloudflare Email Service), als onze verwerker in de zin van art. 28 AVG. Cloudflare kan gegevens in de Verenigde Staten verwerken. Cloudflare is gecertificeerd onder het EU-VS-gegevensprivacykader (adequaatheidsbesluit, art. 45 AVG), en zijn verwerkersovereenkomst bevat de modelcontractbepalingen van de EU (art. 46 AVG). We verkopen of delen uw gegevens met niemand anders.</p>

<h2>Uw rechten</h2>
<p>U hebt recht op inzage (art. 15), rectificatie (art. 16), wissing (art. 17), beperking van de verwerking (art. 18), overdraagbaarheid van gegevens (art. 20) en bezwaar (art. 21), en het recht uw toestemming in te trekken (art. 7, lid 3). Schrijf daarvoor naar de verwerkingsverantwoordelijke hierboven. U kunt ook een klacht indienen bij een toezichthoudende autoriteit voor gegevensbescherming, in het bijzonder in de lidstaat van de EU waar u woont of werkt (art. 77); in België is dat de Gegevensbeschermingsautoriteit. Er is geen geautomatiseerde besluitvorming. Uw gegevens geven is vrijwillig; zonder e-mailadres kunnen we u niet contacteren.</p>
<p class="small">Versie ${c.esc(c.consentVersion)}.</p>
`,
  };
}

export default { ui, pages };
