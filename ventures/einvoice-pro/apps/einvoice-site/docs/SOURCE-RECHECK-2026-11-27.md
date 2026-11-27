# German and French deadline sources, re-read directly (2026-11-27)

The launch list in `apps/einvoice-preflight/ROADMAP.md` asked for every official deadline source to be
re-read directly, because on 2026-11-24 the German and French pages could only be matched against
search excerpts. On 2026-11-27 each URL in `content/deadlines.mjs` was fetched from the build
environment (plain HTTPS, no browser) and every statement compared with the official text. The
quotes below are the sentences each statement rests on.

Two sessions did this re-check at the same time. PR #19823 landed the corrections (the German consent
wording, the four French mentions, the format rule, economie.gouv.fr dropped); the follow-up PR that
added this file moved the French receiving and 2027 rows from the start-up guide to DGFiP's FAQ
(the guide does not say "whatever their size", nor name PME, micro or e-reporting), dated the new
mentions, and removed "through search excerpts" from llms.txt.

## What answered

| Source key | Host | Result |
|---|---|---|
| `bmfFaq` | bundesfinanzministerium.de (FAQ page) | 200, read |
| `bmfLetter2025` | bundesfinanzministerium.de (PDF, 15 Oct 2025) | 200, read (cited by no page today) |
| `bmfLetter2026` | bundesfinanzministerium.de (PDF, 15 Oct 2026) | 200, read |
| `frImpotsDecouvre` | impots.gouv.fr ("Je découvre…", modified 26/05/2026) | 200, read |
| `frImpotsGuide` | impots.gouv.fr (guide pratique, Sept 2026) | 200, read (now cited by no page) |
| `frImpotsFaq` (new) | impots.gouv.fr (FAQ PDF, "Version du 01/09/2026") | 200, read |
| `frEconomie` (removed) | economie.gouv.fr | 403: a bot challenge page, twice |
| `frImpotsMentions` (removed) | impots.gouv.fr (`fiche-1_f_ps.pdf`) | 200, but does not contain the claim |

## What changed

0. **Germany, PDFs in the transition** (PR #19823). FAQ q. 11: "Dabei kann eine Papierrechnung immer verwendet
   werden." Another electronic format "(z. B. E-Mail mit einer PDF-Datei) kann – wie bisher – nur
   verwendet werden, wenn der Empfänger diesem Format zustimmt." The 31 December 2026 row used to imply any issuer could send a
   plain PDF; it now says the recipient must agree.
1. **French new invoice mentions: four, not three.** The site listed the customer's SIREN, the
   category of the transaction and the VAT-on-debits option. DGFiP's FAQ, question 3.4: "Quatre
   nouvelles mentions sont cependant rendues obligatoires … à compter du 1er septembre 2026. Il
   s'agit des mentions suivantes : le SIREN du client ; la catégorie de l'opération … ; l'option de
   paiement de la TVA sur les débits, le cas échéant ; l'adresse de livraison des biens, si elle est
   différente de l'adresse de facturation, le cas échéant." The delivery address is now on the page
   in all four languages, with the start date.
2. **The PDF cited for the mentions did not state them.** `fiche-1_f_ps.pdf` is a booklet for
   service businesses; it mentions SIREN, transaction categories and the debits option only in the
   e-reporting context. The rule now cites the FAQ above.
3. **economie.gouv.fr dropped.** It cannot be read by an automated client, so it cannot be
   re-checked by one. Its two deadlines now cite the FAQ, question 5.1: "Les grandes entreprises (GE)
   et les entreprises de taille intermédiaire (ETI) doivent également émettre toutes leurs factures
   sous format électronique. Les petites, moyennes et micro-entreprises seront … tenues, d'émettre
   leurs factures au format électronique au plus tard le 1er septembre 2027"; question 8.1 (e-reporting
   "suit celle de la facturation électronique : depuis le 1er septembre 2026 pour les grandes
   entreprises et … ETI, et à partir du 1er septembre 2027 pour les micro, petites et moyennes
   entreprises"); question 1.3 ("Les TPE/PME peuvent, si elles le souhaitent, anticiper sur
   l'échéance du 1er septembre 2027").
4. **French receiving date** now cites the FAQ, question 5.1: "Depuis le 1er septembre 2026, toutes
   les entreprises, quelles que soient leur taille et leur forme juridique, ont l'obligation de
   recevoir des factures sous format électronique, par l'intermédiaire d'une plateforme agréée." (The
   guide said "toutes les entreprises concernées", without "whatever their size".)
5. **French format rule reworded to the source.** "Je découvre…": "Une facture électronique devra :
   respecter un format donné (UBL, CII ou tout format mixte composé d'un fichier de données
   structurées et d'un fichier image) ; … être transmise au client par l'intermédiaire d'une
   plateforme agréée". The site used to say "approved platforms transmit invoices in one of three
   formats: UBL, CII or Factur-X"; it now names the mixed format as the page does, with Factur-X as
   an example.

## What matched unchanged (Germany)

- Receiving from 1 Jan 2025, an email inbox is enough: FAQ q. 8 "Allerdings muss ein Unternehmen seit
  dem 1. Januar 2025 den Empfang einer E-Rechnung sicherstellen. Dazu reicht bereits ein
  E‑Mail‑Postfach aus."
- General transition to 31 Dec 2026 (date unchanged; wording fixed, item 0): FAQ q. 11 "In dem Zeitraum vom 1. Januar 2025 bis zum
  31. Dezember 2026 können sich alle Rechnungsaussteller dafür entscheiden, statt einer E‑Rechnung
  eine sonstige Rechnung auszustellen."
- €800,000 and EDI to end of 2027: FAQ q. 11 "Bei einem Vorjahresumsatz des Rechnungsausstellers bis
  800.000 Euro verlängert sich diese Frist noch bis zum Ablauf des Jahres 2027. Schließlich kann ein
  EDI‑Verfahren, das nicht ohnehin die Voraussetzungen an eine E‑Rechnung erfüllt, noch bis zum
  Ablauf des Jahres 2027 verwendet werden."
- Plain PDF is not an e-invoice; EN 16931: FAQ q. 2 and q. 7.
- XRechnung and ZUGFeRD from 2.0.1 except MINIMUM and BASIC-WL: FAQ q. 7, word for word.
- Gross-price tolerance to 31 Dec 2027: BMF letter of 15 Oct 2026, section 2.5 (para. 17 ff.), "die
  bis zum 31. Dezember 2027 ausgestellt werden, nicht beanstandet"; the FAQ repeats it.

## Not re-checked here

Poland and Belgium were already read directly (2026-11-26 and 2026-11-27). Penalties and anything
the site does not state were not looked for. A browser read by a person is still worth doing before
launch, mainly for economie.gouv.fr, which this environment cannot open.
