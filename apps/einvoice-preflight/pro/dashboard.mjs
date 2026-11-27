// @ts-check
// The accountant's view across every client: which companies sent invoices that still fail, which
// rules fail most, and who has not been checked lately. Built only from the stored run history
// (file names, hashes, statuses and rule ids: invoice contents are never stored), so it costs no
// metering and no model call. Proprietary (see ../LICENSE).

/** @typedef {import("./store.mjs").Client} Client */
/** @typedef {import("./store.mjs").Run} Run */
/** @typedef {import("./store.mjs").RunFile} RunFile */

/**
 * - `attention`: at least one invoice checked in the window still fails (no passing fix, and no
 *   passing re-check of the same file or of its fixed copy since).
 * - `ok`: checked in the window, nothing open.
 * - `idle`: checked before, but not in the window.
 * - `never`: no check yet.
 * @typedef {"attention" | "ok" | "idle" | "never"} ClientStatus
 *
 * @typedef {{ rule: string, files: number }} RuleCount
 * @typedef {{ file: string, sha256: string, checkedAt: string, rules: string[], blocking: number }} OpenFile
 * @typedef {{ id: string, name: string, country: string, vatId: string, reference: string,
 *   status: ClientStatus, lastCheckedAt: string | null, runs: number, files: number, passed: number,
 *   failed: number, fixedToPass: number, open: number, passRate: number | null, topRules: RuleCount[],
 *   openFiles: OpenFile[] }} ClientSummary
 * @typedef {{ days: number, since: string, generatedAt: string,
 *   totals: { clients: number, attention: number, ok: number, idle: number, never: number, runs: number,
 *     files: number, passed: number, failed: number, fixedToPass: number, open: number, passRate: number | null },
 *   topRules: RuleCount[], clients: ClientSummary[] }} Dashboard
 */

export const DEFAULT_DAYS = 30;
export const MAX_DAYS = 366;
/** Rules and open files listed per client; the totals count all of them. */
export const TOP_RULES = 5;
export const OPEN_FILES = 20;

/** @param {unknown} v */
export function dashboardDays(v) {
  const n = Math.floor(Number(v ?? DEFAULT_DAYS));
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
  return Math.min(n, MAX_DAYS);
}

const ORDER = /** @type {Record<ClientStatus, number>} */ ({ attention: 0, idle: 1, never: 2, ok: 3 });

/** @param {Map<string, number>} counts @param {number} [limit] @returns {RuleCount[]} */
function topOf(counts, limit = TOP_RULES) {
  return [...counts]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, limit)
    .map(([rule, files]) => ({ rule, files }));
}

/** @param {number} passed @param {number} files */
const rate = (passed, files) => (files ? Math.round((passed / files) * 1000) / 1000 : null);

/**
 * One client's summary. A file counts once per distinct content (SHA-256), at its latest check in
 * the window, so re-checking the same invoice does not inflate the numbers.
 * @param {Client} client
 * @param {Run[]} runs every run of this client in the window, any order
 * @param {string | null} lastEver the newest run's time, in or out of the window
 * @returns {ClientSummary}
 */
export function summarizeClient(client, runs, lastEver) {
  const sorted = [...runs].sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
  /** @type {Map<string, { f: RunFile, at: string }>} */
  const latest = new Map();
  /** Hashes that passed at some check in the window, oldest first: a later pass closes an earlier failure. */
  /** @type {Map<string, string>} */
  const passedAt = new Map();
  for (const run of sorted) {
    for (const f of run.files ?? []) {
      latest.set(f.sha256, { f, at: run.createdAt });
      if (f.status === "pass") passedAt.set(f.sha256, run.createdAt);
      if (f.fixedSha256 && f.fixedStatus === "pass") passedAt.set(f.fixedSha256, run.createdAt);
    }
  }
  let passed = 0;
  let failed = 0;
  let fixedToPass = 0;
  /** @type {Map<string, number>} */
  const rules = new Map();
  /** @type {OpenFile[]} */
  const open = [];
  for (const [sha, { f, at }] of latest) {
    if (f.status === "pass") {
      passed++;
      continue;
    }
    failed++;
    for (const r of new Set(f.rules ?? [])) rules.set(r, (rules.get(r) ?? 0) + 1);
    const fixed = f.fixedStatus === "pass";
    if (fixed) fixedToPass++;
    // Closed by a fix that passed, or by its fixed copy (or the same bytes) passing a later check.
    const closed = fixed || (f.fixedSha256 && passedAt.has(f.fixedSha256) && /** @type {string} */ (passedAt.get(f.fixedSha256)) >= at);
    if (!closed) open.push({ file: f.file, sha256: sha, checkedAt: at, rules: [...new Set(f.rules ?? [])], blocking: f.blocking ?? 0 });
  }
  open.sort((a, b) => (a.checkedAt < b.checkedAt ? 1 : a.checkedAt > b.checkedAt ? -1 : 0));
  const files = latest.size;
  /** @type {ClientStatus} */
  const status = !lastEver ? "never" : !runs.length ? "idle" : open.length ? "attention" : "ok";
  return {
    id: client.id,
    name: client.name,
    country: client.country ?? "",
    vatId: client.vatId ?? "",
    reference: client.reference ?? "",
    status,
    lastCheckedAt: lastEver,
    runs: runs.length,
    files,
    passed,
    failed,
    fixedToPass,
    open: open.length,
    passRate: rate(passed + fixedToPass, files),
    topRules: topOf(rules),
    openFiles: open.slice(0, OPEN_FILES),
  };
}

/**
 * @param {{ clients: Client[], runsByClient: Map<string, Run[]>, lastByClient: Map<string, string | null>,
 *   now: Date, days: number }} input
 * @returns {Dashboard}
 */
export function buildDashboard({ clients, runsByClient, lastByClient, now, days }) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const summaries = clients.map((c) => summarizeClient(c, runsByClient.get(c.id) ?? [], lastByClient.get(c.id) ?? null));
  summaries.sort(
    (a, b) =>
      ORDER[a.status] - ORDER[b.status] ||
      b.open - a.open ||
      // longest unchecked first among the idle ones
      (a.lastCheckedAt ?? "").localeCompare(b.lastCheckedAt ?? "") * (a.status === "idle" ? 1 : 0) ||
      a.name.localeCompare(b.name),
  );
  // The per-client rule lists are truncated, so the firm-wide ranking counts again from the runs.
  /** @type {Map<string, number>} */
  const rules = new Map();
  for (const c of clients) {
    /** @type {Map<string, RunFile>} */
    const latest = new Map();
    const runs = [...(runsByClient.get(c.id) ?? [])].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    for (const run of runs) for (const f of run.files ?? []) latest.set(f.sha256, f);
    for (const f of latest.values()) if (f.status !== "pass") for (const r of new Set(f.rules ?? [])) rules.set(r, (rules.get(r) ?? 0) + 1);
  }
  const sum = (/** @type {(s: ClientSummary) => number} */ k) => summaries.reduce((n, s) => n + k(s), 0);
  const count = (/** @type {ClientStatus} */ st) => summaries.filter((s) => s.status === st).length;
  const files = sum((s) => s.files);
  const passed = sum((s) => s.passed);
  const fixedToPass = sum((s) => s.fixedToPass);
  return {
    days,
    since,
    generatedAt: now.toISOString(),
    totals: {
      clients: summaries.length,
      attention: count("attention"),
      ok: count("ok"),
      idle: count("idle"),
      never: count("never"),
      runs: sum((s) => s.runs),
      files,
      passed,
      failed: sum((s) => s.failed),
      fixedToPass,
      open: sum((s) => s.open),
      passRate: rate(passed + fixedToPass, files),
    },
    topRules: topOf(rules, 10),
    clients: summaries,
  };
}

/**
 * Every run of one client since `since`, by paging the store's history (newest first, 100 a page),
 * so all four stores serve it without a new query. Returns the newest run's time as well.
 * @param {{ listRuns: (a: string, c: string, o: { limit?: number, before?: string }) => Promise<{ items: Run[], nextCursor: string | null }> }} store
 * @param {string} accountId @param {string} clientId @param {string} since
 * @param {number} [maxPages] a bound on the work one request does
 */
export async function runsSince(store, accountId, clientId, since, maxPages = 50) {
  /** @type {Run[]} */
  const out = [];
  /** @type {string | null} */
  let last = null;
  /** @type {string | undefined} */
  let before;
  for (let page = 0; page < maxPages; page++) {
    const { items, nextCursor } = await store.listRuns(accountId, clientId, { limit: 100, before });
    if (page === 0) last = items[0]?.createdAt ?? null;
    let older = false;
    for (const r of items) {
      if (r.createdAt >= since) out.push(r);
      else older = true;
    }
    if (older || !nextCursor) break;
    before = nextCursor;
  }
  return { runs: out, last };
}

/** A spreadsheet cell: quoted, and a leading = + - @ (or tab/CR) neutralised so it is not run as a formula. @param {unknown} v */
export function csvCell(v) {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n;']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEAD = {
  en: ["Client", "Country", "VAT ID", "Reference", "Status", "Last checked", "Checks", "Invoices", "Passed", "Failed", "Fixed to pass", "Still failing", "Pass rate %", "Top rules"],
  de: ["Mandant", "Land", "USt-IdNr.", "Referenz", "Status", "Zuletzt geprüft", "Prüfläufe", "Rechnungen", "Bestanden", "Fehlerhaft", "Durch Korrektur bestanden", "Noch fehlerhaft", "Quote bestanden %", "Häufigste Regeln"],
  fr: ["Client", "Pays", "N° TVA", "Référence", "Statut", "Dernier contrôle", "Contrôles", "Factures", "Conformes", "Non conformes", "Conformes après correction", "Encore non conformes", "Taux de conformité %", "Règles les plus fréquentes"],
  nl: ["Klant", "Land", "Btw-nummer", "Referentie", "Status", "Laatst gecontroleerd", "Controles", "Facturen", "Goedgekeurd", "Afgekeurd", "Goedgekeurd na correctie", "Nog afgekeurd", "Percentage goedgekeurd %", "Meest voorkomende regels"],
  pl: ["Klient", "Kraj", "NIP / nr VAT", "Numer referencyjny", "Status", "Ostatnie sprawdzenie", "Sprawdzenia", "Faktury", "Poprawne", "Błędne", "Poprawne po korekcie", "Nadal błędne", "Odsetek poprawnych %", "Najczęstsze reguły"],
};
const CSV_STATUS = {
  en: { attention: "needs attention", ok: "ok", idle: "not checked lately", never: "never checked" },
  de: { attention: "Handlungsbedarf", ok: "in Ordnung", idle: "länger nicht geprüft", never: "noch nie geprüft" },
  fr: { attention: "à traiter", ok: "conforme", idle: "pas contrôlé récemment", never: "jamais contrôlé" },
  nl: { attention: "actie nodig", ok: "in orde", idle: "lang niet gecontroleerd", never: "nooit gecontroleerd" },
  pl: { attention: "wymaga uwagi", ok: "w porządku", idle: "dawno nie sprawdzano", never: "nigdy nie sprawdzano" },
};

/** One row per client, UTF-8 with a BOM so Excel opens umlauts and accents correctly. @param {Dashboard} d @param {"de" | "fr" | "en" | "nl" | "pl"} lang */
export function dashboardCsv(d, lang) {
  const head = CSV_HEAD[lang] ?? CSV_HEAD.en;
  const st = CSV_STATUS[lang] ?? CSV_STATUS.en;
  const rows = d.clients.map((c) => [
    c.name,
    c.country,
    c.vatId,
    c.reference,
    st[c.status],
    c.lastCheckedAt ? c.lastCheckedAt.slice(0, 10) : "",
    c.runs,
    c.files,
    c.passed,
    c.failed,
    c.fixedToPass,
    c.open,
    c.passRate === null ? "" : Math.round(c.passRate * 1000) / 10,
    c.topRules.map((r) => `${r.rule} (${r.files})`).join(", "),
  ]);
  return `\ufeff${[head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
