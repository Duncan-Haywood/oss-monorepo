// Commercial fishing settlement ("the lay"): catch sales, off-the-top costs, boat share, crew shares.
// Pure functions, no dependencies. Planning arithmetic on the user's own numbers.

export const MAX_CATCH = 30;
export const MAX_CREW = 20;

export function num(v) {
  const n = Number(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

export const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

function splitCsv(line) {
  const cells = [];
  let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) { cells.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function rows(text) {
  return String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => (l.includes("\t") ? l.split("\t").map((c) => c.trim()) : splitCsv(l)));
}

// species, pounds, price per pound
export function parseCatch(text) {
  const out = [], errors = [];
  for (const cells of rows(text)) {
    if (/^(species|label|name)$/i.test(cells[0]) && Number.isNaN(num(cells[1]))) continue;
    const lbs = num(cells[1]), price = num(cells[2]);
    if (cells.length < 3 || !(lbs > 0) || !(price >= 0)) { errors.push(`Catch line "${cells.join(", ")}": need species, pounds above 0 and a price per pound.`); continue; }
    if (out.length >= MAX_CATCH) { errors.push(`Only the first ${MAX_CATCH} catch lines are used.`); break; }
    out.push({ label: cells[0] || "Catch", lbs, price });
  }
  return { catch: out, errors };
}

// name, shares (1 = full deckhand share, 0.5 = green hand, 1.5 = engineer), personal charges (optional)
export function parseCrew(text) {
  const out = [], errors = [];
  for (const cells of rows(text)) {
    if (/^(name|crew|label)$/i.test(cells[0]) && Number.isNaN(num(cells[1]))) continue;
    const shares = num(cells[1]), personal = cells[2] === undefined || cells[2] === "" ? 0 : num(cells[2]);
    if (cells.length < 2 || !(shares > 0) || !(personal >= 0)) { errors.push(`Crew line "${cells.join(", ")}": need a name, shares above 0 and personal charges of 0 or more.`); continue; }
    if (out.length >= MAX_CREW) { errors.push(`Only the first ${MAX_CREW} crew lines are used.`); break; }
    out.push({ name: cells[0] || "Crew", shares, personal });
  }
  return { crew: out, errors };
}

const clampPct = (p) => Math.min(100, Math.max(0, Number.isFinite(p) ? p : 0));

// Money flows: gross -> commission/lumper % -> shared trip costs -> net -> boat % -> crew pool by shares.
export function settle(catchLines, crew, o) {
  const gross = catchLines.reduce((s, c) => s + c.lbs * c.price, 0);
  const pounds = catchLines.reduce((s, c) => s + c.lbs, 0);
  const commission = gross * clampPct(o.commissionPct) / 100;
  const tripCosts = (o.fuel || 0) + (o.ice || 0) + (o.bait || 0) + (o.food || 0) + (o.other || 0);
  const net = gross - commission - tripCosts;
  const boatPct = clampPct(o.boatPct);
  const days = o.days > 0 ? o.days : 1;
  const totalShares = crew.reduce((s, c) => s + c.shares, 0);
  const crewPool = net > 0 ? net * (100 - boatPct) / 100 : 0;
  const boatReceives = net - crewPool; // a losing trip falls on the boat, not the crew
  const perShare = totalShares > 0 ? crewPool / totalShares : 0;
  const people = crew.map((c) => {
    const share = c.shares * perShare;
    const takeHome = share - c.personal;
    return { ...c, share, takeHome, perDay: takeHome / days };
  });
  const boatCosts = (o.boatDaily || 0) * days;
  return { gross, pounds, commission, tripCosts, net, boatPct, days, totalShares, crewPool, boatReceives, boatCosts, boatProfit: boatReceives - boatCosts, perShare, people };
}

// Gross sales needed so a one-share hand takes home `perDay` and so the boat covers its own costs.
export function breakEven(crew, o, targetPerDay) {
  const totalShares = crew.reduce((s, c) => s + c.shares, 0);
  const c = clampPct(o.commissionPct) / 100, b = clampPct(o.boatPct) / 100;
  const E = (o.fuel || 0) + (o.ice || 0) + (o.bait || 0) + (o.food || 0) + (o.other || 0);
  const days = o.days > 0 ? o.days : 1;
  const toGross = (net) => (net + E) / (1 - c);
  const out = { boatCover: null, crewTarget: null };
  if (b > 0 && c < 1) out.boatCover = toGross(((o.boatDaily || 0) * days) / b);
  if (b < 1 && c < 1 && totalShares > 0 && targetPerDay > 0) {
    const pool = (targetPerDay * days) * totalShares; // one full share earns the target
    out.crewTarget = toGross(pool / (1 - b));
  }
  return out;
}

// Same trip at different prices: costs do not move, so the swing lands harder on the shares.
export function priceSensitivity(catchLines, crew, o, steps = [-20, -10, 0, 10]) {
  return steps.map((pct) => {
    const lines = catchLines.map((c) => ({ ...c, price: c.price * (1 + pct / 100) }));
    const r = settle(lines, crew, o);
    const full = r.people.find((p) => p.shares === 1) || r.people[0];
    return { pct, gross: r.gross, net: r.net, handPerDay: full ? full.perDay : 0, boatProfit: r.boatProfit };
  });
}

export function diagnose(r, o, targetPerDay, be) {
  const f = [];
  if (r.net <= 0) f.push({ level: "high", title: "The trip lost money before anyone was paid", text: `Sales of ${money(r.gross)} did not cover ${money(r.commission + r.tripCosts)} of commission and trip costs. Under a lay the crew shares nothing here and the boat absorbs ${money(-r.net)}; check your crew agreement for how a loss trip is handled.` });
  const weak = r.people.filter((p) => targetPerDay > 0 && p.perDay < targetPerDay);
  if (r.net > 0 && weak.length) f.push({ level: "high", title: `${weak.length} crew below ${money(targetPerDay)} a day`, text: `${weak.map((p) => `${p.name} ${money(p.perDay)}`).join(", ")}. ${be.crewTarget ? `A one-share hand reaches the target at about ${money(be.crewTarget)} gross for this trip.` : ""}` });
  if (r.net > 0 && r.boatProfit < 0) f.push({ level: "medium", title: "The boat's cut does not cover its own costs", text: `The boat receives ${money(r.boatReceives)} but carries ${money(r.boatCosts)} of insurance, maintenance and loan cost for ${r.days} day${r.days === 1 ? "" : "s"}. ${be.boatCover ? `Break-even for the boat is about ${money(be.boatCover)} gross at this share.` : ""}` });
  const fuelPct = r.gross > 0 ? (o.fuel || 0) / r.gross * 100 : 0;
  if (fuelPct >= 20) f.push({ level: "medium", title: `Fuel is ${Math.round(fuelPct)}% of sales`, text: "Fuel comes off the top before the split, so every extra steaming hour is paid for by the boat and crew together." });
  if (r.net > 0 && r.people.some((p) => p.takeHome < 0)) f.push({ level: "medium", title: "A crew member owes more than their share", text: "Personal charges (food, gear, advances) exceed that person's share on this trip." });
  const lowest = r.people.length > 1 ? Math.min(...r.people.map((p) => p.shares)) : 0;
  if (r.net > 0 && lowest > 0 && r.totalShares > lowest) {
    const per = r.crewPool / (r.totalShares - lowest);
    f.push({ level: "info", title: "What carrying one fewer hand does", text: `Without the smallest share (${lowest}), each share would be worth ${money(per)} instead of ${money(r.perShare)}. Whether that is workable depends on the work on deck and on safety.` });
  }
  return f;
}
