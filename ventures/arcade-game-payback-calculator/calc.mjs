// Arcade and family-entertainment-center game maths: for each game, weekly plays, credits per play and tickets paid out become revenue,
// card fees, prize cost, floor rent, power and upkeep, then weekly profit, payback on what the game cost, break-even plays, the plays a week
// needed to hit your payback target, and a keep / watch / cut verdict. Pure functions, no DOM, no network.
// Every figure is the operator's own input; nothing here is a market rate, a play count benchmark or a forecast.

export const SAMPLE = {
  creditValue: "0.25", prizePerTicket: "0.004", feesPct: "3", rentPerSqft: "24", energyMonthly: "25", maintPct: "8", targetPaybackMonths: "18", defaultSqft: "12", maxPayoutPct: "8",
  games: [
    "Skee-style roller, 4000, 4, 250, 10, 12",
    "Basketball shoot, 5500, 4, 210, 8, 20",
    "Racing sit-down, 9000, 6, 140, 0, 30",
    "Claw crane, 3200, 2, 330, 0, 10",
    "Cranky coin pusher, 6000, 2, 120, 22, 15",
    "Old pinball, 2500, 3, 25, 0, 18",
  ].join("\n"),
};

const num = (v) => {
  const s = String(v ?? "").replace(/[$,%\s]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const opt = (v, d) => (String(v ?? "").trim() === "" ? d : num(v));
const whole = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");
const money2 = (n) => (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
export const WEEKS_PER_MONTH = 52 / 12;
export const MAX_GAMES = 200;

export function parseGames(text, defaultSqft) {
  const errors = [], games = [];
  const lines = String(text ?? "").split(/\r?\n/).map((l, i) => [i + 1, l.trim()]).filter(([, l]) => l !== "");
  for (const [ln, line] of lines) {
    const p = line.split(/[,\t]/).map((s) => s.trim());
    if (p.length < 5 || p.length > 6) { errors.push(`Line ${ln}: use name, game cost, credits per play, plays per week, tickets per play, square feet (square feet is optional).`); continue; }
    const [name, cost, credits, plays, tickets, sqftRaw] = [p[0], num(p[1]), num(p[2]), num(p[3]), num(p[4]), p[5] === undefined || p[5] === "" ? defaultSqft : num(p[5])];
    if (!name) { errors.push(`Line ${ln}: the game needs a name.`); continue; }
    if (!(cost > 0)) { errors.push(`Line ${ln} (${name}): game cost must be more than 0.`); continue; }
    if (!(credits > 0)) { errors.push(`Line ${ln} (${name}): credits per play must be more than 0.`); continue; }
    if (!(plays >= 0)) { errors.push(`Line ${ln} (${name}): plays per week must be 0 or more.`); continue; }
    if (!(tickets >= 0)) { errors.push(`Line ${ln} (${name}): tickets per play must be 0 or more (0 for a game that pays none).`); continue; }
    if (!(sqftRaw >= 1 && sqftRaw <= 500)) { errors.push(`Line ${ln} (${name}): square feet must be from 1 to 500.`); continue; }
    games.push({ name, cost, credits, plays, tickets, sqft: sqftRaw });
  }
  if (!errors.length && games.length === 0) errors.push("Enter at least one game, one per line.");
  if (games.length > MAX_GAMES) errors.push(`Enter at most ${MAX_GAMES} games.`);
  return { games, errors };
}

export function parse(raw) {
  const errors = [];
  const creditValue = num(raw.creditValue);
  if (!(creditValue > 0)) errors.push("Enter what one credit earns you, in dollars (more than 0). Use your average after card bonuses and discounts.");
  const prizePerTicket = opt(raw.prizePerTicket, 0), feesPct = opt(raw.feesPct, 0), rentPerSqft = opt(raw.rentPerSqft, 0), energyMonthly = opt(raw.energyMonthly, 0), maintPct = opt(raw.maintPct, 0);
  const targetPaybackMonths = opt(raw.targetPaybackMonths, 24), defaultSqft = opt(raw.defaultSqft, 12), maxPayoutPct = opt(raw.maxPayoutPct, null);
  for (const [n, v] of [["Prize cost per ticket", prizePerTicket], ["Rent per square foot", rentPerSqft], ["Power per game per month", energyMonthly]]) if (!(v >= 0)) errors.push(`${n} must be 0 or more.`);
  if (!(feesPct >= 0 && feesPct < 30)) errors.push("Card and platform fees must be from 0 to under 30 percent of revenue.");
  if (!(maintPct >= 0 && maintPct <= 100)) errors.push("Repairs and parts must be 0 to 100 percent of game cost per year.");
  if (!(targetPaybackMonths > 0 && targetPaybackMonths <= 120)) errors.push("Target payback must be more than 0 and at most 120 months.");
  if (!(defaultSqft >= 1 && defaultSqft <= 500)) errors.push("Default square feet per game must be from 1 to 500.");
  if (maxPayoutPct !== null && !(maxPayoutPct >= 0 && maxPayoutPct <= 100)) errors.push("Prize cost limit must be 0 to 100 percent of revenue, or blank.");
  const g = parseGames(raw.games, defaultSqft);
  errors.push(...g.errors);
  return { errors, input: { creditValue, prizePerTicket, feesPct, rentPerSqft, energyMonthly, maintPct, targetPaybackMonths, defaultSqft, maxPayoutPct }, games: g.games };
}

function evaluate(game, i, scale = {}) {
  const cv = i.creditValue * (scale.price ?? 1), ppt = i.prizePerTicket * (scale.prize ?? 1);
  const revenue = game.plays * game.credits * cv;
  const fees = revenue * i.feesPct / 100;
  const prize = game.plays * game.tickets * ppt;
  const rent = game.sqft * i.rentPerSqft / 52;
  const energy = i.energyMonthly / WEEKS_PER_MONTH;
  const maint = game.cost * i.maintPct / 100 / 52;
  const fixed = rent + energy + maint;
  const net = revenue - fees - prize - fixed;
  const perPlay = game.credits * cv * (1 - i.feesPct / 100) - game.tickets * ppt;
  return { revenue, fees, prize, rent, energy, maint, fixed, net, perPlay };
}

export function compute(raw) {
  const p = parse(raw);
  if (p.errors.length) return { errors: p.errors };
  const i = p.input;
  const targetWeeks = i.targetPaybackMonths * WEEKS_PER_MONTH;
  const rows = p.games.map((game) => {
    const e = evaluate(game, i);
    const paybackWeeks = e.net > 0 ? game.cost / e.net : null;
    const breakEvenPlays = e.perPlay > 0 ? e.fixed / e.perPlay : null;
    const needPlays = e.perPlay > 0 ? (game.cost / targetWeeks + e.fixed) / e.perPlay : null;
    const verdict = paybackWeeks === null ? "cut" : paybackWeeks <= targetWeeks ? "keep" : "watch";
    return { ...game, ...e, paybackWeeks, paybackMonths: paybackWeeks === null ? null : paybackWeeks / WEEKS_PER_MONTH, roiYear: e.net * 52 / game.cost, netPerSqftYear: e.net * 52 / game.sqft, breakEvenPlays, needPlays, payoutPct: e.revenue > 0 ? e.prize / e.revenue : null, verdict };
  });
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  const totals = { cost: sum("cost"), revenue: sum("revenue"), fees: sum("fees"), prize: sum("prize"), fixed: sum("fixed"), net: sum("net"), sqft: sum("sqft"), plays: sum("plays") };
  totals.tickets = rows.reduce((a, r) => a + r.plays * r.tickets, 0);
  totals.margin = totals.revenue > 0 ? totals.net / totals.revenue : null;
  totals.paybackWeeks = totals.net > 0 ? totals.cost / totals.net : null;
  totals.payoutPct = totals.revenue > 0 ? totals.prize / totals.revenue : null;
  const sweepNet = (scale) => p.games.reduce((a, g) => a + evaluate(g, i, scale).net, 0);
  const sweepRev = (scale) => p.games.reduce((a, g) => a + evaluate(g, i, scale).revenue, 0);
  const priceSweep = [-20, -10, 0, 10, 20].map((pct) => { const net = sweepNet({ price: 1 + pct / 100 }); return { pct, net, annual: net * 52, margin: sweepRev({ price: 1 + pct / 100 }) > 0 ? net / sweepRev({ price: 1 + pct / 100 }) : null }; });
  const prizeSweep = [-20, -10, 0, 10, 20].map((pct) => { const net = sweepNet({ prize: 1 + pct / 100 }); return { pct, net, annual: net * 52 }; });
  const cutNow = rows.filter((r) => r.verdict === "cut");
  const reclaimed = cutNow.reduce((a, r) => a + (-r.net), 0);
  const findings = [];
  for (const r of cutNow) findings.push({ severity: "high", title: `${r.name} loses ${money2(-r.net)} a week after floor, power and upkeep. Plays would need to reach about ${r.breakEvenPlays === null ? "n/a (each play loses money)" : Math.ceil(r.breakEvenPlays) + " a week"} to break even${r.breakEvenPlays === null ? "; raise its price or cut its tickets" : ""}.` });
  for (const r of rows.filter((x) => x.verdict === "watch")) findings.push({ severity: "medium", title: `${r.name} pays back in ${r.paybackMonths.toFixed(1)} months against your ${i.targetPaybackMonths}-month target; it needs about ${r.needPlays === null ? "n/a" : Math.ceil(r.needPlays)} plays a week (now ${r.plays}).` });
  if (i.maxPayoutPct !== null) for (const r of rows.filter((x) => x.payoutPct !== null && x.payoutPct * 100 > i.maxPayoutPct)) findings.push({ severity: "medium", title: `${r.name} spends ${(r.payoutPct * 100).toFixed(1)}% of its revenue on prizes, above your ${i.maxPayoutPct}% limit. The tickets per play that meets it is ${(i.maxPayoutPct / 100 * r.credits * i.creditValue / i.prizePerTicket).toFixed(1)}.` });
  const byNetPerSqft = [...rows].sort((a, b) => b.netPerSqftYear - a.netPerSqftYear);
  findings.push({ severity: "info", title: `Best use of floor: ${byNetPerSqft[0].name} at ${whole(byNetPerSqft[0].netPerSqftYear)} a year per square foot; weakest: ${byNetPerSqft[byNetPerSqft.length - 1].name} at ${whole(byNetPerSqft[byNetPerSqft.length - 1].netPerSqftYear)}.` });
  findings.push({ severity: "info", title: `The floor issues about ${Math.round(totals.tickets).toLocaleString("en-US")} tickets a week, a prize cost of ${whole(totals.prize)} a week at ${i.prizePerTicket} a ticket.` });
  return { errors: [], input: i, rows, totals, priceSweep, prizeSweep, findings, reclaimed, targetWeeks };
}

export function summaryText(r) {
  const t = r.totals, L = [];
  L.push("ARCADE GAME PAYBACK SUMMARY");
  L.push(`Games: ${r.rows.length}   Floor: ${t.sqft} sq ft   Cost of games: ${whole(t.cost)}`);
  L.push(`Weekly revenue ${whole(t.revenue)}, fees ${whole(t.fees)}, prizes ${whole(t.prize)}, floor/power/upkeep ${whole(t.fixed)}`);
  L.push(`Weekly profit ${whole(t.net)} (${t.margin === null ? "n/a" : (t.margin * 100).toFixed(1) + "% margin"}); whole-floor payback ${t.paybackWeeks === null ? "never at this level" : (t.paybackWeeks / WEEKS_PER_MONTH).toFixed(1) + " months"}`);
  L.push("");
  L.push("Per game (profit per week, payback months, verdict):");
  for (const x of [...r.rows].sort((a, b) => b.net - a.net)) L.push(`  ${x.name}: ${money2(x.net)}/wk, ${x.paybackMonths === null ? "no payback" : x.paybackMonths.toFixed(1) + " mo"}, ${x.verdict.toUpperCase()}`);
  L.push("");
  for (const f of r.findings) L.push(`[${f.severity}] ${f.title}`);
  L.push("");
  L.push("Your own figures; not a forecast, not advice.");
  return L.join("\n");
}

const csvCell = (v) => { const s = String(v); return /^[=+\-@\t\r]/.test(s) || /[",\n]/.test(s) ? `"${(/^[=+\-@\t\r]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };
export function sweepCsv(r) {
  const head = ["game", "cost", "plays_per_week", "revenue_per_week", "prize_cost_per_week", "profit_per_week", "payback_months", "break_even_plays", "plays_needed_for_target", "profit_per_sqft_year", "verdict"];
  const lines = [head.join(",")];
  for (const x of r.rows) lines.push([x.name, x.cost, x.plays, x.revenue.toFixed(2), x.prize.toFixed(2), x.net.toFixed(2), x.paybackMonths === null ? "" : x.paybackMonths.toFixed(1), x.breakEvenPlays === null ? "" : x.breakEvenPlays.toFixed(1), x.needPlays === null ? "" : x.needPlays.toFixed(1), x.netPerSqftYear.toFixed(2), x.verdict].map(csvCell).join(","));
  return lines.join("\n") + "\n";
}
