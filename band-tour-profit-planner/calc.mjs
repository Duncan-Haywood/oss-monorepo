// Band tour profit planner: per-show and whole-tour profit for a touring act.
// Pure functions, no I/O. Money is in dollars, distance in miles.

export const DEFAULTS = {
  members: 4, crew: 0, costPerMile: 0.6, roomCost: 110, occupancy: 2,
  perDiem: 25, merchCogsPct: 35, merchCutPct: 15, agentPct: 10, crewPerShow: 0, vanFlat: 0,
};
const MAX_DRAW = 20000;

const num = (v, d) => {
  if (v === undefined || v === null || String(v).trim() === "") return d;
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (n) => Math.round(n * 100) / 100;

export function readSettings(f = {}) {
  const errors = [];
  const s = {};
  for (const k of Object.keys(DEFAULTS)) {
    const n = num(f[k], DEFAULTS[k]);
    if (!Number.isFinite(n) || n < 0) { errors.push(`${k} must be a number of 0 or more.`); s[k] = DEFAULTS[k]; } else s[k] = n;
  }
  if (s.members < 1) errors.push("members must be at least 1.");
  if (s.occupancy < 1) errors.push("occupancy must be at least 1 person per room.");
  if (s.merchCogsPct + s.merchCutPct > 100) errors.push("Merch cost plus venue cut cannot exceed 100%.");
  if (s.agentPct > 100) errors.push("agentPct cannot exceed 100.");
  s.target = num(f.target, 0);
  if (!Number.isFinite(s.target)) { errors.push("target must be a number."); s.target = 0; }
  return { settings: s, errors };
}

// "Denver CO: miles 280; draw 120; ticket 15; deal vs 400 80 600; merch 4.5; nights 1"
const KEYS = { miles: 1, draw: 1, ticket: 1, merch: 1, cut: 1, nights: 1, other: 1, deal: 3 };

export function parseDeal(tokens) {
  const kind = (tokens[0] || "").toLowerCase();
  const n = (i) => num(tokens[i], NaN);
  if (kind === "flat") { const g = n(1); return Number.isFinite(g) && g >= 0 ? { kind, guarantee: g, pct: 0, expenses: 0 } : null; }
  if (kind === "door") {
    const p = n(1); const e = tokens.length > 2 ? n(2) : 0;
    return Number.isFinite(p) && p >= 0 && p <= 100 && Number.isFinite(e) && e >= 0 ? { kind, guarantee: 0, pct: p, expenses: e } : null;
  }
  if (kind === "vs") {
    const g = n(1); const p = n(2); const e = tokens.length > 3 ? n(3) : 0;
    return [g, p, e].every(Number.isFinite) && g >= 0 && p >= 0 && p <= 100 && e >= 0 ? { kind, guarantee: g, pct: p, expenses: e } : null;
  }
  return null;
}

export function readShows(text) {
  const shows = []; const errors = [];
  String(text || "").split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const c = line.indexOf(":");
    const name = (c < 0 ? "" : line.slice(0, c)).trim();
    if (!name) { errors.push(`Line ${i + 1}: start with a show name and a colon, like "Denver CO: miles 280; draw 120".`); return; }
    const sh = { name, miles: 0, draw: 0, ticket: 0, merch: 0, cut: null, nights: 0, other: 0, deal: { kind: "flat", guarantee: 0, pct: 0, expenses: 0 } };
    let bad = false;
    for (const part of line.slice(c + 1).split(";")) {
      const toks = part.trim().split(/\s+/).filter(Boolean);
      if (!toks.length) continue;
      const key = toks[0].toLowerCase();
      if (!(key in KEYS)) { errors.push(`Line ${i + 1} (${name}): unknown field "${toks[0]}". Use miles, draw, ticket, deal, merch, cut, nights, other.`); bad = true; continue; }
      if (key === "deal") {
        const d = parseDeal(toks.slice(1));
        if (!d) { errors.push(`Line ${i + 1} (${name}): deal must be "flat 400", "door 80 600" (percent, expenses) or "vs 400 80 600" (guarantee, percent, expenses).`); bad = true; } else sh.deal = d;
        continue;
      }
      const v = num(toks[1], NaN);
      if (!Number.isFinite(v) || v < 0) { errors.push(`Line ${i + 1} (${name}): ${key} needs a number of 0 or more.`); bad = true; continue; }
      sh[key] = v;
    }
    if (!bad) shows.push(sh);
  });
  if (!shows.length && !errors.length) errors.push("Add at least one show.");
  return { shows, errors };
}

// Fee paid by the venue, from expected paid attendance.
export function venuePay(deal, draw, ticket) {
  const gross = draw * ticket;
  const share = Math.max(0, (deal.pct / 100) * (gross - deal.expenses));
  if (deal.kind === "flat") return deal.guarantee;
  if (deal.kind === "door") return share;
  return Math.max(deal.guarantee, share);
}

export function showProfit(show, settings, drawOverride) {
  const draw = drawOverride === undefined ? show.draw : drawOverride;
  const people = settings.members + settings.crew;
  const fee = venuePay(show.deal, draw, show.ticket);
  const agent = (settings.agentPct / 100) * fee;
  const cut = show.cut === null ? settings.merchCutPct : show.cut;
  const merchGross = draw * show.merch;
  const merchNet = merchGross * (1 - (cut + settings.merchCogsPct) / 100);
  const drive = show.miles * settings.costPerMile;
  const rooms = Math.ceil(people / settings.occupancy);
  const lodging = show.nights * rooms * settings.roomCost;
  const perDiem = settings.perDiem * people;
  const crew = settings.crewPerShow * settings.crew;
  const costs = drive + lodging + perDiem + crew + show.other;
  const profit = fee - agent + merchNet - costs;
  return { draw, fee, agent, merchGross, merchNet, drive, lodging, perDiem, crew, other: show.other, costs, profit, contribution: profit + drive };
}

// Smallest paid attendance at which profit reaches `target` (profit is non-decreasing in draw).
export function drawFor(show, settings, target = 0) {
  if (showProfit(show, settings, 0).profit >= target) return 0;
  if (showProfit(show, settings, MAX_DRAW).profit < target) return null;
  let lo = 0, hi = MAX_DRAW;
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (showProfit(show, settings, mid).profit >= target) hi = mid; else lo = mid; }
  return hi;
}

// Venue fee you would need to ask for to reach `target` at the expected draw.
export function askFor(show, settings, target) {
  const p = showProfit(show, settings);
  const need = p.fee + (target - p.profit) / (1 - settings.agentPct / 100);
  return Math.max(0, r2(need));
}

export function verdict(p) {
  if (p.profit >= 0) return "keep";
  if (p.contribution >= 0) return "on-the-way";
  return "drop";
}

export function planTour(shows, settings) {
  const rows = shows.map((show) => {
    const p = showProfit(show, settings);
    const sens = [0.5, 0.75, 1, 1.25].map((k) => ({ k, draw: Math.round(show.draw * k), profit: r2(showProfit(show, settings, Math.round(show.draw * k)).profit) }));
    return {
      show, ...p, verdict: verdict(p), breakEvenDraw: drawFor(show, settings, 0), targetDraw: drawFor(show, settings, settings.target),
      ask: askFor(show, settings, Math.max(0, settings.target)), sens,
    };
  });
  const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
  const totals = { fee: sum("fee"), merchNet: sum("merchNet"), agent: sum("agent"), drive: sum("drive"), lodging: sum("lodging"), perDiem: sum("perDiem"), crew: sum("crew"), other: sum("other"), miles: rows.reduce((a, r) => a + r.show.miles, 0) };
  const net = r2(rows.reduce((a, r) => a + r.profit, 0) - settings.vanFlat);
  const dropAll = rows.filter((r) => r.verdict === "drop");
  const netIfDropped = r2(net - dropAll.reduce((a, r) => a + r.profit, 0));
  return {
    rows, settings, totals, vanFlat: settings.vanFlat, net,
    perMember: r2(net / settings.members), perMile: totals.miles ? r2(net / totals.miles) : 0,
    losers: rows.filter((r) => r.profit < 0).map((r) => r.show.name), dropList: dropAll.map((r) => r.show.name), netIfDropped,
  };
}

export function validatePlan(plan) {
  const errors = [];
  let net = -plan.vanFlat;
  for (const r of plan.rows) {
    const q = showProfit(r.show, plan.settings);
    if (Math.abs(q.profit - r.profit) > 0.005) errors.push(`${r.show.name}: profit does not recompute.`);
    if (r.breakEvenDraw !== null) {
      if (showProfit(r.show, plan.settings, r.breakEvenDraw).profit < 0) errors.push(`${r.show.name}: break-even draw does not break even.`);
      if (r.breakEvenDraw > 0 && showProfit(r.show, plan.settings, r.breakEvenDraw - 1).profit >= 0) errors.push(`${r.show.name}: break-even draw is not the smallest.`);
    }
    net += r.profit;
  }
  if (Math.abs(net - plan.net) > 0.01) errors.push("Tour total does not equal the sum of the shows.");
  return { ok: errors.length === 0, errors };
}

export function planFromFields(f) {
  const a = readSettings(f); const b = readShows(f.shows);
  const errors = [...a.errors, ...b.errors];
  return { errors, plan: errors.length ? null : planTour(b.shows, a.settings) };
}

const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toFixed(2);
export const money = usd;

export function planCsv(plan) {
  const head = ["Show", "Miles", "Draw", "Venue fee", "Merch net", "Agent", "Drive", "Lodging", "Per diem", "Crew", "Other", "Profit", "Break-even draw", "Verdict"];
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [head.join(",")];
  for (const r of plan.rows) {
    lines.push([q(r.show.name), r.show.miles, r.draw, r2(r.fee), r2(r.merchNet), r2(r.agent), r2(r.drive), r2(r.lodging), r2(r.perDiem), r2(r.crew), r2(r.other), r2(r.profit), r.breakEvenDraw === null ? "never" : r.breakEvenDraw, r.verdict].join(","));
  }
  lines.push(["Van / fixed", "", "", "", "", "", "", "", "", "", "", r2(-plan.vanFlat), "", ""].join(","));
  lines.push(["TOTAL", plan.totals.miles, "", plan.totals.fee, plan.totals.merchNet, plan.totals.agent, plan.totals.drive, plan.totals.lodging, plan.totals.perDiem, plan.totals.crew, plan.totals.other, plan.net, "", ""].join(","));
  return lines.join("\n") + "\n";
}

export function planText(plan) {
  const out = [`TOUR PLAN: ${plan.rows.length} shows, ${plan.totals.miles} miles`, ""];
  for (const r of plan.rows) {
    const be = r.breakEvenDraw === null ? "never breaks even" : `breaks even at ${r.breakEvenDraw} paid`;
    out.push(`${r.show.name}: ${usd(r.profit)} (${r.verdict}; ${be})`);
  }
  out.push("", `Fixed van / rental: ${usd(-plan.vanFlat)}`, `Tour net: ${usd(plan.net)}`, `Per member (${plan.settings.members}): ${usd(plan.perMember)}`);
  if (plan.dropList.length) out.push(`Losing even before driving: ${plan.dropList.join(", ")}`);
  return out.join("\n") + "\n";
}

export function sampleFields() {
  return {
    members: "4", crew: "1", costPerMile: "0.60", roomCost: "105", occupancy: "2", perDiem: "20",
    merchCogsPct: "35", merchCutPct: "15", agentPct: "10", crewPerShow: "50", vanFlat: "250", target: "150",
    shows: [
      "Denver CO: miles 0; draw 140; ticket 15; deal vs 500 80 700; merch 5; nights 0",
      "Salt Lake City UT: miles 520; draw 70; ticket 12; deal flat 350; merch 3.5; nights 1",
      "Boise ID: miles 340; draw 35; ticket 10; deal door 70 300; merch 3; nights 1",
      "Portland OR: miles 430; draw 160; ticket 15; deal vs 600 85 800; merch 6; nights 1",
      "Seattle WA: miles 175; draw 110; ticket 15; deal door 85 650; merch 5; nights 1; other 40",
    ].join("\n"),
  };
}
