// @ts-check
// The accountant workspace: sign up or sign in with an API key, manage client companies, drop a
// batch of invoices, read each finding in German, French, English, Dutch or Polish, download the fixed file and
// its diff; turn a plain PDF invoice into a checked e-invoice (convertView). Proprietary (see ../../LICENSE, part 2). Talks only to this server's /v1 API.
// Everything is built with createElement and text nodes, never HTML strings, so file names and messages cannot inject markup.
import {
  canCreateKey,
  convertBlockers,
  convertRows,
  discountText,
  diffName,
  fixedName,
  formatEuro,
  fromBase64,
  keyRows,
  LINE_COLUMNS,
  lineValue,
  MAX_PDF,
  parseDiscount,
  parseEndpoint,
  planBatches,
  setPath,
  shiftLineFields,
  shiftLinePaths,
  summarizeResult,
  toBase64,
  usageShare,
  withDiscount,
} from "./workspace-lib.mjs";

/** @typedef {"de" | "fr" | "en" | "nl" | "pl"} Lang */

const T = {
  en: {
    title: "E-invoice workspace",
    tagline: "Check your clients' e-invoices (XRechnung, ZUGFeRD/Factur-X, Peppol, EN 16931), read each problem in plain language, and download the safely fixed file.",
    signupH: "Start a free trial",
    signupP: "100 invoices a month, 3 client companies, no card. You get an API key: it is your sign-in, shown once.",
    firm: "Firm or practice name",
    accept: "I accept the {terms} and have read the {privacy}. I understand this checks the rules listed on the site and is not tax or legal advice.",
    terms: "Terms of Service",
    privacy: "Privacy Policy",
    dpa: "Data Processing Agreement (GDPR Art. 28)",
    termsChanged: "The Terms changed while this page was open. Read them again and accept.",
    keysH: "API keys",
    keysP: "Each key signs in here and works with the API. Give each person or integration its own key, and revoke one you no longer use.",
    keyName: "Key name",
    createKey: "Create key",
    keyCreatedH: "Your new key, shown once",
    keyPrefix: "Starts with",
    keyCreated: "Created",
    keyLastUsed: "Last used",
    never: "never",
    thisBrowser: "this browser",
    revoke: "Revoke",
    confirmRevoke: "Revoke this key? Anything using it stops working.",
    confirmRevokeCurrent: "This is the key this browser signed in with. Revoking it signs you out here. Continue?",
    keysOf: "{n} of {m} keys on your plan",
    keysFull: "Your plan's key limit is reached: revoke a key or upgrade to create another.",
    create: "Create trial account",
    signinH: "Sign in",
    signinP: "Paste the API key you saved at sign-up.",
    key: "API key",
    remember: "Remember on this device",
    signin: "Sign in",
    keyShownH: "Save your API key now",
    keyShownP: "This is the only time it is shown. It signs you in here and works with the API. Keep it in a password manager.",
    copy: "Copy",
    copied: "Copied",
    saved: "I have saved it, continue",
    signout: "Sign out",
    plan: "Plan",
    usage: "Invoices checked this month",
    explained: "AI explanations this month",
    upgrade: "Upgrade",
    perMonth: "/ month, excl. VAT",
    meteredMinimum: "/ month minimum, credited against usage, excl. VAT",
    meteredSoFar: "Metered this month (before the minimum)",
    billingDark: "Paid plans are not open yet. Your trial keeps working.",
    clients: "Client companies",
    dashH: "At a glance",
    dashP: "Every client over the period: who sent invoices that still fail, which rules fail most, and who has not been checked lately. Counts each invoice once, at its latest check.",
    dashDays: "Period",
    days: "days",
    dashCsv: "Download CSV",
    stAttention: "Needs attention",
    stOk: "OK",
    stIdle: "Not checked lately",
    stNever: "Never checked",
    lastChecked: "Last checked",
    invoices: "Invoices",
    passRate: "Pass rate",
    stillFailing: "Still failing",
    topRules: "Most frequent rules",
    dashTotals: "{c} clients · {f} invoices · {o} still failing · {a} need attention",
    addClient: "Add client",
    clientName: "Company name",
    country: "Country (DE, FR, …)",
    vatId: "VAT ID",
    reference: "Your reference",
    noClients: "No clients yet. Add the first company whose invoices you check.",
    open: "Open",
    delete: "Delete",
    confirmDelete: "Delete this client and its history?",
    back: "All clients",
    drop: "Drop invoices here or choose files (XML or Factur-X/ZUGFeRD PDF, up to 1 MB each)",
    choose: "Choose files",
    lang: "Explain in",
    profile: "Rules",
    profileAuto: "Detect from the file",
    rulesRun: "Rules applied",
    builtIn: "built-in checks",
    detected: "detected from the file",
    officialOk: "official Schematron ran",
    officialMissing: "official Schematron not available on this server, so only the built-in checks ran",
    fix: "Propose safe fixes",
    check: "Check",
    checking: "Checking…",
    history: "History",
    noHistory: "No checks for this client yet.",
    pass: "Passes",
    fail: "Fails",
    blocking: "blocking",
    warnings: "warnings",
    fixedFile: "Download fixed file",
    diff: "Download diff",
    fixedPass: "The fixed file passes every check that ran.",
    fixedFail: "The fixed file still has findings that need a person.",
    fixesApplied: "Safe fixes applied",
    notFixed: "Not fixed automatically",
    ai: "AI",
    refused: "Not sent",
    tooLarge: "larger than 1 MB",
    empty: "empty file",
    files: "files",
    passed: "passed",
    failed: "failed",
    fixable: "fixable",
    disclaimer: "Results come only from the deterministic checks listed on the site; explanations never change a result. Not tax or legal advice. Invoice contents are not stored, only file names, hashes and rule ids.",
    error: "Something went wrong",
    emailSigninH: "Lost your key?",
    emailSigninP: "If your workspace has a confirmed sign-in email, we send a one-time link to it. Signing in that way creates a new key for this browser.",
    email: "Email address",
    sendLink: "Email me a sign-in link",
    linkSent: "If that address belongs to a workspace, a link is on its way. It works once, for 15 minutes.",
    linkH: "Sign in from your email link",
    linkP: "Press the button to sign in. This creates a new API key for this browser; your other keys keep working.",
    linkBtn: "Sign in",
    verifyH: "Confirm your sign-in email",
    verifyP: "Press the button to confirm this address. You can then sign in with a link sent to it.",
    verifyBtn: "Confirm address",
    verified: "Address confirmed: {email}. You can sign in with an email link from now on.",
    toWorkspace: "Go to the workspace",
    invalidLink: "This link has expired or was already used. Ask for a new one.",
    emailInUse: "Another workspace already signs in with this address.",
    emailPanelH: "Sign-in email",
    emailPanelP: "Optional. A confirmed address lets you sign in with a link if you lose your API key. It is used only for sign-in links.",
    emailCurrent: "Signs in with",
    emailNone: "No sign-in email yet.",
    emailSave: "Send confirmation link",
    emailRemove: "Remove",
    confirmEmailRemove: "Remove the sign-in email? Links already sent stop working.",
    verifySent: "A confirmation link was sent to {email}. It works for 24 hours.",
  },
  de: {
    title: "E-Rechnungs-Arbeitsbereich",
    tagline: "Prüfen Sie die E-Rechnungen Ihrer Mandanten (XRechnung, ZUGFeRD/Factur-X, Peppol, EN 16931), lesen Sie jeden Fehler in Klartext und laden Sie die sicher korrigierte Datei herunter.",
    signupH: "Kostenlos testen",
    signupP: "100 Rechnungen im Monat, 3 Mandanten, keine Karte. Sie erhalten einen API-Schlüssel: Er ist Ihre Anmeldung und wird nur einmal angezeigt.",
    firm: "Name der Kanzlei oder Firma",
    accept: "Ich akzeptiere die {terms} und habe die {privacy} gelesen (maßgeblich ist die englische Fassung). Mir ist bewusst, dass hier die auf der Website genannten Regeln geprüft werden und dies keine Steuer- oder Rechtsberatung ist.",
    terms: "Nutzungsbedingungen",
    privacy: "Datenschutzerklärung",
    dpa: "Auftragsverarbeitungsvertrag (Art. 28 DSGVO)",
    termsChanged: "Die Nutzungsbedingungen haben sich geändert, während diese Seite offen war. Bitte lesen und erneut akzeptieren.",
    keysH: "API-Schlüssel",
    keysP: "Jeder Schlüssel meldet hier an und funktioniert mit der API. Geben Sie jeder Person oder Integration einen eigenen Schlüssel und widerrufen Sie Schlüssel, die Sie nicht mehr nutzen.",
    keyName: "Name des Schlüssels",
    createKey: "Schlüssel erstellen",
    keyCreatedH: "Ihr neuer Schlüssel, nur einmal angezeigt",
    keyPrefix: "Beginnt mit",
    keyCreated: "Erstellt",
    keyLastUsed: "Zuletzt genutzt",
    never: "nie",
    thisBrowser: "dieser Browser",
    revoke: "Widerrufen",
    confirmRevoke: "Diesen Schlüssel widerrufen? Alles, was ihn nutzt, funktioniert dann nicht mehr.",
    confirmRevokeCurrent: "Mit diesem Schlüssel ist dieser Browser angemeldet. Wenn Sie ihn widerrufen, werden Sie hier abgemeldet. Fortfahren?",
    keysOf: "{n} von {m} Schlüsseln Ihres Tarifs",
    keysFull: "Das Schlüssel-Limit Ihres Tarifs ist erreicht: Widerrufen Sie einen Schlüssel oder wechseln Sie den Tarif.",
    create: "Testkonto anlegen",
    signinH: "Anmelden",
    signinP: "Fügen Sie den API-Schlüssel ein, den Sie bei der Registrierung gespeichert haben.",
    key: "API-Schlüssel",
    remember: "Auf diesem Gerät merken",
    signin: "Anmelden",
    keyShownH: "Speichern Sie jetzt Ihren API-Schlüssel",
    keyShownP: "Er wird nur dieses eine Mal angezeigt. Mit ihm melden Sie sich hier an und nutzen die API. Bewahren Sie ihn in einem Passwortmanager auf.",
    copy: "Kopieren",
    copied: "Kopiert",
    saved: "Gespeichert, weiter",
    signout: "Abmelden",
    plan: "Tarif",
    usage: "Geprüfte Rechnungen in diesem Monat",
    explained: "KI-Erklärungen in diesem Monat",
    upgrade: "Upgrade",
    perMonth: "/ Monat, zzgl. USt.",
    meteredMinimum: "/ Monat Mindestbetrag, mit der Nutzung verrechnet, zzgl. USt.",
    meteredSoFar: "Nutzung diesen Monat (vor dem Mindestbetrag)",
    billingDark: "Bezahltarife sind noch nicht geöffnet. Ihr Testzugang läuft weiter.",
    clients: "Mandanten",
    dashH: "Überblick",
    dashP: "Alle Mandanten im Zeitraum: wer Rechnungen geschickt hat, die noch fehlerhaft sind, welche Regeln am häufigsten verletzt werden und wer länger nicht geprüft wurde. Jede Rechnung zählt einmal, mit ihrer letzten Prüfung.",
    dashDays: "Zeitraum",
    days: "Tage",
    dashCsv: "CSV herunterladen",
    stAttention: "Handlungsbedarf",
    stOk: "In Ordnung",
    stIdle: "Länger nicht geprüft",
    stNever: "Noch nie geprüft",
    lastChecked: "Zuletzt geprüft",
    invoices: "Rechnungen",
    passRate: "Quote bestanden",
    stillFailing: "Noch fehlerhaft",
    topRules: "Häufigste Regeln",
    dashTotals: "{c} Mandanten · {f} Rechnungen · {o} noch fehlerhaft · {a} mit Handlungsbedarf",
    addClient: "Mandant hinzufügen",
    clientName: "Firmenname",
    country: "Land (DE, FR, …)",
    vatId: "USt-IdNr.",
    reference: "Ihre Referenz",
    noClients: "Noch keine Mandanten. Legen Sie das erste Unternehmen an, dessen Rechnungen Sie prüfen.",
    open: "Öffnen",
    delete: "Löschen",
    confirmDelete: "Diesen Mandanten und seinen Verlauf löschen?",
    back: "Alle Mandanten",
    drop: "Rechnungen hierher ziehen oder Dateien wählen (XML oder Factur-X/ZUGFeRD-PDF, je bis 1 MB)",
    choose: "Dateien wählen",
    lang: "Erklären auf",
    profile: "Regeln",
    profileAuto: "Aus der Datei erkennen",
    rulesRun: "Angewandte Regeln",
    builtIn: "eingebaute Prüfungen",
    detected: "aus der Datei erkannt",
    officialOk: "offizielles Schematron geprüft",
    officialMissing: "offizielles Schematron auf diesem Server nicht verfügbar, daher nur die eingebauten Prüfungen",
    fix: "Sichere Korrekturen vorschlagen",
    check: "Prüfen",
    checking: "Wird geprüft…",
    history: "Verlauf",
    noHistory: "Für diesen Mandanten gibt es noch keine Prüfungen.",
    pass: "Bestanden",
    fail: "Nicht bestanden",
    blocking: "blockierend",
    warnings: "Warnungen",
    fixedFile: "Korrigierte Datei herunterladen",
    diff: "Änderungen (Diff) herunterladen",
    fixedPass: "Die korrigierte Datei besteht alle durchgeführten Prüfungen.",
    fixedFail: "Die korrigierte Datei hat noch Befunde, die ein Mensch klären muss.",
    fixesApplied: "Angewendete sichere Korrekturen",
    notFixed: "Nicht automatisch korrigiert",
    ai: "KI",
    refused: "Nicht gesendet",
    tooLarge: "größer als 1 MB",
    empty: "leere Datei",
    files: "Dateien",
    passed: "bestanden",
    failed: "nicht bestanden",
    fixable: "korrigierbar",
    disclaimer: "Ergebnisse stammen ausschließlich aus den auf der Website genannten deterministischen Prüfungen; Erklärungen ändern nie ein Ergebnis. Keine Steuer- oder Rechtsberatung. Rechnungsinhalte werden nicht gespeichert, nur Dateinamen, Hashwerte und Regelkennungen.",
    error: "Etwas ist schiefgelaufen",
    emailSigninH: "Schlüssel verloren?",
    emailSigninP: "Hat Ihr Arbeitsbereich eine bestätigte Anmelde-E-Mail, senden wir einen einmaligen Link an diese Adresse. Diese Anmeldung erstellt einen neuen Schlüssel für diesen Browser.",
    email: "E-Mail-Adresse",
    sendLink: "Anmeldelink per E-Mail senden",
    linkSent: "Gehört die Adresse zu einem Arbeitsbereich, ist ein Link unterwegs. Er funktioniert einmal und 15 Minuten lang.",
    linkH: "Mit Ihrem E-Mail-Link anmelden",
    linkP: "Klicken Sie auf die Schaltfläche, um sich anzumelden. Dabei wird ein neuer API-Schlüssel für diesen Browser erstellt; Ihre anderen Schlüssel funktionieren weiter.",
    linkBtn: "Anmelden",
    verifyH: "Anmelde-E-Mail bestätigen",
    verifyP: "Klicken Sie auf die Schaltfläche, um diese Adresse zu bestätigen. Danach können Sie sich mit einem Link an diese Adresse anmelden.",
    verifyBtn: "Adresse bestätigen",
    verified: "Adresse bestätigt: {email}. Ab jetzt können Sie sich mit einem E-Mail-Link anmelden.",
    toWorkspace: "Zum Arbeitsbereich",
    invalidLink: "Dieser Link ist abgelaufen oder wurde bereits verwendet. Fordern Sie einen neuen an.",
    emailInUse: "Ein anderer Arbeitsbereich meldet sich bereits mit dieser Adresse an.",
    emailPanelH: "Anmelde-E-Mail",
    emailPanelP: "Optional. Mit einer bestätigten Adresse können Sie sich per Link anmelden, wenn Sie Ihren API-Schlüssel verlieren. Sie wird nur für Anmeldelinks verwendet.",
    emailCurrent: "Anmeldung mit",
    emailNone: "Noch keine Anmelde-E-Mail.",
    emailSave: "Bestätigungslink senden",
    emailRemove: "Entfernen",
    confirmEmailRemove: "Anmelde-E-Mail entfernen? Bereits gesendete Links funktionieren dann nicht mehr.",
    verifySent: "Ein Bestätigungslink wurde an {email} gesendet. Er ist 24 Stunden gültig.",
  },
  fr: {
    title: "Espace e-facture",
    tagline: "Contrôlez les factures électroniques de vos clients (Factur-X, Peppol, EN 16931, XRechnung), lisez chaque problème en clair et téléchargez le fichier corrigé en toute sécurité.",
    signupH: "Essai gratuit",
    signupP: "100 factures par mois, 3 sociétés clientes, sans carte. Vous recevez une clé d'API : c'est votre identifiant, affiché une seule fois.",
    firm: "Nom du cabinet ou de l'entreprise",
    accept: "J'accepte les {terms} et j'ai lu la {privacy} (seule la version anglaise fait foi). Je comprends que l'outil contrôle les règles indiquées sur le site et qu'il ne s'agit pas d'un conseil fiscal ou juridique.",
    terms: "Conditions d'utilisation",
    privacy: "Politique de confidentialité",
    dpa: "Accord de sous-traitance (art. 28 RGPD)",
    termsChanged: "Les conditions d'utilisation ont changé pendant que cette page était ouverte. Relisez-les et acceptez-les à nouveau.",
    keysH: "Clés d'API",
    keysP: "Chaque clé permet de se connecter ici et fonctionne avec l'API. Donnez une clé à chaque personne ou intégration, et révoquez celles que vous n'utilisez plus.",
    keyName: "Nom de la clé",
    createKey: "Créer une clé",
    keyCreatedH: "Votre nouvelle clé, affichée une seule fois",
    keyPrefix: "Commence par",
    keyCreated: "Créée le",
    keyLastUsed: "Dernière utilisation",
    never: "jamais",
    thisBrowser: "ce navigateur",
    revoke: "Révoquer",
    confirmRevoke: "Révoquer cette clé ? Tout ce qui l'utilise cessera de fonctionner.",
    confirmRevokeCurrent: "Ce navigateur est connecté avec cette clé. La révoquer vous déconnecte ici. Continuer ?",
    keysOf: "{n} clés sur {m} de votre offre",
    keysFull: "La limite de clés de votre offre est atteinte : révoquez une clé ou changez d'offre.",
    create: "Créer le compte d'essai",
    signinH: "Connexion",
    signinP: "Collez la clé d'API enregistrée lors de l'inscription.",
    key: "Clé d'API",
    remember: "Se souvenir sur cet appareil",
    signin: "Se connecter",
    keyShownH: "Enregistrez votre clé d'API maintenant",
    keyShownP: "Elle n'est affichée qu'une seule fois. Elle vous connecte ici et fonctionne avec l'API. Conservez-la dans un gestionnaire de mots de passe.",
    copy: "Copier",
    copied: "Copié",
    saved: "C'est enregistré, continuer",
    signout: "Se déconnecter",
    plan: "Offre",
    usage: "Factures contrôlées ce mois-ci",
    explained: "Explications IA ce mois-ci",
    upgrade: "Passer à l'offre",
    perMonth: "/ mois, HT",
    meteredMinimum: "/ mois minimum, déduit de l'usage, HT",
    meteredSoFar: "Usage ce mois-ci (avant le minimum)",
    billingDark: "Les offres payantes ne sont pas encore ouvertes. Votre essai continue de fonctionner.",
    clients: "Sociétés clientes",
    dashH: "Vue d'ensemble",
    dashP: "Tous les clients sur la période : qui a envoyé des factures encore non conformes, quelles règles échouent le plus souvent et qui n'a pas été contrôlé récemment. Chaque facture compte une fois, à son dernier contrôle.",
    dashDays: "Période",
    days: "jours",
    dashCsv: "Télécharger le CSV",
    stAttention: "À traiter",
    stOk: "Conforme",
    stIdle: "Pas contrôlé récemment",
    stNever: "Jamais contrôlé",
    lastChecked: "Dernier contrôle",
    invoices: "Factures",
    passRate: "Taux de conformité",
    stillFailing: "Encore non conformes",
    topRules: "Règles les plus fréquentes",
    dashTotals: "{c} clients · {f} factures · {o} encore non conformes · {a} à traiter",
    addClient: "Ajouter un client",
    clientName: "Raison sociale",
    country: "Pays (FR, DE, …)",
    vatId: "N° de TVA",
    reference: "Votre référence",
    noClients: "Aucun client pour l'instant. Ajoutez la première société dont vous contrôlez les factures.",
    open: "Ouvrir",
    delete: "Supprimer",
    confirmDelete: "Supprimer ce client et son historique ?",
    back: "Tous les clients",
    drop: "Déposez les factures ici ou choisissez des fichiers (XML ou PDF Factur-X, 1 Mo max. chacun)",
    choose: "Choisir des fichiers",
    lang: "Expliquer en",
    profile: "Règles",
    profileAuto: "Détecter d'après le fichier",
    rulesRun: "Règles appliquées",
    builtIn: "contrôles intégrés",
    detected: "détecté d'après le fichier",
    officialOk: "Schematron officiel exécuté",
    officialMissing: "Schematron officiel indisponible sur ce serveur : seuls les contrôles intégrés ont été exécutés",
    fix: "Proposer des corrections sûres",
    check: "Contrôler",
    checking: "Contrôle en cours…",
    history: "Historique",
    noHistory: "Aucun contrôle pour ce client pour l'instant.",
    pass: "Conforme",
    fail: "Non conforme",
    blocking: "bloquantes",
    warnings: "avertissements",
    fixedFile: "Télécharger le fichier corrigé",
    diff: "Télécharger les modifications (diff)",
    fixedPass: "Le fichier corrigé passe tous les contrôles effectués.",
    fixedFail: "Le fichier corrigé comporte encore des constats à traiter par une personne.",
    fixesApplied: "Corrections sûres appliquées",
    notFixed: "Non corrigé automatiquement",
    ai: "IA",
    refused: "Non envoyé",
    tooLarge: "plus de 1 Mo",
    empty: "fichier vide",
    files: "fichiers",
    passed: "conformes",
    failed: "non conformes",
    fixable: "corrigeables",
    disclaimer: "Les résultats proviennent uniquement des contrôles déterministes indiqués sur le site ; les explications ne modifient jamais un résultat. Ceci n'est pas un conseil fiscal ou juridique. Le contenu des factures n'est pas conservé, seulement les noms de fichiers, les empreintes et les identifiants de règles.",
    error: "Une erreur s'est produite",
    emailSigninH: "Clé perdue ?",
    emailSigninP: "Si votre espace a un e-mail de connexion confirmé, nous y envoyons un lien à usage unique. Cette connexion crée une nouvelle clé pour ce navigateur.",
    email: "Adresse e-mail",
    sendLink: "Recevoir un lien de connexion",
    linkSent: "Si cette adresse appartient à un espace, un lien est en route. Il fonctionne une fois, pendant 15 minutes.",
    linkH: "Connexion par le lien reçu",
    linkP: "Cliquez sur le bouton pour vous connecter. Une nouvelle clé d'API est créée pour ce navigateur ; vos autres clés continuent de fonctionner.",
    linkBtn: "Se connecter",
    verifyH: "Confirmez votre e-mail de connexion",
    verifyP: "Cliquez sur le bouton pour confirmer cette adresse. Vous pourrez ensuite vous connecter avec un lien envoyé à cette adresse.",
    verifyBtn: "Confirmer l'adresse",
    verified: "Adresse confirmée : {email}. Vous pouvez désormais vous connecter avec un lien par e-mail.",
    toWorkspace: "Aller à l'espace",
    invalidLink: "Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.",
    emailInUse: "Un autre espace se connecte déjà avec cette adresse.",
    emailPanelH: "E-mail de connexion",
    emailPanelP: "Facultatif. Une adresse confirmée vous permet de vous connecter par lien si vous perdez votre clé d'API. Elle ne sert qu'aux liens de connexion.",
    emailCurrent: "Connexion avec",
    emailNone: "Pas encore d'e-mail de connexion.",
    emailSave: "Envoyer le lien de confirmation",
    emailRemove: "Supprimer",
    confirmEmailRemove: "Supprimer l'e-mail de connexion ? Les liens déjà envoyés ne fonctionneront plus.",
    verifySent: "Un lien de confirmation a été envoyé à {email}. Il est valable 24 heures.",
  },
  // Polish: drafted without a native-speaker read (ROADMAP "Must do"); the legal texts stay English.
  pl: {
    title: "Obszar roboczy e-faktur",
    tagline: "Sprawdzaj e-faktury swoich klientów (KSeF FA(3), XRechnung, ZUGFeRD/Factur-X, Peppol, EN 16931), czytaj każdy problem prostym językiem i pobieraj bezpiecznie poprawiony plik.",
    signupH: "Rozpocznij bezpłatny okres próbny",
    signupP: "100 faktur miesięcznie, 3 firmy klientów, bez karty. Otrzymasz klucz API: to Twój sposób logowania, pokazywany tylko raz.",
    firm: "Nazwa biura lub firmy",
    accept: "Akceptuję dokument {terms} i potwierdzam zapoznanie się z dokumentem {privacy} (oba są dostępne po angielsku i wiążąca jest wersja angielska). Rozumiem, że sprawdzane są reguły wymienione na stronie i nie jest to doradztwo podatkowe ani prawne.",
    terms: "Regulamin (Terms of Service)",
    privacy: "Polityka prywatności (Privacy Policy)",
    dpa: "Umowa powierzenia przetwarzania danych (art. 28 RODO)",
    termsChanged: "Regulamin zmienił się, gdy ta strona była otwarta. Przeczytaj go ponownie i zaakceptuj.",
    keysH: "Klucze API",
    keysP: "Każdy klucz loguje tutaj i działa z API. Daj każdej osobie lub integracji własny klucz i unieważnij te, których już nie używasz.",
    keyName: "Nazwa klucza",
    createKey: "Utwórz klucz",
    keyCreatedH: "Twój nowy klucz, pokazywany tylko raz",
    keyPrefix: "Zaczyna się od",
    keyCreated: "Utworzono",
    keyLastUsed: "Ostatnio użyty",
    never: "nigdy",
    thisBrowser: "ta przeglądarka",
    revoke: "Unieważnij",
    confirmRevoke: "Unieważnić ten klucz? Wszystko, co z niego korzysta, przestanie działać.",
    confirmRevokeCurrent: "Tym kluczem zalogowana jest ta przeglądarka. Jego unieważnienie wyloguje Cię tutaj. Kontynuować?",
    keysOf: "{n} z {m} kluczy w Twoim planie",
    keysFull: "Osiągnięto limit kluczy w Twoim planie: unieważnij klucz lub zmień plan, aby utworzyć kolejny.",
    create: "Utwórz konto próbne",
    signinH: "Zaloguj się",
    signinP: "Wklej klucz API zapisany podczas rejestracji.",
    key: "Klucz API",
    remember: "Zapamiętaj na tym urządzeniu",
    signin: "Zaloguj się",
    keyShownH: "Zapisz teraz swój klucz API",
    keyShownP: "To jedyny raz, kiedy jest pokazywany. Służy do logowania tutaj i działa z API. Przechowuj go w menedżerze haseł.",
    copy: "Kopiuj",
    copied: "Skopiowano",
    saved: "Klucz zapisany, dalej",
    signout: "Wyloguj się",
    plan: "Plan",
    usage: "Faktury sprawdzone w tym miesiącu",
    explained: "Objaśnienia AI w tym miesiącu",
    upgrade: "Zmień plan",
    perMonth: "/ miesiąc, netto (bez VAT)",
    meteredMinimum: "/ miesiąc minimum, zaliczane na poczet użycia, netto",
    meteredSoFar: "Użycie w tym miesiącu (przed minimum)",
    billingDark: "Płatne plany nie są jeszcze dostępne. Twój okres próbny nadal działa.",
    clients: "Firmy klientów",
    dashH: "W skrócie",
    dashP: "Wszyscy klienci w wybranym okresie: kto przysłał faktury, które nadal nie przechodzą, które reguły zawodzą najczęściej i kogo dawno nie sprawdzano. Każda faktura liczy się raz, według ostatniego sprawdzenia.",
    dashDays: "Okres",
    days: "dni",
    dashCsv: "Pobierz CSV",
    stAttention: "Wymaga uwagi",
    stOk: "W porządku",
    stIdle: "Dawno nie sprawdzano",
    stNever: "Nigdy nie sprawdzano",
    lastChecked: "Ostatnie sprawdzenie",
    invoices: "Faktury",
    passRate: "Odsetek poprawnych",
    stillFailing: "Nadal błędne",
    topRules: "Najczęstsze reguły",
    dashTotals: "Klienci: {c} · faktury: {f} · nadal błędne: {o} · wymaga uwagi: {a}",
    addClient: "Dodaj klienta",
    clientName: "Nazwa firmy",
    country: "Kraj (PL, DE, FR, …)",
    vatId: "NIP / numer VAT",
    reference: "Twój numer referencyjny",
    noClients: "Brak klientów. Dodaj pierwszą firmę, której faktury sprawdzasz.",
    open: "Otwórz",
    delete: "Usuń",
    confirmDelete: "Usunąć tego klienta wraz z historią?",
    back: "Wszyscy klienci",
    drop: "Upuść faktury tutaj lub wybierz pliki (XML lub PDF Factur-X/ZUGFeRD, do 1 MB każdy)",
    choose: "Wybierz pliki",
    lang: "Objaśnij w języku",
    profile: "Reguły",
    profileAuto: "Rozpoznaj z pliku",
    rulesRun: "Zastosowane reguły",
    builtIn: "wbudowane kontrole",
    detected: "rozpoznano z pliku",
    officialOk: "uruchomiono oficjalny Schematron",
    officialMissing: "oficjalny Schematron nie jest dostępny na tym serwerze, więc uruchomiono tylko wbudowane kontrole",
    fix: "Zaproponuj bezpieczne poprawki",
    check: "Sprawdź",
    checking: "Sprawdzanie…",
    history: "Historia",
    noHistory: "Brak sprawdzeń dla tego klienta.",
    pass: "Poprawna",
    fail: "Błędna",
    blocking: "blokujące",
    warnings: "ostrzeżenia",
    fixedFile: "Pobierz poprawiony plik",
    diff: "Pobierz zmiany (diff)",
    fixedPass: "Poprawiony plik przechodzi wszystkie uruchomione kontrole.",
    fixedFail: "Poprawiony plik nadal ma uwagi, które musi wyjaśnić człowiek.",
    fixesApplied: "Zastosowane bezpieczne poprawki",
    notFixed: "Nie poprawiono automatycznie",
    ai: "AI",
    refused: "Nie wysłano",
    tooLarge: "większy niż 1 MB",
    empty: "pusty plik",
    files: "pliki",
    passed: "poprawne",
    failed: "błędne",
    fixable: "do poprawienia",
    disclaimer: "Wyniki pochodzą wyłącznie z deterministycznych kontroli wymienionych na stronie; objaśnienia nigdy nie zmieniają wyniku. To nie jest doradztwo podatkowe ani prawne. Treść faktur nie jest przechowywana, tylko nazwy plików, skróty (hash) i identyfikatory reguł.",
    error: "Coś poszło nie tak",
    emailSigninH: "Klucz zgubiony?",
    emailSigninP: "Jeśli Twój obszar roboczy ma potwierdzony adres e-mail do logowania, wyślemy na niego jednorazowy link. Takie logowanie tworzy nowy klucz dla tej przeglądarki.",
    email: "Adres e-mail",
    sendLink: "Wyślij mi link do logowania",
    linkSent: "Jeśli ten adres należy do obszaru roboczego, link jest w drodze. Działa raz, przez 15 minut.",
    linkH: "Zaloguj się linkiem z e-maila",
    linkP: "Naciśnij przycisk, aby się zalogować. Zostanie utworzony nowy klucz API dla tej przeglądarki; pozostałe klucze nadal działają.",
    linkBtn: "Zaloguj się",
    verifyH: "Potwierdź e-mail do logowania",
    verifyP: "Naciśnij przycisk, aby potwierdzić ten adres. Potem możesz logować się linkiem wysłanym na ten adres.",
    verifyBtn: "Potwierdź adres",
    verified: "Adres potwierdzony: {email}. Od teraz możesz logować się linkiem z e-maila.",
    toWorkspace: "Przejdź do obszaru roboczego",
    invalidLink: "Ten link wygasł lub został już użyty. Poproś o nowy.",
    emailInUse: "Inny obszar roboczy loguje się już tym adresem.",
    emailPanelH: "E-mail do logowania",
    emailPanelP: "Opcjonalnie. Potwierdzony adres pozwala zalogować się linkiem, jeśli zgubisz klucz API. Służy wyłącznie do linków logowania.",
    emailCurrent: "Logowanie przez",
    emailNone: "Brak e-maila do logowania.",
    emailSave: "Wyślij link potwierdzający",
    emailRemove: "Usuń",
    confirmEmailRemove: "Usunąć e-mail do logowania? Wysłane już linki przestaną działać.",
    verifySent: "Link potwierdzający wysłano na {email}. Jest ważny 24 godziny.",
  },
  nl: {
    title: "E-factuurwerkruimte",
    tagline: "Controleer de e-facturen van uw klanten (Peppol BIS, NLCIUS, XRechnung, ZUGFeRD/Factur-X, EN 16931), lees elk probleem in gewone taal en download het veilig gecorrigeerde bestand.",
    signupH: "Start een gratis proefperiode",
    signupP: "100 facturen per maand, 3 klantbedrijven, geen creditcard. U krijgt een API-sleutel: daarmee meldt u zich aan, en hij wordt maar één keer getoond.",
    firm: "Naam van het kantoor of bedrijf",
    accept: "Ik ga akkoord met de {terms} en heb het {privacy} gelezen (beide zijn in het Engels beschikbaar en de Engelse tekst is bindend). Ik begrijp dat hier de regels worden gecontroleerd die op de website staan en dat dit geen fiscaal of juridisch advies is.",
    terms: "Gebruiksvoorwaarden (Terms of Service)",
    privacy: "Privacybeleid (Privacy Policy)",
    dpa: "Verwerkersovereenkomst (AVG art. 28, Data Processing Agreement)",
    termsChanged: "De voorwaarden zijn gewijzigd terwijl deze pagina openstond. Lees ze opnieuw en ga akkoord.",
    keysH: "API-sleutels",
    keysP: "Met elke sleutel kunt u zich hier aanmelden en de API gebruiken. Geef elke persoon of koppeling een eigen sleutel en trek een sleutel in die u niet meer gebruikt.",
    keyName: "Naam van de sleutel",
    createKey: "Sleutel aanmaken",
    keyCreatedH: "Uw nieuwe sleutel, maar één keer getoond",
    keyPrefix: "Begint met",
    keyCreated: "Aangemaakt",
    keyLastUsed: "Laatst gebruikt",
    never: "nooit",
    thisBrowser: "deze browser",
    revoke: "Intrekken",
    confirmRevoke: "Deze sleutel intrekken? Alles wat hem gebruikt, werkt dan niet meer.",
    confirmRevokeCurrent: "Met deze sleutel is deze browser aangemeld. Als u hem intrekt, wordt u hier afgemeld. Doorgaan?",
    keysOf: "{n} van {m} sleutels in uw abonnement",
    keysFull: "Het maximum aantal sleutels van uw abonnement is bereikt: trek een sleutel in of kies een hoger abonnement om een nieuwe aan te maken.",
    create: "Proefaccount aanmaken",
    signinH: "Aanmelden",
    signinP: "Plak de API-sleutel die u bij de registratie hebt bewaard.",
    key: "API-sleutel",
    remember: "Onthouden op dit apparaat",
    signin: "Aanmelden",
    keyShownH: "Bewaar nu uw API-sleutel",
    keyShownP: "Dit is de enige keer dat hij wordt getoond. Hiermee meldt u zich hier aan en gebruikt u de API. Bewaar hem in een wachtwoordbeheerder.",
    copy: "Kopiëren",
    copied: "Gekopieerd",
    saved: "Ik heb hem bewaard, verder",
    signout: "Afmelden",
    plan: "Abonnement",
    usage: "Gecontroleerde facturen deze maand",
    explained: "AI-uitleg deze maand",
    upgrade: "Upgraden",
    perMonth: "/ maand, excl. btw",
    meteredMinimum: "/ maand minimum, verrekend met het gebruik, excl. btw",
    meteredSoFar: "Gebruik deze maand (vóór het minimum)",
    billingDark: "Betaalde abonnementen zijn nog niet beschikbaar. Uw proefperiode blijft werken.",
    clients: "Klantbedrijven",
    dashH: "In één oogopslag",
    dashP: "Alle klanten over de periode: wie facturen stuurde die nog steeds afgekeurd worden, welke regels het vaakst falen en wie de laatste tijd niet is gecontroleerd. Elke factuur telt één keer, bij de laatste controle.",
    dashDays: "Periode",
    days: "dagen",
    dashCsv: "CSV downloaden",
    stAttention: "Actie nodig",
    stOk: "In orde",
    stIdle: "Lang niet gecontroleerd",
    stNever: "Nooit gecontroleerd",
    lastChecked: "Laatst gecontroleerd",
    invoices: "Facturen",
    passRate: "Goedgekeurd",
    stillFailing: "Nog afgekeurd",
    topRules: "Meest voorkomende regels",
    dashTotals: "{c} klanten · {f} facturen · {o} nog afgekeurd · {a} met actie nodig",
    addClient: "Klant toevoegen",
    clientName: "Bedrijfsnaam",
    country: "Land (NL, BE, …)",
    vatId: "Btw-nummer",
    reference: "Uw referentie",
    noClients: "Nog geen klanten. Voeg het eerste bedrijf toe waarvan u de facturen controleert.",
    open: "Openen",
    delete: "Verwijderen",
    confirmDelete: "Deze klant en de geschiedenis ervan verwijderen?",
    back: "Alle klanten",
    drop: "Sleep facturen hierheen of kies bestanden (XML of Factur-X/ZUGFeRD-pdf, maximaal 1 MB per bestand)",
    choose: "Bestanden kiezen",
    lang: "Uitleg in",
    profile: "Regels",
    profileAuto: "Uit het bestand afleiden",
    rulesRun: "Toegepaste regels",
    builtIn: "ingebouwde controles",
    detected: "afgeleid uit het bestand",
    officialOk: "officiële Schematron uitgevoerd",
    officialMissing: "officiële Schematron is op deze server niet beschikbaar, dus alleen de ingebouwde controles zijn uitgevoerd",
    fix: "Veilige correcties voorstellen",
    check: "Controleren",
    checking: "Bezig met controleren…",
    history: "Geschiedenis",
    noHistory: "Nog geen controles voor deze klant.",
    pass: "Goedgekeurd",
    fail: "Afgekeurd",
    blocking: "blokkerend",
    warnings: "waarschuwingen",
    fixedFile: "Gecorrigeerd bestand downloaden",
    diff: "Verschillen downloaden",
    fixedPass: "Het gecorrigeerde bestand doorstaat alle uitgevoerde controles.",
    fixedFail: "Het gecorrigeerde bestand heeft nog bevindingen die een mens moet bekijken.",
    fixesApplied: "Toegepaste veilige correcties",
    notFixed: "Niet automatisch gecorrigeerd",
    ai: "AI",
    refused: "Niet verzonden",
    tooLarge: "groter dan 1 MB",
    empty: "leeg bestand",
    files: "bestanden",
    passed: "goedgekeurd",
    failed: "afgekeurd",
    fixable: "te corrigeren",
    disclaimer: "Resultaten komen uitsluitend uit de deterministische controles die op de website staan; de uitleg verandert nooit een resultaat. Dit is geen fiscaal of juridisch advies. De inhoud van facturen wordt niet bewaard, alleen bestandsnamen, hashes en regel-id's.",
    error: "Er is iets misgegaan",
    emailSigninH: "Sleutel kwijt?",
    emailSigninP: "Heeft uw werkruimte een bevestigd aanmeldadres, dan sturen we daar een eenmalige link naartoe. Wie zo aanmeldt, krijgt een nieuwe sleutel voor deze browser.",
    email: "E-mailadres",
    sendLink: "Stuur mij een aanmeldlink",
    linkSent: "Als dat adres bij een werkruimte hoort, is er een link onderweg. Hij werkt één keer, gedurende 15 minuten.",
    linkH: "Aanmelden met de link uit uw e-mail",
    linkP: "Druk op de knop om u aan te melden. Dit maakt een nieuwe API-sleutel aan voor deze browser; uw andere sleutels blijven werken.",
    linkBtn: "Aanmelden",
    verifyH: "Bevestig uw aanmeldadres",
    verifyP: "Druk op de knop om dit adres te bevestigen. Daarna kunt u zich aanmelden met een link die naar dit adres wordt gestuurd.",
    verifyBtn: "Adres bevestigen",
    verified: "Adres bevestigd: {email}. Vanaf nu kunt u zich aanmelden met een link per e-mail.",
    toWorkspace: "Naar de werkruimte",
    invalidLink: "Deze link is verlopen of al gebruikt. Vraag een nieuwe aan.",
    emailInUse: "Een andere werkruimte gebruikt dit adres al om aan te melden.",
    emailPanelH: "Aanmeldadres",
    emailPanelP: "Optioneel. Met een bevestigd adres kunt u zich aanmelden met een link als u uw API-sleutel kwijt bent. Het wordt alleen gebruikt voor aanmeldlinks.",
    emailCurrent: "Meldt aan met",
    emailNone: "Nog geen aanmeldadres.",
    emailSave: "Bevestigingslink sturen",
    emailRemove: "Verwijderen",
    confirmEmailRemove: "Het aanmeldadres verwijderen? Al verstuurde links werken dan niet meer.",
    verifySent: "Er is een bevestigingslink gestuurd naar {email}. Hij werkt 24 uur.",
  },
};

const PROFILES = [
  ["auto", "profileAuto"],
  ["", "builtIn"],
  ["xrechnung", "XRechnung"],
  ["peppol", "Peppol BIS 3"],
  ["france", "France (CTC)"],
  ["slovakia", "Slovensko"],
];

// ---------- state ----------

/** @param {Storage | null} s @param {string} k */
const read = (s, k) => {
  try {
    return s?.getItem(k) ?? null;
  } catch {
    return null;
  }
};
/** @param {Storage | null} s @param {string} k @param {string | null} v */
const write = (s, k, v) => {
  try {
    if (v === null) s?.removeItem(k);
    else s?.setItem(k, v);
  } catch {
    /* storage blocked: the session just will not survive a reload */
  }
};
const local = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const session = (() => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
})();

/** @returns {Lang} */
function initialLang() {
  const saved = read(local, "eip.lang");
  if (saved === "de" || saved === "fr" || saved === "en" || saved === "nl" || saved === "pl") return saved;
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return nav === "de" || nav === "fr" || nav === "nl" || nav === "pl" ? nav : "en";
}

const state = {
  /** @type {Lang} */
  lang: initialLang(),
  /** @type {string | null} */
  key: read(session, "eip.key") ?? read(local, "eip.key"),
  /** @type {any} */
  account: null,
  /** @type {any[]} */
  clients: [],
  /** @type {any} */
  client: null,
  /** whether the PDF to e-invoice screen is open */
  convert: false,
  /** @type {number} the dashboard's window */
  dashDays: 30,
  /** @type {string | null} key shown once after sign-up */
  newKey: null,
  /** @type {{ terms?: { version: string, url: string }, privacy?: { version: string, url: string } } | null} */
  legal: null,
  /** whether this server sends sign-in links (GET /v1/signin/options) */
  emailOn: false,
  /** @type {{ kind: "signin" | "verify", token: string } | null} a link opened from an email */
  link: takeLink(),
};

/**
 * A link from an email carries its token in the fragment (#signin=... or #verify=...). Read it
 * once and remove it from the address bar and history, so it is not bookmarked or shared.
 * @returns {{ kind: "signin" | "verify", token: string } | null}
 */
function takeLink() {
  const m = /^#(signin|verify)=([\w-]{20,100})$/.exec(window.location.hash);
  if (!m) return null;
  try {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    /* the token is still only in this tab */
  }
  return { kind: /** @type {"signin" | "verify"} */ (m[1]), token: m[2] };
}

/** @param {keyof typeof T.en} k */
const t = (k) => T[state.lang][k] ?? T.en[k];

// ---------- DOM helpers ----------

/**
 * @param {string} tag @param {Record<string, any>} [attrs] @param {...(Node | string | null | false | undefined)} kids
 * @returns {HTMLElement}
 */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

const main = /** @type {HTMLElement} */ (document.getElementById("app"));

/** @param {...Node} nodes */
function show(...nodes) {
  main.replaceChildren(...nodes);
  document.documentElement.lang = state.lang;
  document.title = t("title");
}

/** @param {unknown} e */
function errorBox(e) {
  const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e);
  return h("p", { class: "error", role: "alert" }, `${t("error")}: ${msg}`);
}

/** @param {string} name @param {string | Uint8Array} content @param {string} type */
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------- API ----------

class ApiError extends Error {
  /** @param {number} status @param {string} code @param {string} message */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** @param {string} method @param {string} path @param {unknown} [body] @param {{ auth?: boolean }} [opts] */
async function api(method, path, body, opts = { auth: true }) {
  /** @type {Record<string, string>} */
  const headers = {};
  if (opts.auth !== false && state.key) headers.authorization = `Bearer ${state.key}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? res.statusText);
  return data;
}

// ---------- chrome ----------

function header() {
  const langs = /** @type {Lang[]} */ (["de", "fr", "en", "nl", "pl"]).map((l) =>
    h(
      "button",
      {
        type: "button",
        class: l === state.lang ? "lang on" : "lang",
        "aria-pressed": l === state.lang ? "true" : "false",
        onclick: () => {
          state.lang = l;
          write(local, "eip.lang", l);
          render();
        },
      },
      l.toUpperCase(),
    ),
  );
  return h(
    "header",
    { class: "top" },
    h("strong", { class: "brand" }, t("title")),
    h("nav", { class: "langs", "aria-label": "Language" }, ...langs),
    state.key && !state.newKey
      ? h(
          "button",
          {
            type: "button",
            class: "link",
            onclick: signOut,
          },
          t("signout"),
        )
      : null,
  );
}

/** A link to a legal page, opened in a new tab so a half-filled form survives. @param {"terms" | "privacy" | "dpa"} k */
const legalLink = (k) =>
  // German and French readers get the translation (the server falls back to English if it has none);
  // the English text governs, as each translation says at the top. Dutch and Polish have no translation: English.
  h("a", { href: state.lang === "de" || state.lang === "fr" ? `/app/${state.lang}/${k}` : `/app/${k}`, target: "_blank", rel: "noopener" }, t(k));

/** Text with {terms} and {privacy} replaced by links. @param {string} text */
function withLegalLinks(text) {
  /** @type {(Node | string)[]} */
  const parts = [];
  for (const piece of text.split(/(\{terms\}|\{privacy\})/)) {
    if (piece === "{terms}") parts.push(legalLink("terms"));
    else if (piece === "{privacy}") parts.push(legalLink("privacy"));
    else if (piece) parts.push(piece);
  }
  return parts;
}

const footer = () =>
  h("footer", {}, h("p", { class: "small" }, t("disclaimer")), h("p", { class: "small" }, legalLink("terms"), " · ", legalLink("privacy"), " · ", legalLink("dpa")));

// ---------- signed out ----------

function signedOut() {
  const signupMsg = h("div");
  const firm = /** @type {HTMLInputElement} */ (h("input", { id: "firm", name: "firm", required: true, maxlength: "200", autocomplete: "organization" }));
  const accept = /** @type {HTMLInputElement} */ (h("input", { id: "accept", type: "checkbox", required: true }));
  const signup = h(
    "form",
    {
      class: "card",
      onsubmit: async (/** @type {SubmitEvent} */ e) => {
        e.preventDefault();
        signupMsg.replaceChildren();
        try {
          const termsVersion = state.legal?.terms?.version;
          const r = await api("POST", "/v1/signup", { name: firm.value, acceptTerms: accept.checked, ...(termsVersion ? { termsVersion } : {}) }, { auth: false });
          state.key = r.apiKey;
          state.newKey = r.apiKey;
          write(session, "eip.key", r.apiKey);
          render();
        } catch (err) {
          if (err instanceof ApiError && err.code === "terms_changed") {
            state.legal = null;
            accept.checked = false;
            loadLegal();
            signupMsg.replaceChildren(h("p", { class: "error", role: "alert" }, t("termsChanged")));
          } else signupMsg.replaceChildren(errorBox(err));
        }
      },
    },
    h("h2", {}, t("signupH")),
    h("p", {}, t("signupP")),
    h("label", { for: "firm" }, t("firm")),
    firm,
    h("label", { class: "check" }, accept, h("span", {}, ...withLegalLinks(t("accept")))),
    h("button", { type: "submit" }, t("create")),
    signupMsg,
  );

  const signinMsg = h("div");
  const key = /** @type {HTMLInputElement} */ (h("input", { id: "key", name: "key", required: true, autocomplete: "current-password", type: "password", spellcheck: "false" }));
  const remember = /** @type {HTMLInputElement} */ (h("input", { type: "checkbox" }));
  const signin = h(
    "form",
    {
      class: "card",
      onsubmit: async (/** @type {SubmitEvent} */ e) => {
        e.preventDefault();
        signinMsg.replaceChildren();
        state.key = key.value.trim();
        try {
          await loadAccount();
          write(remember.checked ? local : session, "eip.key", state.key);
          render();
        } catch (err) {
          state.key = null;
          signinMsg.replaceChildren(errorBox(err));
        }
      },
    },
    h("h2", {}, t("signinH")),
    h("p", {}, t("signinP")),
    h("label", { for: "key" }, t("key")),
    key,
    h("label", { class: "check" }, remember, " ", t("remember")),
    h("button", { type: "submit" }, t("signin")),
    signinMsg,
  );

  if (!state.legal) loadLegal();
  show(header(), h("p", { class: "tagline" }, t("tagline")), h("div", { class: "two" }, signup, h("div", {}, signin, state.emailOn ? emailSigninCard() : null)), footer());
}

/** Ask for a sign-in link. The answer is the same whether or not the address has a workspace. */
function emailSigninCard() {
  const msg = h("div");
  const email = /** @type {HTMLInputElement} */ (h("input", { id: "semail", type: "email", required: true, maxlength: "254", autocomplete: "email" }));
  return h(
    "form",
    {
      class: "card",
      onsubmit: async (/** @type {SubmitEvent} */ e) => {
        e.preventDefault();
        msg.replaceChildren();
        try {
          await api("POST", "/v1/signin/email", { email: email.value, lang: state.lang }, { auth: false });
          msg.replaceChildren(h("p", { class: "small", role: "status" }, t("linkSent")));
        } catch (err) {
          msg.replaceChildren(errorBox(err));
        }
      },
    },
    h("h2", {}, t("emailSigninH")),
    h("p", { class: "small" }, t("emailSigninP")),
    h("label", { for: "semail" }, t("email")),
    email,
    h("button", { type: "submit", class: "secondary" }, t("sendLink")),
    msg,
  );
}

/** A link opened from an email: only the button's POST uses the token, so a mail scanner cannot. */
function linkView() {
  const link = /** @type {{ kind: "signin" | "verify", token: string }} */ (state.link);
  const msg = h("div");
  const done = () => {
    state.link = null;
    render();
  };
  const btn = /** @type {HTMLButtonElement} */ (
    h(
      "button",
      {
        type: "button",
        onclick: async () => {
          msg.replaceChildren();
          btn.disabled = true;
          try {
            if (link.kind === "signin") {
              const r = await api("POST", "/v1/signin/redeem", { token: link.token }, { auth: false });
              state.key = r.apiKey;
              state.newKey = r.apiKey;
              write(session, "eip.key", r.apiKey);
              done();
            } else {
              const r = await api("POST", "/v1/email/verify", { token: link.token }, { auth: false });
              btn.remove();
              msg.replaceChildren(
                h("p", { role: "status" }, t("verified").replace("{email}", r.email)),
                h("button", { type: "button", onclick: done }, t("toWorkspace")),
              );
            }
          } catch (err) {
            const code = err instanceof ApiError ? err.code : "";
            msg.replaceChildren(
              code === "invalid_link" || code === "email_in_use" ? h("p", { class: "error", role: "alert" }, t(code === "invalid_link" ? "invalidLink" : "emailInUse")) : errorBox(err),
              h("button", { type: "button", class: "secondary", onclick: done }, t("toWorkspace")),
            );
            btn.remove();
          }
        },
      },
      t(link.kind === "signin" ? "linkBtn" : "verifyBtn"),
    )
  );
  show(
    header(),
    h("section", { class: "card" }, h("h2", {}, t(link.kind === "signin" ? "linkH" : "verifyH")), h("p", {}, t(link.kind === "signin" ? "linkP" : "verifyP")), btn, msg),
    footer(),
  );
}

/** The current Terms version, sent with sign-up so a change while the page was open is caught. */
async function loadLegal() {
  try {
    state.legal = await api("GET", "/v1/legal", undefined, { auth: false });
  } catch {
    /* an older server: sign-up still records the version it serves */
  }
}

/** Whether this server offers email sign-in (read once, before the first render). */
async function loadOptions() {
  try {
    const o = await api("GET", "/v1/signin/options", undefined, { auth: false });
    state.emailOn = o?.email === true;
  } catch {
    /* an older server: API-key sign-in only */
  }
}

function keyShown() {
  const k = state.newKey ?? "";
  const copyBtn = h("button", { type: "button" }, t("copy"));
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(k);
      copyBtn.textContent = t("copied");
    } catch {
      /* clipboard blocked: the key is still selectable */
    }
  });
  show(
    header(),
    h(
      "section",
      { class: "card" },
      h("h2", {}, t("keyShownH")),
      h("p", {}, t("keyShownP")),
      h("p", {}, h("code", { class: "key" }, k), " ", copyBtn),
      h(
        "button",
        {
          type: "button",
          onclick: () => {
            state.newKey = null;
            render();
          },
        },
        t("saved"),
      ),
    ),
    footer(),
  );
}

// ---------- signed in ----------

async function loadAccount() {
  state.account = await api("GET", "/v1/account");
}

function accountPanel() {
  const a = state.account;
  if (!a) return null;
  const u = a.usage ?? { documents: 0, llmExplanations: 0 };
  const lim = a.plan ?? {};
  /** @param {string} label @param {number} used @param {number} limit */
  const meter = (label, used, limit) =>
    h(
      "div",
      { class: "meter" },
      h("span", {}, `${label}: ${used} / ${limit}`),
      h("progress", { max: "1", value: String(usageShare(used, limit)) }),
    );
  const msg = h("div");
  const upgrades = (a.billing?.plans ?? [])
    .filter((/** @type {any} */ p) => p.key !== a.plan?.key)
    .map((/** @type {any} */ p) =>
      h(
        "button",
        {
          type: "button",
          class: "secondary",
          onclick: async () => {
            msg.replaceChildren();
            if (!a.billing?.available) {
              msg.replaceChildren(h("p", { class: "small" }, t("billingDark")));
              return;
            }
            const email = window.prompt("E-mail");
            if (!email) return;
            try {
              const r = await api("POST", "/v1/billing/checkout", { plan: p.key, email });
              window.location.assign(r.url);
            } catch (err) {
              msg.replaceChildren(errorBox(err));
            }
          },
        },
        `${t("upgrade")}: ${p.name} · ${formatEuro(p.priceCents, state.lang)} ${t(p.metered ? "meteredMinimum" : "perMonth")}`,
      ),
    );
  return h(
    "section",
    { class: "card account" },
    h("p", {}, h("strong", {}, a.account?.name ?? ""), ` · ${t("plan")}: ${lim.name ?? ""}`),
    meter(t("usage"), u.documents ?? 0, lim.documentsPerMonth ?? 0),
    meter(t("explained"), u.llmExplanations ?? 0, lim.llmExplanationsPerMonth ?? 0),
    a.meter ? h("p", { class: "small" }, `${t("meteredSoFar")}: ${formatEuro(a.meter.usageCents ?? 0, state.lang)}`) : null,
    upgrades.length ? h("div", { class: "row" }, ...upgrades) : null,
    msg,
  );
}

/** @param {string | null} iso */
const when = (iso) => (iso ? new Date(iso).toLocaleDateString(state.lang) : t("never"));

/** API keys: list, create (shown once, here), revoke. */
function keysPanel() {
  const section = h("section", { class: "card keys" });
  const msg = h("div");
  const created = h("div");
  const list = h("ul", { class: "clients" });
  const count = h("p", { class: "small" });
  const name = /** @type {HTMLInputElement} */ (h("input", { id: "kname", maxlength: "100" }));
  const createBtn = /** @type {HTMLButtonElement} */ (h("button", { type: "submit" }, t("createKey")));
  const limit = state.account?.plan?.apiKeys;

  async function load() {
    try {
      const rows = keyRows((await api("GET", "/v1/keys")).items, state.key);
      list.replaceChildren(...rows.map(row));
      count.textContent = typeof limit === "number" ? t("keysOf").replace("{n}", String(rows.length)).replace("{m}", String(limit)) : "";
      const ok = canCreateKey(rows.length, limit);
      createBtn.disabled = !ok;
      if (!ok && typeof limit === "number") count.append(" · ", t("keysFull"));
    } catch (e) {
      msg.replaceChildren(errorBox(e));
    }
  }

  /** @param {ReturnType<typeof keyRows>[number]} k */
  function row(k) {
    return h(
      "li",
      {},
      h(
        "span",
        {},
        h("strong", {}, k.name || "key"),
        " · ",
        `${t("keyPrefix")} `,
        h("code", {}, `${k.prefix}…`),
        k.current ? h("span", { class: "badge ok" }, t("thisBrowser")) : null,
        h("span", { class: "small" }, ` · ${t("keyCreated")} ${when(k.createdAt)} · ${t("keyLastUsed")} ${when(k.lastUsedAt)}`),
      ),
      h(
        "button",
        {
          type: "button",
          class: "secondary",
          onclick: async () => {
            if (!window.confirm(k.current ? t("confirmRevokeCurrent") : t("confirmRevoke"))) return;
            msg.replaceChildren();
            try {
              await api("DELETE", `/v1/keys/${encodeURIComponent(k.id)}`);
              if (k.current) return signOut();
              await load();
            } catch (err) {
              msg.replaceChildren(errorBox(err));
            }
          },
        },
        t("revoke"),
      ),
    );
  }

  const form = h(
    "form",
    {
      class: "row",
      onsubmit: async (/** @type {SubmitEvent} */ e) => {
        e.preventDefault();
        msg.replaceChildren();
        created.replaceChildren();
        try {
          const r = await api("POST", "/v1/keys", { name: name.value.trim() || "key" });
          name.value = "";
          const copyBtn = h("button", { type: "button", class: "secondary" }, t("copy"));
          copyBtn.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(r.apiKey);
              copyBtn.textContent = t("copied");
            } catch {
              /* clipboard blocked: the key is still selectable */
            }
          });
          created.replaceChildren(
            h("div", { class: "card", role: "status" }, h("strong", {}, t("keyCreatedH")), h("p", { class: "small" }, t("keyShownP")), h("p", {}, h("code", { class: "key" }, r.apiKey), " ", copyBtn)),
          );
          await load();
        } catch (err) {
          msg.replaceChildren(errorBox(err));
        }
      },
    },
    h("label", { for: "kname" }, t("keyName"), name),
    createBtn,
  );

  section.append(h("h2", {}, t("keysH")), h("p", { class: "small" }, t("keysP")), list, count, form, created, msg);
  load();
  return section;
}

/** The optional sign-in address: show it, send a confirmation link to a new one, remove it. */
function emailPanel() {
  const current = state.account?.account?.email ?? null;
  const msg = h("div");
  const email = /** @type {HTMLInputElement} */ (h("input", { id: "aemail", type: "email", required: true, maxlength: "254", autocomplete: "email" }));
  const form = h(
    "form",
    {
      class: "row",
      onsubmit: async (/** @type {SubmitEvent} */ e) => {
        e.preventDefault();
        msg.replaceChildren();
        try {
          const r = await api("POST", "/v1/account/email", { email: email.value, lang: state.lang });
          email.value = "";
          msg.replaceChildren(h("p", { class: "small", role: "status" }, r.verified ? `${t("emailCurrent")} ${r.email}` : t("verifySent").replace("{email}", r.email)));
        } catch (err) {
          msg.replaceChildren(errorBox(err));
        }
      },
    },
    h("label", { for: "aemail" }, t("email"), email),
    h("button", { type: "submit", class: "secondary" }, t("emailSave")),
  );
  const remove = current
    ? h(
        "button",
        {
          type: "button",
          class: "secondary",
          onclick: async () => {
            if (!window.confirm(t("confirmEmailRemove"))) return;
            msg.replaceChildren();
            try {
              await api("DELETE", "/v1/account/email");
              await clientsView();
            } catch (err) {
              msg.replaceChildren(errorBox(err));
            }
          },
        },
        t("emailRemove"),
      )
    : null;
  return h(
    "section",
    { class: "card" },
    h("h2", {}, t("emailPanelH")),
    h("p", { class: "small" }, t("emailPanelP")),
    h("p", {}, current ? h("span", {}, `${t("emailCurrent")} `, h("strong", {}, current), " ") : t("emailNone"), remove),
    form,
    msg,
  );
}

function signOut() {
  state.key = null;
  state.account = null;
  state.client = null;
  write(session, "eip.key", null);
  write(local, "eip.key", null);
  render();
}

/** The cross-client overview (GET /v1/dashboard): attention first, with a CSV for the practice's own records. */
function dashboardPanel() {
  const section = h("section", { class: "card dash" });
  const body = h("div");
  const STATUS = /** @type {const} */ ({ attention: ["bad", "stAttention"], ok: ["ok", "stOk"], idle: ["warn", "stIdle"], never: ["none", "stNever"] });
  const days = /** @type {HTMLSelectElement} */ (
    h("select", { id: "dashdays", onchange: () => { state.dashDays = Number(days.value) || 30; load(); } }, ...[7, 30, 90, 365].map((n) => h("option", { value: String(n), selected: n === state.dashDays }, `${n} ${t("days")}`)))
  );
  const csv = h(
    "button",
    {
      type: "button",
      class: "secondary",
      onclick: async () => {
        try {
          const res = await fetch(`/v1/dashboard?format=csv&days=${state.dashDays}&lang=${state.lang}`, { headers: { authorization: `Bearer ${state.key}` } });
          if (!res.ok) throw new ApiError(res.status, "error", res.statusText);
          const name = /filename="([\w.-]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "clients.csv";
          const text = await res.text(); // drops the BOM, which Excel needs to read umlauts and accents as UTF-8
          download(name, text.startsWith("\uFEFF") ? text : `\uFEFF${text}`, "text/csv;charset=utf-8");
        } catch (e) {
          body.prepend(errorBox(e));
        }
      },
    },
    t("dashCsv"),
  );
  /** @param {string} s @param {Record<string, string | number>} v */
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
  /** @param {number | null} r */
  const pct = (r) => (r === null || r === undefined ? "–" : `${Math.round(r * 100)} %`);

  async function load() {
    try {
      const d = await api("GET", `/v1/dashboard?days=${state.dashDays}`);
      if (!d.clients.length) return body.replaceChildren(h("p", {}, t("noClients")));
      const rows = d.clients.map((/** @type {any} */ c) => {
        const [cls, label] = STATUS[/** @type {keyof typeof STATUS} */ (c.status)] ?? STATUS.never;
        const open = c.openFiles?.length
          ? h("details", {}, h("summary", {}, String(c.open)), h("ul", { class: "small" }, ...c.openFiles.map((/** @type {any} */ f) => h("li", {}, `${f.file}${f.rules.length ? ` · ${f.rules.join(", ")}` : ""}`))))
          : String(c.open);
        return h(
          "tr",
          {},
          h(
            "td",
            {},
            h("button", { type: "button", class: "link", onclick: () => { state.client = state.clients.find((x) => x.id === c.id) ?? c; render(); } }, c.name),
            c.reference ? h("span", { class: "small" }, ` · ${c.reference}`) : "",
          ),
          h("td", {}, h("span", { class: `badge ${cls}` }, t(label))),
          h("td", {}, c.lastCheckedAt ? new Date(c.lastCheckedAt).toLocaleDateString(state.lang) : "–"),
          h("td", { class: "num" }, String(c.files)),
          h("td", { class: "num" }, pct(c.passRate)),
          h("td", { class: "num" }, open),
          h("td", { class: "small" }, c.topRules.map((/** @type {any} */ r) => `${r.rule} (${r.files})`).join(", ")),
        );
      });
      const tt = d.totals;
      body.replaceChildren(
        h("p", {}, fill(t("dashTotals"), { c: tt.clients, f: tt.files, o: tt.open, a: tt.attention })),
        h(
          "div",
          { class: "dash-wrap" },
          h(
            "table",
            { class: "dash" },
            h("thead", {}, h("tr", {}, ...[t("clientName"), "", t("lastChecked"), t("invoices"), t("passRate"), t("stillFailing"), t("topRules")].map((x) => h("th", { scope: "col" }, x)))),
            h("tbody", {}, ...rows),
          ),
        ),
      );
    } catch (e) {
      body.replaceChildren(errorBox(e));
    }
  }
  section.append(
    h("h2", {}, t("dashH")),
    h("p", { class: "small" }, t("dashP")),
    h("div", { class: "row" }, h("label", { for: "dashdays" }, `${t("dashDays")} `), days, csv),
    body,
  );
  load();
  return section;
}

async function clientsView() {
  const msg = h("div");
  try {
    await loadAccount();
    state.clients = (await api("GET", "/v1/clients")).items ?? [];
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      state.key = null;
      write(session, "eip.key", null);
      write(local, "eip.key", null);
      return render();
    }
    msg.replaceChildren(errorBox(e));
  }
  const name = /** @type {HTMLInputElement} */ (h("input", { id: "cname", required: true, maxlength: "200" }));
  const country = /** @type {HTMLInputElement} */ (h("input", { id: "ccountry", maxlength: "2", size: "3" }));
  const vat = /** @type {HTMLInputElement} */ (h("input", { id: "cvat", maxlength: "30" }));
  const ref = /** @type {HTMLInputElement} */ (h("input", { id: "cref", maxlength: "100" }));
  const add = h(
    "form",
    {
      class: "card",
      onsubmit: async (/** @type {SubmitEvent} */ e) => {
        e.preventDefault();
        msg.replaceChildren();
        try {
          await api("POST", "/v1/clients", { name: name.value, country: country.value, vatId: vat.value, reference: ref.value });
          await clientsView();
        } catch (err) {
          msg.replaceChildren(errorBox(err));
        }
      },
    },
    h("h2", {}, t("addClient")),
    h(
      "div",
      { class: "grid" },
      h("label", { for: "cname" }, t("clientName"), name),
      h("label", { for: "ccountry" }, t("country"), country),
      h("label", { for: "cvat" }, t("vatId"), vat),
      h("label", { for: "cref" }, t("reference"), ref),
    ),
    h("button", { type: "submit" }, t("addClient")),
  );
  const list = state.clients.length
    ? h(
        "ul",
        { class: "clients" },
        ...state.clients.map((c) =>
          h(
            "li",
            {},
            h("span", {}, h("strong", {}, c.name), c.country ? ` · ${c.country}` : "", c.vatId ? ` · ${c.vatId}` : "", c.reference ? ` · ${c.reference}` : ""),
            h(
              "span",
              { class: "row" },
              h(
                "button",
                {
                  type: "button",
                  onclick: () => {
                    state.client = c;
                    render();
                  },
                },
                t("open"),
              ),
              h(
                "button",
                {
                  type: "button",
                  class: "secondary",
                  onclick: async () => {
                    if (!window.confirm(t("confirmDelete"))) return;
                    try {
                      await api("DELETE", `/v1/clients/${encodeURIComponent(c.id)}`);
                      await clientsView();
                    } catch (err) {
                      msg.replaceChildren(errorBox(err));
                    }
                  },
                },
                t("delete"),
              ),
            ),
          ),
        ),
      )
    : h("p", {}, t("noClients"));
  show(header(), accountPanel() ?? "", msg, convertCard(), state.clients.length ? dashboardPanel() : "", h("section", { class: "card" }, h("h2", {}, t("clients")), list), add, state.account ? keysPanel() : "", state.account && state.emailOn ? emailPanel() : "", footer());
}

/** @param {any} r one batch result */
/** Which rule sets produced a result, as the API reports them. @param {any} r */
function rulesRunText(r) {
  const named = PROFILES.find(([v]) => v && v !== "auto" && v === r.profile)?.[1];
  const parts = [named ? `${t("builtIn")} + ${named}${r.profileDetected ? ` (${t("detected")})` : ""}` : t("builtIn")];
  if (r.schematron === "ok") parts.push(t("officialOk"));
  else if (r.schematron) parts.push(t("officialMissing"));
  return parts.join("; ");
}

function resultCard(r) {
  const s = summarizeResult(r);
  const badge = h("span", { class: s.status === "pass" ? "badge ok" : "badge bad" }, s.status === "pass" ? t("pass") : t("fail"));
  const rows = s.rows.map((row) =>
    h(
      "li",
      { class: row.blocking ? "finding blocking" : "finding" },
      h("p", {}, h("code", {}, row.rule), " ", row.blocking ? "" : `(${row.severity}) `, h("strong", {}, row.title || row.message)),
      row.action ? h("p", {}, row.action) : null,
      row.title ? h("p", { class: "small" }, row.message) : null,
      row.source === "llm" || row.notice ? h("p", { class: "small notice" }, row.source === "llm" ? `${t("ai")}: ` : "", row.notice) : null,
    ),
  );
  const fixBlock = s.fixedContent
    ? h(
        "div",
        { class: "fixes" },
        h("p", {}, h("strong", {}, `${t("fixesApplied")}: `), s.fixes.map((f) => `${f.id} (${f.resolves.join(", ")})`).join("; ")),
        h("p", { class: s.fixedStatus === "pass" ? "ok" : "warn" }, s.fixedStatus === "pass" ? t("fixedPass") : t("fixedFail")),
        h(
          "div",
          { class: "row" },
          h("button", { type: "button", onclick: () => download(fixedName(s.file), s.fixedContent ?? "", "application/xml") }, t("fixedFile")),
          h("button", { type: "button", class: "secondary", onclick: () => download(diffName(s.file), s.diff ?? "", "text/x-diff") }, t("diff")),
        ),
        h("details", {}, h("summary", {}, "diff"), h("pre", { class: "diff" }, s.diff ?? "")),
      )
    : null;
  const skipped = s.skipped.length
    ? h("details", {}, h("summary", {}, t("notFixed")), h("ul", {}, ...s.skipped.map((k) => h("li", { class: "small" }, `${k.id}: ${k.reason}`))))
    : null;
  return h(
    "article",
    { class: "card result" },
    h("h3", {}, badge, " ", s.file, h("span", { class: "small" }, ` · ${s.blocking} ${t("blocking")}, ${s.warnings} ${t("warnings")}`)),
    h("p", { class: "small" }, `${t("rulesRun")}: ${rulesRunText(r)}`),
    rows.length ? h("ul", { class: "findings" }, ...rows) : null,
    fixBlock,
    skipped,
  );
}

/** @param {any} run */
function runRow(run) {
  const tt = run.totals ?? {};
  const when = new Date(run.createdAt ?? Date.now()).toLocaleString(state.lang);
  return h(
    "li",
    {},
    h("span", {}, when),
    h("span", { class: "small" }, ` · ${tt.files ?? 0} ${t("files")}: ${tt.passed ?? 0} ${t("passed")}, ${tt.failed ?? 0} ${t("failed")}, ${tt.fixable ?? 0} ${t("fixable")}`),
    h("ul", { class: "small" }, ...(run.files ?? []).map((/** @type {any} */ f) => h("li", {}, `${f.status === "pass" ? "✓" : "✗"} ${f.file}${f.origin === "convert" ? ` · ${ct("fromConvert")}` : ""}${f.rules?.length ? ` · ${f.rules.join(", ")}` : ""}`))),
  );
}

async function clientView() {
  const c = state.client;
  const results = h("div", { class: "results" });
  const historyList = h("ul", { class: "history" });
  const msg = h("div");

  async function loadHistory() {
    try {
      const r = await api("GET", `/v1/clients/${encodeURIComponent(c.id)}/history?limit=20`);
      const items = r.items ?? [];
      historyList.replaceChildren(...(items.length ? items.map(runRow) : [h("li", {}, t("noHistory"))]));
    } catch (e) {
      historyList.replaceChildren(h("li", {}, errorBox(e)));
    }
  }

  const input = /** @type {HTMLInputElement} */ (h("input", { type: "file", multiple: true, accept: ".xml,.pdf,application/xml,text/xml,application/pdf", class: "visually-hidden", id: "files" }));
  const lang = /** @type {HTMLSelectElement} */ (
    h("select", { id: "elang" }, ...["de", "fr", "en", "nl", "pl"].map((l) => h("option", { value: l, selected: l === state.lang }, l.toUpperCase())))
  );
  const profile = /** @type {HTMLSelectElement} */ (
    h("select", { id: "profile" }, ...PROFILES.map(([v, label]) => h("option", { value: v }, v === "auto" || v === "" ? t(/** @type {any} */ (label)) : label)))
  );
  const fix = /** @type {HTMLInputElement} */ (h("input", { type: "checkbox", checked: true }));
  const status = h("p", { class: "small", "aria-live": "polite" });

  /** @param {File[]} files */
  async function run(files) {
    if (!files.length) return;
    msg.replaceChildren();
    results.replaceChildren();
    const plan = planBatches(files);
    for (const r of plan.refused) results.append(h("p", { class: "warn" }, `${t("refused")}: ${r.file.name} (${r.reason === "empty" ? t("empty") : t("tooLarge")})`));
    status.textContent = t("checking");
    try {
      for (const batch of plan.batches) {
        const documents = [];
        for (const f of batch) documents.push({ name: f.name, content: toBase64(new Uint8Array(await f.arrayBuffer())), encoding: "base64" });
        // schematron=1: the official EN 16931 (and XRechnung / Peppol) Schematron where the server has it.
        const q = new URLSearchParams({ lang: lang.value, profile: profile.value, fix: fix.checked ? "1" : "0", schematron: "1" });
        const r = await api("POST", `/v1/clients/${encodeURIComponent(c.id)}/batches?${q}`, { documents });
        for (const one of r.results ?? []) results.append(resultCard(one));
      }
    } catch (e) {
      msg.replaceChildren(errorBox(e));
    }
    status.textContent = "";
    input.value = "";
    await loadHistory();
    try {
      await loadAccount();
      acct.replaceWith((acct = accountPanel() ?? h("div")));
    } catch {
      /* usage shown on next load */
    }
  }

  input.addEventListener("change", () => run([...(input.files ?? [])]));
  const zone = h(
    "label",
    { class: "drop", for: "files" },
    h("span", {}, t("drop")),
    h("span", { class: "button" }, t("choose")),
  );
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    run([...(e.dataTransfer?.files ?? [])]);
  });

  let acct = accountPanel() ?? h("div");
  show(
    header(),
    h(
      "p",
      {},
      h(
        "button",
        {
          type: "button",
          class: "link",
          onclick: () => {
            state.client = null;
            render();
          },
        },
        `← ${t("back")}`,
      ),
    ),
    acct,
    h(
      "section",
      { class: "card" },
      h("h2", {}, c.name, c.country ? ` · ${c.country}` : "", c.vatId ? ` · ${c.vatId}` : ""),
      h(
        "div",
        { class: "row options" },
        h("label", { for: "elang" }, `${t("lang")} `, lang),
        h("label", { for: "profile" }, `${t("profile")} `, profile),
        h("label", { class: "check" }, fix, " ", t("fix")),
      ),
      zone,
      input,
      status,
    ),
    msg,
    results,
    h("section", { class: "card" }, h("h2", {}, t("history")), historyList),
    footer(),
  );
  await loadHistory();
}

// ---------- PDF to e-invoice (pro/README.md, "PDF to ZUGFeRD") ----------

/** The convert screen's texts. The Polish is the agent's, not yet read by a native speaker. */
const CT = {
  en: {
    convertH: "PDF to e-invoice",
    convertP: "Drop a PDF invoice made in Word, Excel or an older invoicing program. Every value is read from the page, never guessed: you confirm the marked ones, fill in what is missing, and download a Factur-X / ZUGFeRD, XRechnung or UBL file that has been through the checks.",
    convertOpen: "Convert a PDF",
    convertDrop: "Drop one PDF invoice here or choose a file (up to 5 MB)",
    convertNote: "The PDF is read in memory and not stored. Reading is free; building and checking the e-invoice counts as one checked invoice.",
    reading: "Reading…",
    gInvoice: "Invoice", gSeller: "Seller (you or your client)", gBuyer: "Buyer", gPayment: "Payment", gLines: "Lines",
    fromPdf: "page {p}: “{line}”",
    notOnPdf: "not on the PDF",
    confirm: "confirm",
    needed: "needed",
    toConfirm: "{n} marked values still to confirm or correct.",
    format: "File",
    fFacturx: "Factur-X / ZUGFeRD (PDF)", fCii: "CII XML", fUbl: "UBL XML",
    convProfile: "Profile",
    build: "Build and check",
    building: "Building and checking…",
    download: "Download e-invoice",
    endpointHint: "e-mail or Peppol ID (0204:…)",
    badEndpoint: "not an e-mail address or a Peppol ID such as 0204:991-01234-56",
    mismatch: "{what}: the PDF prints {pdf}, the e-invoice adds up to {ein}. Correct the lines or rates before sending.",
    totNet: "Net total", totVat: "VAT", totGross: "Total",
    blockedConfirm: "Confirm or correct the marked values to download the file.",
    blockedTotals: "The e-invoice must carry the same amounts as the PDF you sent.",
    buildErrors: "The e-invoice cannot be written yet:",
    builtWarnings: "The profile also asks for:",
    noText: "This PDF has no text layer (a scan). Scans are not read yet: type the invoice into the generator instead.",
    encrypted: "This PDF is encrypted and cannot be read.",
    unreadable: "This PDF could not be read.",
    already: "This PDF already carries an e-invoice (XML inside). Check it in a client's batch instead; the values below are only what its page shows.",
    checksH: "Read against the PDF's own totals",
    addLine: "Add line", removeLine: "Remove",
    lDescription: "Description", lQuantity: "Qty", lUnit: "Unit", lUnit_price: "Unit price", lTax_percent: "VAT %",
    gAdjust: "Discounts and charges on the whole invoice", aAllowance: "Discount", aCharge: "Charge", lReason: "Reason", lAmount: "Amount",
    lDiscount: "Discount", discountHint: "10 % or 5.00", badDiscount: "Type a percent (10 %) or an amount above 0.",
    stale: "Changed since the last build: build again to download.",
    another: "Convert another PDF",
    saveTo: "Keep in a client's history",
    saveChoose: "choose a client",
    save: "Save to history",
    saving: "Saving…",
    saved: "Saved to {name}'s history. The download button now gives the saved file.",
    openClient: "Open {name}",
    saveNoClients: "Add a client on the main screen to keep converted invoices in its history.",
    fromConvert: "converted from a PDF",
    tooLargePdf: "larger than 5 MB",
  },
  de: {
    convertH: "PDF zur E-Rechnung",
    convertP: "Legen Sie eine PDF-Rechnung aus Word, Excel oder einem älteren Rechnungsprogramm ab. Jeder Wert wird von der Seite gelesen, nie geraten: Sie bestätigen die markierten Werte, ergänzen, was fehlt, und laden eine geprüfte Factur-X-/ZUGFeRD-, XRechnung- oder UBL-Datei herunter.",
    convertOpen: "PDF umwandeln",
    convertDrop: "Eine PDF-Rechnung hier ablegen oder Datei wählen (bis 5 MB)",
    convertNote: "Das PDF wird im Arbeitsspeicher gelesen und nicht gespeichert. Das Lesen ist kostenlos; Erstellen und Prüfen der E-Rechnung zählt als eine geprüfte Rechnung.",
    reading: "Wird gelesen…",
    gInvoice: "Rechnung", gSeller: "Verkäufer (Sie oder Ihr Mandant)", gBuyer: "Käufer", gPayment: "Zahlung", gLines: "Positionen",
    fromPdf: "Seite {p}: „{line}“",
    notOnPdf: "nicht im PDF",
    confirm: "bestätigen",
    needed: "erforderlich",
    toConfirm: "Noch {n} markierte Werte zu bestätigen oder zu korrigieren.",
    format: "Datei",
    fFacturx: "Factur-X / ZUGFeRD (PDF)", fCii: "CII-XML", fUbl: "UBL-XML",
    convProfile: "Profil",
    build: "Erstellen und prüfen",
    building: "Wird erstellt und geprüft…",
    download: "E-Rechnung herunterladen",
    endpointHint: "E-Mail oder Peppol-ID (0204:…)",
    badEndpoint: "keine E-Mail-Adresse und keine Peppol-ID wie 0204:991-01234-56",
    mismatch: "{what}: Das PDF weist {pdf} aus, die E-Rechnung ergibt {ein}. Korrigieren Sie Positionen oder Steuersätze vor dem Versand.",
    totNet: "Nettobetrag", totVat: "USt", totGross: "Gesamtbetrag",
    blockedConfirm: "Bestätigen oder korrigieren Sie die markierten Werte, um die Datei herunterzuladen.",
    blockedTotals: "Die E-Rechnung muss dieselben Beträge wie das versandte PDF enthalten.",
    buildErrors: "Die E-Rechnung kann noch nicht erstellt werden:",
    builtWarnings: "Das Profil verlangt außerdem:",
    noText: "Dieses PDF hat keine Textebene (ein Scan). Scans werden noch nicht gelesen: Geben Sie die Rechnung stattdessen im Generator ein.",
    encrypted: "Dieses PDF ist verschlüsselt und kann nicht gelesen werden.",
    unreadable: "Dieses PDF konnte nicht gelesen werden.",
    already: "Dieses PDF enthält bereits eine E-Rechnung (XML). Prüfen Sie es stattdessen im Stapel eines Mandanten; die Werte unten zeigen nur die Seite.",
    checksH: "Abgleich mit den Summen im PDF",
    addLine: "Position hinzufügen", removeLine: "Entfernen",
    lDescription: "Bezeichnung", lQuantity: "Menge", lUnit: "Einheit", lUnit_price: "Einzelpreis", lTax_percent: "USt %",
    gAdjust: "Rabatte und Zuschläge auf die ganze Rechnung", aAllowance: "Rabatt", aCharge: "Zuschlag", lReason: "Grund", lAmount: "Betrag",
    lDiscount: "Rabatt", discountHint: "10 % oder 5,00", badDiscount: "Prozent (10 %) oder einen Betrag über 0 eingeben.",
    stale: "Seit der letzten Erstellung geändert: erneut erstellen, um herunterzuladen.",
    another: "Weiteres PDF umwandeln",
    saveTo: "Im Verlauf eines Mandanten ablegen",
    saveChoose: "Mandant wählen",
    save: "Im Verlauf speichern",
    saving: "Wird gespeichert…",
    saved: "Im Verlauf von {name} gespeichert. Die Download-Schaltfläche liefert jetzt die gespeicherte Datei.",
    openClient: "{name} öffnen",
    saveNoClients: "Legen Sie auf der Startseite einen Mandanten an, um umgewandelte Rechnungen in seinem Verlauf zu behalten.",
    fromConvert: "aus einem PDF umgewandelt",
    tooLargePdf: "größer als 5 MB",
  },
  fr: {
    convertH: "PDF vers facture électronique",
    convertP: "Déposez une facture PDF issue de Word, d'Excel ou d'un ancien logiciel de facturation. Chaque valeur est lue sur la page, jamais devinée : vous confirmez celles qui sont signalées, complétez ce qui manque et téléchargez un fichier Factur-X / ZUGFeRD, XRechnung ou UBL contrôlé.",
    convertOpen: "Convertir un PDF",
    convertDrop: "Déposez une facture PDF ici ou choisissez un fichier (5 Mo max.)",
    convertNote: "Le PDF est lu en mémoire et n'est pas conservé. La lecture est gratuite ; créer et contrôler la facture électronique compte pour une facture contrôlée.",
    reading: "Lecture…",
    gInvoice: "Facture", gSeller: "Vendeur (vous ou votre client)", gBuyer: "Acheteur", gPayment: "Paiement", gLines: "Lignes",
    fromPdf: "page {p} : « {line} »",
    notOnPdf: "absent du PDF",
    confirm: "confirmer",
    needed: "requis",
    toConfirm: "Encore {n} valeurs signalées à confirmer ou corriger.",
    format: "Fichier",
    fFacturx: "Factur-X / ZUGFeRD (PDF)", fCii: "XML CII", fUbl: "XML UBL",
    convProfile: "Profil",
    build: "Créer et contrôler",
    building: "Création et contrôle…",
    download: "Télécharger la facture électronique",
    endpointHint: "e-mail ou identifiant Peppol (0204:…)",
    badEndpoint: "ni une adresse e-mail ni un identifiant Peppol comme 0204:991-01234-56",
    mismatch: "{what} : le PDF indique {pdf}, la facture électronique donne {ein}. Corrigez les lignes ou les taux avant l'envoi.",
    totNet: "Total HT", totVat: "TVA", totGross: "Total TTC",
    blockedConfirm: "Confirmez ou corrigez les valeurs signalées pour télécharger le fichier.",
    blockedTotals: "La facture électronique doit porter les mêmes montants que le PDF envoyé.",
    buildErrors: "La facture électronique ne peut pas encore être créée :",
    builtWarnings: "Le profil demande aussi :",
    noText: "Ce PDF n'a pas de couche texte (un scan). Les scans ne sont pas encore lus : saisissez la facture dans le générateur.",
    encrypted: "Ce PDF est chiffré et ne peut pas être lu.",
    unreadable: "Ce PDF n'a pas pu être lu.",
    already: "Ce PDF contient déjà une facture électronique (XML). Contrôlez-le plutôt dans le lot d'un client ; les valeurs ci-dessous ne reflètent que la page.",
    checksH: "Comparaison avec les totaux du PDF",
    addLine: "Ajouter une ligne", removeLine: "Retirer",
    lDescription: "Désignation", lQuantity: "Qté", lUnit: "Unité", lUnit_price: "Prix unitaire", lTax_percent: "TVA %",
    gAdjust: "Remises et frais sur toute la facture", aAllowance: "Remise", aCharge: "Frais", lReason: "Motif", lAmount: "Montant",
    lDiscount: "Remise", discountHint: "10 % ou 5,00", badDiscount: "Saisissez un pourcentage (10 %) ou un montant supérieur à 0.",
    stale: "Modifié depuis la dernière création : créez à nouveau pour télécharger.",
    another: "Convertir un autre PDF",
    saveTo: "Conserver dans l'historique d'un client",
    saveChoose: "choisir un client",
    save: "Enregistrer dans l'historique",
    saving: "Enregistrement…",
    saved: "Enregistré dans l'historique de {name}. Le bouton de téléchargement fournit désormais le fichier enregistré.",
    openClient: "Ouvrir {name}",
    saveNoClients: "Ajoutez un client sur l'écran principal pour conserver les factures converties dans son historique.",
    fromConvert: "converti depuis un PDF",
    tooLargePdf: "plus de 5 Mo",
  },
  pl: {
    convertH: "PDF na e-fakturę",
    convertP: "Upuść fakturę PDF z Worda, Excela lub starszego programu do fakturowania. Każda wartość jest odczytywana ze strony, nigdy zgadywana: potwierdzasz oznaczone wartości, uzupełniasz brakujące i pobierasz sprawdzony plik Factur-X / ZUGFeRD, XRechnung lub UBL.",
    convertOpen: "Konwertuj PDF",
    convertDrop: "Upuść tutaj jedną fakturę PDF lub wybierz plik (do 5 MB)",
    convertNote: "PDF jest odczytywany w pamięci i nie jest przechowywany. Odczyt jest bezpłatny; utworzenie i sprawdzenie e-faktury liczy się jako jedna sprawdzona faktura.",
    reading: "Odczyt…",
    gInvoice: "Faktura", gSeller: "Sprzedawca (Ty lub Twój klient)", gBuyer: "Nabywca", gPayment: "Płatność", gLines: "Pozycje",
    fromPdf: "strona {p}: „{line}”",
    notOnPdf: "brak w PDF",
    confirm: "potwierdź",
    needed: "wymagane",
    toConfirm: "Pozostało {n} oznaczonych wartości do potwierdzenia lub poprawienia.",
    format: "Plik",
    fFacturx: "Factur-X / ZUGFeRD (PDF)", fCii: "XML CII", fUbl: "XML UBL",
    convProfile: "Profil",
    build: "Utwórz i sprawdź",
    building: "Tworzenie i sprawdzanie…",
    download: "Pobierz e-fakturę",
    endpointHint: "e-mail lub identyfikator Peppol (0204:…)",
    badEndpoint: "to nie jest adres e-mail ani identyfikator Peppol, np. 0204:991-01234-56",
    mismatch: "{what}: PDF podaje {pdf}, e-faktura daje {ein}. Popraw pozycje lub stawki przed wysłaniem.",
    totNet: "Razem netto", totVat: "VAT", totGross: "Razem brutto",
    blockedConfirm: "Potwierdź lub popraw oznaczone wartości, aby pobrać plik.",
    blockedTotals: "E-faktura musi zawierać te same kwoty co wysłany PDF.",
    buildErrors: "Nie można jeszcze utworzyć e-faktury:",
    builtWarnings: "Profil wymaga też:",
    noText: "Ten PDF nie ma warstwy tekstowej (skan). Skany nie są jeszcze odczytywane.",
    encrypted: "Ten PDF jest zaszyfrowany i nie można go odczytać.",
    unreadable: "Nie udało się odczytać tego PDF.",
    already: "Ten PDF zawiera już e-fakturę (XML). Sprawdź go w partii klienta; poniższe wartości pochodzą tylko ze strony.",
    checksH: "Porównanie z sumami w PDF",
    addLine: "Dodaj pozycję", removeLine: "Usuń",
    lDescription: "Opis", lQuantity: "Ilość", lUnit: "Jedn.", lUnit_price: "Cena jedn.", lTax_percent: "VAT %",
    gAdjust: "Rabaty i opłaty do całej faktury", aAllowance: "Rabat", aCharge: "Opłata", lReason: "Powód", lAmount: "Kwota",
    lDiscount: "Rabat", discountHint: "10 % lub 5,00", badDiscount: "Wpisz procent (10 %) lub kwotę większą od 0.",
    stale: "Zmieniono od ostatniego utworzenia: utwórz ponownie, aby pobrać.",
    another: "Konwertuj kolejny PDF",
    saveTo: "Zachowaj w historii klienta",
    saveChoose: "wybierz klienta",
    save: "Zapisz w historii",
    saving: "Zapisywanie…",
    saved: "Zapisano w historii klienta {name}. Przycisk pobierania zwraca teraz zapisany plik.",
    openClient: "Otwórz {name}",
    saveNoClients: "Dodaj klienta na ekranie głównym, aby przechowywać przekonwertowane faktury w jego historii.",
    fromConvert: "przekonwertowano z PDF",
    tooLargePdf: "większy niż 5 MB",
  },
  nl: {
    convertH: "Van pdf naar e-factuur",
    convertP: "Sleep een pdf-factuur hierheen die in Word, Excel of een ouder factuurprogramma is gemaakt. Elke waarde wordt van de pagina gelezen, nooit geraden: u bevestigt de gemarkeerde waarden, vult aan wat ontbreekt en downloadt een Factur-X / ZUGFeRD-, XRechnung- of UBL-bestand dat door de controles is gegaan.",
    convertOpen: "Een pdf omzetten",
    convertDrop: "Sleep één pdf-factuur hierheen of kies een bestand (maximaal 5 MB)",
    convertNote: "De pdf wordt in het geheugen gelezen en niet bewaard. Lezen is gratis; het opbouwen en controleren van de e-factuur telt als één gecontroleerde factuur.",
    reading: "Bezig met lezen…",
    gInvoice: "Factuur", gSeller: "Verkoper (u of uw klant)", gBuyer: "Koper", gPayment: "Betaling", gLines: "Regels",
    fromPdf: "pagina {p}: “{line}”",
    notOnPdf: "niet op de pdf",
    confirm: "bevestigen",
    needed: "verplicht",
    toConfirm: "Nog {n} gemarkeerde waarden te bevestigen of te corrigeren.",
    format: "Bestand",
    fFacturx: "Factur-X / ZUGFeRD (pdf)", fCii: "CII-XML", fUbl: "UBL-XML",
    convProfile: "Profiel",
    build: "Opbouwen en controleren",
    building: "Bezig met opbouwen en controleren…",
    download: "E-factuur downloaden",
    endpointHint: "e-mail of Peppol-ID (0106:…, 0208:…)",
    badEndpoint: "geen e-mailadres en geen Peppol-ID zoals 0208:0123456749",
    mismatch: "{what}: de pdf vermeldt {pdf}, de e-factuur komt uit op {ein}. Corrigeer de regels of tarieven voordat u verstuurt.",
    totNet: "Totaal excl. btw", totVat: "Btw", totGross: "Totaal",
    blockedConfirm: "Bevestig of corrigeer de gemarkeerde waarden om het bestand te downloaden.",
    blockedTotals: "De e-factuur moet dezelfde bedragen bevatten als de pdf die u hebt gestuurd.",
    buildErrors: "De e-factuur kan nog niet worden aangemaakt:",
    builtWarnings: "Het profiel vraagt ook om:",
    noText: "Deze pdf heeft geen tekstlaag (een scan). Scans worden nog niet gelezen: voer de factuur in plaats daarvan in de generator in.",
    encrypted: "Deze pdf is versleuteld en kan niet worden gelezen.",
    unreadable: "Deze pdf kon niet worden gelezen.",
    already: "Deze pdf bevat al een e-factuur (XML erin). Controleer hem liever in een batch van een klant; de waarden hieronder zijn alleen wat de pagina laat zien.",
    checksH: "Gecontroleerd tegen de totalen op de pdf zelf",
    addLine: "Regel toevoegen", removeLine: "Verwijderen",
    lDescription: "Omschrijving", lQuantity: "Aantal", lUnit: "Eenheid", lUnit_price: "Prijs per eenheid", lTax_percent: "Btw %",
    gAdjust: "Kortingen en toeslagen op de hele factuur", aAllowance: "Korting", aCharge: "Toeslag", lReason: "Reden", lAmount: "Bedrag",
    lDiscount: "Korting", discountHint: "10 % of 5,00", badDiscount: "Vul een percentage (10 %) of een bedrag boven 0 in.",
    stale: "Gewijzigd sinds de laatste opbouw: bouw opnieuw op om te downloaden.",
    another: "Nog een pdf omzetten",
    saveTo: "Bewaren in de geschiedenis van een klant",
    saveChoose: "kies een klant",
    save: "In geschiedenis bewaren",
    saving: "Bezig met bewaren…",
    saved: "Bewaard in de geschiedenis van {name}. De downloadknop geeft nu het bewaarde bestand.",
    openClient: "{name} openen",
    saveNoClients: "Voeg op het hoofdscherm een klant toe om omgezette facturen in de geschiedenis ervan te bewaren.",
    fromConvert: "omgezet uit een pdf",
    tooLargePdf: "groter dan 5 MB",
  },
};

/** Field labels on the convert screen, by draft path. */
const FIELD_T = {
  en: {
    number: "Invoice number", issue_date: "Invoice date", due_date: "Due date", delivery_date: "Delivery date",
    buyer_reference: "Buyer reference (Leitweg-ID)", order_reference: "Order reference", currency: "Currency",
    name: "Name", street: "Street", postal_code: "Postcode", city: "City", country: "Country (DE, FR, …)",
    vat_id: "VAT ID", tax_number: "Tax number", "contact.name": "Contact name", "contact.email": "Contact e-mail",
    "contact.phone": "Contact phone", endpoint: "E-invoice address", iban: "IBAN", bic: "BIC", terms: "Payment terms",
  },
  de: {
    number: "Rechnungsnummer", issue_date: "Rechnungsdatum", due_date: "Fälligkeitsdatum", delivery_date: "Leistungsdatum",
    buyer_reference: "Käuferreferenz (Leitweg-ID)", order_reference: "Bestellnummer", currency: "Währung",
    name: "Name", street: "Straße", postal_code: "PLZ", city: "Ort", country: "Land (DE, FR, …)",
    vat_id: "USt-IdNr.", tax_number: "Steuernummer", "contact.name": "Ansprechpartner", "contact.email": "Kontakt-E-Mail",
    "contact.phone": "Kontakt-Telefon", endpoint: "E-Rechnungsadresse", iban: "IBAN", bic: "BIC", terms: "Zahlungsbedingungen",
  },
  fr: {
    number: "N° de facture", issue_date: "Date de facture", due_date: "Échéance", delivery_date: "Date de livraison",
    buyer_reference: "Référence acheteur", order_reference: "N° de commande", currency: "Devise",
    name: "Nom", street: "Rue", postal_code: "Code postal", city: "Ville", country: "Pays (DE, FR, …)",
    vat_id: "N° TVA", tax_number: "N° fiscal", "contact.name": "Contact", "contact.email": "E-mail du contact",
    "contact.phone": "Téléphone du contact", endpoint: "Adresse de facturation électronique", iban: "IBAN", bic: "BIC", terms: "Conditions de paiement",
  },
  pl: {
    number: "Numer faktury", issue_date: "Data wystawienia", due_date: "Termin płatności", delivery_date: "Data dostawy",
    buyer_reference: "Referencja nabywcy", order_reference: "Numer zamówienia", currency: "Waluta",
    name: "Nazwa", street: "Ulica", postal_code: "Kod pocztowy", city: "Miasto", country: "Kraj (DE, FR, …)",
    vat_id: "NIP UE", tax_number: "Numer podatkowy", "contact.name": "Osoba kontaktowa", "contact.email": "E-mail kontaktowy",
    "contact.phone": "Telefon kontaktowy", endpoint: "Adres e-faktur", iban: "IBAN", bic: "BIC", terms: "Warunki płatności",
  },
  nl: {
    number: "Factuurnummer", issue_date: "Factuurdatum", due_date: "Vervaldatum", delivery_date: "Leveringsdatum",
    buyer_reference: "Referentie koper", order_reference: "Ordernummer", currency: "Valuta",
    name: "Naam", street: "Straat", postal_code: "Postcode", city: "Plaats", country: "Land (NL, BE, …)",
    vat_id: "Btw-nummer", tax_number: "Fiscaal nummer", "contact.name": "Contactpersoon", "contact.email": "E-mail contactpersoon",
    "contact.phone": "Telefoon contactpersoon", endpoint: "E-factuuradres", iban: "IBAN", bic: "BIC", terms: "Betalingsvoorwaarden",
  },
};

/** @param {keyof typeof CT.en} k */
const ct = (k) => (Object.hasOwn(CT, state.lang) ? CT[state.lang] : CT.en)[k] ?? CT.en[k];
/** @param {string} path */
const fieldLabel = (path) => {
  const key = /** @type {keyof typeof FIELD_T.en} */ (path.replace(/^(seller|buyer|payment)\./, ""));
  return (Object.hasOwn(FIELD_T, state.lang) ? FIELD_T[state.lang] : FIELD_T.en)[key] ?? FIELD_T.en[key] ?? path;
};

/** The convert screen's state, kept while the person edits: the answer, the draft, what is confirmed. */
const conv = {
  /** @type {any} the POST /v1/convert answer */
  result: null,
  /** @type {any} the draft as edited */
  draft: null,
  /** @type {string[]} */
  toConfirm: [],
  /** @type {Set<string>} */
  confirmed: new Set(),
  /** @type {Set<string>} paths whose typed text cannot be read (an address, a row discount): "Build" waits for them */
  badInputs: new Set(),
  format: "facturx",
  profile: "en16931",
  /** @type {any} the last POST /v1/convert/build answer, null after any edit */
  built: null,
  /** the client whose history the built file is saved to ("" = none chosen) */
  clientId: "",
};

function resetConvert() {
  conv.result = null;
  conv.draft = null;
  conv.toConfirm = [];
  conv.confirmed = new Set();
  conv.badInputs = new Set();
  conv.built = null;
  conv.clientId = "";
}

/** The card on the main screen that opens the convert screen. */
function convertCard() {
  return h(
    "section",
    { class: "card" },
    h("h2", {}, ct("convertH")),
    h("p", {}, ct("convertP")),
    h("button", { type: "button", onclick: () => { resetConvert(); state.convert = true; render(); } }, ct("convertOpen")),
  );
}

async function convertView() {
  const msg = h("div");
  const body = h("div");
  const status = h("p", { class: "small", "aria-live": "polite" });
  let acct = accountPanel() ?? h("div");

  const input = /** @type {HTMLInputElement} */ (h("input", { type: "file", accept: ".pdf,application/pdf", class: "visually-hidden", id: "cpdf" }));

  /** @param {File | undefined} file */
  async function read(file) {
    if (!file) return;
    msg.replaceChildren();
    if (file.size > MAX_PDF) {
      msg.replaceChildren(h("p", { class: "warn" }, `${t("refused")}: ${file.name} (${ct("tooLargePdf")})`));
      return;
    }
    status.textContent = ct("reading");
    try {
      const res = await fetch(`/v1/convert?profile=${encodeURIComponent(conv.profile)}`, {
        method: "POST",
        headers: { authorization: `Bearer ${state.key}`, "content-type": "application/pdf" },
        body: file,
      });
      const data = await res.json();
      if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? "error", data?.error?.message ?? res.statusText);
      resetConvert();
      conv.result = data;
      conv.draft = structuredClone(data.draft ?? {});
      conv.toConfirm = [...(data.toConfirm ?? [])];
    } catch (e) {
      msg.replaceChildren(errorBox(e));
    }
    status.textContent = "";
    input.value = "";
    draw();
  }
  input.addEventListener("change", () => read(input.files?.[0]));

  const zone = h("label", { class: "drop", for: "cpdf" }, h("span", {}, ct("convertDrop")), h("span", { class: "button" }, t("choose")));
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("over");
    read(e.dataTransfer?.files?.[0]);
  });

  /** Any edit: the built file no longer matches the draft. */
  function edited() {
    if (conv.built) {
      conv.built = null;
      drawFooter();
    }
  }

  /** @param {{ path: string, kind: string, value: string, source: any, check: boolean, note: string | null, missing: boolean }} row */
  function fieldRow(row) {
    const id = `cf-${row.path.replace(/\./g, "-")}`;
    const box = /** @type {HTMLInputElement} */ (h("input", { type: "checkbox", checked: conv.confirmed.has(row.path), "aria-label": `${fieldLabel(row.path)}: ${ct("confirm")}` }));
    const err = h("span", { class: "small error" });
    const need = row.missing ? h("span", { class: "badge bad" }, ct("needed")) : null;
    const field = /** @type {HTMLInputElement} */ (
      h("input", {
        id,
        value: row.value,
        type: row.kind === "date" ? "date" : "text",
        maxlength: row.kind === "country" ? "2" : "200",
        placeholder: row.kind === "endpoint" ? ct("endpointHint") : null,
      })
    );
    field.addEventListener("input", () => {
      let v = /** @type {unknown} */ (field.value.trim());
      if (row.kind === "country") v = String(v).toUpperCase();
      if (row.kind === "endpoint") {
        const ep = parseEndpoint(String(v));
        if (ep === null) {
          conv.badInputs.add(row.path);
          err.textContent = ct("badEndpoint");
          v = undefined;
        } else {
          conv.badInputs.delete(row.path);
          err.textContent = "";
          v = ep;
        }
      }
      conv.draft = setPath(conv.draft, row.path, v);
      if (need) need.hidden = v === undefined;
      // Correcting a value is confirming it.
      if (row.check) {
        conv.confirmed.add(row.path);
        box.checked = true;
      }
      edited();
      drawFooter();
    });
    box.addEventListener("change", () => {
      if (box.checked) conv.confirmed.add(row.path);
      else conv.confirmed.delete(row.path);
      drawFooter();
    });
    return h(
      "div",
      { class: row.check ? "cfield mark" : row.missing ? "cfield need" : "cfield" },
      h("label", { for: id }, fieldLabel(row.path), need),
      field,
      err,
      h("p", { class: "small src" }, row.source ? ct("fromPdf").replace("{p}", String(row.source.page)).replace("{line}", row.source.line) : ct("notOnPdf"), row.note ? ` · ${row.note}` : ""),
      row.check ? h("label", { class: "check small" }, box, " ", ct("confirm")) : null,
    );
  }

  function linesTable() {
    const lines = Array.isArray(conv.draft.lines) ? conv.draft.lines : [];
    /** @type {Map<string, any>} */
    const srcByPath = new Map((conv.result.fields ?? []).map((/** @type {any} */ f) => [f.path, f]));
    const rows = lines.map((/** @type {any} */ line, /** @type {number} */ i) => {
      const path = `lines.${i}`;
      const marked = conv.toConfirm.includes(path);
      const box = /** @type {HTMLInputElement} */ (h("input", { type: "checkbox", checked: conv.confirmed.has(path), "aria-label": `${i + 1}: ${ct("confirm")}` }));
      box.addEventListener("change", () => {
        if (box.checked) conv.confirmed.add(path);
        else conv.confirmed.delete(path);
        drawFooter();
      });
      const cells = LINE_COLUMNS.map((col) => {
        const v = line?.[col];
        const inp = /** @type {HTMLInputElement} */ (h("input", { value: v === undefined || v === null ? "" : String(v), "aria-label": `${i + 1} ${ct(/** @type {any} */ (`l${col[0].toUpperCase()}${col.slice(1)}`))}`, inputmode: col === "description" || col === "unit" ? null : "decimal" }));
        inp.addEventListener("input", () => {
          conv.draft = setPath(conv.draft, `lines.${i}.${col}`, lineValue(col, inp.value));
          if (marked) {
            conv.confirmed.add(path);
            box.checked = true;
          }
          edited();
          drawFooter();
        });
        return h("td", { class: col === "description" ? "" : "num" }, inp);
      });
      // The row's discount (a line allowance, BG-27) sits before its VAT rate, as on the PDF.
      cells.splice(LINE_COLUMNS.indexOf("tax_percent"), 0, discountCell(line, i, marked, box));
      const src = srcByPath.get(path);
      return [
        h(
          "tr",
          { class: marked ? "mark" : "" },
          ...cells,
          h("td", {}, marked ? h("label", { class: "check small" }, box, " ", ct("confirm")) : null),
          h("td", {}, h("button", { type: "button", class: "secondary", onclick: () => { removeLine(i); } }, ct("removeLine"))),
        ),
        src ? h("tr", { class: "src" }, h("td", { colspan: String(LINE_COLUMNS.length + 3), class: "small" }, ct("fromPdf").replace("{p}", String(src.page)).replace("{line}", src.line), src.note ? ` · ${src.note}` : "")) : null,
      ];
    });
    return h(
      "section",
      { class: "card" },
      h("h3", {}, ct("gLines")),
      h(
        "div",
        { class: "dash-wrap" },
        h(
          "table",
          { class: "dash lines" },
          h("thead", {}, h("tr", {}, ...LINE_COLUMNS.flatMap((col) => [...(col === "tax_percent" ? [h("th", {}, ct("lDiscount"))] : []), h("th", {}, ct(/** @type {any} */ (`l${col[0].toUpperCase()}${col.slice(1)}`)))]), h("th", {}, ""), h("th", {}, ""))),
          h("tbody", {}, ...rows.flat().filter(Boolean)),
        ),
      ),
      h("button", { type: "button", class: "secondary", onclick: () => { conv.draft = setPath(conv.draft, "lines", [...lines, { quantity: 1, unit: "C62", tax_percent: lines[0]?.tax_percent }]); edited(); draw(); } }, ct("addLine")),
    );
  }

  /**
   * A row's discount cell: "10 %" (of quantity x price) or an amount, blank for none. An
   * unreadable entry is shown as such and blocks "Build" until it is corrected, never guessed.
   * @param {any} line @param {number} i @param {boolean} marked @param {HTMLInputElement} box
   */
  function discountCell(line, i, marked, box) {
    const shown = discountText(line);
    const key = `lines.${i}.allowances`;
    const err = h("span", { class: "small error" }, conv.badInputs.has(key) ? ct("badDiscount") : "");
    const inp = /** @type {HTMLInputElement} */ (
      h("input", { value: shown.text, disabled: !shown.editable, placeholder: ct("discountHint"), "aria-label": `${i + 1} ${ct("lDiscount")}`, inputmode: "decimal", size: "7" })
    );
    inp.addEventListener("input", () => {
      const d = parseDiscount(inp.value);
      if (d === undefined) {
        conv.badInputs.add(key);
        err.textContent = ct("badDiscount");
      } else {
        conv.badInputs.delete(key);
        err.textContent = "";
        conv.draft = setPath(conv.draft, key, withDiscount(conv.draft.lines?.[i], d, ct("aAllowance")));
      }
      if (marked) {
        conv.confirmed.add(`lines.${i}`);
        box.checked = true;
      }
      edited();
      drawFooter();
    });
    return h("td", { class: "num" }, inp, err);
  }

  // Discounts and charges on the whole invoice (BG-20 / BG-21) the reader found below the table:
  // reason, amount and VAT rate, each with its source line; a rate it could not prove is "needed".
  function adjustTable() {
    const missing = new Set((conv.result.missing ?? []).map((/** @type {any} */ m) => m.path));
    /** @type {Map<string, any>} */
    const srcByPath = new Map((conv.result.fields ?? []).map((/** @type {any} */ f) => [f.path, f]));
    const rows = /** @type {const} */ (["allowances", "charges"]).flatMap((list) =>
      (Array.isArray(conv.draft[list]) ? conv.draft[list] : []).map((/** @type {any} */ a, /** @type {number} */ i) => {
        const path = `${list}.${i}`;
        const marked = conv.toConfirm.includes(path);
        const box = /** @type {HTMLInputElement} */ (h("input", { type: "checkbox", checked: conv.confirmed.has(path), "aria-label": `${ct(list === "charges" ? "aCharge" : "aAllowance")} ${i + 1}: ${ct("confirm")}` }));
        box.addEventListener("change", () => {
          if (box.checked) conv.confirmed.add(path);
          else conv.confirmed.delete(path);
          drawFooter();
        });
        const cells = /** @type {const} */ (["reason", "amount", "tax_percent"]).map((col) => {
          const v = a?.[col];
          const inp = /** @type {HTMLInputElement} */ (h("input", { value: v === undefined || v === null ? "" : String(v), "aria-label": `${ct(list === "charges" ? "aCharge" : "aAllowance")} ${i + 1} ${ct(col === "reason" ? "lReason" : col === "amount" ? "lAmount" : "lTax_percent")}`, inputmode: col === "reason" ? null : "decimal" }));
          inp.addEventListener("input", () => {
            conv.draft = setPath(conv.draft, `${list}.${i}.${col}`, col === "reason" ? inp.value.trim() || undefined : lineValue("quantity", inp.value));
            if (marked) {
              conv.confirmed.add(path);
              box.checked = true;
            }
            edited();
            drawFooter();
          });
          const need = col === "tax_percent" && missing.has(`${path}.tax_percent`) && (v === undefined || v === null) ? h("span", { class: "badge bad" }, ct("needed")) : null;
          return h("td", { class: col === "reason" ? "" : "num" }, inp, need ? " " : null, need);
        });
        const src = srcByPath.get(path);
        return [
          h(
            "tr",
            { class: marked ? "mark" : "" },
            h("td", {}, ct(list === "charges" ? "aCharge" : "aAllowance")),
            ...cells,
            h("td", {}, marked ? h("label", { class: "check small" }, box, " ", ct("confirm")) : null),
            h("td", {}, h("button", { type: "button", class: "secondary", onclick: () => { removeAdjust(list, i); } }, ct("removeLine"))),
          ),
          src ? h("tr", { class: "src" }, h("td", { colspan: "6", class: "small" }, ct("fromPdf").replace("{p}", String(src.page)).replace("{line}", src.line), src.note ? ` · ${src.note}` : "")) : null,
        ];
      }),
    );
    if (!rows.length) return null;
    return h(
      "section",
      { class: "card" },
      h("h3", {}, ct("gAdjust")),
      h(
        "div",
        { class: "dash-wrap" },
        h(
          "table",
          { class: "dash lines" },
          h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", {}, ct("lReason")), h("th", {}, ct("lAmount")), h("th", {}, ct("lTax_percent")), h("th", {}, ""), h("th", {}, ""))),
          h("tbody", {}, ...rows.flat().filter(Boolean)),
        ),
      ),
    );
  }

  /** @param {"allowances" | "charges"} list @param {number} i */
  function removeAdjust(list, i) {
    const items = [...(conv.draft[list] ?? [])];
    items.splice(i, 1);
    conv.draft = setPath(conv.draft, list, items.length ? items : undefined);
    conv.toConfirm = shiftLinePaths(conv.toConfirm, i, list);
    conv.confirmed = new Set(shiftLinePaths([...conv.confirmed], i, list));
    conv.result = {
      ...conv.result,
      fields: shiftLineFields(conv.result.fields ?? [], i, list),
      missing: (conv.result.missing ?? []).flatMap((/** @type {any} */ m) => {
        const [p] = shiftLinePaths([m.path], i, list);
        return p === undefined ? [] : [{ ...m, path: p }];
      }),
    };
    edited();
    draw();
  }

  /** @param {number} i */
  function removeLine(i) {
    const lines = [...(conv.draft.lines ?? [])];
    lines.splice(i, 1);
    conv.draft = setPath(conv.draft, "lines", lines);
    // A removed line needs no confirmation; the ones after it move up by one.
    conv.toConfirm = shiftLinePaths(conv.toConfirm, i);
    conv.confirmed = new Set(shiftLinePaths([...conv.confirmed], i));
    conv.badInputs = new Set(shiftLinePaths([...conv.badInputs], i));
    conv.result = { ...conv.result, fields: shiftLineFields(conv.result.fields ?? [], i) };
    edited();
    draw();
  }

  const footerBox = h("div");
  const format = /** @type {HTMLSelectElement} */ (
    h("select", { id: "cformat" }, ...[["facturx", "fFacturx"], ["cii", "fCii"], ["ubl", "fUbl"]].map(([v, k]) => h("option", { value: v, selected: v === conv.format }, ct(/** @type {any} */ (k)))))
  );
  const profile = /** @type {HTMLSelectElement} */ (
    h("select", { id: "cprofile" }, ...[["en16931", "EN 16931"], ["xrechnung", "XRechnung"], ["peppol", "Peppol BIS 3"]].map(([v, label]) => h("option", { value: v, selected: v === conv.profile }, label)))
  );
  format.addEventListener("change", () => { conv.format = format.value; edited(); drawFooter(); });
  profile.addEventListener("change", () => { conv.profile = profile.value; edited(); drawFooter(); });

  async function build() {
    msg.replaceChildren();
    status.textContent = ct("building");
    try {
      conv.built = await api("POST", `/v1/convert/build?lang=${state.lang}`, { draft: conv.draft, format: conv.format, profile: conv.profile });
    } catch (e) {
      msg.replaceChildren(errorBox(e));
    }
    status.textContent = "";
    drawFooter();
    try {
      await loadAccount();
      acct.replaceWith((acct = accountPanel() ?? h("div")));
    } catch {
      /* usage shown on next load */
    }
  }

  /** Builds the same draft again with clientId: the server records its own check in the client's
   * history, and the answer (the saved file) replaces the shown one, so the download is what was kept.
   * The XML is the same as the first build's, so it is not charged again this month. */
  async function save() {
    if (!conv.clientId || !conv.built?.ok) return;
    msg.replaceChildren();
    status.textContent = ct("saving");
    try {
      conv.built = await api("POST", `/v1/convert/build?lang=${state.lang}`, { draft: conv.draft, format: conv.format, profile: conv.profile, clientId: conv.clientId });
    } catch (e) {
      msg.replaceChildren(errorBox(e));
    }
    status.textContent = "";
    drawFooter();
  }

  /** The save-to-history row under a built, downloadable file. */
  function saveRow() {
    const b = conv.built;
    const clients = state.clients ?? [];
    const savedTo = b?.run ? clients.find((/** @type {any} */ c) => c.id === b.run.clientId) : null;
    if (savedTo) {
      const name = savedTo.name;
      return h(
        "div",
        {},
        h("p", { class: "ok" }, ct("saved").replace("{name}", name)),
        h("button", { type: "button", class: "secondary", onclick: () => { state.convert = false; state.client = savedTo; render(); } }, ct("openClient").replace("{name}", name)),
      );
    }
    if (!clients.length) return h("p", { class: "small" }, ct("saveNoClients"));
    const pick = /** @type {HTMLSelectElement} */ (
      h(
        "select",
        { id: "cclient" },
        h("option", { value: "", selected: !conv.clientId }, `— ${ct("saveChoose")} —`),
        ...clients.map((/** @type {any} */ c) => h("option", { value: c.id, selected: c.id === conv.clientId }, c.name)),
      )
    );
    const go = /** @type {HTMLButtonElement} */ (h("button", { type: "button", class: "secondary", onclick: save, disabled: !conv.clientId }, ct("save")));
    pick.addEventListener("change", () => { conv.clientId = pick.value; go.disabled = !conv.clientId; });
    return h("div", { class: "row options" }, h("label", { for: "cclient" }, `${ct("saveTo")} `, pick), go);
  }

  function drawFooter() {
    const b = conv.built;
    const blockers = convertBlockers({ toConfirm: conv.toConfirm, printedTotals: conv.result?.printedTotals }, conv.confirmed, b?.ok ? b.totals : null);
    const parts = [];
    if (blockers.unconfirmed.length) parts.push(h("p", { class: "warn" }, ct("toConfirm").replace("{n}", String(blockers.unconfirmed.length))));
    parts.push(
      h(
        "div",
        { class: "row options" },
        h("label", { for: "cformat" }, `${ct("format")} `, format),
        h("label", { for: "cprofile" }, `${ct("convProfile")} `, profile),
        h("button", { type: "button", onclick: build, disabled: conv.badInputs.size > 0 }, ct("build")),
      ),
    );
    if (b && !b.ok) {
      parts.push(h("p", { class: "error" }, ct("buildErrors")), h("ul", {}, ...(b.errors ?? []).map((/** @type {any} */ e) => h("li", {}, h("code", {}, e.path), ` ${e.message}`))));
    }
    if (b?.ok) {
      if (b.warnings?.length) parts.push(h("p", { class: "warn" }, ct("builtWarnings")), h("ul", { class: "small" }, ...b.warnings.map((/** @type {any} */ w) => h("li", {}, h("code", {}, w.path), ` ${w.message}`))));
      for (const m of blockers.mismatches) {
        const what = ct(m.id === "net" ? "totNet" : m.id === "vat" ? "totVat" : "totGross");
        parts.push(h("p", { class: "error" }, ct("mismatch").replace("{what}", what).replace("{pdf}", m.pdf.toFixed(2)).replace("{ein}", m.einvoice.toFixed(2))));
      }
      parts.push(resultCard(b.check));
      const blocked = blockers.unconfirmed.length > 0 || blockers.mismatches.length > 0;
      if (blocked) parts.push(h("p", { class: "warn" }, blockers.unconfirmed.length ? ct("blockedConfirm") : ct("blockedTotals")));
      parts.push(h("button", { type: "button", disabled: blocked, onclick: () => download(b.filename, fromBase64(b.content), b.contentType) }, ct("download")));
      // Kept in a client's history only once it could be sent: confirmed and matching the PDF.
      if (!blocked) parts.push(saveRow());
    } else if (conv.result && !b) {
      parts.push(h("p", { class: "small" }, ct("stale")));
    }
    footerBox.replaceChildren(...parts);
  }

  function draw() {
    const r = conv.result;
    if (!r) {
      body.replaceChildren();
      return;
    }
    if (!r.readable) {
      body.replaceChildren(h("p", { class: "error" }, r.reason === "no_text" ? ct("noText") : r.reason === "encrypted" ? ct("encrypted") : ct("unreadable")));
      return;
    }
    const view = { ...r, draft: conv.draft, fields: r.fields };
    const groups = convertRows(view).map((g) =>
      h(
        "section",
        { class: "card" },
        h("h3", {}, ct(/** @type {any} */ (`g${g.group[0].toUpperCase()}${g.group.slice(1)}`))),
        h("div", { class: "grid cgrid" }, ...g.rows.map(fieldRow)),
      ),
    );
    const checks = (r.checks ?? []).length
      ? h("section", { class: "card" }, h("h3", {}, ct("checksH")), h("ul", { class: "small" }, ...r.checks.map((/** @type {any} */ c) => h("li", { class: c.ok ? "ok" : "warn" }, `${c.ok ? "✓" : "✗"} ${c.message}`))))
      : null;
    body.replaceChildren(
      r.reason === "already_einvoice" ? h("p", { class: "warn" }, ct("already")) : "",
      ...groups,
      linesTable(),
      adjustTable() ?? "",
      checks ?? "",
      h("section", { class: "card" }, footerBox),
      h("p", {}, h("button", { type: "button", class: "secondary", onclick: () => { resetConvert(); draw(); } }, ct("another"))),
    );
    drawFooter();
  }

  show(
    header(),
    h("p", {}, h("button", { type: "button", class: "link", onclick: () => { state.convert = false; render(); } }, `← ${t("back")}`)),
    acct,
    h("section", { class: "card" }, h("h2", {}, ct("convertH")), h("p", {}, ct("convertP")), zone, input, status, h("p", { class: "small" }, ct("convertNote"))),
    msg,
    body,
    footer(),
  );
  draw();
}

async function render() {
  if (state.link) return linkView();
  if (!state.key) return signedOut();
  if (state.newKey) return keyShown();
  if (state.convert) return convertView();
  if (state.client) return clientView();
  return clientsView();
}

// a link opened into a tab that already shows the workspace changes only the fragment
window.addEventListener("hashchange", () => {
  const link = takeLink();
  if (link) {
    state.link = link;
    render();
  }
});
loadOptions().then(render);
