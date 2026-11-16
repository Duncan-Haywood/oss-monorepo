// Zero-dependency, deterministic estimate of a monthly Supabase Pro bill from the
// usage numbers the user types or pastes (it is on the Usage page of the Supabase
// dashboard), plus a ranked list of the changes that would cut it most, each
// with a dollar figure. Pure data in, report out -- no filesystem or network
// here (cli.mjs and index.html supply the input).
//
// This is arithmetic on the user's own inputs and editable list prices. It is
// not a bill reader and not a guarantee: Supabase's real invoice depends on the
// plan, regions, spend management, enterprise contracts and metering rules this
// file does not reproduce.

export const PRICES_AS_OF = "Supabase Pro-plan list prices checked against Supabase's pricing documentation (egress, disk-size, storage-size and cost-control pages) on 2026-11-16; verify at https://supabase.com/pricing";
export const PRICING_URL = "https://supabase.com/pricing";

// Editable. `included` is what the Pro plan bundles per month. Each Pro
// organization gets its own quotas and its own $10 compute credit, so lines
// marked `perOrg` scale their allowance by the number of orgs entered.
// Database disk is per project instead (`perProject`: 8 GB for each project's
// primary gp3 disk), scaled by `db_projects` (one per org when left at 0).
// Uncached and cached egress are separate meters with independent 250 GB
// quotas ($0.09 and $0.03 per GB over). `spendCap` marks the lines the Pro
// spend cap covers (docs, cost-control): with the cap on, their overage is not
// billed and the service is restricted instead. `rate` is the overage price per
// `per` units. Compute is entered as the USD list price of the instances you
// run, and the $10 of bundled compute credit is modeled as that line's
// allowance; compute is not covered by the spend cap.
export const DEFAULT_PRICES = {
  pro_orgs: { label: "Pro organizations (per org)", unit: "organizations", rate: 25, per: 1, included: 0 },
  compute_usd: { label: "Compute instances (USD list price of your add-ons)", unit: "USD of compute", rate: 1, per: 1, included: 10, perOrg: true },
  db_disk_gb: { label: "Database disk, provisioned gp3 (per GB)", unit: "GB", rate: 0.125, per: 1, included: 8, perProject: true, spendCap: true },
  egress_gb: { label: "Uncached egress (per GB)", unit: "GB", rate: 0.09, per: 1, included: 250, perOrg: true, spendCap: true },
  cached_egress_gb: { label: "Cached egress, served from the CDN (per GB)", unit: "GB", rate: 0.03, per: 1, included: 250, perOrg: true, spendCap: true },
  storage_gb: { label: "File storage (per GB)", unit: "GB", rate: 0.0213, per: 1, included: 100, perOrg: true, spendCap: true },
  mau_thousand: { label: "Monthly active users (per thousand)", unit: "thousand users", rate: 3.25, per: 1, included: 100, perOrg: true, spendCap: true },
  edge_invocations_million: { label: "Edge Function invocations (per million)", unit: "million invocations", rate: 2, per: 1, included: 2, perOrg: true, spendCap: true },
  realtime_messages_million: { label: "Realtime messages (per million)", unit: "million messages", rate: 2.5, per: 1, included: 5, perOrg: true, spendCap: true },
};

// Compute is already net of the bundled credit through its allowance, so no
// separate usage credit is applied by default (the field stays editable).
export const DEFAULT_CREDIT_USD = 0;

// What each lever *assumes*. A saving is "if you did this much of it", so
// every assumption is shown next to the dollar figure and can be overridden.
export const DEFAULT_ASSUMPTIONS = {
  egressPct: 30, // share of uncached egress removed by narrower selects, compression and resized images
  cdnPct: 30, // share of uncached egress moved to cached egress by serving storage files through the Smart CDN
  storagePct: 25, // share of file storage removed by deleting orphaned and duplicate objects
  computePct: 30, // share of compute spend removed by rightsizing the instance after checking CPU and memory
  diskPct: 25, // share of database disk removed by archiving old rows, dropping unused indexes and vacuuming bloat
  edgePct: 40, // share of Edge Function invocations removed by caching responses and batching calls
  realtimePct: 30, // share of Realtime messages removed by batching and by broadcasting less often
  authPct: 15, // share of monthly active users that are bot or throwaway sign-ups you can block
  orgPct: 20, // share of Pro organizations that could be merged into another
};

// Every priced line is a usage field, plus the project count that scales the
// per-project disk quota (0 means one project per organization).
export const USAGE_FIELDS = [
  ...Object.entries(DEFAULT_PRICES).map(([key, p]) => ({ key, label: p.label.replace(/ \(per .*\)$/, ""), unit: p.unit, def: 0 })),
  { key: "db_projects", label: "Projects (each with its own 8 GB disk quota; 0 = one per org)", unit: "projects", def: 0 },
];

const KEYS = new Map(USAGE_FIELDS.map((f) => [f.key, f]));
export const CSV_TEMPLATE = ["product,usage", ...USAGE_FIELDS.map((f) => `${f.key},${f.def}`)].join("\n");

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Parses the documented `product,usage` CSV (header optional, `#` comments and
 * blank lines ignored, `=` accepted for `,`). Unknown products are returned in
 * `unknown` and ignored; unparseable values are returned in `errors`.
 */
export function parseUsageCsv(text) {
  const usage = {};
  const errors = [];
  const unknown = [];
  String(text ?? "").split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const m = /^([^,=]+?)\s*[,=]\s*(.*)$/.exec(line);
    if (!m) { errors.push(`line ${idx + 1}: expected "product,usage"`); return; }
    const key = m[1].trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/^["']|["']$/g, "");
    const val = m[2].trim().replace(/^["']|["']$/g, "");
    if (key === "product" && /^usage$/i.test(val)) return; // header
    if (!KEYS.has(key)) { unknown.push(key); return; }
    const n = Number(val.replace(/[_\s,]/g, ""));
    if (!val || !Number.isFinite(n) || n < 0) { errors.push(`line ${idx + 1}: ${key} needs a non-negative number, got "${val}"`); return; }
    usage[key] = n;
  });
  return { usage, errors, unknown };
}

/** Fills defaults so every key is present. */
export function normalizeUsage(partial = {}) {
  const u = {};
  for (const f of USAGE_FIELDS) u[f.key] = Number.isFinite(partial[f.key]) && partial[f.key] >= 0 ? partial[f.key] : f.def;
  return u;
}

/** Projects whose disks share the per-project quota: the number entered, or one per organization. */
export function projectCount(u) {
  return Math.max(1, u.db_projects || 0, u.pro_orgs || 0);
}

/**
 * Line items and total for a usage record. Any extra usage credit offsets
 * usage lines, never the organization fee. `withSpendCap` is the same bill
 * with the Pro spend cap on (Supabase's default for Pro organizations): the
 * overage on capped lines is not billed, and those services are restricted
 * once their quota runs out instead.
 *
 * Disk is entered as the total provisioned across projects and checked
 * against the pooled per-project quota, so a project below 8 GB is treated as
 * lending its unused quota to a larger one; Supabase does not, so with uneven
 * projects the disk line is a lower bound (enter only the over-8 GB projects
 * and their count to get it exact).
 */
export function estimateBill(usageIn, prices = DEFAULT_PRICES, creditUsd = DEFAULT_CREDIT_USD) {
  const u = normalizeUsage(usageIn);
  const items = [];
  const orgs = Math.max(1, u.pro_orgs ?? 0);
  const projects = projectCount(u);
  for (const [key, p] of Object.entries(prices)) {
    const quantity = u[key] ?? 0;
    const mult = p.perProject ? projects : p.perOrg ? orgs : 1;
    const included = p.included * mult;
    const billable = Math.max(0, quantity - included);
    const scaleNote = mult > 1 ? ` (${p.included} per ${p.perProject ? "project" : "org"} x ${mult})` : "";
    items.push({
      key, label: p.label, quantity, unit: p.unit, billable, rate: p.rate, spendCap: Boolean(p.spendCap),
      monthly: round2((billable / p.per) * p.rate),
      note: included ? `${round2(included)} ${p.unit} included${scaleNote}` : "",
    });
  }
  const pro_orgs = items.find((i) => i.key === "pro_orgs")?.monthly ?? 0;
  const usageLines = items.filter((i) => i.key !== "pro_orgs");
  const usageCharges = round2(usageLines.reduce((n, i) => n + i.monthly, 0));
  const credit = round2(Math.min(creditUsd, usageCharges));
  const total = round2(pro_orgs + usageCharges - credit);
  const cappedOverage = round2(usageLines.filter((i) => i.spendCap).reduce((n, i) => n + i.monthly, 0));
  const uncapped = round2(usageCharges - cappedOverage);
  const withSpendCap = round2(pro_orgs + uncapped - Math.min(creditUsd, uncapped));
  return { usage: u, items, pro_orgs, usageCharges, credit, total, annual: round2(total * 12), cappedOverage, withSpendCap };
}

/**
 * Ranked levers, largest saving first. Each saving is the difference between
 * the baseline estimate and the same estimate with that one change applied,
 * under the stated assumption. Levers overlap (caching and bot blocking both
 * remove the same invocations), so the savings are NOT additive.
 */
export function rankLevers(usageIn, prices = DEFAULT_PRICES, assumptions = DEFAULT_ASSUMPTIONS, creditUsd = DEFAULT_CREDIT_USD) {
  const u = normalizeUsage(usageIn);
  const base = estimateBill(u, prices, creditUsd).total;
  const A = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const keep = (n) => 1 - Math.min(100, Math.max(0, n)) / 100;
  const levers = [];
  const scale = (keys, k) => Object.fromEntries(keys.map((key) => [key, u[key] * k]));
  const push = (id, title, assumption, change) => {
    const next = estimateBill({ ...u, ...change }, prices, creditUsd).total;
    const saving = round2(base - next);
    if (saving > 0.005) levers.push({ id, title, assumption, saving, after: round2(next), pctOfBill: base ? round2((saving / base) * 100) : 0 });
  };

  push("trim-egress", "Trim uncached egress: narrower selects instead of select *, compression, resized images",
    `${A.egressPct}% less uncached egress`, scale(["egress_gb"], keep(A.egressPct)));
  // Caching does not remove egress: it moves it to the cached meter ($0.03 a GB, its own 250 GB quota).
  const moved = u.egress_gb * (1 - keep(A.cdnPct));
  push("serve-from-cdn", "Serve storage files through the Smart CDN so cache hits bill as cached egress ($0.03 a GB, not $0.09)",
    `${A.cdnPct}% of uncached egress becomes cached`, { egress_gb: u.egress_gb - moved, cached_egress_gb: u.cached_egress_gb + moved });
  push("rightsize-compute", "Rightsize compute: check CPU and memory, then drop to a smaller instance size",
    `${A.computePct}% less compute spend`, scale(["compute_usd"], keep(A.computePct)));
  push("shrink-database", "Shrink the database (archive old rows, drop unused indexes, vacuum bloat), then reduce the provisioned disk: deleting rows alone does not shrink a billed disk",
    `${A.diskPct}% less provisioned disk`, scale(["db_disk_gb"], keep(A.diskPct)));
  push("clean-storage", "Clean up storage: delete orphaned and duplicate objects, set expiry on temp files",
    `${A.storagePct}% less file storage`, scale(["storage_gb"], keep(A.storagePct)));
  push("cache-edge", "Cache Edge Function responses and batch calls so fewer invocations run",
    `${A.edgePct}% fewer invocations`, scale(["edge_invocations_million"], keep(A.edgePct)));
  push("batch-realtime", "Batch Realtime messages and broadcast less often",
    `${A.realtimePct}% fewer messages`, scale(["realtime_messages_million"], keep(A.realtimePct)));
  push("block-fake-signups", "Block bot and throwaway sign-ups with CAPTCHA and email verification",
    `${A.authPct}% of monthly active users are fake`, scale(["mau_thousand"], keep(A.authPct)));
  // Merging needs two orgs; it removes whole orgs (at least one) and their
  // quotas, while the projects (and their disk quotas) move, not vanish.
  if (u.pro_orgs >= 2) {
    const merged = Math.max(1, Math.round(u.pro_orgs * (1 - keep(A.orgPct))));
    push("merge-orgs", "Consolidate small projects into fewer Pro organizations",
      `${merged} of ${u.pro_orgs} organizations merged into the others`, { pro_orgs: u.pro_orgs - merged, db_projects: projectCount(u) });
  }

  levers.sort((a, b) => b.saving - a.saving || (a.id < b.id ? -1 : 1));
  return levers;
}

/** Summary and budget gate. `budget` is monthly USD or null. */
export function summarize(estimate, levers, { budget = null } = {}) {
  const overBudget = budget != null && estimate.total > budget;
  const errors = overBudget ? 1 : 0;
  if (estimate.items.every((i) => i.quantity === 0)) return { status: "none", errors, overBudget, text: "No usage entered. Fill in at least one product (or paste a product,usage CSV)." };
  let text = `Estimated ${fmt(estimate.total)} per month (${fmt(estimate.annual)} per year) at the list prices shown.`;
  if (levers.length) text += ` Biggest lever: ${levers[0].title.split(":")[0]}, about ${fmt(levers[0].saving)} per month under its stated assumption.`;
  if (estimate.cappedOverage > 0) text += ` With the Pro spend cap on (Supabase's default), ${fmt(estimate.cappedOverage)} of that is overage you would not be billed for: those services are restricted once their quota runs out instead, for a bill of ${fmt(estimate.withSpendCap)}.`;
  if (overBudget) text += ` Over your ${fmt(budget)} monthly budget by ${fmt(estimate.total - budget)}.`;
  return { status: errors ? "error" : "ok", errors, overBudget, text };
}

export function fmt(n) {
  const format = (n) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(n));
  return n < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}
