// @ts-check
// Dutch (nl) plain-language explanations for every built-in rule id except Poland's KSeF rules,
// for Flemish and Dutch accountants and their clients (Belgium has required structured B2B
// e-invoices over Peppol since 1 January 2026). Merged into TEMPLATES by explain-catalog.mjs.
// Proprietary (see ../LICENSE).
//
// Same shape and placeholders as the English text beside it in explain-catalog.mjs: [title,
// action]; {n}, {value} and {party} inside [brackets] are dropped when the finding has no value.
// Register: formal "u", neutral standard Dutch (no Belgian- or Netherlands-only words where a
// common one exists). Codes, field numbers (BT-nn), URNs and amounts are copied unchanged from the
// English text; explain-nl.test.mjs checks that. Drafted by the agent, not yet read by a native
// speaker.
//
// These texts explain; they never decide. Whether an invoice passes is the checker's verdict.

/** @type {Record<string, [string, string]>} */
export const NL_TEXTS = {
  // --- Core structure (EN 16931 basics) ---
  "INV-001": ["Een verplicht onderdeel van de factuur ontbreekt, zodat geen enkele ontvanger haar kan verwerken.", "Vul het veld aan dat in de melding wordt genoemd en exporteer de factuur opnieuw."],
  "INV-002": ["Het factuurnummer (BT-1) is leeg. Elke factuur heeft een uniek nummer nodig.", "Vul het factuurnummer uit uw nummerreeks in."],
  "INV-003": ["De factuurdatum staat niet in de vorm JJJJ-MM-DD, het enige datumformaat dat e-facturen accepteren.", "Schrijf de factuurdatum als JJJJ-MM-DD, bijvoorbeeld 2026-08-24."],
  "INV-004": ["De valuta van de factuur is geen ISO 4217-code van drie hoofdletters.", "Gebruik de ISO-code in hoofdletters, bijvoorbeeld EUR."],
  "INV-005": ["De identificatie van de [{party} ]ontbreekt, zodat de ontvanger de partij niet aan zijn gegevens kan koppelen.", "Vul een identificatie van de partij in (klantnummer, GLN, btw- of ondernemingsnummer) uit uw systeem."],
  "INV-006": ["De naam van de [{party} ]ontbreekt; een factuur moet beide partijen vermelden.", "Vul de volledige officiële naam van de partij in."],
  "INV-007": ["De factuur heeft geen regels. Een factuur moet vermelden wat er geleverd is.", "Voeg minstens één factuurregel toe met omschrijving, hoeveelheid en prijs."],
  "INV-008": ["Regel[ {n}] heeft geen omschrijving van wat er geleverd is.", "Omschrijf de goederen of de dienst op die regel."],
  "INV-009": ["De hoeveelheid op regel[ {n}] ontbreekt of is geen getal.", "Vul de hoeveelheid in als gewoon getal, met een punt als decimaalteken."],
  "INV-010": ["De eenheidsprijs op regel[ {n}] ontbreekt of is geen getal.", "Vul de netto eenheidsprijs in als getal, met een punt als decimaalteken."],
  "INV-011": ["Het btw-tarief op regel[ {n}] ontbreekt of is ongeldig.", "Vul het btw-percentage voor die regel in (bijvoorbeeld 21, 9 of 0)."],
  "INV-012": ["Het nettobedrag van regel[ {n}] is niet hoeveelheid maal eenheidsprijs.", "Bereken het nettobedrag van de regel opnieuw[ (verwacht {value})] of corrigeer hoeveelheid of prijs."],
  "INV-013": ["Het netto totaal van de factuur ontbreekt of is geen getal.", "Vul de som van de netto regelbedragen in als netto totaal."],
  "INV-014": ["Het netto totaal is niet gelijk aan de som van de regels (na kortingen en toeslagen op documentniveau).", "Zet het netto totaal[ op {value}] of corrigeer de regels."],
  "INV-015": ["Het btw-totaal ontbreekt of is geen getal.", "Vul het totale btw-bedrag van de factuur in."],
  "INV-016": ["Het bruto totaal (bedrag inclusief btw) ontbreekt of is geen getal.", "Vul netto totaal plus btw in als bruto totaal."],
  "INV-017": ["Het bruto totaal is niet netto totaal plus btw; ontvangers weigeren facturen waarvan de totalen niet kloppen.", "Zet het bruto totaal[ op {value}] of corrigeer netto en btw."],
  "INV-018": ["Het btw-totaal komt niet overeen met de btw-tarieven op de regels.", "Zet het btw-totaal[ op {value}] of corrigeer de tarieven en bedragen van de regels."],
  "INV-019": ["Hetzelfde factuurnummer komt twee keer voor in deze reeks. Factuurnummers moeten uniek zijn.", "Geef elke factuur een eigen nummer, of verwijder het dubbele bestand."],
  "INV-020": ["De vervaldatum staat niet in de vorm JJJJ-MM-DD.", "Schrijf de vervaldatum als JJJJ-MM-DD, bijvoorbeeld 2026-09-23."],
  "INV-021": ["De vervaldatum ligt vóór de factuurdatum; dat is bijna altijd een tikfout.", "Zet de vervaldatum op of na de factuurdatum."],
  "INV-022": ["Een btw-nummer heeft een landcode of lengte die geen enkel EU-btw-nummer heeft.", "Neem het btw-nummer precies over uit de documenten van de partij, met de landcode van twee letters."],
  "INV-023": ["Een btw-nummer klopt niet met zijn nationale controlecijfer en is dus vrijwel zeker verkeerd getypt.", "Controleer het btw-nummer met de documenten van de partij of met de VIES-dienst van de EU."],
  "INV-024": ["De IBAN voor de betaling is leeg.", "Vul de IBAN in van de rekening die de betaling moet ontvangen, of verwijder het lege veld."],
  "INV-025": ["De IBAN klopt niet met zijn controlecijfers; een betaling daarnaartoe zou terugkomen.", "Neem de IBAN opnieuw over van het rekeningafschrift."],
  "INV-026": ["De bankidentificatie (BIC) is leeg of verkeerd opgebouwd.", "Vul de BIC uit de bankgegevens in, of laat hem weg (voor SEPA-betalingen is hij optioneel)."],
  "INV-027": ["De BIC of bankcode hoort bij een ander land of een andere bank dan de IBAN.", "Gebruik de BIC van de bank van de IBAN."],
  "INV-028": ["Het vooruitbetaalde bedrag is ongeldig of hoger dan het factuurtotaal.", "Vul het al betaalde bedrag in, hoogstens het bruto totaal."],
  "INV-029": ["Het te betalen bedrag is niet het bruto totaal min het al betaalde bedrag.", "Zet het te betalen bedrag[ op {value}] of corrigeer het vooruitbetaalde bedrag."],
  "INV-030": ["De factuur vermeldt een IBAN maar geen betalingskenmerk, zodat de betaling moeilijk te koppelen is.", "Voeg een betalingskenmerk toe (meestal het factuurnummer) dat de betaler kan vermelden."],
  "INV-031": ["Het betalingskenmerk is leeg, te lang voor een overschrijving of geen geldige gestructureerde referentie.", "Gebruik een korte referentie van hoogstens 140 tekens, of een geldige RF-schuldeisersreferentie."],
  "INV-032": ["De documenttypecode is geen bekende code voor een factuur, creditnota of debetnota.", "Gebruik 380 voor een factuur of 381 voor een creditnota, tenzij uw netwerk een andere code voorschrijft."],
  "INV-033": ["Een creditnota of debetnota moet de factuur vermelden die ze corrigeert.", "Voeg het nummer (en liefst de datum) van de oorspronkelijke factuur toe."],
  "INV-034": ["Deze creditnota verwijst naar zichzelf als de factuur die ze corrigeert.", "Verwijs naar het nummer van de oorspronkelijke factuur, niet naar het eigen nummer van de creditnota."],
  "INV-035": ["Een regel met 0% of vrijgestelde btw heeft geen reden voor de vrijstelling, die netwerken verplicht stellen.", "Voeg de reden of code van de vrijstelling toe (bijvoorbeeld verlegde btw, intracommunautaire levering)."],
  "INV-036": ["Een referentieveld is aanwezig maar leeg.", "Vul de referentie in of verwijder het lege element."],
  "INV-037": ["De factuur gebruikt meerdere btw-tarieven maar heeft geen btw-uitsplitsing per tarief.", "Voeg per tarief één rij in de btw-uitsplitsing toe met het belastbare bedrag en de btw."],
  "INV-038": ["Rij[ {n}] van de btw-uitsplitsing klopt niet: de btw is niet het belastbare bedrag maal het tarief.", "Zet de btw van die rij[ op {value}] of corrigeer het belastbare bedrag of het tarief."],
  "INV-039": ["Een elektronisch adres (Peppol-endpoint) heeft geen herkende schemacode.", "Voeg de schemacode van het adres toe, bijvoorbeeld 0088 voor een GLN of 9930 voor een Duits btw-nummer."],
  "INV-040": ["Een elektronisch adres is leeg, zodat de factuur niet kan worden afgeleverd.", "Vul het elektronische adres van de partij in."],
  "INV-041": ["Een elektronisch adres heeft niet de vorm die zijn schema vereist.", "Controleer het adres met de registratie van de partij (cijfers, lengte, controlecijfer)."],
  "INV-042": ["De factuurperiode is onvolledig of verkeerd opgebouwd.", "Geef zowel een begin- als een einddatum als JJJJ-MM-DD, of verwijder de periode."],
  "INV-043": ["De factuurperiode eindigt voordat ze begint.", "Wissel de begin- en einddatum om of corrigeer ze."],
  "INV-044": ["De code voor de betaalwijze is leeg of geen UNCL 4461-code.", "Gebruik een standaardcode, bijvoorbeeld 58 voor een SEPA-overschrijving of 59 voor een SEPA-domiciliëring."],
  "INV-045": ["De factuur vraagt om een overschrijving maar vermeldt geen IBAN om op te betalen.", "Voeg de IBAN toe, of wijzig de betaalwijze als de factuur op een andere manier wordt betaald."],
  "INV-046": ["De betaalwijze is contant, cheque of kaart, maar er staat toch een IBAN; die twee spreken elkaar tegen.", "Verwijder de IBAN of wijzig de betaalwijze in een overschrijving."],
  "INV-047": ["De referentie van de koper is leeg of een plaatshouder.", "Vul de referentie in die de koper u gaf (voor Duitse overheidskopers de Leitweg-ID)."],
  "INV-048": ["De referentie van de bestelbon is leeg of een plaatshouder.", "Vul het bestelnummer van de koper in, of laat het veld weg."],
  "INV-049": ["De referentie van de bestelbon herhaalt het factuurnummer, zodat de koper haar niet aan een bestelling kan koppelen.", "Vul het echte bestelnummer van de koper in, of laat het veld weg."],
  "INV-050": ["Een korting of toeslag op documentniveau is verkeerd opgebouwd.", "Geef elke korting of toeslag een soort (korting of toeslag), een bedrag en een reden."],
  "INV-051": ["Het bedrag van een korting of toeslag op documentniveau klopt niet met het percentage van de basis.", "Bereken het bedrag opnieuw uit basis en percentage[ ({value})], of corrigeer die."],
  "INV-052": ["Een korting of toeslag op documentniveau heeft geen bruikbare reden.", "Vermeld een korte reden, bijvoorbeeld 'korting voor contante betaling' of 'vracht'."],
  "INV-053": ["De betalingstermijn in dagen is geen positief geheel getal.", "Vul het aantal dagen in, bijvoorbeeld 30."],
  "INV-054": ["De vervaldatum komt niet overeen met de factuurdatum plus de vermelde betalingstermijn.", "Laat de vervaldatum en de betalingstermijn met elkaar overeenstemmen."],
  "INV-056": ["De creditnota staat in een andere valuta dan de factuur die ze corrigeert.", "Maak de creditnota op in de valuta van de oorspronkelijke factuur."],
  "INV-057": ["De creditnota's in deze reeks op één factuur zijn samen hoger dan die factuur.", "Controleer op een dubbele creditnota of een verkeerde verwijzing."],
  "INV-058": ["De creditnota en de factuur die ze corrigeert komen van verschillende verkopers.", "Controleer of de creditnota naar de juiste factuur verwijst."],
  "INV-059": ["Het btw-totaal in de btw-boekingsvaluta verschilt van het btw-totaal van het document, hoewel de valuta's gelijk zijn.", "Maak beide btw-totalen gelijk, of verwijder het dubbele totaal."],
  "INV-060": ["De uitgebreide prijsbedragen van een regel (btw of bruto) kloppen niet.", "Bereken de btw en het brutobedrag van de regel opnieuw uit het nettobedrag."],
  "INV-061": ["Een elektronisch adres heeft niet het formaat dat Peppol voor zijn schema controleert (een waarschuwing).", "Controleer het adres met de registratie van de partij."],
  "INV-062": ["Een identificatie heeft niet het formaat waarop Peppol weigert.", "Corrigeer de identificatie naar het formaat van haar schema; Peppol-accesspoints weigeren dit bestand zoals het nu is."],
  "INV-063": ["Een identificatie heeft niet het formaat dat Peppol controleert (een waarschuwing).", "Controleer de identificatie met het formaat van haar schema."],
  "INV-064": ["Een Nederlands btw-nummer staat niet in de vorm NL + negen cijfers + B + twee cijfers.", "Schrijf het Nederlandse btw-nummer in de standaardvorm, bijvoorbeeld NL123456789B01."],
  "INV-065": ["Een getal, datum of tijd bevat een spatie of onzichtbaar teken en is daardoor geen geldige XML-waarde.", "Verwijder de spatie of het onzichtbare teken uit die waarde."],

  // --- UBL 2.1 schema (ubl-xsd.mjs) ---
  "UBL-XSD-01": ["Het bestand bevat een element dat het UBL 2.1-schema op deze plaats niet toelaat, of één element te veel. Validators controleren eerst het schema en weigeren het bestand meteen.", "Verwijder het element uit de melding, of verplaats het naar het blok waar UBL het definieert."],
  "UBL-XSD-02": ["De elementen staan in de verkeerde volgorde. UBL legt de volgorde binnen elk blok vast, en een bestand in een andere volgorde voldoet niet aan het schema.", "Zet de elementen in de volgorde uit de melding; de meeste factuursoftware lost dit op zodra het exportsjabloon is gecorrigeerd."],
  "UBL-XSD-03": ["Een element dat het UBL 2.1-schema hier vereist, ontbreekt.", "Voeg het element uit de melding toe."],
  "UBL-XSD-04": ["Een waarde kan niet worden gelezen als het type dat het schema vereist: een getal, een datum JJJJ-MM-DD, een tijd hh:mm:ss, true of false, of base64-gegevens.", "Schrijf de waarde in die vorm, bijvoorbeeld 1250.00 voor een bedrag (een punt, geen scheidingsteken voor duizendtallen) of 2026-08-24 voor een datum."],
  "UBL-XSD-05": ["Een attribuut is fout: een verplicht attribuut ontbreekt (elk bedrag heeft currencyID nodig, elke maat unitCode, elke bijlage mimeCode), of het element draagt een attribuut dat het schema niet kent.", "Voeg het ontbrekende attribuut toe, of verwijder het attribuut uit de melding."],
  "UBL-XSD-06": ["Een element staat in de verkeerde naamruimte (bijvoorbeeld cac: waar UBL cbc: gebruikt). Voor een validator is dat een ander element, dus het bestand voldoet niet aan het schema.", "Schrijf het element met het voorvoegsel uit de melding en zorg dat dat voorvoegsel gedeclareerd is."],
  "UBL-XSD-07": ["De XML is niet goed gevormd: een tag wordt nooit of in de verkeerde volgorde gesloten. Meestal is het bestand afgebroken of met de hand bewerkt.", "Exporteer het bestand opnieuw vanuit de factuursoftware."],

  // --- XRechnung (Germany) ---
  "XR-001": ["De referentie van de koper (BT-10) ontbreekt. XRechnung vereist ze; voor overheidskopers is het de Leitweg-ID.", "Vul de Leitweg-ID of de referentie in die de koper u gaf."],
  "XR-002": ["De referentie van de koper lijkt op een Leitweg-ID, maar de controlecijfers kloppen niet: het portaal zal haar weigeren.", "Neem de Leitweg-ID opnieuw over, precies zoals de koper hem publiceerde."],
  "XR-003": ["XRechnung vereist betalingsinstructies (een code voor de betaalwijze), en die ontbreken.", "Voeg de betaalwijze toe, bijvoorbeeld 58 (SEPA-overschrijving) met uw IBAN."],
  "XR-004": ["De contactgegevens van de verkoper zijn onvolledig. XRechnung vereist een contactnaam, telefoonnummer en e-mailadres.", "Voeg de naam, het telefoonnummer en het e-mailadres van de contactpersoon van de verkoper toe."],
  "XR-005": ["De plaats of postcode van de verkoper ontbreekt; XRechnung vereist beide.", "Voeg de plaats en postcode van de verkoper toe."],
  "XR-006": ["De plaats of postcode van de koper ontbreekt; XRechnung vereist beide.", "Voeg de plaats en postcode van de koper toe."],
  "XR-007": ["De factuurtypecode is geen code die XRechnung accepteert.", "Gebruik een geaccepteerde code, meestal 380 (factuur) of 381 (creditnota)."],
  "XR-008": ["De specificatie-identificatie (BT-24) noemt geen XRechnung-versie, zodat de ontvanger de verkeerde regels toepast.", "Zet ze op de XRechnung-versie die uw software maakt, bijvoorbeeld urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0."],
  "XR-009": ["De verkoper heeft geen btw-nummer en geen belastingnummer; een Duitse factuur heeft een van beide nodig.", "Voeg het btw-nummer (USt-IdNr.) of het belastingnummer (Steuernummer) van de verkoper toe."],

  // --- Peppol BIS Billing 3.0 ---
  "PP-001": ["De identificatie van het bedrijfsproces (BT-23) ontbreekt of is niet het Peppol-factureringsproces.", "Zet ze op urn:fdc:peppol.eu:2017:poacc:billing:01:1.0."],
  "PP-002": ["De specificatie-identificatie noemt geen Peppol BIS Billing 3.0, dus accesspoints zullen de factuur weigeren.", "Zet ze op urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0 (of de CIUS die uw netwerk verwacht)."],
  "PP-003": ["Het elektronische adres van de verkoper (BT-34) ontbreekt; Peppol heeft het nodig om te weten wie de factuur stuurde.", "Voeg de Peppol-endpoint-ID van de verkoper toe, met zijn schemacode."],
  "PP-004": ["Het elektronische adres van de koper (BT-49) ontbreekt, zodat de factuur niet via Peppol kan worden afgeleverd.", "Voeg de Peppol-endpoint-ID van de koper toe, met zijn schemacode."],
  "PP-005": ["Er is geen referentie van de koper en geen bestelreferentie; Peppol vereist een van beide.", "Voeg de referentie van de koper of het bestelnummer toe."],

  // --- France (CTC reform) ---
  "FR-001": ["De Franse verkoper heeft geen SIREN of SIRET op de factuur; vanaf de hervorming van 2026-2027 is dat verplicht.", "Voeg de SIREN (9 cijfers) of SIRET (14 cijfers) van de verkoper toe als wettelijke registratie-identificatie."],
  "FR-002": ["Een SIREN of SIRET heeft de verkeerde lengte of klopt niet met zijn controlecijfer.", "Neem het nummer opnieuw over uit het Kbis-uittreksel van het bedrijf of het INSEE-register."],
  "FR-003": ["De SIREN in het Franse btw-nummer van de verkoper verschilt van de SIREN van de verkoper.", "Controleer welk van de twee nummers fout is; ze moeten bij hetzelfde bedrijf horen."],
  "FR-004": ["De Franse koper heeft geen SIREN of SIRET, zodat het platform de factuur niet naar hem kan doorsturen.", "Voeg de SIREN of SIRET van de koper toe."],
  "FR-005": ["Het tarief van de boete bij laattijdige betaling staat niet vermeld, wat de Franse wet vereist (Code de commerce L441-10).", "Voeg een opmerking toe met het tarief van de boete bij laattijdige betaling."],
  "FR-006": ["De vaste invorderingsvergoeding van 40 euro wordt niet vermeld (Code de commerce D441-5).", "Voeg de vermelding van de vaste invorderingsvergoeding van 40 euro toe."],
  "FR-007": ["De voorwaarde voor korting bij vervroegde betaling (escompte) staat niet vermeld (Code de commerce L441-9).", "Voeg de kortingsvoorwaarde toe, of vermeld dat er geen korting wordt gegeven bij vervroegde betaling."],
  "FR-008": ["De categorie van de verrichting (goederen, diensten of beide) staat niet vermeld; de hervorming maakt dat verplicht.", "Voeg een opmerking toe die zegt of de factuur goederen, diensten of beide betreft."],

  // --- PDF (Factur-X / ZUGFeRD) ---
  "PDF-001": ["De PDF heeft geen PDF/A-3-markering. Veel ontvangers aanvaarden dat, maar Factur-X en ZUGFeRD vereisen PDF/A-3.", "Exporteer de factuur als PDF/A-3 vanuit uw software (een opmerking, niet blokkerend)."],
  "PDF-002": ["De ingesloten factuur-XML heeft een niet-standaard bestandsnaam, zodat ontvangers haar mogelijk niet vinden.", "Noem de bijlage factur-x.xml (of zugferd-invoice.xml / xrechnung.xml)."],
  "PDF-003": ["De bijlage vermeldt haar relatie tot de PDF niet (AFRelationship).", "Laat uw PDF-programma AFRelationship op Data of Alternative zetten (een opmerking)."],
  "PDF-004": ["De metadata van de PDF noemen een ander Factur-X-profiel dan de ingesloten XML.", "Maak de PDF opnieuw aan, zodat metadata en XML hetzelfde profiel noemen."],
  "PDF-005": ["Het ingesloten bestand heeft geen MIME-type, wat PDF/A-3 verwacht.", "Laat uw PDF-programma het MIME-type text/xml voor de bijlage schrijven (een opmerking)."],
  "PDF-006": ["De catalogus van de PDF vermeldt de bijlage niet als geassocieerd bestand (/AF).", "Laat uw PDF-programma de bijlage aan de /AF-lijst toevoegen (een opmerking)."],

  // --- CII schema (cii-xsd.mjs) ---
  "CII-001": ["De XML bevat een element dat het CII-schema op deze plaats niet toelaat, of één element te veel. Een validator weigert het bestand nog voordat er een bedrijfsregel wordt gecontroleerd.", "Verwijder het element uit de melding, of verplaats het naar het blok waar het schema het definieert, en exporteer opnieuw."],
  "CII-002": ["De elementen staan in de verkeerde volgorde. Het CII-schema legt de volgorde van elk element vast, en een validator weigert een bestand dat daarvan afwijkt, ook als elke waarde juist is.", "Zet het element uit de melding op de plaats die de volgorde van het schema voorschrijft; de meeste factuursoftware doet dat bij een nieuwe export."],
  "CII-003": ["Een element dat het CII-schema vereist, ontbreekt, zodat het bestand geen geldige Cross Industry Invoice is.", "Voeg het element uit de melding toe en exporteer opnieuw."],
  "CII-004": ["Een waarde past niet bij haar type in het CII-schema (een getal met een komma, een datum of true/false anders geschreven, een code die te lang is).", "Corrigeer de waarde uit de melding: getallen met een decimale punt en zonder scheidingsteken voor duizendtallen, Indicator als true of false."],
  "CII-005": ["Een attribuut heeft een waarde die het CII-schema niet toelaat (het schema legt het attribuut op één waarde vast), of het schema staat het attribuut op dat element helemaal niet toe (de Factur-X-schema's MINIMUM en BASIC WL laten de meeste weg).", "Zet het attribuut op de waarde uit de melding, of laat het weg."],
  "CII-006": ["De XML is niet goed gevormd: een tag wordt nooit of in de verkeerde volgorde gesloten, zoals bij een afgebroken bestand.", "Exporteer het bestand opnieuw; is het met de hand bewerkt, sluit dan elke tag in de volgorde waarin hij geopend werd."],
  "CII-007": ["Een element staat in de verkeerde naamruimte, bijvoorbeeld udt:DateTimeString waar het schema qdt:DateTimeString verwacht (de datum van de voorafgaande factuur, BT-26). Voor een validator is dat een ander element, dus het bestand wordt geweigerd.", "Schrijf het element met het voorvoegsel uit de melding en declareer die naamruimte op het hoofdelement."],

  // --- Paid-layer rules (pro/rules.mjs) ---
  "PRO-DEC-001": ["Een bedrag heeft meer dan twee decimalen. EN 16931 staat er hoogstens twee toe (BR-DEC-regels), dus ontvangers weigeren het.", "Rond het bedrag af op twee decimalen[ ({value})]."],
  "PRO-DATE-001": ["Een datum staat niet in de enige vorm die het e-factuurschema accepteert (JJJJ-MM-DD in UBL, JJJJMMDD in CII).", "Schrijf de datum in die vorm; het schema weigert 24.08.2026 of 24/08/2026."],
  "PRO-SUM-001": ["Een totaal klopt niet tot op de cent. De officiële EN 16931-regels (BR-CO) vergelijken exact, zonder afrondingsmarge.", "Zet het totaal[ op {value}] of corrigeer de bedragen waaruit het bestaat."],
  "PRO-DE-001": ["Dit ZUGFeRD- / Factur-X-profiel (MINIMUM of BASIC WL) geldt in Duitsland niet als e-factuur: het BMF aanvaardt XRechnung en ZUGFeRD vanaf 2.0.1, behalve deze twee profielen.", "Exporteer de factuur in het profiel EN 16931 (COMFORT), EXTENDED of XRECHNUNG, of als XRechnung."],
  "PRO-CUR-001": ["De valutacode van het document ontbreekt, zodat het bestand niet als factuur kan worden gelezen.", "Voeg de valutacode van de factuur toe, bijvoorbeeld EUR."],
};
