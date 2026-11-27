// @ts-check
// The client summary email: the accountant's "At a glance" dashboard (pro/dashboard.mjs), sent
// weekly or monthly to the account's verified sign-in address, only when the account turned it
// on (`PUT /v1/account/digest`). Proprietary (see ../LICENSE, part 2). No npm dependencies.
//
// Sending is a platform admin call, `POST /v1/admin/digest/send` with ADMIN_TOKEN, like the
// month-end usage settlement: nothing here runs on a timer. Each account and period
// ("2026-W48", "2026-11") is claimed in the store before the send, so a repeated call sends
// nothing twice; a failed send releases its claim and the next call retries it.
//
// What the email holds: counts, dates, rule ids and the firm's own account name. Never a client's
// name, VAT id or reference, a file name, invoice contents or amounts. Client records are the
// customer's personal data under the DPA (pro/legal/dpa.md, Annex I), and the mail provider is
// listed there as receiving account data only, so a client's identity stays in the workspace:
// the email says how many clients need attention and links to them. Plain text from fixed
// templates; the firm name has control characters stripped.
import { dashboardFor } from "./dashboard.mjs";
import { oneLine } from "./email.mjs";

/** @typedef {import("./dashboard.mjs").Dashboard} Dashboard */
/** @typedef {"de" | "fr" | "en" | "nl" | "pl"} Lang */
/** @typedef {import("./store.mjs").DigestFrequency} DigestFrequency */

export const DIGEST_FREQUENCIES = /** @type {const} */ (["off", "weekly", "monthly"]);
/** The dashboard window each frequency covers. */
export const DIGEST_DAYS = { weekly: 7, monthly: 30 };
/** Sends per admin call: a Worker request has a subrequest budget; the answer says when more wait. */
export const DEFAULT_SEND_LIMIT = 40;

/** @param {unknown} v @returns {Lang} */
export const digestLang = (v) => (v === "de" || v === "fr" || v === "nl" || v === "pl" ? v : "en");

/** @param {unknown} v @returns {DigestFrequency | null} */
export const digestFrequency = (v) => (v === "off" || v === "weekly" || v === "monthly" ? v : null);

/**
 * The period a send belongs to: the ISO week ("2026-W48") or the calendar month ("2026-11") of
 * `at`, in UTC. One email per account and period.
 * @param {"weekly" | "monthly"} frequency @param {Date} at
 */
export function digestPeriod(frequency, at) {
  if (frequency === "monthly") return at.toISOString().slice(0, 7);
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this week names its year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** @param {unknown} v @param {"weekly" | "monthly"} frequency */
export function validPeriod(v, frequency) {
  if (typeof v !== "string") return false;
  return frequency === "weekly" ? /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(v) : /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/**
 * Every language's fixed phrases. `{n}`-style holes are filled by `fill`; nothing else varies.
 * @type {Record<Lang, Record<string, string>>}
 */
const T = {
  en: {
    subjectAttention: "{firm}: {attention} of {clients} clients need attention",
    subjectOk: "{firm}: no open e-invoice errors across {clients} clients",
    intro: "E-invoice summary for {firm}, the last {days} days ({since} to {today}).",
    totals: "Invoices checked: {files}. Passed: {passed}. Passed after a fix: {fixed}. Still failing: {open}.",
    attention: "Clients that need attention: {n}, with {open} invoice(s) still failing.",
    idle: "Clients not checked in the last {days} days: {n}.",
    never: "Clients never checked: {n}.",
    topRules: "Most frequent rules across all clients: {rules}",
    noneOpen: "Every invoice checked in this period passed or was fixed.",
    open: "Open the workspace for the files, explanations and fixed copies:\n{link}",
    footer:
      "You get this email because the {frequency} summary is turned on for this sign-in address. To stop it, open the workspace and set the email summary to Off, or remove the sign-in address. This summary is generated from your run history; it is not legal or tax advice.",
    weekly: "weekly",
    monthly: "monthly",
  },
  de: {
    subjectAttention: "{firm}: {attention} von {clients} Mandanten mit Handlungsbedarf",
    subjectOk: "{firm}: keine offenen E-Rechnungs-Fehler bei {clients} Mandanten",
    intro: "E-Rechnungs-Übersicht für {firm}, die letzten {days} Tage ({since} bis {today}).",
    totals: "Geprüfte Rechnungen: {files}. Bestanden: {passed}. Nach Korrektur bestanden: {fixed}. Noch fehlerhaft: {open}.",
    attention: "Mandanten mit Handlungsbedarf: {n}, mit {open} noch fehlerhaften Rechnung(en).",
    idle: "Mandanten, die in den letzten {days} Tagen nicht geprüft wurden: {n}.",
    never: "Noch nie geprüfte Mandanten: {n}.",
    topRules: "Häufigste Regeln über alle Mandanten: {rules}",
    noneOpen: "Jede in diesem Zeitraum geprüfte Rechnung hat bestanden oder wurde korrigiert.",
    open: "Öffnen Sie den Arbeitsbereich für die Dateien, Erklärungen und korrigierten Fassungen:\n{link}",
    footer:
      "Sie erhalten diese E-Mail, weil die {frequency} Übersicht für diese Anmeldeadresse eingeschaltet ist. Zum Abbestellen stellen Sie im Arbeitsbereich die E-Mail-Übersicht auf Aus oder entfernen die Anmeldeadresse. Diese Übersicht wird aus Ihrem Prüfverlauf erstellt; sie ist keine Rechts- oder Steuerberatung.",
    weekly: "wöchentliche",
    monthly: "monatliche",
  },
  fr: {
    subjectAttention: "{firm} : {attention} clients sur {clients} à traiter",
    subjectOk: "{firm} : aucune erreur d'e-facture ouverte pour {clients} clients",
    intro: "Synthèse e-facture pour {firm}, les {days} derniers jours (du {since} au {today}).",
    totals: "Factures contrôlées : {files}. Conformes : {passed}. Conformes après correction : {fixed}. Encore non conformes : {open}.",
    attention: "Clients à traiter : {n}, avec {open} facture(s) encore non conforme(s).",
    idle: "Clients non contrôlés depuis {days} jours : {n}.",
    never: "Clients jamais contrôlés : {n}.",
    topRules: "Règles les plus fréquentes, tous clients confondus : {rules}",
    noneOpen: "Chaque facture contrôlée sur la période est conforme ou a été corrigée.",
    open: "Ouvrez l'espace de travail pour les fichiers, les explications et les copies corrigées :\n{link}",
    footer:
      "Vous recevez cet e-mail car la synthèse {frequency} est activée pour cette adresse de connexion. Pour l'arrêter, ouvrez l'espace de travail et réglez la synthèse par e-mail sur Désactivée, ou retirez l'adresse de connexion. Cette synthèse est établie à partir de votre historique de contrôles ; elle ne constitue pas un conseil juridique ou fiscal.",
    weekly: "hebdomadaire",
    monthly: "mensuelle",
  },
  nl: {
    subjectAttention: "{firm}: {attention} van {clients} klanten vragen actie",
    subjectOk: "{firm}: geen openstaande e-factuurfouten bij {clients} klanten",
    intro: "E-factuuroverzicht voor {firm}, de laatste {days} dagen ({since} tot {today}).",
    totals: "Gecontroleerde facturen: {files}. Goedgekeurd: {passed}. Goedgekeurd na correctie: {fixed}. Nog afgekeurd: {open}.",
    attention: "Klanten die actie vragen: {n}, met {open} factuur/facturen nog afgekeurd.",
    idle: "Klanten niet gecontroleerd in de laatste {days} dagen: {n}.",
    never: "Klanten nooit gecontroleerd: {n}.",
    topRules: "Meest voorkomende regels bij alle klanten: {rules}",
    noneOpen: "Elke factuur die in deze periode is gecontroleerd, is goedgekeurd of gecorrigeerd.",
    open: "Open de werkruimte voor de bestanden, uitleg en gecorrigeerde versies:\n{link}",
    footer:
      "U ontvangt deze e-mail omdat het {frequency} overzicht voor dit aanmeldadres is ingeschakeld. Om het te stoppen, zet u in de werkruimte het e-mailoverzicht op Uit, of verwijdert u het aanmeldadres. Dit overzicht is gemaakt uit uw controlegeschiedenis; het is geen juridisch of fiscaal advies.",
    weekly: "wekelijkse",
    monthly: "maandelijkse",
  },
  pl: {
    subjectAttention: "{firm}: {attention} z {clients} klientów wymaga uwagi",
    subjectOk: "{firm}: brak otwartych błędów e-faktur u {clients} klientów",
    intro: "Podsumowanie e-faktur dla {firm}, ostatnie {days} dni (od {since} do {today}).",
    totals: "Sprawdzone faktury: {files}. Poprawne: {passed}. Poprawne po korekcie: {fixed}. Nadal błędne: {open}.",
    attention: "Klienci wymagający uwagi: {n}; nadal błędne faktury: {open}.",
    idle: "Klienci niesprawdzani w ostatnich {days} dniach: {n}.",
    never: "Klienci nigdy niesprawdzani: {n}.",
    topRules: "Najczęstsze reguły u wszystkich klientów: {rules}",
    noneOpen: "Każda faktura sprawdzona w tym okresie jest poprawna lub została poprawiona.",
    open: "Otwórz obszar roboczy, aby zobaczyć pliki, wyjaśnienia i poprawione wersje:\n{link}",
    footer:
      "Otrzymujesz tę wiadomość, ponieważ dla tego adresu logowania włączono {frequency} podsumowanie. Aby je wyłączyć, ustaw w obszarze roboczym podsumowanie e-mail na Wył. lub usuń adres logowania. To podsumowanie powstaje z historii sprawdzeń; nie jest poradą prawną ani podatkową.",
    weekly: "cotygodniowe",
    monthly: "comiesięczne",
  },
};

/** @param {string} tpl @param {Record<string, string | number>} vars */
const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** @param {{ rule: string, files: number }[]} rules */
const ruleList = (rules) => rules.map((r) => `${oneLine(r.rule, 60)} (${r.files})`).join(", ");

/**
 * The summary as one plain-text email, or null when the account has no clients (nothing to say).
 * @param {Dashboard} d
 * @param {{ lang: unknown, firm: string, link: string, frequency: "weekly" | "monthly" }} o
 * @returns {{ subject: string, text: string } | null}
 */
export function digestMessage(d, o) {
  if (!d.clients.length) return null;
  const t = T[digestLang(o.lang)];
  const firm = oneLine(o.firm, 200) || "—";
  const tot = d.totals;
  const subject = tot.attention
    ? fill(t.subjectAttention, { firm, attention: tot.attention, clients: tot.clients })
    : fill(t.subjectOk, { firm, clients: tot.clients });
  /** @type {string[]} */
  const parts = [
    fill(t.intro, { firm, days: d.days, since: d.since.slice(0, 10), today: d.generatedAt.slice(0, 10) }),
    fill(t.totals, { files: tot.files, passed: tot.passed, fixed: tot.fixedToPass, open: tot.open }),
  ];
  /** @type {string[]} */
  const status = [];
  if (tot.attention) status.push(fill(t.attention, { n: tot.attention, open: tot.open }));
  else status.push(t.noneOpen);
  if (tot.idle) status.push(fill(t.idle, { days: d.days, n: tot.idle }));
  if (tot.never) status.push(fill(t.never, { n: tot.never }));
  parts.push(status.join("\n"));
  if (d.topRules.length) parts.push(fill(t.topRules, { rules: ruleList(d.topRules.slice(0, 5)) }));
  parts.push(fill(t.open, { link: o.link }));
  parts.push(`-- \n${fill(t.footer, { frequency: o.frequency === "monthly" ? t.monthly : t.weekly })}`);
  return { subject, text: `${parts.join("\n\n")}\n` };
}

/**
 * Send one frequency's summaries for one period to every account that asked for it.
 * @param {{ store: any, mailer: import("./email.mjs").Mailer, appUrl: string, now: () => Date,
 *   frequency: "weekly" | "monthly", period?: string, limit?: number }} o
 */
export async function sendDigests(o) {
  const at = o.now();
  const period = o.period ?? digestPeriod(o.frequency, at);
  const limit = Math.min(Math.max(Math.trunc(o.limit ?? DEFAULT_SEND_LIMIT) || DEFAULT_SEND_LIMIT, 1), 500);
  /** @type {import("./store.mjs").Account[]} */
  const accounts = await o.store.listDigestAccounts(o.frequency);
  /** @type {{ accountId: string, status: "sent" | "already_sent" | "no_clients" | "failed", reason?: string }[]} */
  const results = [];
  let sent = 0;
  let more = false;
  for (const account of accounts) {
    if (sent >= limit) {
      more = true;
      break;
    }
    if (!account.email) continue;
    if (!(await o.store.claimDigest(account.id, period))) {
      results.push({ accountId: account.id, status: "already_sent" });
      continue;
    }
    const dash = await dashboardFor(o.store, account.id, (o.frequency === "monthly" ? DIGEST_DAYS.monthly : DIGEST_DAYS.weekly), at);
    const msg = digestMessage(dash, { lang: account.digestLang, firm: account.name, link: `${o.appUrl}/app`, frequency: o.frequency });
    if (!msg) {
      // Claimed all the same: a firm that adds its first client later gets the next period's email.
      results.push({ accountId: account.id, status: "no_clients" });
      continue;
    }
    try {
      await o.mailer.send({ to: account.email, ...msg });
      sent++;
      results.push({ accountId: account.id, status: "sent" });
    } catch (e) {
      await o.store.releaseDigest(account.id, period);
      results.push({ accountId: account.id, status: "failed", reason: (e instanceof Error ? e.message : "unknown").slice(0, 200) });
    }
  }
  return { frequency: o.frequency, period, sent, more, results };
}
