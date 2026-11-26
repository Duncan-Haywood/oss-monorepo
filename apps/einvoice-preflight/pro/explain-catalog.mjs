// @ts-check
// Deterministic plain-language explanations, one per rule id, in German, French and English.
// FSL-1.1-MIT (see ../LICENSE, part 2).
//
// Each entry is [title, action] per language: the title says what is wrong and why it matters,
// the action says what to change. Placeholders: {n} (a line or breakdown row number), {value}
// (the value the checker computed), {party} (supplier/customer/seller/buyer). A segment in
// [brackets] is dropped when a placeholder inside it has no value. The checker's own English
// message and fix are always returned beside the template, so no detail is lost.
//
// These texts explain; they never decide. Whether an invoice passes is the checker's verdict.

/** @typedef {"de" | "fr" | "en"} Lang */
/** @typedef {[string, string]} Pair */
/** @typedef {{ en: Pair, de: Pair, fr: Pair }} Template */

/** @type {Record<string, Template>} */
export const TEMPLATES = {
  // --- Core structure (EN 16931 basics) ---
  "INV-001": {
    en: ["A required part of the invoice is missing, so no receiver can process it.", "Add the missing field named in the detail and export the invoice again."],
    de: ["Ein Pflichtbestandteil der Rechnung fehlt; kein Empfänger kann sie so verarbeiten.", "Ergänzen Sie das in der Meldung genannte Feld und exportieren Sie die Rechnung erneut."],
    fr: ["Un élément obligatoire de la facture manque ; aucun destinataire ne peut la traiter.", "Ajoutez le champ indiqué dans le détail et exportez de nouveau la facture."],
  },
  "INV-002": {
    en: ["The invoice number (BT-1) is empty. Every invoice needs a unique number.", "Enter the invoice number from your numbering sequence."],
    de: ["Die Rechnungsnummer (BT-1) ist leer. Jede Rechnung braucht eine eindeutige Nummer (§ 14 UStG).", "Tragen Sie die Rechnungsnummer aus Ihrem Nummernkreis ein."],
    fr: ["Le numéro de facture (BT-1) est vide. Chaque facture doit porter un numéro unique.", "Saisissez le numéro issu de votre séquence de facturation."],
  },
  "INV-003": {
    en: ["The issue date is not written as YYYY-MM-DD, the only date format e-invoices accept.", "Write the issue date as YYYY-MM-DD, for example 2026-08-24."],
    de: ["Das Rechnungsdatum steht nicht im Format JJJJ-MM-TT, dem einzigen Datumsformat, das E-Rechnungen zulassen.", "Schreiben Sie das Rechnungsdatum als JJJJ-MM-TT, z. B. 2026-08-24 statt 24.08.2026."],
    fr: ["La date d'émission n'est pas au format AAAA-MM-JJ, le seul accepté dans une facture électronique.", "Écrivez la date d'émission au format AAAA-MM-JJ, par exemple 2026-08-24 au lieu de 24/08/2026."],
  },
  "INV-004": {
    en: ["The invoice currency is not a three-letter ISO 4217 code in capitals.", "Use the capitalised ISO code, for example EUR."],
    de: ["Die Rechnungswährung ist kein dreibuchstabiger ISO-4217-Code in Großbuchstaben.", "Verwenden Sie den ISO-Code in Großbuchstaben, z. B. EUR."],
    fr: ["La devise de la facture n'est pas un code ISO 4217 de trois lettres majuscules.", "Utilisez le code ISO en majuscules, par exemple EUR."],
  },
  "INV-005": {
    en: ["The [{party} ]identifier is missing, so the receiver cannot match the party to its records.", "Add the party's identifier (customer number, GLN, VAT or registration number) from your system."],
    de: ["Die Kennung des [{party}s ]fehlt; der Empfänger kann die Partei nicht seinen Stammdaten zuordnen.", "Ergänzen Sie eine Kennung der Partei (Kundennummer, GLN, USt-IdNr. oder Registernummer)."],
    fr: ["L'identifiant [du {party} ]manque ; le destinataire ne peut pas rapprocher la partie de ses données.", "Ajoutez un identifiant de la partie (numéro client, GLN, numéro de TVA ou SIREN)."],
  },
  "INV-006": {
    en: ["The [{party} ]name is missing; an invoice must name both parties.", "Enter the full legal name of the party."],
    de: ["Der Name des [{party}s ]fehlt; eine Rechnung muss beide Parteien benennen (§ 14 Abs. 4 UStG).", "Tragen Sie den vollständigen Namen der Partei ein."],
    fr: ["Le nom [du {party} ]manque ; une facture doit nommer les deux parties.", "Saisissez la dénomination complète de la partie."],
  },
  "INV-007": {
    en: ["The invoice has no lines. An invoice must list what was supplied.", "Add at least one invoice line with description, quantity and price."],
    de: ["Die Rechnung hat keine Positionen. Sie muss die gelieferten Waren oder Leistungen aufführen.", "Fügen Sie mindestens eine Position mit Bezeichnung, Menge und Preis hinzu."],
    fr: ["La facture ne comporte aucune ligne. Elle doit détailler ce qui a été fourni.", "Ajoutez au moins une ligne avec désignation, quantité et prix."],
  },
  "INV-008": {
    en: ["Line[ {n}] has no description of what was supplied.", "Describe the goods or service on that line."],
    de: ["Position[ {n}] hat keine Bezeichnung der Ware oder Leistung.", "Beschreiben Sie die Ware oder Leistung in dieser Position."],
    fr: ["La ligne[ {n}] ne décrit pas le bien ou le service fourni.", "Indiquez la désignation du bien ou du service sur cette ligne."],
  },
  "INV-009": {
    en: ["The quantity on line[ {n}] is missing or not a number.", "Enter the quantity as a plain number, with a dot as decimal separator."],
    de: ["Die Menge in Position[ {n}] fehlt oder ist keine Zahl.", "Geben Sie die Menge als Zahl mit Punkt als Dezimaltrennzeichen an (1.5 statt 1,5)."],
    fr: ["La quantité de la ligne[ {n}] manque ou n'est pas un nombre.", "Indiquez la quantité en chiffres, avec un point comme séparateur décimal (1.5 et non 1,5)."],
  },
  "INV-010": {
    en: ["The unit price on line[ {n}] is missing or not a number.", "Enter the net unit price as a number, with a dot as decimal separator."],
    de: ["Der Einzelpreis in Position[ {n}] fehlt oder ist keine Zahl.", "Geben Sie den Netto-Einzelpreis als Zahl mit Punkt als Dezimaltrennzeichen an."],
    fr: ["Le prix unitaire de la ligne[ {n}] manque ou n'est pas un nombre.", "Indiquez le prix unitaire HT en chiffres, avec un point comme séparateur décimal."],
  },
  "INV-011": {
    en: ["The VAT rate on line[ {n}] is missing or invalid.", "Enter the VAT percentage for that line (for example 19, 7 or 0)."],
    de: ["Der Steuersatz in Position[ {n}] fehlt oder ist ungültig.", "Geben Sie den Umsatzsteuersatz der Position an (z. B. 19, 7 oder 0)."],
    fr: ["Le taux de TVA de la ligne[ {n}] manque ou n'est pas valable.", "Indiquez le taux de TVA de la ligne (par exemple 20, 10, 5.5 ou 0)."],
  },
  "INV-012": {
    en: ["The net amount of line[ {n}] is not quantity times unit price.", "Recalculate the line net amount[ (expected {value})] or correct quantity or price."],
    de: ["Der Nettobetrag von Position[ {n}] ist nicht Menge mal Einzelpreis.", "Berechnen Sie den Positionsbetrag neu[ (erwartet: {value})] oder korrigieren Sie Menge oder Preis."],
    fr: ["Le montant HT de la ligne[ {n}] n'est pas égal à quantité × prix unitaire.", "Recalculez le montant de la ligne[ (attendu : {value})] ou corrigez la quantité ou le prix."],
  },
  "INV-013": {
    en: ["The invoice net total is missing or not a number.", "Enter the sum of the line net amounts as the net total."],
    de: ["Die Netto-Gesamtsumme fehlt oder ist keine Zahl.", "Tragen Sie die Summe der Positionsbeträge als Nettosumme ein."],
    fr: ["Le total HT de la facture manque ou n'est pas un nombre.", "Indiquez la somme des montants HT des lignes comme total HT."],
  },
  "INV-014": {
    en: ["The net total does not equal the sum of the lines (after document-level discounts and charges).", "Set the net total[ to {value}] or correct the lines."],
    de: ["Die Nettosumme entspricht nicht der Summe der Positionen (nach Nachlässen und Zuschlägen auf Belegebene).", "Setzen Sie die Nettosumme[ auf {value}] oder korrigieren Sie die Positionen."],
    fr: ["Le total HT n'est pas égal à la somme des lignes (après remises et frais au niveau du document).", "Fixez le total HT[ à {value}] ou corrigez les lignes."],
  },
  "INV-015": {
    en: ["The VAT total is missing or not a number.", "Enter the total VAT amount of the invoice."],
    de: ["Die Umsatzsteuer-Gesamtsumme fehlt oder ist keine Zahl.", "Tragen Sie den Gesamtbetrag der Umsatzsteuer ein."],
    fr: ["Le total de TVA manque ou n'est pas un nombre.", "Indiquez le montant total de TVA de la facture."],
  },
  "INV-016": {
    en: ["The gross total (amount including VAT) is missing or not a number.", "Enter net total plus VAT as the gross total."],
    de: ["Die Bruttosumme fehlt oder ist keine Zahl.", "Tragen Sie Nettosumme plus Umsatzsteuer als Bruttosumme ein."],
    fr: ["Le total TTC manque ou n'est pas un nombre.", "Indiquez le total HT plus la TVA comme total TTC."],
  },
  "INV-017": {
    en: ["The gross total is not net total plus VAT; receivers reject invoices whose totals do not add up.", "Set the gross total[ to {value}] or correct net and VAT."],
    de: ["Die Bruttosumme ist nicht Nettosumme plus Umsatzsteuer; Empfänger weisen Rechnungen mit unstimmigen Summen zurück.", "Setzen Sie die Bruttosumme[ auf {value}] oder korrigieren Sie Netto und Steuer."],
    fr: ["Le total TTC n'est pas égal au total HT plus la TVA ; les destinataires rejettent les factures dont les totaux ne concordent pas.", "Fixez le total TTC[ à {value}] ou corrigez le HT et la TVA."],
  },
  "INV-018": {
    en: ["The VAT total does not match the VAT rates applied to the lines.", "Set the VAT total[ to {value}] or correct the line rates and amounts."],
    de: ["Die Steuersumme passt nicht zu den Steuersätzen der Positionen.", "Setzen Sie die Steuersumme[ auf {value}] oder korrigieren Sie Sätze und Beträge der Positionen."],
    fr: ["Le total de TVA ne correspond pas aux taux appliqués aux lignes.", "Fixez le total de TVA[ à {value}] ou corrigez les taux et montants des lignes."],
  },
  "INV-019": {
    en: ["The same invoice number appears twice in this batch. Invoice numbers must be unique.", "Give each invoice its own number, or remove the duplicate file."],
    de: ["Dieselbe Rechnungsnummer kommt in diesem Stapel zweimal vor. Rechnungsnummern müssen einmalig sein.", "Vergeben Sie jeder Rechnung eine eigene Nummer oder entfernen Sie die doppelte Datei."],
    fr: ["Le même numéro de facture figure deux fois dans ce lot. Les numéros doivent être uniques.", "Attribuez un numéro propre à chaque facture ou retirez le fichier en double."],
  },
  "INV-020": {
    en: ["The due date is not written as YYYY-MM-DD.", "Write the due date as YYYY-MM-DD, for example 2026-09-23."],
    de: ["Das Fälligkeitsdatum steht nicht im Format JJJJ-MM-TT.", "Schreiben Sie das Fälligkeitsdatum als JJJJ-MM-TT, z. B. 2026-09-23."],
    fr: ["La date d'échéance n'est pas au format AAAA-MM-JJ.", "Écrivez la date d'échéance au format AAAA-MM-JJ, par exemple 2026-09-23."],
  },
  "INV-021": {
    en: ["The due date is before the issue date, which is almost always a typing error.", "Set the due date on or after the issue date."],
    de: ["Das Fälligkeitsdatum liegt vor dem Rechnungsdatum; das ist fast immer ein Tippfehler.", "Setzen Sie das Fälligkeitsdatum auf das Rechnungsdatum oder später."],
    fr: ["La date d'échéance précède la date d'émission, ce qui est presque toujours une erreur de saisie.", "Fixez l'échéance à la date d'émission ou après."],
  },
  "INV-022": {
    en: ["A VAT number has a country prefix or length that no EU VAT number has.", "Copy the VAT number exactly from the party's documents, including its two-letter country prefix."],
    de: ["Eine USt-IdNr. hat ein Länderkürzel oder eine Länge, die es bei keiner EU-USt-IdNr. gibt.", "Übernehmen Sie die USt-IdNr. genau aus den Unterlagen der Partei, mit zweistelligem Länderkürzel (z. B. DE)."],
    fr: ["Un numéro de TVA porte un préfixe pays ou une longueur qu'aucun numéro de TVA de l'UE ne possède.", "Recopiez exactement le numéro de TVA de la partie, avec son préfixe pays (par exemple FR)."],
  },
  "INV-023": {
    en: ["A VAT number fails its national check digit, so it is almost certainly mistyped.", "Check the VAT number against the party's documents or the EU VIES service."],
    de: ["Eine USt-IdNr. besteht die Prüfziffernprüfung nicht und ist damit fast sicher falsch abgetippt.", "Prüfen Sie die USt-IdNr. anhand der Unterlagen der Partei oder über das EU-VIES-System bzw. das BZSt."],
    fr: ["Un numéro de TVA ne passe pas le contrôle de clé : il est très probablement mal saisi.", "Vérifiez le numéro de TVA dans les documents de la partie ou via le service VIES de l'UE."],
  },
  "INV-024": {
    en: ["The IBAN for payment is empty.", "Enter the IBAN of the account that should receive the payment, or remove the empty field."],
    de: ["Die IBAN für die Zahlung ist leer.", "Tragen Sie die IBAN des Empfängerkontos ein oder entfernen Sie das leere Feld."],
    fr: ["L'IBAN de paiement est vide.", "Indiquez l'IBAN du compte bénéficiaire ou supprimez le champ vide."],
  },
  "INV-025": {
    en: ["The IBAN fails its check digits; a payment to it would bounce.", "Copy the IBAN again from the bank statement."],
    de: ["Die IBAN besteht die Prüfziffernprüfung nicht; eine Zahlung darauf würde zurückkommen.", "Übernehmen Sie die IBAN erneut vom Kontoauszug."],
    fr: ["L'IBAN ne passe pas le contrôle de clé ; un virement serait rejeté.", "Recopiez l'IBAN depuis un relevé bancaire."],
  },
  "INV-026": {
    en: ["The bank identifier (BIC) is empty or malformed.", "Enter the BIC from the bank details, or leave it out (it is optional for SEPA payments)."],
    de: ["Die Bankkennung (BIC) ist leer oder fehlerhaft.", "Tragen Sie die BIC aus den Bankdaten ein oder lassen Sie sie weg (bei SEPA-Zahlungen optional)."],
    fr: ["L'identifiant bancaire (BIC) est vide ou mal formé.", "Indiquez le BIC des coordonnées bancaires ou omettez-le (facultatif pour les paiements SEPA)."],
  },
  "INV-027": {
    en: ["The BIC or bank code belongs to a different country or bank than the IBAN.", "Use the BIC that belongs to the IBAN's bank."],
    de: ["BIC oder Bankleitzahl gehören zu einem anderen Land oder einer anderen Bank als die IBAN.", "Verwenden Sie die BIC der Bank, zu der die IBAN gehört."],
    fr: ["Le BIC ou le code banque correspond à un autre pays ou une autre banque que l'IBAN.", "Utilisez le BIC de la banque qui tient l'IBAN."],
  },
  "INV-028": {
    en: ["The prepaid amount is invalid or larger than the invoice total.", "Enter the amount already paid, at most the gross total."],
    de: ["Der bereits gezahlte Betrag ist ungültig oder größer als die Bruttosumme.", "Tragen Sie den bereits gezahlten Betrag ein, höchstens die Bruttosumme."],
    fr: ["Le montant déjà payé n'est pas valable ou dépasse le total TTC.", "Indiquez le montant déjà réglé, au plus égal au total TTC."],
  },
  "INV-029": {
    en: ["The amount due is not gross total minus the amount already paid.", "Set the amount due[ to {value}] or correct the prepaid amount."],
    de: ["Der Zahlbetrag ist nicht Bruttosumme minus bereits gezahlter Betrag.", "Setzen Sie den Zahlbetrag[ auf {value}] oder korrigieren Sie die Anzahlung."],
    fr: ["Le net à payer n'est pas égal au total TTC moins les acomptes.", "Fixez le net à payer[ à {value}] ou corrigez le montant des acomptes."],
  },
  "INV-030": {
    en: ["The invoice gives an IBAN but no payment reference, so the payment will be hard to match.", "Add a remittance reference (usually the invoice number) for the payer to quote."],
    de: ["Die Rechnung nennt eine IBAN, aber keinen Verwendungszweck; die Zahlung lässt sich schwer zuordnen.", "Ergänzen Sie einen Verwendungszweck (meist die Rechnungsnummer)."],
    fr: ["La facture indique un IBAN mais aucune référence de paiement ; le virement sera difficile à rapprocher.", "Ajoutez une référence de paiement (souvent le numéro de facture)."],
  },
  "INV-031": {
    en: ["The payment reference is empty, too long for a bank transfer, or not a valid structured reference.", "Use a short reference of at most 140 characters, or a valid RF creditor reference."],
    de: ["Der Verwendungszweck ist leer, für eine Überweisung zu lang oder keine gültige strukturierte Referenz.", "Verwenden Sie höchstens 140 Zeichen oder eine gültige RF-Gläubigerreferenz."],
    fr: ["La référence de paiement est vide, trop longue pour un virement ou n'est pas une référence structurée valable.", "Utilisez au plus 140 caractères ou une référence créancier RF valable."],
  },
  "INV-032": {
    en: ["The document type code is not a known invoice, credit note or debit note code.", "Use 380 for an invoice or 381 for a credit note, unless your network names another code."],
    de: ["Der Dokumenttyp-Code ist kein bekannter Code für Rechnung, Gutschrift oder Belastungsanzeige.", "Verwenden Sie 380 für eine Rechnung oder 381 für eine Gutschrift (Rechnungskorrektur)."],
    fr: ["Le code de type de document n'est pas un code connu de facture, d'avoir ou de note de débit.", "Utilisez 380 pour une facture ou 381 pour un avoir."],
  },
  "INV-033": {
    en: ["A credit or debit note must name the invoice it corrects.", "Add the number (and ideally the date) of the original invoice."],
    de: ["Eine Gutschrift oder Rechnungskorrektur muss die ursprüngliche Rechnung nennen.", "Ergänzen Sie Nummer (und möglichst Datum) der ursprünglichen Rechnung."],
    fr: ["Un avoir ou une note de débit doit mentionner la facture qu'il rectifie.", "Ajoutez le numéro (et si possible la date) de la facture d'origine."],
  },
  "INV-034": {
    en: ["This credit note names itself as the invoice it corrects.", "Reference the original invoice's number, not the credit note's own number."],
    de: ["Diese Gutschrift nennt sich selbst als korrigierte Rechnung.", "Verweisen Sie auf die Nummer der ursprünglichen Rechnung, nicht auf die eigene."],
    fr: ["Cet avoir se cite lui-même comme facture rectifiée.", "Indiquez le numéro de la facture d'origine, pas celui de l'avoir."],
  },
  "INV-035": {
    en: ["A line with 0% or exempt VAT has no exemption reason, which networks require.", "Add the exemption reason or code (for example reverse charge, intra-EU supply)."],
    de: ["Eine Position mit 0 % oder steuerfrei hat keinen Befreiungsgrund; Netzwerke verlangen ihn (§ 14a UStG).", "Ergänzen Sie Befreiungsgrund oder -code (z. B. Reverse Charge, innergemeinschaftliche Lieferung)."],
    fr: ["Une ligne à 0 % ou exonérée n'indique pas le motif d'exonération exigé.", "Ajoutez le motif ou le code d'exonération (par exemple autoliquidation, livraison intracommunautaire, art. 262 ter I CGI)."],
  },
  "INV-036": {
    en: ["A reference field is present but empty.", "Fill in the reference or remove the empty element."],
    de: ["Ein Referenzfeld ist vorhanden, aber leer.", "Füllen Sie die Referenz aus oder entfernen Sie das leere Element."],
    fr: ["Un champ de référence est présent mais vide.", "Renseignez la référence ou supprimez l'élément vide."],
  },
  "INV-037": {
    en: ["The invoice uses several VAT rates but has no VAT breakdown per rate.", "Add one VAT breakdown row per rate with its taxable amount and VAT."],
    de: ["Die Rechnung verwendet mehrere Steuersätze, aber keine Aufschlüsselung je Satz.", "Fügen Sie je Steuersatz eine Zeile mit Bemessungsgrundlage und Steuerbetrag hinzu."],
    fr: ["La facture utilise plusieurs taux de TVA sans ventilation par taux.", "Ajoutez une ligne de ventilation par taux, avec base et montant de TVA."],
  },
  "INV-038": {
    en: ["VAT breakdown row[ {n}] does not add up: its VAT is not the taxable amount times the rate.", "Set that row's VAT[ to {value}] or correct its taxable amount or rate."],
    de: ["Steuerzeile[ {n}] ist unstimmig: der Steuerbetrag ist nicht Bemessungsgrundlage mal Satz.", "Setzen Sie den Steuerbetrag dieser Zeile[ auf {value}] oder korrigieren Sie Grundlage oder Satz."],
    fr: ["La ligne de ventilation TVA[ {n}] est incohérente : la TVA n'est pas égale à la base multipliée par le taux.", "Fixez la TVA de cette ligne[ à {value}] ou corrigez la base ou le taux."],
  },
  "INV-039": {
    en: ["An electronic address (Peppol endpoint) has no recognised scheme code.", "Add the scheme code of the address, for example 0088 for a GLN or 9930 for a German VAT number."],
    de: ["Eine elektronische Adresse (Peppol-Endpunkt) hat keinen anerkannten Schema-Code.", "Ergänzen Sie den Schema-Code, z. B. 0204 für eine Leitweg-ID, 9930 für eine deutsche USt-IdNr. oder 0088 für eine GLN."],
    fr: ["Une adresse électronique (point de terminaison Peppol) n'a pas de code de schéma reconnu.", "Ajoutez le code de schéma, par exemple 0009 pour un SIRET, 0225 pour l'annuaire français ou 0088 pour un GLN."],
  },
  "INV-040": {
    en: ["An electronic address is empty, so the invoice cannot be routed.", "Enter the party's electronic address."],
    de: ["Eine elektronische Adresse ist leer; die Rechnung kann nicht zugestellt werden.", "Tragen Sie die elektronische Adresse der Partei ein."],
    fr: ["Une adresse électronique est vide ; la facture ne peut pas être acheminée.", "Indiquez l'adresse électronique de la partie."],
  },
  "INV-041": {
    en: ["An electronic address does not have the shape its scheme requires.", "Check the address against the party's registration (digits, length, check digit)."],
    de: ["Eine elektronische Adresse hat nicht die Form, die ihr Schema verlangt.", "Prüfen Sie die Adresse anhand der Registrierung der Partei (Ziffern, Länge, Prüfziffer)."],
    fr: ["Une adresse électronique n'a pas la forme exigée par son schéma.", "Vérifiez l'adresse auprès de la partie (chiffres, longueur, clé de contrôle)."],
  },
  "INV-042": {
    en: ["The invoicing period is incomplete or malformed.", "Give both a start and an end date as YYYY-MM-DD, or remove the period."],
    de: ["Der Leistungszeitraum ist unvollständig oder fehlerhaft.", "Geben Sie Beginn und Ende als JJJJ-MM-TT an oder entfernen Sie den Zeitraum."],
    fr: ["La période de facturation est incomplète ou mal formée.", "Indiquez une date de début et de fin au format AAAA-MM-JJ, ou supprimez la période."],
  },
  "INV-043": {
    en: ["The invoicing period ends before it starts.", "Swap or correct the start and end dates."],
    de: ["Der Leistungszeitraum endet, bevor er beginnt.", "Vertauschen oder korrigieren Sie Beginn und Ende."],
    fr: ["La période de facturation se termine avant de commencer.", "Inversez ou corrigez les dates de début et de fin."],
  },
  "INV-044": {
    en: ["The payment means code is empty or not a UNCL 4461 code.", "Use a standard code, for example 58 for a SEPA credit transfer or 59 for a SEPA direct debit."],
    de: ["Der Zahlungsart-Code ist leer oder kein UNCL-4461-Code.", "Verwenden Sie einen Standardcode, z. B. 58 für SEPA-Überweisung oder 59 für SEPA-Lastschrift."],
    fr: ["Le code de moyen de paiement est vide ou n'appartient pas à la liste UNCL 4461.", "Utilisez un code standard, par exemple 58 pour un virement SEPA ou 59 pour un prélèvement SEPA."],
  },
  "INV-045": {
    en: ["The invoice asks for a bank transfer but gives no IBAN to pay into.", "Add the IBAN, or change the payment means if the invoice is paid another way."],
    de: ["Die Rechnung verlangt eine Überweisung, nennt aber keine IBAN.", "Ergänzen Sie die IBAN oder ändern Sie die Zahlungsart, wenn anders gezahlt wird."],
    fr: ["La facture demande un virement mais n'indique aucun IBAN.", "Ajoutez l'IBAN, ou changez le moyen de paiement si la facture est réglée autrement."],
  },
  "INV-046": {
    en: ["The payment means is cash, cheque or card, yet an IBAN is given; the two contradict each other.", "Remove the IBAN or change the payment means to a transfer."],
    de: ["Als Zahlungsart ist bar, Scheck oder Karte angegeben, aber zugleich eine IBAN; das widerspricht sich.", "Entfernen Sie die IBAN oder ändern Sie die Zahlungsart auf Überweisung."],
    fr: ["Le moyen de paiement est espèces, chèque ou carte alors qu'un IBAN est indiqué ; c'est contradictoire.", "Supprimez l'IBAN ou passez le moyen de paiement au virement."],
  },
  "INV-047": {
    en: ["The buyer reference is empty or a placeholder.", "Enter the reference the buyer gave you (for public buyers in Germany, the Leitweg-ID)."],
    de: ["Die Käuferreferenz ist leer oder ein Platzhalter.", "Tragen Sie die vom Käufer genannte Referenz ein (bei öffentlichen Auftraggebern die Leitweg-ID)."],
    fr: ["La référence acheteur est vide ou fictive.", "Indiquez la référence fournie par l'acheteur (pour l'État, le code service Chorus Pro)."],
  },
  "INV-048": {
    en: ["The purchase-order reference is empty or a placeholder.", "Enter the buyer's order number, or leave the field out."],
    de: ["Die Bestellreferenz ist leer oder ein Platzhalter.", "Tragen Sie die Bestellnummer des Käufers ein oder lassen Sie das Feld weg."],
    fr: ["La référence de bon de commande est vide ou fictive.", "Indiquez le numéro de commande de l'acheteur, ou supprimez le champ."],
  },
  "INV-049": {
    en: ["The purchase-order reference repeats the invoice number, so the buyer cannot match it to an order.", "Enter the buyer's real order number, or leave the field out."],
    de: ["Die Bestellreferenz wiederholt die Rechnungsnummer; der Käufer kann keine Bestellung zuordnen.", "Tragen Sie die echte Bestellnummer des Käufers ein oder lassen Sie das Feld weg."],
    fr: ["La référence de commande reprend le numéro de facture ; l'acheteur ne peut pas la rapprocher d'une commande.", "Indiquez le vrai numéro de commande de l'acheteur, ou supprimez le champ."],
  },
  "INV-050": {
    en: ["A document-level discount or charge is malformed.", "Give each discount or charge a kind (allowance or charge), an amount and a reason."],
    de: ["Ein Nachlass oder Zuschlag auf Belegebene ist fehlerhaft aufgebaut.", "Geben Sie für jeden Nachlass oder Zuschlag Art, Betrag und Grund an."],
    fr: ["Une remise ou des frais au niveau du document sont mal formés.", "Indiquez pour chaque remise ou frais sa nature, son montant et son motif."],
  },
  "INV-051": {
    en: ["A document-level discount or charge amount does not match its percentage of the base.", "Recalculate the amount from base and percentage[ ({value})], or correct them."],
    de: ["Der Betrag eines Nachlasses oder Zuschlags passt nicht zu seinem Prozentsatz der Basis.", "Berechnen Sie den Betrag aus Basis und Prozentsatz neu[ ({value})] oder korrigieren Sie diese."],
    fr: ["Le montant d'une remise ou de frais ne correspond pas à son pourcentage de la base.", "Recalculez le montant à partir de la base et du pourcentage[ ({value})], ou corrigez-les."],
  },
  "INV-052": {
    en: ["A document-level discount or charge has no usable reason.", "State a short reason, for example 'early payment discount' or 'freight'."],
    de: ["Ein Nachlass oder Zuschlag hat keinen brauchbaren Grund.", "Geben Sie einen kurzen Grund an, z. B. „Skonto“ oder „Fracht“."],
    fr: ["Une remise ou des frais n'ont pas de motif exploitable.", "Indiquez un motif court, par exemple « escompte » ou « frais de port »."],
  },
  "INV-053": {
    en: ["The payment terms in days are not a positive whole number.", "Enter the number of days, for example 30."],
    de: ["Das Zahlungsziel in Tagen ist keine positive ganze Zahl.", "Geben Sie die Anzahl Tage an, z. B. 30."],
    fr: ["Le délai de paiement en jours n'est pas un nombre entier positif.", "Indiquez le nombre de jours, par exemple 30."],
  },
  "INV-054": {
    en: ["The due date does not match the issue date plus the stated payment terms.", "Make the due date and the payment terms agree."],
    de: ["Das Fälligkeitsdatum passt nicht zu Rechnungsdatum plus Zahlungsziel.", "Bringen Sie Fälligkeitsdatum und Zahlungsziel in Übereinstimmung."],
    fr: ["La date d'échéance ne correspond pas à la date d'émission plus le délai indiqué.", "Mettez en accord la date d'échéance et le délai de paiement."],
  },
  "INV-056": {
    en: ["The credit note is in a different currency from the invoice it corrects.", "Issue the credit note in the original invoice's currency."],
    de: ["Die Gutschrift lautet auf eine andere Währung als die korrigierte Rechnung.", "Stellen Sie die Gutschrift in der Währung der ursprünglichen Rechnung aus."],
    fr: ["L'avoir est dans une autre devise que la facture rectifiée.", "Émettez l'avoir dans la devise de la facture d'origine."],
  },
  "INV-057": {
    en: ["Credit notes in this batch against one invoice add up to more than that invoice.", "Check for a duplicated credit note or a wrong reference."],
    de: ["Die Gutschriften dieses Stapels zu einer Rechnung übersteigen deren Betrag.", "Prüfen Sie auf eine doppelte Gutschrift oder einen falschen Rechnungsbezug."],
    fr: ["Les avoirs de ce lot sur une même facture dépassent son montant.", "Vérifiez s'il y a un avoir en double ou une mauvaise référence."],
  },
  "INV-058": {
    en: ["The credit note and the invoice it corrects come from different sellers.", "Check that the credit note references the right invoice."],
    de: ["Gutschrift und korrigierte Rechnung stammen von verschiedenen Verkäufern.", "Prüfen Sie, ob die Gutschrift auf die richtige Rechnung verweist."],
    fr: ["L'avoir et la facture rectifiée émanent de vendeurs différents.", "Vérifiez que l'avoir cite la bonne facture."],
  },
  "INV-059": {
    en: ["The VAT total in the VAT accounting currency differs from the document VAT total although the currencies are the same.", "Make both VAT totals equal, or remove the duplicate total."],
    de: ["Die Steuersumme in der Steuerwährung weicht von der Beleg-Steuersumme ab, obwohl beide Währungen gleich sind.", "Gleichen Sie beide Steuersummen an oder entfernen Sie die doppelte Angabe."],
    fr: ["Le total de TVA en devise de comptabilisation diffère du total du document alors que les devises sont identiques.", "Alignez les deux totaux de TVA ou supprimez le total en double."],
  },
  "INV-060": {
    en: ["A line's price extension amounts (VAT or gross) do not add up.", "Recalculate the line's VAT and gross from its net amount."],
    de: ["Die Preiserweiterungsbeträge einer Position (Steuer oder Brutto) sind unstimmig.", "Berechnen Sie Steuer und Brutto der Position aus dem Nettobetrag neu."],
    fr: ["Les montants complémentaires d'une ligne (TVA ou TTC) sont incohérents.", "Recalculez la TVA et le TTC de la ligne à partir de son HT."],
  },
  "INV-061": {
    en: ["An electronic address does not match the format Peppol checks for its scheme (a warning).", "Check the address against the party's registration."],
    de: ["Eine elektronische Adresse entspricht nicht dem Format, das Peppol für ihr Schema prüft (Warnung).", "Prüfen Sie die Adresse anhand der Registrierung der Partei."],
    fr: ["Une adresse électronique ne respecte pas le format que Peppol contrôle pour son schéma (avertissement).", "Vérifiez l'adresse auprès de la partie."],
  },
  "INV-062": {
    en: ["An identifier does not match the format Peppol rejects on.", "Correct the identifier to its scheme's format; Peppol access points reject this file as it is."],
    de: ["Eine Kennung entspricht nicht dem Format, bei dem Peppol ablehnt.", "Korrigieren Sie die Kennung gemäß ihrem Schema; Peppol-Zugangspunkte weisen die Datei sonst zurück."],
    fr: ["Un identifiant ne respecte pas le format sur lequel Peppol rejette.", "Corrigez l'identifiant selon son schéma ; sinon les points d'accès Peppol rejettent le fichier."],
  },
  "INV-063": {
    en: ["An identifier does not match the format Peppol checks (a warning).", "Check the identifier against its scheme's format."],
    de: ["Eine Kennung entspricht nicht dem Format, das Peppol prüft (Warnung).", "Prüfen Sie die Kennung anhand ihres Schemas."],
    fr: ["Un identifiant ne respecte pas le format contrôlé par Peppol (avertissement).", "Vérifiez l'identifiant selon son schéma."],
  },
  "INV-064": {
    en: ["A Dutch VAT number is not written as NL + nine digits + B + two digits.", "Write the Dutch VAT number in its standard form, for example NL123456789B01."],
    de: ["Eine niederländische USt-IdNr. ist nicht als NL + neun Ziffern + B + zwei Ziffern geschrieben.", "Schreiben Sie sie in der Standardform, z. B. NL123456789B01."],
    fr: ["Un numéro de TVA néerlandais n'est pas écrit NL + neuf chiffres + B + deux chiffres.", "Écrivez-le sous sa forme standard, par exemple NL123456789B01."],
  },
  "INV-065": {
    en: ["A number, date or time contains a space or invisible character, so it is not valid XML data.", "Remove the space or invisible character from that value."],
    de: ["Eine Zahl, ein Datum oder eine Uhrzeit enthält ein Leer- oder unsichtbares Zeichen und ist damit kein gültiger XML-Wert.", "Entfernen Sie das Leer- oder unsichtbare Zeichen aus dem Wert."],
    fr: ["Un nombre, une date ou une heure contient une espace ou un caractère invisible : ce n'est pas une valeur XML valable.", "Supprimez l'espace ou le caractère invisible de cette valeur."],
  },

  // --- German XRechnung (BR-DE) ---
  "XR-001": {
    en: ["The buyer reference (BT-10) is missing. XRechnung requires it; for public buyers it is the Leitweg-ID.", "Enter the Leitweg-ID or buyer reference the buyer gave you."],
    de: ["Die Käuferreferenz (BT-10) fehlt. XRechnung verlangt sie; bei öffentlichen Auftraggebern ist es die Leitweg-ID (BR-DE-15).", "Tragen Sie die Leitweg-ID bzw. die Käuferreferenz ein, die Ihnen der Auftraggeber genannt hat."],
    fr: ["La référence acheteur (BT-10) manque. XRechnung l'exige ; pour un acheteur public allemand, c'est le Leitweg-ID.", "Indiquez le Leitweg-ID ou la référence fournie par l'acheteur."],
  },
  "XR-002": {
    en: ["The buyer reference looks like a Leitweg-ID, but its check digits are wrong: the portal will reject it.", "Copy the Leitweg-ID again exactly as the buyer published it."],
    de: ["Die Käuferreferenz sieht aus wie eine Leitweg-ID, aber die Prüfziffern stimmen nicht; das Portal weist sie zurück.", "Übernehmen Sie die Leitweg-ID erneut genau so, wie der Auftraggeber sie mitgeteilt hat."],
    fr: ["La référence acheteur ressemble à un Leitweg-ID mais sa clé de contrôle est fausse : le portail la rejettera.", "Recopiez le Leitweg-ID exactement tel que l'acheteur l'a communiqué."],
  },
  "XR-003": {
    en: ["XRechnung requires payment instructions (a payment means code), and there are none.", "Add the payment means, for example 58 (SEPA transfer) with your IBAN."],
    de: ["XRechnung verlangt Zahlungsanweisungen (Zahlungsart-Code), und es gibt keine (BR-DE-1).", "Ergänzen Sie die Zahlungsart, z. B. 58 (SEPA-Überweisung) mit Ihrer IBAN."],
    fr: ["XRechnung exige des instructions de paiement (code de moyen de paiement) et il n'y en a pas.", "Ajoutez le moyen de paiement, par exemple 58 (virement SEPA) avec votre IBAN."],
  },
  "XR-004": {
    en: ["The seller contact is incomplete. XRechnung requires a contact name, phone and e-mail.", "Add the seller contact's name, phone number and e-mail address."],
    de: ["Der Verkäuferkontakt ist unvollständig. XRechnung verlangt Name, Telefon und E-Mail (BR-DE-2, -5, -6, -7).", "Ergänzen Sie Name, Telefonnummer und E-Mail-Adresse des Ansprechpartners."],
    fr: ["Le contact du vendeur est incomplet. XRechnung exige un nom, un téléphone et un e-mail.", "Ajoutez le nom, le téléphone et l'e-mail du contact vendeur."],
  },
  "XR-005": {
    en: ["The seller's city or postcode is missing; XRechnung requires both.", "Add the seller's city and postcode."],
    de: ["Ort oder Postleitzahl des Verkäufers fehlen; XRechnung verlangt beides (BR-DE-3, -4).", "Ergänzen Sie Ort und Postleitzahl des Verkäufers."],
    fr: ["La ville ou le code postal du vendeur manque ; XRechnung exige les deux.", "Ajoutez la ville et le code postal du vendeur."],
  },
  "XR-006": {
    en: ["The buyer's city or postcode is missing; XRechnung requires both.", "Add the buyer's city and postcode."],
    de: ["Ort oder Postleitzahl des Käufers fehlen; XRechnung verlangt beides (BR-DE-8, -9).", "Ergänzen Sie Ort und Postleitzahl des Käufers."],
    fr: ["La ville ou le code postal de l'acheteur manque ; XRechnung exige les deux.", "Ajoutez la ville et le code postal de l'acheteur."],
  },
  "XR-007": {
    en: ["The invoice type code is not one XRechnung accepts.", "Use an accepted code, usually 380 (invoice) or 381 (credit note)."],
    de: ["Der Rechnungstyp-Code ist keiner, den XRechnung zulässt (BR-DE-17).", "Verwenden Sie einen zulässigen Code, meist 380 (Rechnung) oder 381 (Gutschrift)."],
    fr: ["Le code de type de facture n'est pas accepté par XRechnung.", "Utilisez un code accepté, en général 380 (facture) ou 381 (avoir)."],
  },
  "XR-008": {
    en: ["The specification identifier (BT-24) does not name an XRechnung version, so the receiver applies the wrong rules.", "Set it to the XRechnung version your software produces, for example urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0."],
    de: ["Die Spezifikationskennung (BT-24) nennt keine XRechnung-Version; der Empfänger prüft gegen falsche Regeln (BR-DE-21).", "Setzen Sie die XRechnung-Version Ihrer Software, z. B. urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0."],
    fr: ["L'identifiant de spécification (BT-24) ne désigne aucune version XRechnung ; le destinataire applique de mauvaises règles.", "Indiquez la version XRechnung produite par votre logiciel, par exemple urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0."],
  },
  "XR-009": {
    en: ["The seller has neither a VAT number nor a tax number; a German invoice needs one of them.", "Add the seller's VAT number (USt-IdNr.) or tax number (Steuernummer)."],
    de: ["Der Verkäufer hat weder USt-IdNr. noch Steuernummer; eine deutsche Rechnung braucht eine davon (BR-DE-16, § 14 Abs. 4 UStG).", "Ergänzen Sie die USt-IdNr. oder die Steuernummer des Verkäufers."],
    fr: ["Le vendeur n'a ni numéro de TVA ni numéro fiscal ; une facture allemande exige l'un des deux.", "Ajoutez le numéro de TVA (USt-IdNr.) ou le numéro fiscal (Steuernummer) du vendeur."],
  },

  // --- Peppol BIS Billing 3.0 ---
  "PP-001": {
    en: ["The business process identifier (BT-23) is missing or not the Peppol billing process.", "Set it to urn:fdc:peppol.eu:2017:poacc:billing:01:1.0."],
    de: ["Die Geschäftsprozesskennung (BT-23) fehlt oder ist nicht der Peppol-Rechnungsprozess.", "Setzen Sie sie auf urn:fdc:peppol.eu:2017:poacc:billing:01:1.0."],
    fr: ["L'identifiant de processus métier (BT-23) manque ou n'est pas le processus de facturation Peppol.", "Fixez-le à urn:fdc:peppol.eu:2017:poacc:billing:01:1.0."],
  },
  "PP-002": {
    en: ["The specification identifier does not name Peppol BIS Billing 3.0, so access points will refuse it.", "Set it to urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0 (or the CIUS your network expects)."],
    de: ["Die Spezifikationskennung nennt nicht Peppol BIS Billing 3.0; Zugangspunkte lehnen die Datei ab.", "Setzen Sie urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0 (oder die vom Netzwerk verlangte CIUS, z. B. XRechnung)."],
    fr: ["L'identifiant de spécification ne désigne pas Peppol BIS Billing 3.0 ; les points d'accès refuseront le fichier.", "Indiquez urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0 (ou la CIUS attendue par le réseau)."],
  },
  "PP-003": {
    en: ["The seller's electronic address (BT-34) is missing; Peppol needs it to know who sent the invoice.", "Add the seller's Peppol endpoint ID with its scheme code."],
    de: ["Die elektronische Adresse des Verkäufers (BT-34) fehlt; Peppol braucht sie zur Absenderzuordnung.", "Ergänzen Sie die Peppol-Endpunkt-ID des Verkäufers mit Schema-Code."],
    fr: ["L'adresse électronique du vendeur (BT-34) manque ; Peppol en a besoin pour identifier l'émetteur.", "Ajoutez l'identifiant Peppol du vendeur avec son code de schéma."],
  },
  "PP-004": {
    en: ["The buyer's electronic address (BT-49) is missing, so the invoice cannot be delivered over Peppol.", "Add the buyer's Peppol endpoint ID with its scheme code."],
    de: ["Die elektronische Adresse des Käufers (BT-49) fehlt; die Rechnung kann über Peppol nicht zugestellt werden.", "Ergänzen Sie die Peppol-Endpunkt-ID des Käufers mit Schema-Code."],
    fr: ["L'adresse électronique de l'acheteur (BT-49) manque ; la facture ne peut pas être livrée via Peppol.", "Ajoutez l'identifiant Peppol de l'acheteur avec son code de schéma."],
  },
  "PP-005": {
    en: ["There is neither a buyer reference nor an order reference; Peppol requires one of them.", "Add the buyer's reference or purchase-order number."],
    de: ["Es gibt weder Käuferreferenz noch Bestellreferenz; Peppol verlangt eine davon.", "Ergänzen Sie die Käuferreferenz oder die Bestellnummer."],
    fr: ["Il n'y a ni référence acheteur ni référence de commande ; Peppol exige l'une des deux.", "Ajoutez la référence acheteur ou le numéro de commande."],
  },

  // --- French reform (2026-2027) ---
  "FR-001": {
    en: ["The French seller has no SIREN or SIRET on the invoice; from the 2026-2027 reform it is mandatory.", "Add the seller's SIREN (9 digits) or SIRET (14 digits) as legal registration identifier."],
    de: ["Der französische Verkäufer hat keine SIREN/SIRET auf der Rechnung; ab der Reform 2026-2027 ist sie Pflicht.", "Ergänzen Sie die SIREN (9 Ziffern) oder SIRET (14 Ziffern) des Verkäufers als Registerkennung."],
    fr: ["Le vendeur français n'a pas de SIREN ni de SIRET sur la facture ; il est obligatoire avec la réforme 2026-2027.", "Ajoutez le SIREN (9 chiffres) ou le SIRET (14 chiffres) du vendeur comme identifiant légal."],
  },
  "FR-002": {
    en: ["A SIREN or SIRET has the wrong length or fails its check digit.", "Copy the number again from the company's Kbis or the INSEE register."],
    de: ["Eine SIREN oder SIRET hat die falsche Länge oder eine falsche Prüfziffer.", "Übernehmen Sie die Nummer erneut aus dem Kbis-Auszug oder dem INSEE-Register."],
    fr: ["Un SIREN ou SIRET n'a pas la bonne longueur ou sa clé de contrôle est fausse.", "Recopiez le numéro depuis l'extrait Kbis ou le répertoire SIRENE de l'INSEE."],
  },
  "FR-003": {
    en: ["The SIREN inside the seller's French VAT number differs from the seller's SIREN.", "Check which of the two numbers is wrong; they must belong to the same company."],
    de: ["Die SIREN in der französischen USt-IdNr. des Verkäufers weicht von seiner SIREN ab.", "Prüfen Sie, welche Nummer falsch ist; beide müssen zum selben Unternehmen gehören."],
    fr: ["Le SIREN contenu dans le numéro de TVA du vendeur diffère de son SIREN.", "Vérifiez lequel des deux numéros est faux ; ils doivent désigner la même entreprise."],
  },
  "FR-004": {
    en: ["The French buyer has no SIREN or SIRET, so the platform cannot route the invoice to them.", "Add the buyer's SIREN or SIRET."],
    de: ["Der französische Käufer hat keine SIREN/SIRET; die Plattform kann ihm die Rechnung nicht zustellen.", "Ergänzen Sie die SIREN oder SIRET des Käufers."],
    fr: ["L'acheteur français n'a pas de SIREN ni de SIRET : la plateforme ne peut pas lui acheminer la facture.", "Ajoutez le SIREN ou le SIRET de l'acheteur."],
  },
  "FR-005": {
    en: ["The late-payment penalty rate is not stated, which French law requires (Code de commerce L441-10).", "Add a note with the late-payment penalty rate."],
    de: ["Der Verzugszinssatz ist nicht angegeben; französisches Recht verlangt ihn (Code de commerce L441-10).", "Ergänzen Sie einen Hinweis mit dem Verzugszinssatz."],
    fr: ["Le taux des pénalités de retard n'est pas mentionné, alors que l'article L441-10 du Code de commerce l'exige.", "Ajoutez une mention du taux des pénalités de retard."],
  },
  "FR-006": {
    en: ["The fixed 40 euro recovery indemnity is not mentioned (Code de commerce D441-5).", "Add the mention of the 40 euro fixed recovery indemnity."],
    de: ["Die pauschale Beitreibungsentschädigung von 40 Euro ist nicht erwähnt (Code de commerce D441-5).", "Ergänzen Sie den Hinweis auf die Pauschale von 40 Euro."],
    fr: ["L'indemnité forfaitaire de recouvrement de 40 euros n'est pas mentionnée (art. D441-5 du Code de commerce).", "Ajoutez la mention de l'indemnité forfaitaire de 40 euros pour frais de recouvrement."],
  },
  "FR-007": {
    en: ["The early-payment discount condition (escompte) is not stated (Code de commerce L441-9).", "Add the discount condition, or state that no discount is given for early payment."],
    de: ["Die Skontobedingung (escompte) ist nicht angegeben (Code de commerce L441-9).", "Ergänzen Sie die Skontobedingung oder den Hinweis, dass kein Skonto gewährt wird."],
    fr: ["Les conditions d'escompte ne sont pas mentionnées (art. L441-9 du Code de commerce).", "Ajoutez les conditions d'escompte, ou « pas d'escompte pour paiement anticipé »."],
  },
  "FR-008": {
    en: ["The category of the operation (goods, services or both) is not stated; the reform makes it mandatory.", "Add a note stating whether the invoice covers goods, services or both."],
    de: ["Die Art des Umsatzes (Lieferung, Leistung oder beides) ist nicht angegeben; die Reform macht sie zur Pflicht.", "Ergänzen Sie einen Hinweis, ob Lieferungen, Leistungen oder beides abgerechnet werden."],
    fr: ["La catégorie de l'opération (biens, services ou mixte) n'est pas indiquée ; la réforme la rend obligatoire.", "Ajoutez une mention précisant s'il s'agit de livraisons de biens, de prestations de services ou des deux."],
  },

  // --- Factur-X / ZUGFeRD PDF envelope ---
  "PDF-001": {
    en: ["The PDF has no PDF/A-3 marker. Many receivers accept it, but Factur-X and ZUGFeRD require PDF/A-3.", "Export the invoice as PDF/A-3 from your software (a note, not blocking)."],
    de: ["Die PDF-Datei trägt keine PDF/A-3-Kennzeichnung. Viele Empfänger nehmen sie an, ZUGFeRD verlangt aber PDF/A-3.", "Exportieren Sie die Rechnung als PDF/A-3 (Hinweis, nicht blockierend)."],
    fr: ["Le PDF ne porte pas de marqueur PDF/A-3. Beaucoup de destinataires l'acceptent, mais Factur-X exige le PDF/A-3.", "Exportez la facture en PDF/A-3 depuis votre logiciel (remarque, non bloquante)."],
  },
  "PDF-002": {
    en: ["The embedded invoice XML has a non-standard file name, so receivers may not find it.", "Name the attachment factur-x.xml (or zugferd-invoice.xml / xrechnung.xml)."],
    de: ["Die eingebettete Rechnungs-XML hat einen unüblichen Dateinamen; Empfänger finden sie eventuell nicht.", "Benennen Sie den Anhang factur-x.xml (bzw. zugferd-invoice.xml oder xrechnung.xml)."],
    fr: ["Le XML de facture intégré porte un nom non standard ; les destinataires risquent de ne pas le trouver.", "Nommez la pièce jointe factur-x.xml (ou zugferd-invoice.xml / xrechnung.xml)."],
  },
  "PDF-003": {
    en: ["The attachment does not declare its relationship to the PDF (AFRelationship).", "Let your PDF tool set AFRelationship to Data or Alternative (a note)."],
    de: ["Der Anhang deklariert seine Beziehung zur PDF nicht (AFRelationship).", "Lassen Sie Ihr PDF-Werkzeug AFRelationship auf Data oder Alternative setzen (Hinweis)."],
    fr: ["La pièce jointe ne déclare pas sa relation avec le PDF (AFRelationship).", "Faites définir AFRelationship à Data ou Alternative par votre outil PDF (remarque)."],
  },
  "PDF-004": {
    en: ["The PDF metadata names a different Factur-X profile than the embedded XML.", "Regenerate the PDF so metadata and XML name the same profile."],
    de: ["Die PDF-Metadaten nennen ein anderes ZUGFeRD-Profil als die eingebettete XML.", "Erzeugen Sie die PDF neu, sodass Metadaten und XML dasselbe Profil nennen."],
    fr: ["Les métadonnées du PDF indiquent un autre profil Factur-X que le XML intégré.", "Régénérez le PDF pour que métadonnées et XML indiquent le même profil."],
  },
  "PDF-005": {
    en: ["The embedded file has no MIME type, which PDF/A-3 expects.", "Let your PDF tool write the MIME type text/xml for the attachment (a note)."],
    de: ["Die eingebettete Datei hat keinen MIME-Typ, den PDF/A-3 erwartet.", "Lassen Sie Ihr PDF-Werkzeug den MIME-Typ text/xml setzen (Hinweis)."],
    fr: ["Le fichier intégré n'a pas de type MIME, attendu par le PDF/A-3.", "Faites écrire le type MIME text/xml par votre outil PDF (remarque)."],
  },
  "PDF-006": {
    en: ["The PDF catalogue does not list the attachment as an associated file (/AF).", "Let your PDF tool add the attachment to the /AF array (a note)."],
    de: ["Der PDF-Katalog führt den Anhang nicht als zugeordnete Datei (/AF).", "Lassen Sie Ihr PDF-Werkzeug den Anhang in das /AF-Array aufnehmen (Hinweis)."],
    fr: ["Le catalogue du PDF ne liste pas la pièce jointe comme fichier associé (/AF).", "Faites ajouter la pièce jointe au tableau /AF par votre outil PDF (remarque)."],
  },

  // --- CII schema (cii-xsd.mjs, the EN 16931 subset of UN/CEFACT D16B) ---
  "CII-001": {
    en: ["The XML has an element the CII schema does not allow at this place, or one element too many. A validator refuses the file before any business rule runs.", "Remove the element named in the detail, or move it to the block where the schema defines it, and export again."],
    de: ["Die XML enthält ein Element, das das CII-Schema an dieser Stelle nicht zulässt, oder ein Element zu viel. Ein Validator (z. B. KoSIT) weist die Datei ab, bevor eine Geschäftsregel geprüft wird.", "Entfernen Sie das in der Meldung genannte Element oder verschieben Sie es in den Block, in dem das Schema es vorsieht, und exportieren Sie erneut."],
    fr: ["Le XML contient un élément que le schéma CII n'autorise pas à cet endroit, ou un élément de trop. Un validateur rejette le fichier avant toute règle métier.", "Supprimez l'élément indiqué dans le détail, ou déplacez-le dans le bloc où le schéma le prévoit, puis exportez de nouveau."],
  },
  "CII-002": {
    en: ["Elements are out of order. The CII schema fixes the order of every element, and a validator rejects a file that breaks it even when every value is right.", "Put the element named in the detail where the schema sequence places it; most invoicing software does this when the file is exported again."],
    de: ["Elemente stehen in der falschen Reihenfolge. Das CII-Schema legt die Reihenfolge jedes Elements fest; ein Validator lehnt die Datei ab, auch wenn alle Werte stimmen.", "Setzen Sie das genannte Element an die Stelle, die die Schema-Reihenfolge vorsieht; ein erneuter Export aus der Rechnungssoftware erledigt das meist."],
    fr: ["Des éléments ne sont pas dans le bon ordre. Le schéma CII fixe l'ordre de chaque élément, et un validateur rejette le fichier même si toutes les valeurs sont justes.", "Placez l'élément indiqué à l'endroit prévu par la séquence du schéma ; un nouvel export depuis le logiciel de facturation le fait en général."],
  },
  "CII-003": {
    en: ["An element the CII schema requires is missing, so the file is not a valid Cross Industry Invoice.", "Add the element named in the detail and export again."],
    de: ["Ein Element, das das CII-Schema vorschreibt, fehlt; die Datei ist keine gültige Cross Industry Invoice.", "Ergänzen Sie das in der Meldung genannte Element und exportieren Sie erneut."],
    fr: ["Un élément obligatoire du schéma CII manque : le fichier n'est pas une Cross Industry Invoice valide.", "Ajoutez l'élément indiqué dans le détail et exportez de nouveau."],
  },
  "CII-004": {
    en: ["A value does not fit its type in the CII schema (a number with a comma, a date or true/false written another way, a code that is too long).", "Correct the value named in the detail: numbers with a decimal point and no thousands separator, Indicator as true or false."],
    de: ["Ein Wert passt nicht zu seinem Typ im CII-Schema (eine Zahl mit Komma, ein Datum oder Wahrheitswert in anderer Schreibweise, ein zu langer Code).", "Korrigieren Sie den genannten Wert: Zahlen mit Dezimalpunkt und ohne Tausendertrennzeichen, Indicator als true oder false."],
    fr: ["Une valeur ne correspond pas à son type dans le schéma CII (un nombre avec une virgule, une date ou un booléen écrit autrement, un code trop long).", "Corrigez la valeur indiquée : nombres avec un point décimal et sans séparateur de milliers, Indicator à true ou false."],
  },
  "CII-005": {
    en: ["An attribute that the CII schema fixes to one value has another value.", "Set the attribute to the value named in the detail, or leave it out."],
    de: ["Ein Attribut, das das CII-Schema auf einen festen Wert legt, hat einen anderen Wert.", "Setzen Sie das Attribut auf den in der Meldung genannten Wert oder lassen Sie es weg."],
    fr: ["Un attribut que le schéma CII fixe à une seule valeur en porte une autre.", "Donnez à l'attribut la valeur indiquée dans le détail, ou supprimez-le."],
  },
  "CII-006": {
    en: ["The XML is not well formed: a tag is never closed or closes out of order, which is what a cut-off file looks like.", "Export the file again; if it was edited by hand, close every tag in the order it was opened."],
    de: ["Die XML ist nicht wohlgeformt: Ein Tag wird nie oder in falscher Reihenfolge geschlossen, wie bei einer abgeschnittenen Datei.", "Exportieren Sie die Datei erneut; wurde sie von Hand bearbeitet, schließen Sie jedes Tag in der Reihenfolge, in der es geöffnet wurde."],
    fr: ["Le XML n'est pas bien formé : une balise n'est jamais fermée ou se ferme dans le désordre, comme dans un fichier tronqué.", "Exportez de nouveau le fichier ; s'il a été modifié à la main, fermez chaque balise dans l'ordre d'ouverture."],
  },
  "CII-007": {
    en: ["An element is written in the wrong namespace, for example udt:DateTimeString where the schema wants qdt:DateTimeString (the preceding invoice's date, BT-26). To a validator it is a different element, so the file fails.", "Write the element with the prefix the detail names and declare that namespace on the root element."],
    de: ["Ein Element steht im falschen Namensraum, z. B. udt:DateTimeString statt qdt:DateTimeString (Datum der vorausgegangenen Rechnung, BT-26). Für einen Validator ist das ein anderes Element, die Datei fällt durch.", "Schreiben Sie das Element mit dem in der Meldung genannten Präfix und deklarieren Sie diesen Namensraum im Wurzelelement."],
    fr: ["Un élément est écrit dans le mauvais espace de noms, par exemple udt:DateTimeString au lieu de qdt:DateTimeString (date de la facture antérieure, BT-26). Pour un validateur c'est un autre élément : le fichier est rejeté.", "Écrivez l'élément avec le préfixe indiqué dans le détail et déclarez cet espace de noms sur l'élément racine."],
  },

  // --- Paid-layer rule (pro/rules.mjs) ---
  "PRO-DEC-001": {
    en: ["An amount has more than two decimals. EN 16931 allows at most two (BR-DEC rules), so receivers reject it.", "Round the amount to two decimals[ ({value})]."],
    de: ["Ein Betrag hat mehr als zwei Nachkommastellen. EN 16931 erlaubt höchstens zwei (BR-DEC), Empfänger lehnen ab.", "Runden Sie den Betrag auf zwei Nachkommastellen[ ({value})]."],
    fr: ["Un montant a plus de deux décimales. La norme EN 16931 en autorise deux au plus (règles BR-DEC) : la facture sera rejetée.", "Arrondissez le montant à deux décimales[ ({value})]."],
  },
  "PRO-DATE-001": {
    en: ["A date is not written in the only form the e-invoice schema accepts (YYYY-MM-DD in UBL, YYYYMMDD in CII).", "Rewrite the date in that form; the schema rejects 24.08.2026 or 24/08/2026."],
    de: ["Ein Datum steht nicht in der einzigen Form, die das E-Rechnungs-Schema zulässt (JJJJ-MM-TT in UBL, JJJJMMTT in CII).", "Schreiben Sie das Datum in dieser Form; 24.08.2026 wird vom Schema abgelehnt."],
    fr: ["Une date n'est pas écrite sous la seule forme acceptée par le schéma (AAAA-MM-JJ en UBL, AAAAMMJJ en CII).", "Réécrivez la date sous cette forme ; 24/08/2026 est rejeté par le schéma."],
  },
  "PRO-SUM-001": {
    en: ["A total does not add up exactly to the cent. The official EN 16931 rules (BR-CO) compare exactly, with no rounding tolerance.", "Set the total[ to {value}] or correct the amounts it is made of."],
    de: ["Eine Summe stimmt nicht centgenau. Die offiziellen EN-16931-Regeln (BR-CO) prüfen exakt, ohne Rundungstoleranz.", "Setzen Sie die Summe[ auf {value}] oder korrigieren Sie die Beträge, aus denen sie besteht."],
    fr: ["Un total n'est pas exact au centime près. Les règles officielles EN 16931 (BR-CO) comparent sans tolérance d'arrondi.", "Fixez le total[ à {value}] ou corrigez les montants qui le composent."],
  },
  "PRO-DE-001": {
    en: ["This ZUGFeRD / Factur-X profile (MINIMUM or BASIC WL) does not count as an e-invoice in Germany: the BMF accepts XRechnung and ZUGFeRD from 2.0.1 except these two profiles.", "Export the invoice in the EN 16931 (COMFORT), EXTENDED or XRECHNUNG profile, or as an XRechnung."],
    de: ["Dieses ZUGFeRD-/Factur-X-Profil (MINIMUM oder BASIC WL) gilt in Deutschland nicht als E-Rechnung: Das BMF erkennt XRechnung und ZUGFeRD ab 2.0.1 an, mit Ausnahme dieser beiden Profile.", "Erzeugen Sie die Rechnung im Profil EN 16931 (COMFORT), EXTENDED oder XRECHNUNG oder als XRechnung."],
    fr: ["Ce profil ZUGFeRD / Factur-X (MINIMUM ou BASIC WL) ne compte pas comme facture électronique en Allemagne : le BMF admet XRechnung et ZUGFeRD à partir de la version 2.0.1, sauf ces deux profils.", "Générez la facture au profil EN 16931 (COMFORT), EXTENDED ou XRECHNUNG, ou en XRechnung."],
  },
  "PRO-CUR-001": {
    en: ["The document currency code is missing, so the file cannot be read as an invoice.", "Add the invoice currency code, for example EUR."],
    de: ["Der Währungscode der Rechnung fehlt; die Datei lässt sich nicht als Rechnung lesen.", "Ergänzen Sie den Währungscode, z. B. EUR."],
    fr: ["Le code devise du document manque ; le fichier ne peut pas être lu comme une facture.", "Ajoutez le code devise de la facture, par exemple EUR."],
  },
};

const PARTY = {
  en: { supplier: "supplier", customer: "customer", seller: "seller", buyer: "buyer" },
  de: { supplier: "Lieferanten", customer: "Kunden", seller: "Verkäufer", buyer: "Käufer" },
  fr: { supplier: "fournisseur", customer: "client", seller: "vendeur", buyer: "acheteur" },
};
// German genitive in the templates appends "s" to the bracketed noun; the word list above already
// carries the genitive form, so the template's trailing "s" is dropped for these (see fill()).

/** @param {{ message?: string, fix?: string }} finding */
export function extractParams(finding) {
  const message = String(finding.message ?? "");
  const fix = String(finding.fix ?? "");
  /** @type {Record<string, string>} */
  const params = {};
  const n = /\b(?:line|row)\s+(\d+)/i.exec(message);
  if (n) params.n = n[1];
  const value = /\bto (-?\d[\d.,]*\d|-?\d)\b/.exec(fix);
  if (value) params.value = value[1];
  const party = /^(Supplier|Customer|Seller|Buyer)\b/.exec(message);
  if (party) params.party = party[1].toLowerCase();
  return params;
}

/**
 * Fill a template: replace {key}; drop a [segment] whose placeholder has no value.
 * @param {string} text @param {Record<string, string>} params @param {Lang} lang
 */
export function fill(text, params, lang) {
  /** @param {string} key */
  const valueOf = (key) => {
    const v = params[key];
    if (v === undefined) return undefined;
    if (key === "party") return PARTY[lang][/** @type {keyof typeof PARTY.en} */ (v)];
    return v;
  };
  const withSegments = text.replace(/\[([^\]]*)\]/g, (_, seg) => {
    const keys = [...seg.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
    return keys.every((k) => valueOf(k) !== undefined) ? seg : "";
  });
  return withSegments
    .replace(/\{party\}s/g, () => valueOf("party") ?? "")
    .replace(/\{(\w+)\}/g, (_, k) => valueOf(k) ?? "")
    .replace(/ {2,}/g, " ")
    .replace(/ ([.,;:])/g, "$1");
}

export const LANGS = /** @type {const} */ (["de", "fr", "en"]);

/** @param {unknown} value @returns {Lang} */
export function normaliseLang(value) {
  const v = String(value ?? "").toLowerCase().slice(0, 2);
  return v === "de" || v === "fr" ? v : "en";
}
