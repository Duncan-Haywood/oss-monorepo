# Datenschutzerklärung

**Version 2026-11-27** · Maris Stella Labs LLC

**Unverbindliche Übersetzung.** Diese deutsche Fassung dient nur dem besseren Verständnis. Verbindlich ist allein die englische Fassung der Privacy Policy unter /app/privacy; weichen die Fassungen voneinander ab, gilt die englische.

Diese Erklärung beschreibt, welche Informationen der E-Rechnungs-Arbeitsbereich und die API (der „Dienst“, betrieben von Maris Stella Labs LLC, „wir“) erheben, wozu, wer sie verarbeitet und welche Wahlmöglichkeiten Sie haben. Die Early-Access-Liste auf der Marketing-Website hat eine eigene Datenschutzseite.

## Was wir erheben

- **Konto:** der Name der Kanzlei oder Firma, mit dem Sie sich registrieren, Ihr Tarif, das Erstellungsdatum des Kontos und welche Fassung der Nutzungsbedingungen Sie akzeptiert haben. Das Konto hat kein Passwort.
- **Anmelde-E-Mail (optional):** wenn Sie im Arbeitsbereich eine hinzufügen, die E-Mail-Adresse und wann Sie sie bestätigt haben, damit Sie sich mit einem Einmal-Link anmelden können, falls Sie Ihren API-Schlüssel verlieren. Wir nutzen sie nur, um die Bestätigungs- und Anmeldelinks zu senden, die Sie anfordern, und, wenn Sie sie im Arbeitsbereich einschalten, eine wöchentliche oder monatliche Mandantenübersicht (Anzahl der Mandanten und Rechnungen und die häufigsten Regel-IDs; nie den Namen oder Kennungen eines Mandanten, einen Dateinamen oder Rechnungsinhalte), nie für Newsletter oder Werbung. Schalten Sie die Übersicht ein, speichern wir diese Einstellung, ihre Sprache und die Zeiträume, für die eine Übersicht gesendet wurde, damit keine doppelt kommt; die Einstellung Aus oder das Entfernen der Adresse beendet sie. Zu jedem Link speichern wir die Adresse, an die er ging, wann er gesendet wurde, wann er abläuft und ob er benutzt wurde (um zu begrenzen, wie viele Links eine Adresse erhält), und den Link selbst nur als SHA-256-Hash; Link-Einträge werden etwa einen Tag nach ihrem Ablauf gelöscht. Entfernen Sie die Adresse im Arbeitsbereich, wird sie aus dem Konto gelöscht, und bereits gesendete Links funktionieren nicht mehr.
- **API-Schlüssel:** der Name jedes Schlüssels, seine ersten 12 Zeichen (damit Sie Schlüssel unterscheiden können), wann er erstellt, zuletzt benutzt und widerrufen wurde. Der Schlüssel selbst wird nur als SHA-256-Hash gespeichert.
- **Mandanten:** Name, Land, Umsatzsteuer-Identifikationsnummer und Ihr eigenes Kürzel für jeden Mandanten, den Sie anlegen.
- **Prüfverlauf:** für jeden Stapel die Zeit, die gewählte Sprache und das gewählte Regelwerk, und für jede Datei ihr Name, ihre Größe, ihr SHA-256-Hash, bestanden oder nicht bestanden, die IDs der nicht erfüllten Regeln und die IDs der angewendeten Korrekturen. **Rechnungsinhalte werden nicht gespeichert**: Jede Rechnung wird im Arbeitsspeicher gelesen, und die korrigierte Datei und der Diff werden an Sie zurückgegeben, nicht aufbewahrt.
- **Nutzung:** je Konto und Kalendermonat die Zahl der geprüften und erklärten Rechnungen sowie der SHA-256-Hash jeder gezählten Rechnung (damit dieselbe Datei nicht doppelt gezählt wird).
- **Abrechnung:** Tarif, Status, Abrechnungszeitraum und Preis Ihres Abonnements sowie die Kunden- und Abonnementkennungen des Merchant of Record aus dessen signierten Benachrichtigungen, mit einem Protokoll dieser Benachrichtigungen (Ereignis-ID, Typ, Ergebnis) und jedes begonnenen Checkouts (Tarif, Zeit). Die E-Mail-Adresse, die Sie beim Checkout angeben, geht an den Merchant of Record; wir speichern weder sie noch Kartendaten.
- **Technische Daten:** die IP-Adresse jeder Registrierungs- oder Anmeldelink-Anfrage, nur im Arbeitsspeicher des Servers gehalten, um Anfragen je Adresse zu begrenzen (nie in die Datenbank geschrieben, nach einem Neustart des Servers weg); und Fehlerprotokolle, die eine kurze Fehlermeldung enthalten, nie einen API-Schlüssel, und die unser Hosting-Anbieter bis zu 7 Tage aufbewahrt. Die Protokolle des Hosting-Anbieters zu jeder einzelnen Anfrage sind ausgeschaltet.

## Wozu wir sie nutzen

- Um den Dienst bereitzustellen: Rechnungen prüfen, Befunde erklären, Korrekturen vorschlagen und Ihren Verlauf anzeigen.
- Um Tarifgrenzen anzuwenden und Ihnen Rechnungen zu stellen.
- Um den Dienst abzusichern und Missbrauch zu verhindern.
- Um Sie zu unterstützen, wenn Sie uns darum bitten, und um gesetzliche Pflichten zu erfüllen.

## Unterauftragsverarbeiter

| Unterauftragsverarbeiter | Zweck |
| --- | --- |
| Cloudflare, Inc. | Hosting: betreibt den Dienst auf seiner Workers-Plattform, hält seine Datenbank (Cloudflare D1, gespeichert in der Europäischen Union) und bewahrt seine Fehlerprotokolle auf |
| Anthropic, PBC | KI-Modell, das manche verständlichen Erklärungen schreibt |
| Paddle (Merchant of Record) | Checkout, Zahlungen, Rechnungsstellung und Umsatzsteuer oder Sales Tax |
| Resend, Inc. (nur wenn die E-Mail-Anmeldung eingeschaltet ist) | Stellt die E-Mails mit Bestätigungs- und Anmeldelinks und, wenn eingeschaltet, die Mandantenübersicht zu; erhält die Adresse und die Nachricht |

**Was das KI-Modell sieht.** Die meisten Befunde haben eine eingebaute Erklärung, und es wird nichts gesendet. Für einen Befund ohne eine solche senden wir Anthropic die Regel-ID, die Meldung des Befunds (die den Wert zitieren kann, um den es in der Regel geht, etwa ein Datum, einen Code oder eine Kennung aus der Rechnung), den Text der vorgeschlagenen Korrektur und die Sprache, nie die Rechnungsdatei. Die Erklärung wird nach Regel, Meldung und Sprache zwischengespeichert. Wir nutzen Ihre Daten nicht zum Training von KI-Modellen.

Wir aktualisieren diese Liste, bevor wir einen neuen Unterauftragsverarbeiter hinzunehmen.

## Die Daten Ihrer Mandanten

Wenn Sie einen Mandanten anlegen oder seine Rechnungen prüfen, entscheiden Sie, was verarbeitet wird, und wir verarbeiten es in Ihrem Auftrag als Ihr Auftragsverarbeiter. Unser **Auftragsverarbeitungsvertrag** (Art. 28 DSGVO, mit den EU-Standardvertragsklauseln), veröffentlicht unter /app/dpa, ist Bestandteil der Nutzungsbedingungen und deckt diese Verarbeitung ab; fragen Sie uns, wenn Sie ein von beiden Parteien unterschriebenes Exemplar möchten. Diese Erklärung betrifft die Konto-, Abrechnungs- und Nutzungsdaten, für die wir Verantwortlicher sind.

## Was wir nicht tun

- Wir **verkaufen keine** personenbezogenen Daten oder Unternehmensdaten.
- Wir **nutzen Ihre Daten nicht für Werbung**.
- Wir **teilen Ihre Mandanten, Ihren Verlauf oder Ihre Ergebnisse nicht mit anderen Kunden**.

## Speicherdauer

- Kontodaten werden aufbewahrt, solange das Konto aktiv ist. Wenn Sie im Arbeitsbereich einen Mandanten löschen, wird sein Verlauf gelöscht.
- Bitten Sie uns, Ihr Konto zu schließen, löschen wir seine Daten aus unserer Datenbank. Der zeitpunktgenaue Verlauf der Datenbank, mit dem wir sie nach einem Vorfall wiederherstellen können, hält frühere Stände 30 Tage lang und verwirft sie dann.
- Abrechnungsunterlagen bewahren wir auf, soweit der Merchant of Record oder das Gesetz es verlangt.

## Sicherheit

- Verschlüsselung bei der Übertragung (HTTPS).
- API-Schlüssel und Anmeldelinks nur als Hashes gespeichert; jede Anfrage wird gegen das Konto geprüft, dem die Daten gehören.
- Zugriff des Betreibers: Die Personen, die den Dienst betreiben, können kontenübergreifend Kontonamen, Tarife, Registrierungsdaten, Abonnementstatus und Nutzungszahlen sehen. Jeder solche Abruf wird protokolliert. Diese Werkzeuge zeigen weder Ihre Mandanten noch Ihren Verlauf noch Ihre Anmelde-E-Mail.

Kein System ist vollkommen sicher. Wir benachrichtigen betroffene Kunden über einen Sicherheitsvorfall, der ihre Daten betrifft, wie gesetzlich vorgeschrieben.

## Ihre Rechte und Wahlmöglichkeiten

- **Berichtigung und Löschung:** Löschen Sie Mandanten, widerrufen Sie Schlüssel und ändern oder entfernen Sie die Anmelde-E-Mail jederzeit im Arbeitsbereich; kontaktieren Sie uns, um Ihr Konto zu schließen.
- Je nachdem, wo Sie sind, haben Sie weitere Rechte (in der EU nach der DSGVO: Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch sowie Beschwerde bei Ihrer Datenschutzaufsichtsbehörde). Kontaktieren Sie uns, um sie auszuüben.

## Änderungen

Wir veröffentlichen Aktualisierungen mit einem neuen Versionsdatum und informieren Sie im Arbeitsbereich über wesentliche Änderungen.

## Kontakt

Maris Stella Labs LLC, Colorado, USA · hello@marisstella.app
