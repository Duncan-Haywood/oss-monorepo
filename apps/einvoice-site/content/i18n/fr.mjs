// Textes français. Les faits (dates, règles, prix) viennent de content/deadlines.mjs et
// content/pricing.mjs via ctx ; ne jamais saisir une date ou un prix à la main ici.
// Les espaces insécables de la typographie française sont ajoutées au build (build.mjs, frTypo).
// À faire relire par une personne de langue maternelle française avant le lancement (README).

const ui = {
  skip: "Aller au contenu",
  banner:
    "Accès anticipé : le service n'est pas encore ouvert à tous. Rien sur ce site ne constitue un conseil fiscal.",
  navLabel: "Navigation principale",
  langLabel: "Langue",
  nav: {
    accountants: "Experts-comptables",
    api: "API",
    pricing: "Tarifs",
    "deadlines-de": "Allemagne",
    "deadlines-fr": "France",
    "early-access": "Accès anticipé",
    privacy: "Confidentialité",
  },
  footer:
    "Accès anticipé. Les échéances sont citées d'après des sources officielles, avec la date de notre vérification ; seul le texte officiel fait foi. Ceci n'est pas un conseil fiscal.",
  chooser: "Français",
  notFound: "Page introuvable. Aller à l'accueil en français",
  kind: { receive: "Réception", issue: "Émission" },
  date: "Date",
  what: "Concerne",
  detail: "Ce qui change",
  source: "Source",
  sourcesHeading: "Sources officielles",
  checkedOn: "Vérifié le",
  checkedViaSearch:
    "Comparé au texte de la page officielle tel que restitué par une recherche limitée au site officiel ; consultez le lien pour la formulation en vigueur",
  notTaxAdvice:
    "Cette page résume des informations officielles. Elle ne constitue pas un conseil fiscal et ne remplace ni le texte officiel ni votre expert-comptable.",
  plan: "Formule",
  perMonth: "Par mois",
  clients: "Dossiers clients",
  invoicesChecked: "Factures vérifiées / mois",
  explanations: "Factures expliquées / mois",
  meterValidation: "Validation (conforme / non conforme, avec codes de règle)",
  meterExplanation: "Validation avec explication claire et correction proposée",
  meterMinimum: "Minimum mensuel",
  per1000: "les 1 000 factures",
  perInvoice: "par facture",
  perMonthCredited: "par mois, déduit de la consommation",
  ldPricing: "Formules d'accès anticipé proposées aux cabinets ; prix hors TVA.",
  roles: {
    accountant: "Expert-comptable ou comptable",
    vendor: "Éditeur de logiciel de facturation ou de comptabilité",
    business: "Entreprise qui émet ou reçoit des factures",
    other: "Autre",
  },
  form: {
    email: "Adresse e-mail professionnelle",
    role: "Vous êtes",
    countries: "Pays concernés (facultatif)",
    consent: (privacyLink) =>
      `J'accepte que mon adresse e-mail, mon profil, la langue et les pays choisis soient enregistrés afin que vous m'envoyiez un e-mail de confirmation, puis des informations sur l'accès anticipé à ce produit. Je peux retirer mon consentement à tout moment grâce au lien présent dans chaque e-mail. Détails : ${privacyLink}.`,
    submit: "Demander l'accès anticipé",
    afterSubmit:
      "Vous recevrez un e-mail contenant un lien de confirmation. Votre demande n'est confirmée qu'après votre clic.",
  },
  mail: {
    subject: "Confirmez votre demande d'accès anticipé",
    body: (confirmUrl, deleteUrl, siteName) =>
      `Bonjour,\n\nquelqu'un (vous, nous l'espérons) a demandé un accès anticipé à ${siteName} avec cette adresse.\n\nConfirmez ici (le lien est valable 7 jours) :\n${confirmUrl}\n\nSi ce n'était pas vous, ignorez cet e-mail : la demande sera supprimée automatiquement au bout de 7 jours.\n\nSupprimer vos données dès maintenant :\n${deleteUrl}\n\n${siteName}`,
  },
  confirmPage: {
    title: "Confirmez votre demande d'accès anticipé",
    text: "Cliquez sur le bouton pour confirmer. Nous demandons un clic parce que les outils de sécurité des messageries ouvrent les liens automatiquement.",
    button: "Confirmer",
  },
  deletePage: {
    title: "Supprimer vos données d'accès anticipé",
    text: "Cette action supprime votre adresse e-mail et tout ce qui y est associé. Elle est définitive.",
    button: "Supprimer mes données",
  },
};

const pages = {
  home: (c) => ({
    title: "Des factures électroniques conformes, chaque erreur expliquée",
    description:
      "Accès anticipé : vérifiez vos factures Factur-X, UBL, CII, XRechnung et ZUGFeRD pour la France et l'Allemagne, chaque erreur de validation expliquée clairement en français, allemand ou anglais.",
    body: `<h1>Des factures électroniques conformes. Chaque erreur expliquée.</h1>
<p class="lead">La France et l'Allemagne imposent désormais des factures électroniques structurées entre entreprises. Quand un fichier Factur-X, UBL, CII ou XRechnung est rejeté, le message du validateur dit rarement quoi corriger. Nous vérifions le fichier, expliquons chaque erreur en langage clair et proposons une correction lorsqu'elle ne demande aucune information nouvelle.</p>
<p><a class="cta" href="${c.link("early-access")}">Demander l'accès anticipé</a></p>

<h2>Les échéances</h2>
<p>Chaque date renvoie à la page officielle dont elle provient. Les pages par pays donnent le détail et la date de notre dernière vérification de chaque source.</p>
<div class="grid">
${c.deadlineSummary()}
</div>

<h2>Ce que fait « vérifier et expliquer »</h2>
<ol>
<li><strong>Vérifier.</strong> Vous déposez un fichier de facture (ou l'envoyez par l'API). Nous reconnaissons le format et le profil, puis appliquons les règles de validation.</li>
<li><strong>Expliquer.</strong> Pour chaque erreur, vous obtenez la règle enfreinte, l'endroit de la facture concerné et ce que cela signifie, en clair, en français, en allemand ou en anglais.</li>
<li><strong>Corriger, avec prudence.</strong> Lorsque la correction ne demande aucune information nouvelle, nous proposons un fichier XML corrigé avec le diff : une date mal écrite (24.08.2026 devient 2026-08-24), un montant à plus de deux décimales, un code devise en minuscules, un code devise manquant quand les montants n'en citent qu'une, un identifiant de processus Peppol manquant. Une correction n'est retenue que si le fichier corrigé satisfait la règle visée sans créer de nouveau constat. Les totaux, identifiants et données métier manquantes ne sont jamais modifiés : s'il manque une information, comme le SIREN d'un client, nous l'indiquons et vous la demandons. Les PDF sont analysés, pas réécrits.</li>
</ol>

<h2>Ce qui est vérifié, et ce qui ne l'est pas</h2>
<p>Cette liste correspond à ce que vérifie le service aujourd'hui. Conforme ou non conforme ne dépend que de règles déterministes ; une explication ne change jamais un résultat.</p>
<div class="checks">
<div class="card"><h3>Vérifié</h3><ul>
<li>Le schéma XSD CII (UN/CEFACT D16B, le sous-ensemble EN 16931 publié par le CEN) pour les fichiers EN 16931 et leurs CIUS comme XRechnung et Factur-X BASIC : ordre des éléments, éléments obligatoires et inconnus, valeurs numériques, dates et booléens, et espaces de noms (udt: au lieu de qdt:). Sur 499 fichiers de test modifiés, chaque verdict a concordé avec xmllint appliquant le même schéma.</li>
<li>La lecture du fichier : XML UBL 2.1 et UN/CEFACT CII, le XML joint à un PDF Factur-X / ZUGFeRD et le PDF qui l'entoure (marqueur PDF/A-3, nom et relation de la pièce jointe, profil indiqué dans les métadonnées du PDF).</li>
<li>Le schéma UBL 2.1 (XSD) sur chaque facture et avoir UBL, avant toute règle de gestion : éléments inconnus ou répétés, ordre des éléments, éléments manquants, valeurs qui ne sont pas un nombre, une date, une heure ou true/false, <code>currencyID</code> et autres attributs manquants, et l'espace de noms de chaque élément.</li>
<li>Les règles de gestion EN 16931 (BR-…) via le Schematron officiel du CEN, et le module officiel XRechnung ou Peppol BIS quand le fichier en déclare un, partout où le serveur les a installés ; chaque résultat indique s'ils ont été exécutés. À côté, nos propres contrôles : champs obligatoires, totaux exacts au centime, deux décimales au plus, codes de date et de devise, clés de contrôle des numéros de TVA et des IBAN.</li>
<li>France : avec les règles françaises (choisies, ou détectées quand vendeur et acheteur sont tous deux en France), le SIREN ou SIRET du vendeur et de l'acheteur et leur clé de contrôle, le SIREN contenu dans le numéro de TVA français du vendeur, la catégorie de l'opération (l'une des nouvelles mentions de la ${c.a("deadlines-fr", "page France")}), et les mentions de pénalités de retard, d'indemnité forfaitaire de 40 € et d'escompte.</li>
<li>Allemagne : un fichier ZUGFeRD / Factur-X au profil MINIMUM ou BASIC WL émis par un vendeur allemand est signalé comme n'étant pas une facture électronique. Avec les règles XRechnung (choisies, ou détectées d'après l'identifiant de spécification du fichier), neuf contrôles d'après BR-DE : référence acheteur et clé de contrôle du Leitweg-ID, instructions de paiement, contact du vendeur, adresses du vendeur et de l'acheteur, code de type de facture, identifiant de spécification et numéro fiscal du vendeur.</li>
</ul></div>
<div class="card"><h3>Non vérifié</h3><ul>
<li>Le schéma CII des fichiers Factur-X aux profils EXTENDED, MINIMUM et BASIC WL (chacun a le sien) : un tel fichier peut passer ici et être refusé par un validateur qui applique le schéma.</li>
<li>Si le taux ou le régime de TVA est le bon pour l'opération.</li>
<li>Si un numéro de TVA, un SIREN ou un Leitweg-ID existe ou est actif : seulement sa forme et sa clé de contrôle.</li>
<li>France : si l'option pour le paiement de la TVA d'après les débits s'applique et figure sur la facture.</li>
<li>Si le PDF dans son ensemble est conforme à PDF/A-3 : nous ne sommes pas un validateur PDF/A.</li>
<li>Si les biens ou services ont réellement été fournis, ou les montants convenus.</li>
<li>La transmission : nous ne sommes pas une <em>plateforme agréée</em> et n'envoyons ni factures ni données d'e-reporting à une administration fiscale.</li>
<li>Les obligations d'archivage.</li>
</ul></div>
</div>

<h2>Pour qui</h2>
<div class="grid">
<div class="card"><h3>${c.a("accountants", "Experts-comptables")}</h3><p>Un plan par dossier client : l'échéance applicable, ce que produit son logiciel et les erreurs à corriger en priorité.</p></div>
<div class="card"><h3>${c.a("api", "Éditeurs de logiciels de facturation")}</h3><p>Une API facturée à l'usage, qui renvoie chaque erreur avec une explication exploitable par vos utilisateurs.</p></div>
<div class="card"><h3>${c.a("pricing", "Tarifs")}</h3><p>Formules proposées à partir de ${c.euro(c.minPlanCents)} par mois, calculées à partir de nos coûts. Prix d'accès anticipé.</p></div>
</div>
`,
  }),

  accountants: (c) => ({
    title: "Facture électronique : un plan par client, pour les experts-comptables",
    description:
      "Pour les cabinets d'expertise comptable : un plan facture électronique par dossier client pour la France et l'Allemagne, avec l'échéance applicable, le contrôle du format et chaque erreur expliquée. Accès anticipé.",
    body: `<h1>Un plan facture électronique par dossier client</h1>
<p class="lead">Vos clients vous demanderont si leurs factures sont prêtes. La réponse dépend du client : son pays, sa taille, et ce que produit son logiciel de facturation. Accès anticipé.</p>

<h2>Ce que contient le plan</h2>
<ol>
<li><strong>L'échéance applicable.</strong> À partir de vos informations (pays, catégorie d'entreprise en France, tranche de chiffre d'affaires de l'année précédente en Allemagne), le plan retient la date correspondante du calendrier officiel. En France, par exemple, l'obligation d'émission s'applique à une date différente aux GE et ETI d'une part, aux PME et micro-entreprises d'autre part (${c.a("deadlines-fr", "page France")}).</li>
<li><strong>Réception.</strong> Si le client peut déjà recevoir des factures électroniques : obligatoire en France depuis le ${c.when("fr", "receive")} et en Allemagne depuis le ${c.when("de", "receive")}, selon les sources officielles citées sur les pages par pays.</li>
<li><strong>Contrôle d'un échantillon.</strong> Déposez quelques factures produites par le logiciel du client. Vous voyez le format, le profil et chaque erreur expliquée.</li>
<li><strong>Les corrections, dans le bon ordre.</strong> D'abord les erreurs qui empêchent la facture de compter comme facture électronique, puis les autres. Chaque point précise s'il s'agit d'un réglage du logiciel, d'une donnée de référence manquante (par exemple le SIREN d'un client) ou d'une erreur ponctuelle.</li>
<li><strong>Une liste d'actions datée</strong> à transmettre au client, en français, en allemand ou en anglais.</li>
</ol>
<p>Le plan n'indique que des échéances issues de notre tableau sourcé et des informations que vous avez saisies. Il ne tranche pas le régime de TVA d'un client : cela reste votre jugement professionnel.</p>

<h2>Tarifs pour les cabinets</h2>
${c.plansTable()}
<p class="small">Prix d'accès anticipé proposés, hors TVA. Comment nous les fixons : ${c.a("pricing", "tarifs")}.</p>
<p><a class="cta" href="${c.link("early-access")}">Demander l'accès anticipé</a></p>
`,
  }),

  api: (c) => ({
    title: "API de validation de factures électroniques, avec explications",
    description:
      "API facturée à l'usage pour les éditeurs de logiciels de facturation : validez Factur-X, UBL, CII, XRechnung et ZUGFeRD et obtenez chaque erreur expliquée en français, allemand ou anglais.",
    body: `<h1>Une API qui explique pourquoi une facture électronique est rejetée</h1>
<p class="lead">Vos utilisateurs voient « BR-CO-15 » et appellent le support. Envoyez-nous la facture ; vous recevez chaque erreur, son emplacement et une explication exploitable, dans la langue de l'utilisateur. Accès anticipé.</p>

<h2>Requête et réponse</h2>
<p>Voici la réponse que renvoie le service aujourd'hui, abrégée (un constat sur quatre affiché ; la correction de date en lève deux, le contact du vendeur et l'adresse de l'acheteur, XR-004 et XR-006, demandent des informations que vous seul avez). Les noms de champs peuvent encore changer avant l'ouverture ; les partenaires de l'accès anticipé seront prévenus avant tout changement.</p>
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
<li>Une correction ne vient que de la liste ci-dessous (dates, décimales, code devise, identifiant de processus Peppol), et seulement si le fichier corrigé satisfait la règle visée sans créer de nouveau constat. Les totaux, identifiants et données métier manquantes ne sont jamais modifiés ; une correction qui en aurait besoin figure sous <code>skipped</code> avec sa raison.</li>
<li><code>status</code> provient uniquement de règles déterministes. <code>explanation.source</code> vaut <code>template</code> (rédigé par nous), <code>llm</code> (formulation d'un modèle pour une règle sans modèle rédigé, signalée comme telle et sans effet sur le résultat) ou <code>checker</code>.</li>
<li><code>schematron</code> indique si le Schematron officiel EN 16931 a été exécuté (<code>ok</code>) ou était indisponible sur ce serveur (<code>unavailable</code>) ; seuls les contrôles intégrés ont alors été exécutés.</li>
<li>Traitement des données : le contenu des factures n'est pas conservé. L'historique garde les noms de fichiers, les empreintes SHA-256 et les identifiants de règles et de corrections. Quand une règle n'a pas de modèle rédigé, seuls son identifiant et son message sont envoyés au modèle, pas la facture.</li>
</ul>

<h2>Tarifs à l'usage</h2>
${c.meterTable()}
<p class="small">Prix d'accès anticipé proposés, hors TVA, facturés chaque mois à terme échu. Comment nous les fixons : ${c.a("pricing", "tarifs")}.</p>
<p><a class="cta" href="${c.link("early-access")}">Demander l'accès anticipé à l'API</a></p>
`,
  }),

  pricing: (c) => ({
    title: "Tarifs",
    description: `Prix d'accès anticipé proposés pour vérifier et expliquer vos factures électroniques : formules pour cabinets à partir de ${c.euro(c.minPlanCents)} par mois et API à l'usage pour les éditeurs. Calculés à partir de nos coûts.`,
    body: `<h1>Tarifs</h1>
<p class="lead">Prix d'accès anticipé proposés, hors TVA. Nos prix suivent nos coûts : chaque formule coûte entre 1,3 et 2 fois ce que nous coûte un client qui l'utilise entièrement.</p>

<h2>Cabinets</h2>
${c.plansTable()}
<p>Une facture compte une fois par mois, quel que soit le nombre de nouvelles vérifications. « Expliquée » signifie une facture en erreur dont nous avons expliqué les erreurs en langage clair ; les factures conformes ne comptent que dans le volume « vérifiées ».</p>

<h2>API pour les éditeurs</h2>
${c.meterTable()}

<h2>Pourquoi ces montants</h2>
<p>Ce qui coûte cher, c'est l'explication en langage clair, qui fait appel à un grand modèle de langage. La validation des règles elle-même coûte peu. Notre estimation du coût de chaque formule comprend ces appels au modèle, l'hébergement, les frais du prestataire de paiement et une réserve pour remboursements, en supposant que vous utilisez tout le volume. Si nos coûts baissent, nos prix baissent.</p>
<p><a class="cta" href="${c.link("early-access")}">Demander l'accès anticipé</a></p>
`,
  }),

  "deadlines-de": (c) => ({
    title: "Échéances de la facture électronique en Allemagne",
    description:
      "Allemagne, facture électronique B2B : réception depuis le 1er janvier 2025, périodes transitoires jusqu'à fin 2026 et fin 2027, formats admis. Chaque date sourcée auprès du BMF.",
    body: `<h1>Échéances de la facture électronique en Allemagne</h1>
<p class="lead">${c.esc(c.COUNTRIES[0].scope.fr)}</p>
${c.deadlineTable("de")}
<h2>Ce qui compte comme facture électronique</h2>
${c.rulesList("de")}
<h2>Comment nous aidons</h2>
<p>Nous vérifions les fichiers XRechnung et ZUGFeRD au regard de ces règles et expliquons chaque erreur. ${c.a("accountants", "Pour les experts-comptables")} · ${c.a("early-access", "Accès anticipé")}</p>
${c.sourcesBlock("de")}
`,
  }),

  "deadlines-fr": (c) => ({
    title: "Échéances de la facturation électronique en France",
    description:
      "France, facturation électronique et e-reporting : réception pour toutes les entreprises depuis le 1er septembre 2026, émission en 2026 ou 2027 selon la taille, formats et nouvelles mentions.",
    body: `<h1>Échéances de la facturation électronique en France</h1>
<p class="lead">${c.esc(c.COUNTRIES[1].scope.fr)}</p>
${c.deadlineTable("fr")}
<h2>Formats et nouvelles mentions obligatoires</h2>
${c.rulesList("fr")}
<h2>Comment nous aidons</h2>
<p>Nous vérifions les fichiers Factur-X, UBL et CII et expliquons chaque erreur. Nous ne sommes pas une <em>plateforme agréée</em> : il vous faut toujours une plateforme agréée pour émettre et recevoir vos factures. ${c.a("early-access", "Accès anticipé")}</p>
${c.sourcesBlock("fr")}
`,
  }),

  "early-access": (c) => ({
    title: "Demander l'accès anticipé",
    description:
      "Demandez l'accès anticipé à la vérification et à l'explication des factures électroniques pour la France et l'Allemagne. Double opt-in ; nous ne conservons que ce que demande le formulaire.",
    body: `<h1>Demander l'accès anticipé</h1>
<p class="lead">Dites-nous qui vous êtes et quels pays vous concernent. Nous vous écrirons dès qu'une place se libère pour vous.</p>
${c.form()}
`,
  }),

  privacy: (c) => privacy(c),

  "check-inbox": () => ({
    title: "Consultez votre messagerie",
    description: "Confirmez votre demande grâce au lien que nous vous avons envoyé.",
    body: `<h1>Consultez votre messagerie</h1><p>Si l'adresse est valide, nous vous avons envoyé un lien de confirmation, valable 7 jours. Les demandes non confirmées sont supprimées automatiquement au bout de 7 jours.</p>`,
  }),
  confirmed: (c) => ({
    title: "Demande confirmée",
    description: "Votre demande d'accès anticipé est confirmée.",
    body: `<h1>Demande confirmée</h1><p>Merci. Nous vous écrirons au sujet de l'accès anticipé. Chaque e-mail contient un lien pour supprimer vos données.</p><p>${c.a("home", "Retour à l'accueil")}</p>`,
  }),
  deleted: (c) => ({
    title: "Données supprimées",
    description: "Vos données d'accès anticipé ont été supprimées.",
    body: `<h1>Données supprimées</h1><p>Votre adresse e-mail et tout ce qui y était associé ont été supprimés.</p><p>${c.a("home", "Retour à l'accueil")}</p>`,
  }),
  "form-error": (c) => ({
    title: "Une erreur s'est produite",
    description: "La demande n'a pas pu être traitée.",
    body: `<h1>Une erreur s'est produite</h1><p>Le lien a peut-être expiré, ou le formulaire était incomplet. ${c.a("early-access", "Réessayer")}.</p>`,
  }),
};

function privacy(c) {
  const ctl = c.cfg.controller;
  const controller = ctl.name
    ? `${c.esc(ctl.name)}, ${c.esc(ctl.address)}, <a href="mailto:${c.esc(ctl.email)}">${c.esc(ctl.email)}</a>`
    : "[Nom, adresse et e-mail du responsable du traitement : à renseigner avant le lancement. Sans eux, le build de production échoue.]";
  return {
    title: "Confidentialité",
    description:
      "Ce que ce site enregistre lorsque vous demandez l'accès anticipé, pourquoi, combien de temps, qui le traite, et vos droits au titre du RGPD.",
    body: `<h1>Politique de confidentialité</h1>
<p>Cette politique couvre ce site et le formulaire d'accès anticipé. Elle sera remplacée par une politique complète pour le service lui-même avant son lancement.</p>

<h2>Responsable du traitement</h2>
<p>${controller}</p>

<h2>Consultation du site</h2>
<p>Aucun cookie, aucun outil de mesure d'audience, aucun pixel de suivi, aucune police ni aucun script chargé depuis un autre serveur. Le site est hébergé par Cloudflare, qui traite votre adresse IP et les données de la requête pour afficher les pages et les protéger contre les attaques. Nous ne conservons pas ces données dans notre base et n'avons pas activé la journalisation des requêtes.</p>

<h2>Le formulaire d'accès anticipé</h2>
<p>Lorsque vous envoyez le formulaire, nous enregistrons :</p>
<ul>
<li>votre adresse e-mail ;</li>
<li>le profil choisi, les pays cochés et la langue de la page ;</li>
<li>la version du texte de consentement que vous avez accepté, ainsi que la date et l'heure de l'envoi et de la confirmation (preuve du consentement, art. 7, paragraphe 1, du RGPD) ;</li>
<li>une empreinte (hachage) du lien de confirmation, et non le lien lui-même, sa date d'expiration, ainsi que la date et le nombre d'e-mails de confirmation envoyés (pour limiter les renvois).</li>
</ul>
<p>Nous ne conservons pas votre adresse IP. Finalité : confirmer votre adresse (double opt-in), puis vous écrire au sujet de l'accès anticipé à ce produit. Base légale : votre consentement, art. 6, paragraphe 1, point a), du RGPD. Vous pouvez le retirer à tout moment grâce au lien de suppression présent dans chaque e-mail ; ce retrait ne remet pas en cause la licéité du traitement effectué auparavant.</p>
<p>Qui peut voir la liste : seules les personnes qui exploitent ce service (le responsable du traitement indiqué ci-dessus), dans une vue interne qui affiche votre adresse e-mail, si vous avez confirmé et la date. Chaque consultation est journalisée.</p>

<h2>Durée de conservation</h2>
<ul>
<li>Demandes non confirmées : supprimées automatiquement au bout de 7 jours.</li>
<li>Demandes confirmées : jusqu'à ce que vous les supprimiez, et au plus 24 mois après la confirmation.</li>
<li>La suppression efface immédiatement l'intégralité de l'enregistrement.</li>
</ul>

<h2>Qui traite vos données</h2>
<p>Cloudflare, Inc. héberge le site et la base de données (Cloudflare D1) et envoie les e-mails (Cloudflare Email Service), en tant que sous-traitant au sens de l'art. 28 du RGPD. Cloudflare peut traiter des données aux États-Unis. Cloudflare est certifié au titre du cadre de protection des données UE–États-Unis (Data Privacy Framework, décision d'adéquation, art. 45 du RGPD), et son accord de traitement des données intègre les clauses contractuelles types de l'UE (art. 46 du RGPD). Nous ne vendons pas vos données et ne les transmettons à personne d'autre.</p>

<h2>Vos droits</h2>
<p>Vous disposez d'un droit d'accès (art. 15), de rectification (art. 16), d'effacement (art. 17), de limitation du traitement (art. 18), à la portabilité (art. 20) et d'opposition (art. 21), ainsi que du droit de retirer votre consentement (art. 7, paragraphe 3). Écrivez au responsable du traitement indiqué ci-dessus. Vous pouvez aussi introduire une réclamation auprès d'une autorité de contrôle, notamment dans l'État membre de l'UE où vous résidez ou travaillez ; en France, la CNIL (art. 77). Aucune décision automatisée n'est prise. La communication de vos données est facultative ; sans adresse e-mail, nous ne pouvons pas vous contacter.</p>
<p class="small">Version du ${c.esc(c.consentVersion)}.</p>
`,
  };
}

export default { ui, pages };
