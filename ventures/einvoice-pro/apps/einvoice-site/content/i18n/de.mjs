// Deutsche Texte. Fakten (Daten, Regeln, Preise) kommen über ctx aus content/deadlines.mjs und
// content/pricing.mjs; hier nie ein Datum oder einen Preis von Hand eintragen.
// Vor dem Launch von einer muttersprachlichen Person prüfen lassen (README).

const ui = {
  skip: "Zum Inhalt springen",
  banner:
    "Frühzugang: Der Dienst ist noch nicht allgemein verfügbar. Nichts auf dieser Website ist Steuerberatung.",
  navLabel: "Hauptnavigation",
  langLabel: "Sprache",
  nav: {
    accountants: "Steuerberater",
    api: "API",
    pricing: "Preise",
    "deadlines-de": "Deutschland",
    "deadlines-fr": "Frankreich",
    "deadlines-pl": "Polen",
    "deadlines-be": "Belgien",
    "early-access": "Frühzugang",
    privacy: "Datenschutz",
  },
  footer:
    "Frühzugang. Fristen zitieren wir aus amtlichen Quellen mit dem Datum unserer Prüfung; maßgeblich ist immer der amtliche Text. Keine Steuerberatung.",
  chooser: "Deutsch",
  notFound: "Seite nicht gefunden. Zur deutschen Startseite",
  kind: { receive: "Empfang", issue: "Ausstellung" },
  date: "Datum",
  what: "Betrifft",
  detail: "Was sich ändert",
  source: "Quelle",
  sourcesHeading: "Amtliche Quellen",
  checkedOn: "Geprüft am",
  checkedViaSearch:
    "Abgeglichen mit dem Text der amtlichen Seite, wie ihn eine auf die amtliche Website beschränkte Suche lieferte; den aktuellen Wortlaut finden Sie unter dem Link",
  notTaxAdvice:
    "Diese Seite fasst amtliche Hinweise zusammen. Sie ist keine Steuerberatung und ersetzt weder den amtlichen Text noch Ihre Steuerberaterin oder Ihren Steuerberater.",
  plan: "Tarif",
  perMonth: "Pro Monat",
  clients: "Mandanten",
  invoicesChecked: "Geprüfte Rechnungen / Monat",
  explanations: "Erklärte Rechnungen / Monat",
  meterValidation: "Validierung (gültig/ungültig mit Regelcodes)",
  meterExplanation: "Validierung mit verständlicher Erklärung und Korrekturvorschlag",
  meterMinimum: "Monatliches Minimum",
  per1000: "je 1.000 Rechnungen",
  perInvoice: "je Rechnung",
  perMonthCredited: "pro Monat, wird mit der Nutzung verrechnet",
  ldPricing: "Vorgeschlagene Frühzugangstarife für Kanzleien; Preise zzgl. USt.",
  roles: {
    accountant: "Steuerberater/in oder Buchhaltung",
    vendor: "Anbieter von Rechnungs- oder Buchhaltungssoftware",
    business: "Unternehmen, das Rechnungen sendet oder empfängt",
    other: "Sonstiges",
  },
  form: {
    email: "Geschäftliche E-Mail-Adresse",
    role: "Sie sind",
    countries: "Benötigte Länder (optional)",
    consent: (privacyLink) =>
      `Ich bin einverstanden, dass meine E-Mail-Adresse, meine Rolle, die Sprache und die gewählten Länder gespeichert werden, damit Sie mir eine Bestätigungs-E-Mail und danach Informationen zum Frühzugang zu diesem Produkt senden können. Ich kann die Einwilligung jederzeit über den Link in jeder E-Mail widerrufen. Einzelheiten: ${privacyLink}.`,
    submit: "Frühzugang anfragen",
    afterSubmit:
      "Sie erhalten eine E-Mail mit einem Bestätigungslink. Erst nach dem Klick gilt Ihre Anfrage als bestätigt.",
  },
  mail: {
    subject: "Bitte bestätigen Sie Ihre Anfrage zum Frühzugang",
    body: (confirmUrl, deleteUrl, siteName) =>
      `Guten Tag,\n\njemand (hoffentlich Sie) hat mit dieser Adresse Frühzugang zu ${siteName} angefragt.\n\nHier bestätigen (der Link gilt 7 Tage):\n${confirmUrl}\n\nWaren Sie das nicht, ignorieren Sie diese E-Mail einfach: Die Anfrage wird nach 7 Tagen automatisch gelöscht.\n\nIhre Daten sofort löschen:\n${deleteUrl}\n\n${siteName}`,
  },
  confirmPage: {
    title: "Anfrage zum Frühzugang bestätigen",
    text: "Bitte bestätigen Sie mit einem Klick auf die Schaltfläche. Wir fragen nach einem Klick, weil Sicherheitsscanner von E-Mail-Diensten Links automatisch öffnen.",
    button: "Bestätigen",
  },
  deletePage: {
    title: "Ihre Daten zum Frühzugang löschen",
    text: "Damit löschen Sie Ihre E-Mail-Adresse und alles, was dazu gespeichert ist. Das lässt sich nicht rückgängig machen.",
    button: "Meine Daten löschen",
  },
};

const pages = {
  home: (c) => ({
    title: "E-Rechnungen, die durchgehen, jeder Fehler erklärt",
    description:
      "Frühzugang: XRechnung, ZUGFeRD, Factur-X und UBL für Deutschland und Frankreich prüfen, jeden Validierungsfehler verständlich auf Deutsch, Französisch, Niederländisch oder Englisch erklärt.",
    body: `<h1>E-Rechnungen, die durchgehen. Jeder Fehler erklärt.</h1>
<p class="lead">Deutschland und Frankreich verlangen zwischen Unternehmen strukturierte E-Rechnungen. Wird eine XRechnung, ZUGFeRD-, Factur-X- oder UBL-Datei abgelehnt, sagt die Fehlermeldung des Validators selten, was zu ändern ist. Wir prüfen die Datei, erklären jeden Fehler in klarer Sprache und schlagen eine Korrektur vor, wenn sie ohne neue Angaben auskommt.</p>
<p><a class="cta" href="${c.link("early-access")}">Frühzugang anfragen</a></p>

<h2>Die Fristen</h2>
<p>Jedes Datum verweist auf die amtliche Seite, aus der es stammt. Auf den Länderseiten finden Sie Einzelheiten und das Datum, an dem wir jede Quelle zuletzt geprüft haben.</p>
<div class="grid">
${c.deadlineSummary()}
</div>

<h2>Was „Prüfen und Erklären“ leistet</h2>
<ol>
<li><strong>Prüfen.</strong> Sie laden eine Rechnungsdatei hoch (oder senden sie über die API). Wir erkennen Format und Profil und wenden die Validierungsregeln an.</li>
<li><strong>Erklären.</strong> Zu jedem Fehler erhalten Sie die verletzte Regel, die Stelle in der Rechnung und was das in klaren Worten bedeutet, auf Deutsch, Französisch, Niederländisch oder Englisch.</li>
<li><strong>Korrigieren, mit Sorgfalt.</strong> Wenn die Korrektur keine neuen Angaben braucht, schlagen wir eine korrigierte XML-Datei mit Diff vor: ein Datum in falscher Form (aus 24.08.2026 wird 2026-08-24), ein Betrag mit mehr als zwei Nachkommastellen, ein kleingeschriebener Währungscode, ein fehlender Währungscode, wenn die Beträge eine einzige Währung nennen, und eine fehlende Peppol-Prozesskennung. Eine Korrektur bleibt nur, wenn die korrigierte Datei die Regel erfüllt, auf die sie zielt, und keine neue Feststellung auslöst. Summen, Kennungen und fehlende Geschäftsdaten ändern wir nie: Fehlt eine Angabe, etwa die SIREN eines französischen Kunden, nennen wir sie und fragen nach. PDFs werden geprüft, nicht umgeschrieben.</li>
<li><strong>Aus dem PDF.</strong> Eine Rechnung, die noch als PDF aus Word, Excel oder einem älteren Programm entsteht, wird im Arbeitsbereich zur E-Rechnung. Jeder Wert wird von der Seite gelesen und neben der Zeile angezeigt, aus der er stammt, nie geraten. Positionen werden nur übernommen, wenn Menge mal Preis den Betrag ergibt, und die im PDF gedruckten Summen sind der Maßstab. Sie bestätigen die Werte, die eine Einschätzung brauchten, und ergänzen, was im PDF fehlt (meist die E-Rechnungsadresse des Käufers). Dann laden Sie eine Factur-X-/ZUGFeRD-, CII- oder UBL-Datei herunter, die die Prüfungen oben durchlaufen hat. Der Download bleibt gesperrt, bis ihre Summen mit dem PDF übereinstimmen. Gescannte PDFs werden noch nicht gelesen.</li>
</ol>

<h2>Was geprüft wird und was nicht</h2>
<p>Diese Liste entspricht dem, was der Dienst heute prüft. Bestanden oder nicht entscheiden nur deterministische Regeln; eine Erklärung ändert nie ein Ergebnis.</p>
<div class="checks">
<div class="card"><h3>Geprüft</h3><ul>
<li>Das CII-XSD-Schema (UN/CEFACT D16B, die von CEN veröffentlichte EN-16931-Teilmenge) für EN-16931-Dateien und ihre CIUS wie XRechnung und Factur-X BASIC: Reihenfolge der Elemente, Pflicht- und unbekannte Elemente, Zahlen, Datums- und Wahrheitswerte sowie Namensräume (udt: statt qdt:). Bei 499 veränderten Testdateien stimmte jedes Ergebnis mit xmllint auf demselben Schema überein.</li>
<li>Factur-X-/ZUGFeRD-Dateien in den Profilen MINIMUM, BASIC WL und EXTENDED gegen das eigene Schema ihres Profils aus dem Factur-X-1.0.9-Paket, mit denselben Prüfungen und zusätzlich Attributen, die das Profil nicht zulässt (z. B. listID am Währungscode einer BASIC-WL-Datei). Bei 1.199 veränderten Testdateien stimmte jedes Ergebnis mit xmllint auf denselben Schemata überein. Dateien im französischen Profil EXTENDED-CTC-FR werden gegen dessen eigenes UN/CEFACT-D22B-Schema aus derselben Quelle geprüft; bei 1.499 veränderten Kopien der fünf FNFE-MPE-Beispiele stimmte jedes Ergebnis mit xmllint überein.</li>
<li>Das Lesen der Datei: UBL 2.1 und UN/CEFACT CII als XML, das in ein Factur-X-/ZUGFeRD-PDF eingebettete XML und das PDF darum (PDF/A-3-Kennzeichen, Name und Beziehung des Anhangs, das in den PDF-Metadaten genannte Profil).</li>
<li>Das UBL-2.1-Schema (XSD) bei jeder UBL-Rechnung und -Gutschrift, vor allen Geschäftsregeln: unbekannte oder doppelte Elemente, Reihenfolge der Elemente, fehlende Elemente, Werte, die keine Zahl, kein Datum, keine Uhrzeit und kein true/false sind, fehlendes <code>currencyID</code> und andere Attribute sowie der Namensraum jedes Elements.</li>
<li>Die Geschäftsregeln der EN 16931 (BR-…) über das offizielle CEN-Schematron, dazu das offizielle XRechnung- oder Peppol-BIS-Zusatzmodul, wenn die Datei eines angibt, überall dort, wo der Server sie installiert hat; jedes Ergebnis sagt, ob sie liefen. Daneben unsere eigenen Prüfungen: Pflichtfelder, centgenaue Summen, höchstens zwei Nachkommastellen, Datums- und Währungscodes, Prüfziffern von USt-IdNr. und IBAN.</li>
<li>Deutschland: Eine ZUGFeRD-/Factur-X-Datei im Profil MINIMUM oder BASIC WL von einem deutschen Verkäufer wird als keine E-Rechnung gemeldet. Mit den XRechnung-Regeln (gewählt oder aus der Spezifikationskennung der Datei erkannt) neun Prüfungen nach BR-DE: Käuferreferenz und Prüfziffern der Leitweg-ID, Zahlungsanweisungen, Kontakt des Verkäufers, Anschrift von Verkäufer und Käufer, Rechnungsart, Spezifikationskennung und Steuernummer des Verkäufers.</li>
<li>Frankreich: Mit den französischen Regeln (gewählt oder erkannt, wenn Verkäufer und Käufer beide in Frankreich sind) SIREN oder SIRET von Verkäufer und Käufer samt Prüfziffer, die SIREN in der französischen USt-IdNr. des Verkäufers, die Art des Umsatzes (eine der neuen Angaben auf der ${c.a("deadlines-fr", "Seite zu Frankreich")}) sowie die Angaben zu Verzugszinsen, 40-Euro-Pauschale und Skonto.</li>
<li>Polen: KSeF-Dateien im Format FA(3) gegen das FA(3)-Schema, die Prüfungen, die KSeF bei jeder eingehenden Datei durchführt und die eine Datei selbst zeigen kann (Kodierung, unzulässige Zeichen, Größe, Ausstellungsdatum in der Zukunft, doppelte Rechnungsnummer in einem Paket), die Prüfziffern der NIP und die Summen je Steuersatz, auch bei Korrektur-, Anzahlungs- und Schlussrechnungen (${c.a("deadlines-pl", "Seite zu Polen")}).</li>
<li>Belgien: belgische Unternehmensnummern (Schema 0208) als Peppol-Adresse, Kennung oder Registernummer einer Partei, geprüft auf die 10 Ziffern und die Mod-97-Prüfung, die Peppol anwendet, in jeder Datei; Peppol-BIS-Billing-3.0-Dateien mit den offiziellen Peppol-Regeln, wo der Server sie installiert hat (${c.a("deadlines-be", "Seite zu Belgien")}).</li>
</ul></div>
<div class="card"><h3>Nicht geprüft</h3><ul>
<li>Ob Steuersatz oder umsatzsteuerliche Behandlung für den Umsatz richtig sind.</li>
<li>Ob eine USt-IdNr., SIREN oder Leitweg-ID existiert oder gültig ist: nur Form und Prüfziffern.</li>
<li>Frankreich: ob die Option zur Besteuerung nach vereinbarten Entgelten (TVA sur les débits) gilt und angegeben ist.</li>
<li>Ob das PDF insgesamt PDF/A-3 entspricht: Wir sind kein PDF/A-Validator.</li>
<li>Ob die Leistung tatsächlich erbracht wurde oder die Beträge vereinbart sind.</li>
<li>Die Übermittlung: Wir sind keine französische <em>plateforme agréée</em> und senden weder Rechnungen noch E-Reporting-Daten an eine Steuerverwaltung.</li>
<li>Aufbewahrungspflichten.</li>
</ul></div>
</div>

<h2>Für wen</h2>
<div class="grid">
<div class="card"><h3>${c.a("accountants", "Steuerberater und Kanzleien")}</h3><p>Ein Plan pro Mandant: welche Frist gilt, was die Software erzeugt und welche Fehler zuerst zu beheben sind.</p></div>
<div class="card"><h3>${c.a("api", "Anbieter von Rechnungssoftware")}</h3><p>Eine nutzungsbasierte API, die jeden Fehler mit einer Erklärung liefert, mit der Ihre Kunden etwas anfangen können.</p></div>
<div class="card"><h3>${c.a("pricing", "Preise")}</h3><p>Vorgeschlagene Tarife ab ${c.euro(c.minPlanCents)} im Monat, kostenbasiert kalkuliert. Preise für den Frühzugang.</p></div>
</div>
`,
  }),

  accountants: (c) => ({
    title: "E-Rechnung: ein Plan pro Mandant, für Steuerberater",
    description:
      "Für Steuerberater und Kanzleien: ein E-Rechnungs-Plan pro Mandant für Deutschland und Frankreich, mit geltender Frist, Formatprüfung und jedem Fehler erklärt. Frühzugang.",
    body: `<h1>Ein E-Rechnungs-Plan pro Mandant</h1>
<p class="lead">Ihre Mandanten werden Sie fragen, ob ihre Rechnungen bereit sind. Die Antwort hängt vom Mandanten ab: wo er sitzt, wie groß er ist und was seine Rechnungssoftware erzeugt. Frühzugang.</p>

<h2>Was der Plan enthält</h2>
<ol>
<li><strong>Die geltende Frist.</strong> Aus Ihren Angaben (Land, in Deutschland die Umsatzgröße des Vorjahres, in Frankreich die Unternehmenskategorie) wählt der Plan das passende Datum aus dem amtlichen Zeitplan. In Deutschland gilt zum Beispiel die verlängerte Übergangsfrist nur für Aussteller unterhalb einer Umsatzgrenze im Vorjahr (${c.a("deadlines-de", "Seite zu Deutschland")}).</li>
<li><strong>Empfang.</strong> Ob der Mandant E-Rechnungen schon empfangen kann: in Deutschland seit dem ${c.when("de", "receive")} vorgeschrieben, in Frankreich seit dem ${c.when("fr", "receive")}, laut den amtlichen Quellen auf den Länderseiten.</li>
<li><strong>Stichprobe.</strong> Laden Sie einige Rechnungen hoch, die die Software des Mandanten erzeugt. Sie sehen Format, Profil und jeden Fehler mit Erklärung.</li>
<li><strong>Was zu beheben ist, in sinnvoller Reihenfolge.</strong> Zuerst Fehler, durch die eine Rechnung nicht als E-Rechnung zählt, dann der Rest. Zu jedem Punkt steht, ob es sich um eine Einstellung der Software, ein fehlendes Stammdatenfeld (etwa die SIREN eines Kunden) oder einen einmaligen Fehler handelt.</li>
<li><strong>Eine Checkliste mit Terminen</strong>, die Sie dem Mandanten schicken können, auf Deutsch, Französisch oder Englisch.</li>
</ol>
<p>Der Plan nennt nur Fristen aus unserer belegten Tabelle und Angaben, die Sie selbst gemacht haben. Über die umsatzsteuerliche Behandlung entscheidet er nicht: Das bleibt Ihre fachliche Beurteilung.</p>

<h2>Alle Mandanten auf einen Blick</h2>
<p>Der Arbeitsbereich zeigt jeden Mandanten mit seinem Stand der letzten 7 bis 365 Tage: wer Rechnungen geschickt hat, die noch fehlerhaft sind, welche Regeln am häufigsten verletzt werden und wer länger nicht geprüft wurde. Mandanten mit Handlungsbedarf stehen oben. Dieselbe Tabelle gibt es als CSV für Ihre eigenen Unterlagen. Sie entsteht allein aus dem Prüfverlauf (Dateinamen, Prüfsummen und Regel-IDs) und zählt daher nicht gegen Ihr Rechnungskontingent.</p>

<h2>Preise für Kanzleien</h2>
${c.plansTable()}
<p class="small">Vorgeschlagene Preise für den Frühzugang, zzgl. USt. Wie wir sie festlegen: ${c.a("pricing", "Preise")}.</p>
<p><a class="cta" href="${c.link("early-access")}">Frühzugang anfragen</a></p>
`,
  }),

  api: (c) => ({
    title: "API zur Validierung von E-Rechnungen mit Erklärungen",
    description:
      "Nutzungsbasierte API für Anbieter von Rechnungssoftware: XRechnung, ZUGFeRD, Factur-X, UBL und CII validieren und jeden Fehler auf Deutsch, Französisch, Niederländisch oder Englisch erklärt bekommen.",
    body: `<h1>Eine API, die erklärt, warum eine E-Rechnung scheitert</h1>
<p class="lead">Ihre Kunden sehen „BR-CO-15“ und rufen beim Support an. Senden Sie uns die Rechnung; Sie erhalten jeden Fehler mit Fundstelle und einer Erklärung in der Sprache Ihrer Kunden, mit der sie etwas anfangen können. Frühzugang.</p>

<h2>Anfrage und Antwort</h2>
<p>So antwortet der Dienst heute, gekürzt (eine von vier Feststellungen gezeigt; die Datumskorrektur behebt zwei, Kontakt des Verkäufers und Anschrift des Käufers, XR-004 und XR-006, brauchen Angaben, die nur Sie haben). Feldnamen können sich vor dem Start noch ändern; Partner im Frühzugang erfahren es vorher.</p>
<pre><code>POST /v1/check?lang=en&amp;fix=1&amp;profile=auto&amp;name=rechnung.xml
Authorization: Bearer epk_…
Content-Type: application/xml   (or application/pdf for Factur-X / ZUGFeRD)

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
        "lang": "en",
        "source": "template",
        "title": "A date is not written in the only form the e-invoice schema accepts …",
        "action": "Rewrite the date in that form; the schema rejects 24.08.2026 or 24/08/2026."
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
<li>Eine Korrektur kommt nur aus der unten genannten Liste (Datum, Nachkommastellen, Währungscode, Peppol-Prozesskennung) und nur, wenn die korrigierte Datei die Regel erfüllt, auf die sie zielt, und keine neue Feststellung auslöst. Summen, Kennungen und fehlende Geschäftsdaten werden nie geändert; eine Korrektur, die sie bräuchte, steht mit Begründung unter <code>skipped</code>.</li>
<li><code>status</code> stammt nur aus deterministischen Regeln. <code>explanation.source</code> ist <code>template</code> (von uns geschrieben), <code>llm</code> (Formulierung eines Modells für eine Regel ohne Vorlage, als solche gekennzeichnet und ohne Einfluss auf das Ergebnis) oder <code>checker</code>.</li>
<li><code>schematron</code> sagt, ob das offizielle EN-16931-Schematron lief (<code>ok</code>) oder auf diesem Server nicht verfügbar war (<code>unavailable</code>); dann liefen nur die eingebauten Prüfungen.</li>
<li>Umgang mit Daten: Rechnungsinhalte werden nicht gespeichert. Der Verlauf enthält Dateinamen, SHA-256-Prüfsummen, Regel- und Korrektur-IDs. Hat eine Regel keine Vorlage, gehen nur Regel-ID und Meldung an das Modell, nicht die Rechnung.</li>
</ul>

<h2>Nur validieren: <code>explain=0</code></h2>
<p>Zeigt Ihre Software eigene Fehlermeldungen, können Sie nur das Prüfergebnis kaufen. Hängen Sie <code>explain=0</code> an <code>/v1/check</code> oder an einen Stapel: Sie erhalten denselben <code>status</code> und dieselben Feststellungen, jeweils mit dem englischen Originaltext des Prüfers als Erklärung, ohne Korrekturen und mit <code>"explained": false</code>. Diese Rechnung wird zum Validierungspreis abgerechnet, auch wenn sie Fehler hat. <code>explain=0&amp;fix=1</code> wird mit 400 abgelehnt, bevor etwas gezählt wird, denn Korrekturen gehören zur erklärten Rechnung.</p>
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

<h2>Nutzungsbasierte Preise</h2>
${c.meterTable()}
<p class="small">Vorgeschlagene Preise für den Frühzugang, zzgl. USt. Wie wir sie festlegen: ${c.a("pricing", "Preise")}.</p>

<h2>Wie die Nutzung gezählt und abgerechnet wird</h2>
<ul>
<li><strong>Eine Rechnung, einmal im Monat.</strong> Eine Rechnung erkennen wir an der SHA-256-Prüfsumme ihrer Bytes. Dieselbe Datei im selben Monat erneut zu prüfen, allein oder im Stapel, kostet nichts zusätzlich.</li>
<li><strong>Validiert oder erklärt.</strong> Eine Rechnung ohne Fehler (oder nur mit Warnungen) ist eine Validierung. Die erste erklärte Prüfung im Monat, die Fehler findet, macht sie einmalig zur erklärten Rechnung; der Preis dafür schließt die Validierung ein. Mit <code>explain=0</code> bleibt sie eine Validierung.</li>
<li><strong>Das Minimum.</strong> Das monatliche Minimum wird im Voraus bezahlt und mit der Nutzung verrechnet. Nach Monatsende wird nur die Nutzung darüber berechnet, einmalig, mit der nächsten Verlängerung.</li>
<li><strong>Die Rechnung nachlesen.</strong> Jede gezählte Antwort trägt <code>x-usage-amount-cents</code> (der laufende Monat bis jetzt, vor dem Minimum). <code>GET /v1/billing/usage?period=YYYY-MM</code> liefert die Aufstellung eines beliebigen Monats, <code>GET /v1/account</code> die des laufenden.</li>
<li><strong>Sicherheitsgrenzen, keine Stufen.</strong> 200.000 Rechnungen und 20.000 vom Modell formulierte Erklärungen im Monat, gegen einen außer Kontrolle geratenen Client; darüber antwortet die API mit <code>429 quota_exceeded</code>.</li>
</ul>

<h2>Frühzugang zur API anfragen</h2>
<p>Die API ist noch nicht öffentlich. Hinterlassen Sie Ihre Adresse, und wir schreiben Ihnen, sobald ein Konto für Softwareanbieter eröffnet werden kann; im Formular ist „Softwareanbieter“ schon ausgewählt.</p>
${c.form({ role: "vendor" })}
`,
  }),

  pricing: (c) => ({
    title: "Preise",
    description: `Vorgeschlagene Preise für den Frühzugang: E-Rechnungen prüfen und erklären lassen, Kanzleitarife ab ${c.euro(c.minPlanCents)} im Monat und eine nutzungsbasierte API für Softwareanbieter. Kostenbasiert.`,
    body: `<h1>Preise</h1>
<p class="lead">Vorgeschlagene Preise für den Frühzugang, zzgl. USt. Wir kalkulieren kostenbasiert: Jeder Tarif kostet das 1,3- bis 2-Fache dessen, was uns ein Kunde kostet, der ihn voll ausschöpft.</p>

<h2>Kanzleien</h2>
${c.plansTable()}
<p>Eine Rechnung zählt einmal im Monat, egal wie oft Sie sie erneut prüfen. „Erklärt“ heißt: eine fehlerhafte Rechnung, deren Fehler wir in klarer Sprache erklärt haben; gültige Rechnungen zählen nur zum Kontingent „geprüft“.</p>

<h2>API für Softwareanbieter</h2>
${c.meterTable()}

<h2>Warum diese Zahlen</h2>
<p>Teuer ist die verständliche Erklärung, für die wir ein großes Sprachmodell nutzen. Die Regelprüfung selbst kostet wenig. Unsere Kostenschätzung pro Tarif umfasst diese Modellaufrufe, das Hosting, die Gebühren des Zahlungsanbieters und eine Rücklage für Erstattungen, und sie geht davon aus, dass Sie das ganze Kontingent nutzen. Sinken unsere Kosten, sinken die Preise.</p>
<p><a class="cta" href="${c.link("early-access")}">Frühzugang anfragen</a></p>
`,
  }),

  "deadlines-de": (c) => ({
    title: "Fristen für die E-Rechnung in Deutschland",
    description:
      "E-Rechnungspflicht im Inland (B2B): Empfang seit 1. Januar 2025, Übergangsfristen bis Ende 2026 und 2027, zulässige Formate. Jedes Datum mit Beleg beim BMF.",
    body: `<h1>Fristen für die E-Rechnung in Deutschland</h1>
<p class="lead">${c.esc(c.COUNTRIES[0].scope.de)}</p>
${c.deadlineTable("de")}
<h2>Was als E-Rechnung zählt</h2>
${c.rulesList("de")}
<h2>Wie wir helfen</h2>
<p>Wir prüfen XRechnung- und ZUGFeRD-Dateien gegen diese Regeln und erklären jeden Fehler. ${c.a("accountants", "Für Steuerberater")} · ${c.a("early-access", "Frühzugang")}</p>
${c.sourcesBlock("de")}
`,
  }),

  "deadlines-fr": (c) => ({
    title: "Fristen für die E-Rechnung in Frankreich",
    description:
      "E-Rechnung und E-Reporting in Frankreich: Empfang für alle ab 1. September 2026, Ausstellung je nach Größe ab 2026 oder 2027, Formate und neue Pflichtangaben.",
    body: `<h1>Fristen für die E-Rechnung in Frankreich</h1>
<p class="lead">${c.esc(c.COUNTRIES[1].scope.de)}</p>
${c.deadlineTable("fr")}
<h2>Formate und neue Pflichtangaben</h2>
${c.rulesList("fr")}
<h2>Wie wir helfen</h2>
<p>Wir prüfen Factur-X-, UBL- und CII-Dateien und erklären jeden Fehler. Wir sind keine <em>plateforme agréée</em>: Für Versand und Empfang brauchen Sie weiterhin eine zugelassene Plattform. ${c.a("early-access", "Frühzugang")}</p>
${c.sourcesBlock("fr")}
`,
  }),

  "deadlines-pl": (c) => ({
    title: "KSeF-Fristen für E-Rechnungen in Polen",
    description:
      "Polens KSeF-Fristen: Empfang und Ausstellung für große Unternehmen ab 1. Februar 2026, alle übrigen ab 1. April 2026, die 10.000-PLN-Erleichterung bis Ende 2026. Jedes Datum mit Quelle beim Finanzministerium.",
    body: `<h1>KSeF-Fristen für E-Rechnungen in Polen</h1>
<p class="lead">${c.esc(c.COUNTRIES.find((x) => x.key === "pl").scope.de)}</p>
${c.deadlineTable("pl")}
<h2>Wie KSeF funktioniert und was das für ausländische Unternehmen heißt</h2>
${c.rulesList("pl")}
<h2>Wie wir helfen</h2>
<p>Wir prüfen FA(3)-Dateien vor dem Versand: das FA(3)-Schema, die Prüfungen, die KSeF bei jeder eingehenden Datei durchführt und die eine Datei selbst zeigen kann (Kodierung, unzulässige Zeichen, Größe, ein Ausstellungsdatum in der Zukunft, dieselbe Rechnungsnummer zweimal in einem Paket), die Prüfziffern der NIP und die Summen je Steuersatz, auch bei Korrektur-, Anzahlungs- und Schlussrechnungen. Jeder Fehler wird verständlich auf Deutsch, Englisch, Französisch oder Polnisch erklärt. Wir senden keine Rechnungen an KSeF und vergeben keine KSeF-Nummer: Das übernimmt Ihr Rechnungsprogramm oder die Anwendung des Ministeriums. ${c.a("accountants", "Für Steuerberater")} · ${c.a("early-access", "Frühzugang")}</p>
${c.sourcesBlock("pl")}
`,
  }),

  "deadlines-be": (c) => ({
    title: "Peppol-Fristen für E-Rechnungen in Belgien",
    description:
      "Belgiens B2B-E-Rechnungspflicht: strukturierte Peppol-BIS-Rechnungen zwischen belgischen umsatzsteuerpflichtigen Unternehmen seit 1. Januar 2026, die beendeten Toleranzen, die Ausnahmeregel und das für 2028 geplante E-Reporting.",
    body: `<h1>Peppol-Fristen für E-Rechnungen in Belgien</h1>
<p class="lead">${c.esc(c.COUNTRIES.find((x) => x.key === "be").scope.de)}</p>
${c.deadlineTable("be")}
<h2>Wer erfasst ist, die Ausnahmeregel und was als Nächstes kommt</h2>
${c.rulesList("be")}
<h2>Wie wir helfen</h2>
<p>Wir prüfen Peppol-BIS-Billing-3.0-Dateien (UBL) vor dem Versand: das UBL-Schema, die Regeln der EN 16931, die offiziellen Peppol-Regeln, wo der Server sie installiert hat, und die belgische Unternehmensnummer (Schema 0208), wo immer sie vorkommt, auf die 10 Ziffern und die Mod-97-Prüfung, die das Peppol-Netz anwendet. Jeder Fehler wird verständlich auf Deutsch, Niederländisch, Französisch oder Englisch erklärt. Wir sind kein Peppol-Access-Point und senden oder empfangen keine Rechnungen: Das übernehmen Ihr Rechnungsprogramm und dessen Peppol-Anbieter. ${c.a("accountants", "Für Steuerberater")} · ${c.a("early-access", "Frühzugang")}</p>
${c.sourcesBlock("be")}
`,
  }),

  "early-access": (c) => ({
    title: "Frühzugang anfragen",
    description:
      "Frühzugang zur Prüfung und Erklärung von E-Rechnungen für Deutschland, Frankreich, Polen und Belgien anfragen. Double-Opt-in; wir speichern nur, was das Formular abfragt.",
    body: `<h1>Frühzugang anfragen</h1>
<p class="lead">Sagen Sie uns, wer Sie sind und welche Länder Sie brauchen. Wir schreiben Ihnen, sobald ein Platz für Sie frei ist.</p>
${c.form()}
`,
  }),

  privacy: (c) => privacy(c),

  "check-inbox": () => ({
    title: "Bitte prüfen Sie Ihr Postfach",
    description: "Bestätigen Sie Ihre Anfrage mit dem Link aus unserer E-Mail.",
    body: `<h1>Bitte prüfen Sie Ihr Postfach</h1><p>Wenn die Adresse gültig ist, haben wir Ihnen einen Bestätigungslink geschickt. Er gilt 7 Tage. Unbestätigte Anfragen werden nach 7 Tagen automatisch gelöscht.</p>`,
  }),
  confirmed: (c) => ({
    title: "Bestätigt",
    description: "Ihre Anfrage zum Frühzugang ist bestätigt.",
    body: `<h1>Bestätigt</h1><p>Vielen Dank. Wir schreiben Ihnen zum Frühzugang. Jede E-Mail enthält einen Link, mit dem Sie Ihre Daten löschen können.</p><p>${c.a("home", "Zur Startseite")}</p>`,
  }),
  deleted: (c) => ({
    title: "Gelöscht",
    description: "Ihre Daten zum Frühzugang sind gelöscht.",
    body: `<h1>Gelöscht</h1><p>Ihre E-Mail-Adresse und alles, was dazu gespeichert war, sind gelöscht.</p><p>${c.a("home", "Zur Startseite")}</p>`,
  }),
  "form-error": (c) => ({
    title: "Das hat nicht geklappt",
    description: "Die Anfrage konnte nicht verarbeitet werden.",
    body: `<h1>Das hat nicht geklappt</h1><p>Vielleicht ist der Link abgelaufen oder das Formular war unvollständig. ${c.a("early-access", "Bitte versuchen Sie es noch einmal")}.</p>`,
  }),
};

function privacy(c) {
  const ctl = c.cfg.controller;
  const controller = ctl.name
    ? `${c.esc(ctl.name)}, ${c.esc(ctl.address)}, <a href="mailto:${c.esc(ctl.email)}">${c.esc(ctl.email)}</a>`
    : "[Name, Anschrift und E-Mail des Verantwortlichen: vor dem Launch eintragen. Ohne sie schlägt der Produktions-Build fehl.]";
  return {
    title: "Datenschutz",
    description:
      "Was diese Website speichert, wenn Sie Frühzugang anfragen, wozu, wie lange, wer es verarbeitet und welche Rechte Sie nach der DSGVO haben.",
    body: `<h1>Datenschutzhinweise</h1>
<p>Diese Hinweise gelten für diese Website und das Formular zum Frühzugang. Vor dem Start des Dienstes selbst ersetzen wir sie durch vollständige Hinweise für den Dienst.</p>

<h2>Verantwortlicher</h2>
<p>${controller}</p>

<h2>Besuch der Website</h2>
<p>Keine Cookies, keine Analyse, keine Zählpixel, keine Schriften oder Skripte von fremden Servern. Gehostet wird die Website bei Cloudflare; Cloudflare verarbeitet Ihre IP-Adresse und Anfragedaten, um die Seiten auszuliefern und vor Angriffen zu schützen. Wir speichern diese Daten nicht in unserer Datenbank und haben keine Protokollierung von Anfragen eingeschaltet.</p>

<h2>Das Formular zum Frühzugang</h2>
<p>Wenn Sie das Formular absenden, speichern wir:</p>
<ul>
<li>Ihre E-Mail-Adresse;</li>
<li>die gewählte Rolle, die angekreuzten Länder und die Sprache der Seite;</li>
<li>die Version des Einwilligungstextes, dem Sie zugestimmt haben, sowie den Zeitpunkt des Absendens und der Bestätigung (Nachweis der Einwilligung, Art. 7 Abs. 1 DSGVO);</li>
<li>einen Hashwert des Bestätigungslinks (nicht den Link selbst), sein Ablaufdatum sowie wann und wie viele Bestätigungs-E-Mails versandt wurden (um wiederholtes Senden zu begrenzen).</li>
</ul>
<p>Ihre IP-Adresse speichern wir nicht. Zweck: Ihre Adresse zu bestätigen (Double-Opt-in) und Ihnen danach E-Mails zum Frühzugang zu diesem Produkt zu senden. Rechtsgrundlage: Ihre Einwilligung, Art. 6 Abs. 1 lit. a DSGVO. Sie können sie jederzeit über den Löschlink in jeder E-Mail widerrufen; die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt davon unberührt.</p>
<p>Wer die Liste sehen kann: nur die Betreiber dieses Dienstes (der oben genannte Verantwortliche), in einer internen Übersicht mit Ihrer E-Mail-Adresse, dem Bestätigungsstatus und dem Datum. Jeder solche Abruf wird protokolliert.</p>

<h2>Speicherdauer</h2>
<ul>
<li>Unbestätigte Anfragen: automatische Löschung nach 7 Tagen.</li>
<li>Bestätigte Anfragen: bis Sie sie löschen, höchstens 24 Monate nach der Bestätigung.</li>
<li>Beim Löschen wird der gesamte Eintrag sofort entfernt.</li>
</ul>

<h2>Wer die Daten verarbeitet</h2>
<p>Cloudflare, Inc. hostet die Website und die Datenbank (Cloudflare D1) und versendet die E-Mails (Cloudflare Email Service), als unser Auftragsverarbeiter nach Art. 28 DSGVO. Cloudflare kann Daten in den USA verarbeiten. Cloudflare ist nach dem EU-U.S. Data Privacy Framework zertifiziert (Angemessenheitsbeschluss, Art. 45 DSGVO); die Auftragsverarbeitungsvereinbarung von Cloudflare enthält zudem die EU-Standardvertragsklauseln (Art. 46 DSGVO). Wir verkaufen Ihre Daten nicht und geben sie an niemanden sonst weiter.</p>

<h2>Ihre Rechte</h2>
<p>Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch (Art. 21) sowie auf Widerruf Ihrer Einwilligung (Art. 7 Abs. 3). Schreiben Sie dazu an den oben genannten Verantwortlichen. Sie können sich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, insbesondere in dem EU-Mitgliedstaat, in dem Sie wohnen oder arbeiten (Art. 77). Eine automatisierte Entscheidungsfindung findet nicht statt. Die Angabe Ihrer Daten ist freiwillig; ohne E-Mail-Adresse können wir Sie nicht kontaktieren.</p>
<p class="small">Stand ${c.esc(c.consentVersion)}.</p>
`,
  };
}

export default { ui, pages };
