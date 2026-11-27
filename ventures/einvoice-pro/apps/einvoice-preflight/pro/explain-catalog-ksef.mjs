// @ts-check
// Plain-language explanations for Poland's KSeF FA(3) findings (rule ids PL-nnn, emitted by
// ../fa3.mjs, ../fa3-xsd.mjs and ../report.mjs), in English, German, French and Polish.
// Proprietary (see ../LICENSE, part 2).
//
// Same shape and rules as explain-catalog.mjs, which merges these into TEMPLATES: [title, action]
// per language, {n} is the line number the checker's message names, a [segment] is dropped when
// its placeholder has no value. The checker's own English message, with the element, the values
// and the line, is always returned beside the template, so these texts stay general where one
// rule id covers several cases (PL-018 encoding, PL-020 size or attachment).
//
// What these texts may say about KSeF is only what the checker's own messages say: the schema
// (PL-012..PL-017), the transport rules (PL-018..PL-020), the issue date (PL-021) and duplicates
// (PL-022) are refusals; the arithmetic rules (PL-005..PL-008, PL-023..PL-025) are not claimed to
// be KSeF refusals, because the checker does not claim it either.
//
// Polish text written by the agent (2026-11-26), not yet read by a native speaker; terms follow
// the FA(3) schema and the VAT Act (ustawa o VAT): NIP, stawka podatku, wartość netto.

/** @typedef {[string, string]} Pair */
/** @typedef {{ en: Pair, de: Pair, fr: Pair, pl: Pair }} KsefTemplate */

const RATE_CODES_EN = '23, 22, 8, 7, 5, 4, 3, "0 KR", "0 WDT", "0 EX", zw, oo, "np I" or "np II"';

/** @type {Record<string, KsefTemplate>} */
export const KSEF_TEMPLATES = {
  "PL-001": {
    en: ["The file is not an FA(3) invoice (WariantFormularza is not 3, or the Fa block is missing); KSeF has taken only the FA(3) structure since 1 February 2026.", "Export the invoice from your software in the FA(3) structure, with WariantFormularza 3 and the Fa block."],
    de: ["Die Datei ist keine FA(3)-Rechnung (WariantFormularza ist nicht 3 oder der Fa-Block fehlt); KSeF nimmt seit dem 1. Februar 2026 nur die Struktur FA(3) an.", "Exportieren Sie die Rechnung aus Ihrer Software in der Struktur FA(3), mit WariantFormularza 3 und dem Fa-Block."],
    fr: ["Le fichier n'est pas une facture FA(3) (WariantFormularza ne vaut pas 3, ou le bloc Fa manque) ; depuis le 1er février 2026, KSeF n'accepte que la structure FA(3).", "Exportez la facture depuis votre logiciel dans la structure FA(3), avec WariantFormularza 3 et le bloc Fa."],
    pl: ["Plik nie jest fakturą w strukturze FA(3) (WariantFormularza jest inny niż 3 albo brakuje bloku Fa), a od 1 lutego 2026 r. KSeF przyjmuje tylko strukturę FA(3).", "Wyeksportuj fakturę z programu w strukturze FA(3), z WariantFormularza 3 i blokiem Fa."],
  },
  "PL-002": {
    en: ["A Polish tax number (NIP) on the invoice fails its check digit, so it was most likely mistyped and matches no registered taxpayer.", "Copy the NIP (10 digits, without the PL prefix or dashes) or the internal id (IDWew) from the registration documents or from KSeF instead of re-keying it."],
    de: ["Eine polnische Steuernummer (NIP) auf der Rechnung besteht die Prüfziffernkontrolle nicht; sie wurde also höchstwahrscheinlich falsch eingegeben und passt zu keinem registrierten Steuerpflichtigen.", "Übernehmen Sie die NIP (10 Ziffern, ohne Präfix PL und ohne Bindestriche) oder die interne Kennung (IDWew) aus den Registrierungsunterlagen oder aus KSeF, statt sie neu einzutippen."],
    fr: ["Un numéro fiscal polonais (NIP) de la facture échoue au contrôle de la clé : il a très probablement été mal saisi et ne correspond à aucun contribuable enregistré.", "Reprenez le NIP (10 chiffres, sans préfixe PL ni tirets) ou l'identifiant interne (IDWew) depuis les documents d'immatriculation ou depuis KSeF, au lieu de le ressaisir."],
    pl: ["Numer NIP na fakturze nie przechodzi kontroli cyfry kontrolnej, więc najpewniej został źle wpisany i nie odpowiada żadnemu zarejestrowanemu podatnikowi.", "Skopiuj NIP (10 cyfr, bez prefiksu PL i bez myślników) lub identyfikator wewnętrzny (IDWew) z dokumentów rejestrowych albo z KSeF, zamiast wpisywać go ręcznie."],
  },
  "PL-004": {
    en: ["The tax rate[ on line {n}] (P_12) is not one of the codes FA(3) allows, so KSeF refuses the file.", `Use one of the FA(3) rate codes: ${RATE_CODES_EN}.`],
    de: ["Der Steuersatz[ in Zeile {n}] (P_12) gehört nicht zu den Codes, die FA(3) zulässt; KSeF weist die Datei ab.", "Verwenden Sie einen der FA(3)-Codes: 23, 22, 8, 7, 5, 4, 3, „0 KR“, „0 WDT“, „0 EX“, zw, oo, „np I“ oder „np II“."],
    fr: ["Le taux de TVA[ de la ligne {n}] (P_12) ne fait pas partie des codes admis par FA(3) ; KSeF refuse le fichier.", "Utilisez l'un des codes FA(3) : 23, 22, 8, 7, 5, 4, 3, « 0 KR », « 0 WDT », « 0 EX », zw, oo, « np I » ou « np II »."],
    pl: ["Stawka podatku[ w wierszu {n}] (P_12) nie należy do kodów dopuszczonych w FA(3), więc KSeF odrzuci plik.", "Użyj jednego z kodów FA(3): 23, 22, 8, 7, 5, 4, 3, „0 KR”, „0 WDT”, „0 EX”, zw, oo, „np I” lub „np II”."],
  },
  "PL-005": {
    en: ["The net amount (P_11)[ of line {n}] is not the quantity (P_8B) times the unit net price (P_9A); the buyer or an audit will query it.", "Correct the quantity, the unit price or the net amount so that P_11 = P_8B × P_9A to the grosz."],
    de: ["Der Nettobetrag (P_11)[ in Zeile {n}] entspricht nicht Menge (P_8B) mal Nettoeinzelpreis (P_9A); der Käufer oder eine Prüfung wird nachfragen.", "Korrigieren Sie Menge, Einzelpreis oder Nettobetrag, sodass P_11 = P_8B × P_9A auf den Grosz genau gilt."],
    fr: ["Le montant net (P_11)[ de la ligne {n}] n'est pas égal à la quantité (P_8B) multipliée par le prix unitaire net (P_9A) ; l'acheteur ou un contrôle le relèvera.", "Corrigez la quantité, le prix unitaire ou le montant net pour que P_11 = P_8B × P_9A au grosz près."],
    pl: ["Wartość netto (P_11)[ w wierszu {n}] nie jest równa ilości (P_8B) pomnożonej przez cenę jednostkową netto (P_9A); nabywca lub kontrola to zakwestionuje.", "Popraw ilość, cenę jednostkową lub wartość netto tak, aby P_11 = P_8B × P_9A co do grosza."],
  },
  "PL-006": {
    en: ["A net total per tax rate (P_13_n) does not match the lines at that rate: it is missing, differs from their sum, or totals a rate no line uses.", "Set each P_13_n to the sum of the lines' net amounts (P_11) at its rate (on a correction, the before rows count minus) and remove a total that no line carries."],
    de: ["Eine Nettosumme je Steuersatz (P_13_n) passt nicht zu den Zeilen mit diesem Satz: Sie fehlt, weicht von deren Summe ab oder summiert einen Satz, den keine Zeile verwendet.", "Setzen Sie jedes P_13_n auf die Summe der Nettobeträge (P_11) der Zeilen mit diesem Satz (bei einer Korrektur zählen die Zeilen „vorher“ negativ) und entfernen Sie Summen, zu denen es keine Zeile gibt."],
    fr: ["Un total net par taux (P_13_n) ne correspond pas aux lignes à ce taux : il manque, diffère de leur somme, ou totalise un taux qu'aucune ligne n'utilise.", "Fixez chaque P_13_n à la somme des montants nets (P_11) des lignes à ce taux (sur une facture rectificative, les lignes « avant » comptent en négatif) et supprimez un total qu'aucune ligne ne porte."],
    pl: ["Suma wartości netto dla stawki (P_13_n) nie zgadza się z wierszami w tej stawce: brakuje jej, różni się od ich sumy albo sumuje stawkę, której nie ma w żadnym wierszu.", "Ustaw każde P_13_n jako sumę wartości netto (P_11) wierszy w danej stawce (w korekcie wiersze „przed korektą” liczą się ze znakiem minus) i usuń sumę, której nie odpowiada żaden wiersz."],
  },
  "PL-007": {
    en: ["The VAT for a rate (P_14_n) is not that rate applied to its net total (P_13_n).", "Recalculate the VAT as the net total times the rate, rounded once per rate rather than line by line."],
    de: ["Die Umsatzsteuer eines Satzes (P_14_n) entspricht nicht diesem Satz angewandt auf die zugehörige Nettosumme (P_13_n).", "Berechnen Sie die Steuer neu als Nettosumme mal Steuersatz, einmal je Satz gerundet statt Zeile für Zeile."],
    fr: ["La TVA d'un taux (P_14_n) n'est pas ce taux appliqué au total net correspondant (P_13_n).", "Recalculez la TVA comme total net multiplié par le taux, arrondie une fois par taux et non ligne par ligne."],
    pl: ["Kwota podatku dla stawki (P_14_n) nie jest równa tej stawce zastosowanej do sumy netto (P_13_n).", "Przelicz podatek jako sumę netto pomnożoną przez stawkę, zaokrąglając raz dla każdej stawki, a nie w każdym wierszu."],
  },
  "PL-008": {
    en: ["The amount due (P_15) is not the sum of the net and VAT totals (every P_13_n and P_14_n).", "Make P_15 the sum of all P_13_n and P_14_n (on a correction, the sum of the differences)."],
    de: ["Der Gesamtbetrag (P_15) ist nicht die Summe der Netto- und Steuersummen (aller P_13_n und P_14_n).", "Setzen Sie P_15 auf die Summe aller P_13_n und P_14_n (bei einer Korrektur die Summe der Differenzen)."],
    fr: ["Le montant total (P_15) n'est pas la somme des totaux nets et de TVA (tous les P_13_n et P_14_n).", "Fixez P_15 à la somme de tous les P_13_n et P_14_n (sur une facture rectificative, la somme des différences)."],
    pl: ["Kwota należności ogółem (P_15) nie jest sumą kwot netto i podatku (wszystkich P_13_n i P_14_n).", "Ustaw P_15 jako sumę wszystkich P_13_n i P_14_n (w korekcie: sumę różnic)."],
  },
  "PL-009": {
    en: ["Two invoice lines have the same line number (NrWierszaFa).", "Number the lines (FaWiersz) uniquely; on a correction only a before row (StanPrzed) may repeat its after row's number."],
    de: ["Zwei Rechnungszeilen haben dieselbe Zeilennummer (NrWierszaFa).", "Nummerieren Sie die Zeilen (FaWiersz) eindeutig; nur bei einer Korrektur darf eine Zeile „vorher“ (StanPrzed) die Nummer ihrer Zeile „nachher“ wiederholen."],
    fr: ["Deux lignes de la facture portent le même numéro (NrWierszaFa).", "Numérotez les lignes (FaWiersz) de façon unique ; seule une ligne « avant » (StanPrzed) d'une facture rectificative peut reprendre le numéro de sa ligne « après »."],
    pl: ["Dwa wiersze faktury mają ten sam numer (NrWierszaFa).", "Nadaj wierszom (FaWiersz) unikalne numery; tylko w korekcie wiersz „przed korektą” (StanPrzed) może powtarzać numer wiersza „po korekcie”."],
  },
  "PL-011": {
    en: ["The invoice is in a foreign currency but does not give the VAT converted to złoty (P_14_nW).", "Add the VAT in PLN for each rate (P_14_1W and so on), converted at the exchange rate art. 106e(11) of the VAT Act prescribes."],
    de: ["Die Rechnung lautet auf eine Fremdwährung, nennt aber die Steuer nicht in Złoty umgerechnet (P_14_nW).", "Ergänzen Sie die Steuer in PLN je Satz (P_14_1W usw.), umgerechnet zum Kurs nach Art. 106e Abs. 11 des polnischen Umsatzsteuergesetzes."],
    fr: ["La facture est libellée en devise étrangère mais n'indique pas la TVA convertie en zlotys (P_14_nW).", "Ajoutez la TVA en PLN pour chaque taux (P_14_1W, etc.), convertie au taux de change prévu par l'art. 106e, al. 11, de la loi polonaise sur la TVA."],
    pl: ["Faktura jest wystawiona w walucie obcej, ale nie podaje kwoty podatku przeliczonej na złote (P_14_nW).", "Dodaj kwotę podatku w PLN dla każdej stawki (P_14_1W itd.), przeliczoną po kursie wskazanym w art. 106e ust. 11 ustawy o VAT."],
  },
  "PL-012": {
    en: ["The file has an element the FA(3) schema does not allow at that place, or one too many; KSeF refuses a file that fails the schema before any other check.", "Remove the element named in the detail or move it to where the schema expects it; usually the software's FA(3) export needs an update."],
    de: ["Die Datei enthält ein Element, das das FA(3)-Schema an dieser Stelle nicht zulässt, oder eines zu viel; KSeF weist eine Datei, die das Schema verletzt, vor jeder weiteren Prüfung ab.", "Entfernen Sie das in der Meldung genannte Element oder setzen Sie es an die vom Schema vorgesehene Stelle; meist muss der FA(3)-Export der Software aktualisiert werden."],
    fr: ["Le fichier contient un élément que le schéma FA(3) n'admet pas à cet endroit, ou un de trop ; KSeF refuse un fichier non conforme au schéma avant tout autre contrôle.", "Supprimez l'élément indiqué dans le détail ou placez-le là où le schéma l'attend ; le plus souvent, l'export FA(3) du logiciel doit être mis à jour."],
    pl: ["Plik zawiera element, którego schemat FA(3) nie dopuszcza w tym miejscu, albo o jeden za dużo; KSeF odrzuca plik niezgodny ze schematem przed innymi kontrolami.", "Usuń element wskazany w komunikacie albo przenieś go tam, gdzie oczekuje go schemat; zwykle trzeba zaktualizować eksport FA(3) w programie."],
  },
  "PL-013": {
    en: ["Elements are in an order the FA(3) schema does not allow, so KSeF refuses the file.", "Put the elements in the order the schema prescribes (the detail names where it goes wrong); a hand-edited or self-built export is the usual cause."],
    de: ["Elemente stehen in einer Reihenfolge, die das FA(3)-Schema nicht zulässt; KSeF weist die Datei ab.", "Ordnen Sie die Elemente in der vom Schema vorgegebenen Reihenfolge (die Meldung nennt die Stelle); meist ist ein von Hand bearbeiteter oder selbst gebauter Export die Ursache."],
    fr: ["Des éléments sont dans un ordre que le schéma FA(3) n'admet pas ; KSeF refuse le fichier.", "Placez les éléments dans l'ordre prescrit par le schéma (le détail indique l'endroit) ; un export modifié à la main ou développé en interne en est la cause habituelle."],
    pl: ["Elementy występują w kolejności, której schemat FA(3) nie dopuszcza, więc KSeF odrzuci plik.", "Ułóż elementy w kolejności wymaganej przez schemat (komunikat wskazuje miejsce); zwykle przyczyną jest ręcznie edytowany lub własny eksport."],
  },
  "PL-014": {
    en: ["A mandatory FA(3) element is missing, so KSeF refuses the file.", "Add the element named in the detail, with its value."],
    de: ["Ein Pflichtelement von FA(3) fehlt; KSeF weist die Datei ab.", "Ergänzen Sie das in der Meldung genannte Element mit seinem Wert."],
    fr: ["Un élément obligatoire de FA(3) manque ; KSeF refuse le fichier.", "Ajoutez l'élément indiqué dans le détail, avec sa valeur."],
    pl: ["Brakuje obowiązkowego elementu FA(3), więc KSeF odrzuci plik.", "Dodaj element wskazany w komunikacie wraz z jego wartością."],
  },
  "PL-015": {
    en: ["A value does not fit the FA(3) schema (too long, wrong pattern, out of range, too many decimals or not in the code list), so KSeF refuses the file.", "Correct the value of the element named in the detail to the form the schema requires."],
    de: ["Ein Wert passt nicht zum FA(3)-Schema (zu lang, falsches Muster, außerhalb des Bereichs, zu viele Nachkommastellen oder nicht in der Codeliste); KSeF weist die Datei ab.", "Korrigieren Sie den Wert des in der Meldung genannten Elements in die vom Schema verlangte Form."],
    fr: ["Une valeur n'est pas conforme au schéma FA(3) (trop longue, motif incorrect, hors limites, trop de décimales ou absente de la liste de codes) ; KSeF refuse le fichier.", "Corrigez la valeur de l'élément indiqué dans le détail selon la forme exigée par le schéma."],
    pl: ["Wartość nie pasuje do schematu FA(3) (za długa, zły wzorzec, poza zakresem, za dużo miejsc po przecinku lub spoza listy kodów), więc KSeF odrzuci plik.", "Popraw wartość elementu wskazanego w komunikacie do postaci wymaganej przez schemat."],
  },
  "PL-016": {
    en: ["A required attribute is missing, or a fixed one has another value (such as kodSystemowy or wersjaSchemy on KodFormularza), so KSeF refuses the file.", "Set the attribute named in the detail exactly as the FA(3) schema fixes it."],
    de: ["Ein Pflichtattribut fehlt oder ein festgelegtes hat einen anderen Wert (etwa kodSystemowy oder wersjaSchemy an KodFormularza); KSeF weist die Datei ab.", "Setzen Sie das in der Meldung genannte Attribut genau so, wie das FA(3)-Schema es festlegt."],
    fr: ["Un attribut obligatoire manque, ou un attribut fixe a une autre valeur (par exemple kodSystemowy ou wersjaSchemy sur KodFormularza) ; KSeF refuse le fichier.", "Donnez à l'attribut indiqué dans le détail exactement la valeur fixée par le schéma FA(3)."],
    pl: ["Brakuje wymaganego atrybutu albo atrybut o stałej wartości ma inną wartość (np. kodSystemowy lub wersjaSchemy w KodFormularza), więc KSeF odrzuci plik.", "Ustaw atrybut wskazany w komunikacie dokładnie tak, jak określa go schemat FA(3)."],
  },
  "PL-017": {
    en: ["The XML is not well formed (a tag is never closed or closes out of order), which usually means a cut-off file; KSeF cannot read it.", "Export the file again; if it was edited by hand, close every tag in the order it was opened."],
    de: ["Das XML ist nicht wohlgeformt (ein Tag wird nie oder in falscher Reihenfolge geschlossen), meist eine abgeschnittene Datei; KSeF kann sie nicht lesen.", "Exportieren Sie die Datei erneut; wurde sie von Hand bearbeitet, schließen Sie jedes Tag in der Reihenfolge, in der es geöffnet wurde."],
    fr: ["Le XML n'est pas bien formé (une balise n'est jamais fermée ou se ferme dans le désordre), signe habituel d'un fichier tronqué ; KSeF ne peut pas le lire.", "Exportez de nouveau le fichier ; s'il a été modifié à la main, fermez chaque balise dans l'ordre de son ouverture."],
    pl: ["XML nie jest poprawnie zbudowany (znacznik nie został zamknięty albo zamyka się w złej kolejności), co zwykle oznacza ucięty plik; KSeF nie odczyta go.", "Wyeksportuj plik ponownie; jeśli był edytowany ręcznie, zamknij każdy znacznik w kolejności, w jakiej został otwarty."],
  },
  "PL-018": {
    en: ["The file's encoding or header breaks KSeF's transport rules: KSeF takes UTF-8 without a byte-order mark, and no processing instruction besides the XML declaration.", "Save the XML as UTF-8 without BOM, with encoding=\"UTF-8\" or no declaration, and remove lines such as <?xml-stylesheet?>."],
    de: ["Kodierung oder Kopf der Datei verletzen die Übertragungsregeln von KSeF: KSeF nimmt UTF-8 ohne Byte-Order-Mark und keine Verarbeitungsanweisung außer der XML-Deklaration.", "Speichern Sie das XML als UTF-8 ohne BOM, mit encoding=\"UTF-8\" oder ohne Deklaration, und entfernen Sie Zeilen wie <?xml-stylesheet?>."],
    fr: ["L'encodage ou l'en-tête du fichier enfreint les règles de transmission de KSeF : KSeF accepte l'UTF-8 sans indicateur d'ordre des octets (BOM), et aucune instruction de traitement hormis la déclaration XML.", "Enregistrez le XML en UTF-8 sans BOM, avec encoding=\"UTF-8\" ou sans déclaration, et supprimez les lignes comme <?xml-stylesheet?>."],
    pl: ["Kodowanie lub nagłówek pliku łamie zasady przesyłania do KSeF: KSeF przyjmuje UTF-8 bez znacznika BOM i bez instrukcji przetwarzania poza deklaracją XML.", "Zapisz XML w UTF-8 bez BOM, z encoding=\"UTF-8\" albo bez deklaracji, i usuń wiersze takie jak <?xml-stylesheet?>."],
  },
  "PL-019": {
    en: ["The file holds characters that XML forbids or that KSeF refuses (control characters), often from a database field or a garbled Polish letter.", "Remove those characters (the detail names the first one and where it is); if Polish letters look garbled, fix the export's encoding at the source and issue the invoice again."],
    de: ["Die Datei enthält Zeichen, die XML verbietet oder KSeF ablehnt (Steuerzeichen), oft aus einem Datenbankfeld oder einem falsch kodierten polnischen Buchstaben.", "Entfernen Sie diese Zeichen (die Meldung nennt das erste und seine Stelle); sehen polnische Buchstaben verstümmelt aus, beheben Sie die Kodierung des Exports an der Quelle und stellen Sie die Rechnung neu aus."],
    fr: ["Le fichier contient des caractères interdits en XML ou refusés par KSeF (caractères de contrôle), souvent issus d'un champ de base de données ou d'une lettre polonaise mal encodée.", "Supprimez ces caractères (le détail indique le premier et son emplacement) ; si des lettres polonaises sont déformées, corrigez l'encodage de l'export à la source et émettez de nouveau la facture."],
    pl: ["Plik zawiera znaki zabronione w XML lub odrzucane przez KSeF (znaki sterujące), często z pola bazy danych albo ze źle zakodowanej polskiej litery.", "Usuń te znaki (komunikat wskazuje pierwszy z nich i jego miejsce); jeśli polskie litery są zniekształcone, popraw kodowanie eksportu u źródła i wystaw fakturę ponownie."],
  },
  "PL-020": {
    en: ["The file is over KSeF's size limit, or it carries an attachment (Zalacznik), which KSeF takes only in a batch session once attachments are enabled in e-Urząd Skarbowy.", "Shorten or split the invoice; send an invoice with an attachment in a batch session, after enabling attachments in e-Urząd Skarbowy."],
    de: ["Die Datei überschreitet die Größengrenze von KSeF oder enthält eine Anlage (Zalacznik), die KSeF nur in einer Batch-Sitzung annimmt, nachdem Anlagen in e-Urząd Skarbowy freigeschaltet wurden.", "Kürzen oder teilen Sie die Rechnung; senden Sie eine Rechnung mit Anlage in einer Batch-Sitzung, nachdem Sie Anlagen in e-Urząd Skarbowy freigeschaltet haben."],
    fr: ["Le fichier dépasse la taille maximale de KSeF, ou il contient une pièce jointe (Zalacznik), que KSeF n'accepte qu'en session par lots une fois les pièces jointes activées dans e-Urząd Skarbowy.", "Raccourcissez ou scindez la facture ; envoyez une facture avec pièce jointe en session par lots, après avoir activé les pièces jointes dans e-Urząd Skarbowy."],
    pl: ["Plik przekracza limit rozmiaru KSeF albo zawiera załącznik (Zalacznik), który KSeF przyjmuje tylko w sesji wsadowej, po włączeniu załączników w e-Urzędzie Skarbowym.", "Skróć lub podziel fakturę; fakturę z załącznikiem wyślij w sesji wsadowej, po włączeniu załączników w e-Urzędzie Skarbowym."],
  },
  "PL-021": {
    en: ["The issue date (P_1) is later than today in Poland; KSeF refuses an invoice dated after the day it receives it.", "Set P_1 to the day the invoice is issued, or send it on or after that date."],
    de: ["Das Ausstellungsdatum (P_1) liegt nach dem heutigen Tag in Polen; KSeF weist eine Rechnung ab, die später datiert ist als der Tag ihres Eingangs.", "Setzen Sie P_1 auf den Tag der Ausstellung oder senden Sie die Rechnung erst an oder nach diesem Datum."],
    fr: ["La date d'émission (P_1) est postérieure à la date du jour en Pologne ; KSeF refuse une facture datée d'après le jour où il la reçoit.", "Fixez P_1 au jour d'émission de la facture, ou envoyez-la à cette date ou après."],
    pl: ["Data wystawienia (P_1) jest późniejsza niż dzisiejsza data w Polsce; KSeF odrzuca fakturę z datą późniejszą niż dzień jej otrzymania.", "Ustaw P_1 na dzień wystawienia faktury albo wyślij ją w tym dniu lub później."],
  },
  "PL-022": {
    en: ["Another file in this batch has the same seller NIP, invoice type (RodzajFaktury) and invoice number (P_2); KSeF refuses the second one as a duplicate.", "Give each invoice its own number (P_2) in the seller's numbering; branches invoicing under one NIP must share one numbering scheme."],
    de: ["Eine andere Datei in diesem Stapel hat dieselbe Verkäufer-NIP, dieselbe Rechnungsart (RodzajFaktury) und dieselbe Rechnungsnummer (P_2); KSeF weist die zweite als Duplikat ab.", "Geben Sie jeder Rechnung eine eigene Nummer (P_2) im Nummernkreis des Verkäufers; Niederlassungen unter einer NIP müssen einen gemeinsamen Nummernkreis verwenden."],
    fr: ["Un autre fichier de ce lot a le même NIP de vendeur, le même type de facture (RodzajFaktury) et le même numéro (P_2) ; KSeF refuse le second comme doublon.", "Donnez à chaque facture son propre numéro (P_2) dans la numérotation du vendeur ; les établissements qui facturent sous un même NIP doivent partager une seule numérotation."],
    pl: ["Inny plik w tej partii ma ten sam NIP sprzedawcy, rodzaj faktury (RodzajFaktury) i numer faktury (P_2); KSeF odrzuci drugi jako duplikat.", "Nadaj każdej fakturze własny numer (P_2) w numeracji sprzedawcy; oddziały wystawiające faktury pod jednym NIP muszą korzystać ze wspólnej numeracji."],
  },
  "PL-023": {
    en: ["On an advance or settlement invoice (ZAL, ROZ or a correction of one), a total per rate (P_13_n or P_14_n) does not match the payment split across the rates.", "Split the payment by each rate's share of the gross order value, with VAT = share × rate / (100 + rate), as art. 106f of the VAT Act and the Ministry's FA(3) examples do."],
    de: ["Auf einer Anzahlungs- oder Schlussrechnung (ZAL, ROZ oder deren Korrektur) passt eine Summe je Satz (P_13_n oder P_14_n) nicht zur Aufteilung der Zahlung auf die Steuersätze.", "Teilen Sie die Zahlung nach dem Anteil jedes Satzes am Bruttoauftragswert auf, mit Steuer = Anteil × Satz / (100 + Satz), wie es Art. 106f des polnischen Umsatzsteuergesetzes und die FA(3)-Beispiele des Ministeriums tun."],
    fr: ["Sur une facture d'acompte ou de solde (ZAL, ROZ ou leur rectification), un total par taux (P_13_n ou P_14_n) ne correspond pas à la répartition du paiement entre les taux.", "Répartissez le paiement selon la part de chaque taux dans la valeur brute de la commande, avec TVA = part × taux / (100 + taux), comme le font l'art. 106f de la loi polonaise sur la TVA et les exemples FA(3) du ministère."],
    pl: ["Na fakturze zaliczkowej lub rozliczeniowej (ZAL, ROZ albo ich korekcie) suma dla stawki (P_13_n lub P_14_n) nie zgadza się z podziałem płatności między stawki.", "Podziel płatność według udziału każdej stawki w wartości brutto zamówienia, z podatkiem = udział × stawka / (100 + stawka), tak jak art. 106f ustawy o VAT i przykłady FA(3) Ministerstwa Finansów."],
  },
  "PL-024": {
    en: ["The order value on the advance invoice (WartoscZamowienia) is not the sum of the order lines' net amounts and VAT.", "Set WartoscZamowienia to the order's gross value: the sum of P_11NettoZ and P_11VatZ over its lines."],
    de: ["Der Auftragswert auf der Anzahlungsrechnung (WartoscZamowienia) ist nicht die Summe aus Nettobeträgen und Steuer der Auftragszeilen.", "Setzen Sie WartoscZamowienia auf den Bruttowert des Auftrags: die Summe von P_11NettoZ und P_11VatZ über seine Zeilen."],
    fr: ["La valeur de la commande sur la facture d'acompte (WartoscZamowienia) n'est pas la somme des montants nets et de la TVA des lignes de commande.", "Fixez WartoscZamowienia à la valeur brute de la commande : la somme de P_11NettoZ et P_11VatZ sur ses lignes."],
    pl: ["Wartość zamówienia na fakturze zaliczkowej (WartoscZamowienia) nie jest sumą wartości netto i podatku wierszy zamówienia.", "Ustaw WartoscZamowienia jako wartość brutto zamówienia: sumę P_11NettoZ i P_11VatZ ze wszystkich jego wierszy."],
  },
  "PL-025": {
    en: ["The net amount (P_11NettoZ)[ of order line {n}] is not the quantity (P_8BZ) times the unit price (P_9AZ).", "Correct the quantity, the unit price or P_11NettoZ so that P_11NettoZ = P_8BZ × P_9AZ to the grosz."],
    de: ["Der Nettobetrag (P_11NettoZ)[ der Auftragszeile {n}] entspricht nicht Menge (P_8BZ) mal Einzelpreis (P_9AZ).", "Korrigieren Sie Menge, Einzelpreis oder P_11NettoZ, sodass P_11NettoZ = P_8BZ × P_9AZ auf den Grosz genau gilt."],
    fr: ["Le montant net (P_11NettoZ)[ de la ligne de commande {n}] n'est pas égal à la quantité (P_8BZ) multipliée par le prix unitaire (P_9AZ).", "Corrigez la quantité, le prix unitaire ou P_11NettoZ pour que P_11NettoZ = P_8BZ × P_9AZ au grosz près."],
    pl: ["Wartość netto (P_11NettoZ)[ w wierszu zamówienia {n}] nie jest równa ilości (P_8BZ) pomnożonej przez cenę jednostkową (P_9AZ).", "Popraw ilość, cenę jednostkową lub P_11NettoZ tak, aby P_11NettoZ = P_8BZ × P_9AZ co do grosza."],
  },
};
