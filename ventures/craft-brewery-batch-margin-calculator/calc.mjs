// Craft brewery batch margin: what a batch really earns once loss, labour, excise and channel costs are taken out.
// Pure functions, no DOM, no network.

export const GAL_PER_BBL = 31;

export const DEFAULT_SETTINGS = {
  lossPct: 10,
  laborHours: 10,
  laborRate: 22,
  otherPerBatch: 90,
  annualBbl: 1200,
  overheadPerMonth: 14000,
  stateExcisePerBbl: 6,
  tankBbl: 15,
  tanks: 4,
  tankUtilPct: 85,
};

// One line per channel: name, units per barrel, price per unit, packaging per unit, other cost per unit, % of sales lost.
export const DEFAULT_CHANNELS = `# name, units per barrel, price per unit, packaging per unit, other cost per unit, percent of sales (bar staff, card fees)
Taproom pints, 248, 6.50, 0.06, 0, 25
Self-distributed kegs, 2, 185, 6, 9, 0
Distributor kegs, 2, 150, 6, 0, 0
Distributor cans, 248, 2.15, 0.38, 0, 0
Taproom cans to go, 248, 4.25, 0.38, 0, 8`;

// One line per beer: name, batch barrels, fermenter days, ingredient cost per batch, channel mix as name:percent;name:percent
export const DEFAULT_BEERS = `# name, batch barrels, fermenter days, ingredients per batch, mix
House IPA, 15, 14, 1150, Taproom pints:40; Self-distributed kegs:30; Distributor cans:30
Pilsner, 15, 21, 760, Taproom pints:55; Distributor kegs:25; Distributor cans:20
Barrel-aged stout, 15, 60, 1900, Taproom pints:30; Taproom cans to go:70`;

const num = (v) => {
  const n = Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const r2 = (x) => Math.round(x * 100) / 100;

export function money(x) {
  const s = Math.abs(Math.round(x)).toLocaleString("en-US");
  return (x < 0 ? "-$" : "$") + s;
}
export function money2(x) {
  return (x < 0 ? "-$" : "$") + Math.abs(x).toFixed(2);
}

// Federal excise (TTB, Craft Beverage Modernization Act rates): brewers making 2,000,000 barrels or fewer a year pay $3.50
// per barrel on the first 60,000 barrels removed and $16 on the rest; larger brewers $16 to 6 million and $18 above.
// The result is the average rate on a brewery's whole year, which is what a batch carries.
export function federalExcisePerBbl(annualBbl) {
  const a = Math.max(0, annualBbl);
  if (a === 0) return 3.5;
  if (a <= 2_000_000) {
    const low = Math.min(a, 60_000);
    return (low * 3.5 + (a - low) * 16) / a;
  }
  const first = Math.min(a, 6_000_000);
  return (first * 16 + (a - first) * 18) / a;
}

function dataLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter((l) => l.text && !l.text.startsWith("#"));
}

export function parseChannels(text) {
  const channels = [];
  const errors = [];
  for (const { line, text: t } of dataLines(text)) {
    const p = t.split(",").map((x) => x.trim());
    if (/^name$/i.test(p[0])) continue;
    if (p.length < 3) { errors.push(`Channel line ${line}: need name, units per barrel, price per unit.`); continue; }
    const [name, u, price, pack = "0", other = "0", pct = "0"] = p;
    const v = [u, price, pack, other, pct].map(num);
    if (!name || v.some((x) => !Number.isFinite(x) || x < 0) || v[0] <= 0) { errors.push(`Channel line ${line}: "${t.slice(0, 40)}" has a missing or negative number.`); continue; }
    if (v[4] > 100) { errors.push(`Channel line ${line}: percent of sales cannot exceed 100.`); continue; }
    if (channels.some((c) => c.name.toLowerCase() === name.toLowerCase())) { errors.push(`Channel line ${line}: ${name} is listed twice.`); continue; }
    channels.push({ name, units: v[0], price: v[1], pack: v[2], other: v[3], pct: v[4] });
  }
  return { channels, errors };
}

export function parseBeers(text, channels) {
  const beers = [];
  const errors = [];
  const byName = new Map(channels.map((c) => [c.name.toLowerCase(), c]));
  for (const { line, text: t } of dataLines(text)) {
    const first = t.split(",");
    if (/^name$/i.test(first[0].trim())) continue;
    if (first.length < 5) { errors.push(`Beer line ${line}: need name, batch barrels, fermenter days, ingredients, mix.`); continue; }
    const name = first[0].trim();
    const [bbl, days, ing] = first.slice(1, 4).map(num);
    const mixText = first.slice(4).join(",");
    if (!name || ![bbl, days, ing].every((x) => Number.isFinite(x) && x >= 0) || bbl <= 0 || days <= 0) { errors.push(`Beer line ${line}: batch barrels and fermenter days must be above zero and ingredients cannot be negative.`); continue; }
    const mix = [];
    let bad = null;
    for (const part of mixText.split(";")) {
      const s = part.trim();
      if (!s) continue;
      const i = s.lastIndexOf(":");
      const cn = (i < 0 ? s : s.slice(0, i)).trim();
      const share = i < 0 ? NaN : num(s.slice(i + 1));
      const ch = byName.get(cn.toLowerCase());
      if (!ch) { bad = `Beer line ${line}: "${cn}" is not one of your channels.`; break; }
      if (!Number.isFinite(share) || share < 0) { bad = `Beer line ${line}: the share for ${cn} is not a number.`; break; }
      mix.push({ channel: ch.name, share });
    }
    if (bad) { errors.push(bad); continue; }
    const total = mix.reduce((s, m) => s + m.share, 0);
    if (!mix.length || total <= 0) { errors.push(`Beer line ${line}: give at least one channel share.`); continue; }
    beers.push({ name, bbl, days, ing, mix, mixTotal: total });
  }
  return { beers, errors };
}

export function analyzeBeer(beer, channels, s) {
  const loss = Math.min(Math.max(s.lossPct, 0), 90) / 100;
  const packaged = beer.bbl * (1 - loss);
  const fed = federalExcisePerBbl(s.annualBbl);
  const excisePerBbl = fed + s.stateExcisePerBbl;
  const batchCost = beer.ing + s.laborHours * s.laborRate + s.otherPerBatch;
  const brewCostPerBbl = batchCost / packaged;
  const overheadPerBbl = s.annualBbl > 0 ? (s.overheadPerMonth * 12) / s.annualBbl : 0;
  const parts = beer.mix.map((m) => {
    const ch = channels.find((c) => c.name === m.channel);
    const share = m.share / beer.mixTotal;
    const bbl = packaged * share;
    const rev = bbl * ch.units * ch.price;
    const chCost = bbl * ch.units * (ch.pack + ch.other) + rev * ch.pct / 100;
    const excise = bbl * excisePerBbl;
    const brew = bbl * brewCostPerBbl;
    const overhead = bbl * overheadPerBbl;
    const contribution = rev - chCost - excise - brew;
    const profit = contribution - overhead;
    return {
      channel: ch.name, share: share * 100, bbl, units: bbl * ch.units, revenue: rev, channelCost: chCost, excise, brewCost: brew, overhead, contribution, profit,
      profitPerBbl: bbl ? profit / bbl : 0, marginPct: rev ? (profit / rev) * 100 : 0,
      breakEvenPrice: ch.units ? (chCost - rev * ch.pct / 100 + excise + brew + overhead) / (bbl * ch.units) / (1 - ch.pct / 100) : 0,
      price: ch.price,
    };
  });
  const revenue = parts.reduce((x, p) => x + p.revenue, 0);
  const profit = parts.reduce((x, p) => x + p.profit, 0);
  const sorted = [...parts].sort((a, b) => b.profitPerBbl - a.profitPerBbl);
  return {
    name: beer.name, bbl: beer.bbl, packaged, overheadPerBbl, days: beer.days, batchCost, brewCostPerBbl, excisePerBbl, revenue, profit,
    marginPct: revenue ? (profit / revenue) * 100 : 0,
    profitPerBbl: packaged ? profit / packaged : 0,
    profitPerTankDay: profit / beer.days,
    profitPerBblDay: profit / beer.bbl / beer.days,
    parts, best: sorted[0], worst: sorted[sorted.length - 1],
    // What moving ten points of volume from the worst channel to the best would add.
    shift: sorted.length > 1 && beer.mix.length > 1 ? Math.min(10, parts.find((p) => p === sorted[sorted.length - 1]).share) / 100 * packaged * (sorted[0].profitPerBbl - sorted[sorted.length - 1].profitPerBbl) : 0,
  };
}

export function analyze(channelsText, beersText, settings = {}) {
  const s = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(s)) if (Number.isFinite(settings[k])) s[k] = settings[k];
  const ch = parseChannels(channelsText);
  const errors = [...ch.errors];
  if (!ch.channels.length) return { summary: null, errors: [...errors, "Add at least one sales channel."], warnings: [], beers: [] };
  const b = parseBeers(beersText, ch.channels);
  errors.push(...b.errors);
  if (!b.beers.length) return { summary: null, errors: [...errors, "Add at least one beer."], warnings: [], beers: [] };
  const beers = b.beers.map((x) => analyzeBeer(x, ch.channels, s));
  const warnings = [];
  for (const [i, beer] of b.beers.entries()) {
    if (Math.abs(beer.mixTotal - 100) > 0.5) warnings.push({ level: "medium", text: `${beer.name}: channel shares add to ${r2(beer.mixTotal)}, not 100. They were scaled to 100.` });
    for (const p of beers[i].parts) if (p.profit < 0) warnings.push({ level: "high", text: `${beer.name} loses ${money(-p.profit)} a batch in ${p.channel}: each barrel sold there leaves ${money(p.profitPerBbl)} after brewing cost, excise, channel costs and a volume share of overhead. Break-even price per unit is ${money2(p.breakEvenPrice)}; you charge ${money2(p.price)}.` });
    if (beers[i].marginPct < 15 && beers[i].profit >= 0) warnings.push({ level: "medium", text: `${beer.name}: margin is ${beers[i].marginPct.toFixed(0)}% of revenue. A small yield loss or a price cut turns it negative.` });
  }
  if (s.lossPct >= 15) warnings.push({ level: "medium", text: `Loss is set at ${s.lossPct}%. Check it against your own brewhouse-to-package numbers; every point of loss is lost product you paid to make.` });
  if (s.annualBbl > 2_000_000) warnings.push({ level: "info", text: "Over 2 million barrels a year the reduced federal rate does not apply; the model uses $16 and $18 per barrel." });
  warnings.push({ level: "info", text: `Overhead of ${money(s.overheadPerMonth)} a month is spread over ${s.annualBbl.toLocaleString("en-US")} barrels a year (${money(s.annualBbl > 0 ? (s.overheadPerMonth * 12) / s.annualBbl : 0)} a barrel). Profit below is after that share; change the barrels or overhead to see how fast a beer pays its way.` });
  warnings.push({ level: "info", text: `Federal excise averages ${money2(federalExcisePerBbl(s.annualBbl))} per barrel at ${s.annualBbl.toLocaleString("en-US")} barrels a year; state excise is the ${money2(s.stateExcisePerBbl)} you entered. Confirm both with TTB and your state before relying on them.` });
  const ranked = [...beers].sort((a, b2) => b2.profitPerBblDay - a.profitPerBblDay);
  const tankDays = s.tanks * 365 * (s.tankUtilPct / 100);
  const totalRevenue = beers.reduce((x, y) => x + y.revenue, 0);
  const totalProfit = beers.reduce((x, y) => x + y.profit, 0);
  const summary = {
    beers: beers.length, revenue: totalRevenue, profit: totalProfit, marginPct: totalRevenue ? (totalProfit / totalRevenue) * 100 : 0,
    bestPerTankDay: ranked[0].name, worstPerTankDay: ranked[ranked.length - 1].name,
    tankDaysYear: tankDays, tankBblDaysYear: tankDays * s.tankBbl,
    federalPerBbl: federalExcisePerBbl(s.annualBbl),
  };
  return { summary, beers, ranked, warnings, errors, settings: s };
}

export function resultCsv(r) {
  const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [["beer", "channel", "share_pct", "barrels", "units", "revenue", "brewing_cost", "excise", "overhead", "channel_cost", "profit", "profit_per_bbl", "margin_pct"]];
  for (const b of r.beers) for (const p of b.parts) rows.push([b.name, p.channel, r2(p.share), r2(p.bbl), r2(p.units), r2(p.revenue), r2(p.brewCost), r2(p.excise), r2(p.overhead), r2(p.channelCost), r2(p.profit), r2(p.profitPerBbl), r2(p.marginPct)]);
  return rows.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export function summaryText(r) {
  const out = [`Brewery batch margins`, ""];
  for (const b of r.ranked) {
    out.push(`${b.name}: ${money(b.profit)} profit on ${money(b.revenue)} (${b.marginPct.toFixed(0)}%), ${money(b.profitPerBbl)} per barrel, ${money(b.profitPerBblDay)} per barrel-day of tank. Best channel ${b.best.channel}, worst ${b.worst.channel}.`);
  }
  out.push("", "Estimates from the numbers entered. Not tax or legal advice.");
  return out.join("\n");
}
