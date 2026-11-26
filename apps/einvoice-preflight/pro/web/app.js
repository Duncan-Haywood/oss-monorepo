// @ts-check
// The accountant workspace: sign up or sign in with an API key, manage client companies, drop a
// batch of invoices, read each finding in German, French or English, download the fixed file and
// its diff. FSL-1.1-MIT (see ../../LICENSE, part 2). Talks only to this server's /v1 API.
// Everything is built with createElement and text nodes, never HTML strings, so file names and messages cannot inject markup.
import { diffName, fixedName, formatEuro, planBatches, summarizeResult, toBase64, usageShare } from "./workspace-lib.mjs";

/** @typedef {"de" | "fr" | "en"} Lang */

const T = {
  en: {
    title: "E-invoice workspace",
    tagline: "Check your clients' e-invoices (XRechnung, ZUGFeRD/Factur-X, Peppol, EN 16931), read each problem in plain language, and download the safely fixed file.",
    signupH: "Start a free trial",
    signupP: "100 invoices a month, 3 client companies, no card. You get an API key: it is your sign-in, shown once.",
    firm: "Firm or practice name",
    accept: "I understand this checks the rules listed on the site and is not tax or legal advice.",
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
    billingDark: "Paid plans are not open yet. Your trial keeps working.",
    clients: "Client companies",
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
  },
  de: {
    title: "E-Rechnungs-Arbeitsbereich",
    tagline: "Prüfen Sie die E-Rechnungen Ihrer Mandanten (XRechnung, ZUGFeRD/Factur-X, Peppol, EN 16931), lesen Sie jeden Fehler in Klartext und laden Sie die sicher korrigierte Datei herunter.",
    signupH: "Kostenlos testen",
    signupP: "100 Rechnungen im Monat, 3 Mandanten, keine Karte. Sie erhalten einen API-Schlüssel: Er ist Ihre Anmeldung und wird nur einmal angezeigt.",
    firm: "Name der Kanzlei oder Firma",
    accept: "Mir ist bewusst, dass hier die auf der Website genannten Regeln geprüft werden und dies keine Steuer- oder Rechtsberatung ist.",
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
    billingDark: "Bezahltarife sind noch nicht geöffnet. Ihr Testzugang läuft weiter.",
    clients: "Mandanten",
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
  },
  fr: {
    title: "Espace e-facture",
    tagline: "Contrôlez les factures électroniques de vos clients (Factur-X, Peppol, EN 16931, XRechnung), lisez chaque problème en clair et téléchargez le fichier corrigé en toute sécurité.",
    signupH: "Essai gratuit",
    signupP: "100 factures par mois, 3 sociétés clientes, sans carte. Vous recevez une clé d'API : c'est votre identifiant, affiché une seule fois.",
    firm: "Nom du cabinet ou de l'entreprise",
    accept: "Je comprends que l'outil contrôle les règles indiquées sur le site et qu'il ne s'agit pas d'un conseil fiscal ou juridique.",
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
    billingDark: "Les offres payantes ne sont pas encore ouvertes. Votre essai continue de fonctionner.",
    clients: "Sociétés clientes",
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
  if (saved === "de" || saved === "fr" || saved === "en") return saved;
  const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
  return nav === "de" || nav === "fr" ? nav : "en";
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
  /** @type {string | null} key shown once after sign-up */
  newKey: null,
};

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

/** @param {string} name @param {string} content @param {string} type */
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
  const langs = /** @type {Lang[]} */ (["de", "fr", "en"]).map((l) =>
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
            onclick: () => {
              state.key = null;
              state.account = null;
              state.client = null;
              write(session, "eip.key", null);
              write(local, "eip.key", null);
              render();
            },
          },
          t("signout"),
        )
      : null,
  );
}

const footer = () => h("footer", {}, h("p", { class: "small" }, t("disclaimer")));

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
          const r = await api("POST", "/v1/signup", { name: firm.value, acceptTerms: accept.checked }, { auth: false });
          state.key = r.apiKey;
          state.newKey = r.apiKey;
          write(session, "eip.key", r.apiKey);
          render();
        } catch (err) {
          signupMsg.replaceChildren(errorBox(err));
        }
      },
    },
    h("h2", {}, t("signupH")),
    h("p", {}, t("signupP")),
    h("label", { for: "firm" }, t("firm")),
    firm,
    h("label", { class: "check" }, accept, " ", t("accept")),
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

  show(header(), h("p", { class: "tagline" }, t("tagline")), h("div", { class: "two" }, signup, signin), footer());
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
        `${t("upgrade")}: ${p.name} · ${formatEuro(p.priceCents, state.lang)} ${t("perMonth")}`,
      ),
    );
  return h(
    "section",
    { class: "card account" },
    h("p", {}, h("strong", {}, a.account?.name ?? ""), ` · ${t("plan")}: ${lim.name ?? ""}`),
    meter(t("usage"), u.documents ?? 0, lim.documentsPerMonth ?? 0),
    meter(t("explained"), u.llmExplanations ?? 0, lim.llmExplanationsPerMonth ?? 0),
    upgrades.length ? h("div", { class: "row" }, ...upgrades) : null,
    msg,
  );
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
  show(header(), accountPanel() ?? "", msg, h("section", { class: "card" }, h("h2", {}, t("clients")), list), add, footer());
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
    h("ul", { class: "small" }, ...(run.files ?? []).map((/** @type {any} */ f) => h("li", {}, `${f.status === "pass" ? "✓" : "✗"} ${f.file}${f.rules?.length ? ` · ${f.rules.join(", ")}` : ""}`))),
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
    h("select", { id: "elang" }, ...["de", "fr", "en"].map((l) => h("option", { value: l, selected: l === state.lang }, l.toUpperCase())))
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

async function render() {
  if (!state.key) return signedOut();
  if (state.newKey) return keyShown();
  if (state.client) return clientView();
  return clientsView();
}

render();
