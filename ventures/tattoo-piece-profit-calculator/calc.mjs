// Take-home and price floor per tattoo piece, counting the unpaid hours around the needle time:
// drawing, consult, setup and breakdown, and free touch-ups. Handles a shop commission, a booth
// rent, or both. Pure functions, no DOM. Arithmetic on figures the user types; no shop contract,
// licence rule or tax treatment is asserted anywhere in here.

export const DEFAULTS = Object.freeze({
  ownerHourly: 0,
  shopCutPct: 0,
  boothRentPerMonth: 0,
  tattooHoursPerMonth: 0,
  setupMinutesPerSession: 0,
  suppliesPerSession: 0,
  touchUpPct: 0,
  cardFeePct: 3,
  quotedRate: 0,
  drawingPerTattooHour: 0.25,
});

const num = (v, d = 0) => {
  if (v === "" || v === null || v === undefined) return d;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const cells = (line) => (line.includes("\t") ? line.split("\t") : line.split(",")).map((c) => c.trim().replace(/^"|"$/g, ""));

// Lines: "piece, needle hours, drawing hours, sessions, price you quote $". Drawing hours, sessions
// and price may be blank (sessions default to 1; price blank gives the floor only). Header optional.
export function parsePieces(text) {
  const rows = [];
  let skipped = 0;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const c = cells(line);
    const hours = num(c[1], NaN);
    if (c.length < 2 || !Number.isFinite(hours)) { if (rows.length || !/piece|hours|label|name/i.test(line)) skipped++; continue; }
    const drawing = num(c[2], 0), sessions = num(c[3], 1) || 1, price = num(c[4], 0);
    if (!(hours > 0) || !(drawing >= 0) || !(sessions >= 1) || !(price >= 0)) { skipped++; continue; }
    rows.push({ label: c[0] || "Piece", needleHours: hours, drawingHours: drawing, sessions: Math.ceil(sessions), price });
  }
  const warnings = skipped ? [`${skipped} piece line(s) skipped (need a name, needle hours above 0, drawing hours of 0 or more, sessions of 1 or more and a price of 0 or more).`] : [];
  if (!rows.length) return { error: "Add at least one piece: name, needle hours, drawing hours, sessions, price you quote $ (drawing, sessions and price may be blank)." };
  return { rows, warnings };
}

const clean = (s) => {
  const o = { ...DEFAULTS };
  for (const k of Object.keys(DEFAULTS)) if (s && s[k] !== undefined) o[k] = num(s[k], DEFAULTS[k]);
  return o;
};

const HOUR_STEPS = [1, 2, 3, 4, 6, 8];

export function analyze(settingsIn, pieces) {
  const o = clean(settingsIn);
  for (const k of Object.keys(DEFAULTS)) if (!Number.isFinite(o[k]) || o[k] < 0) return { error: `Check the number in "${k}".` };
  if (o.ownerHourly <= 0) return { error: "Enter the hourly take-home you want for every hour you work on a piece." };
  if (o.boothRentPerMonth > 0 && o.tattooHoursPerMonth <= 0) return { error: "Enter the hours per month you actually spend tattooing so booth rent can be spread over them." };
  if (o.shopCutPct + o.cardFeePct >= 100) return { error: "Shop cut plus payment fee must be under 100%." };

  const warnings = [];
  const keepShare = 1 - (o.shopCutPct + o.cardFeePct) / 100;
  const rentPerHour = o.boothRentPerMonth > 0 ? o.boothRentPerMonth / o.tattooHoursPerMonth : 0;

  const build = (needleHours, drawingHours, sessions, price) => {
    const touchUpHours = needleHours * o.touchUpPct / 100;
    const setupHours = sessions * o.setupMinutesPerSession / 60;
    const allHours = needleHours + drawingHours + touchUpHours + setupHours;
    const supplies = sessions * o.suppliesPerSession;
    const rent = needleHours * rentPerHour;
    const labor = allHours * o.ownerHourly;
    const cost = labor + rent + supplies;
    const floor = cost / keepShare;
    const hasPrice = price > 0;
    const shopCut = price * o.shopCutPct / 100, cardFee = price * o.cardFeePct / 100;
    const profit = hasPrice ? price - shopCut - cardFee - cost : null;
    // What you keep per hour of ALL your time on the piece, after the shop, fees, supplies and rent.
    const effectiveHourly = hasPrice ? (price - shopCut - cardFee - supplies - rent) / allHours : null;
    return { allHours, touchUpHours, setupHours, supplies, rent, cost, floor, hasPrice, shopCut, cardFee, profit, effectiveHourly, meetsFloor: hasPrice ? price + 1e-9 >= floor : null, statedHourly: hasPrice ? price / needleHours : null };
  };

  const lines = pieces.map((p) => ({ ...p, ...build(p.needleHours, p.drawingHours, p.sessions, p.price) }));
  const priced = lines.filter((l) => l.hasPrice);
  const below = priced.filter((l) => !l.meetsFloor);
  let verdict;
  if (!priced.length) verdict = "No prices entered, so only the lowest price for each piece is shown.";
  else if (!below.length) verdict = `All ${priced.length} priced piece(s) clear the price that pays your hourly target.`;
  else verdict = `${below.length} of ${priced.length} priced piece(s) are under the price that pays your hourly target: ${below.map((l) => l.label).join(", ")}.`;

  // The shop minimum: a one-session, half-hour flash piece with no drawing time.
  const minimumPiece = build(0.5, 0, 1, 0);
  const shopMinimum = minimumPiece.floor;

  // The hourly needle rate you must quote so a one-session piece of h hours pays the target, with
  // drawing time at the ratio entered. Solved per size because setup is a fixed cost per session.
  const ladder = o.quotedRate > 0 ? HOUR_STEPS.map((h) => {
    const b = build(h, h * o.drawingPerTattooHour, 1, h * o.quotedRate);
    return { needleHours: h, price: h * o.quotedRate, floor: b.floor, effectiveHourly: b.effectiveHourly, coversTarget: b.meetsFloor, needleRateNeeded: b.floor / h };
  }) : [];

  const losing = priced.filter((l) => l.profit < 0);
  if (losing.length) warnings.push(`${losing.map((l) => l.label).join(", ")} pays you less than your hourly target once drawing, setup, touch-ups and the shop's share are counted.`);
  if (o.quotedRate > 0 && ladder.length && !ladder.some((x) => x.coversTarget)) warnings.push("At that needle rate no piece size reaches your hourly target; the rate has to rise.");

  return { settings: o, rentPerHour, keepShare, shopMinimum, lines, verdict, ladder, warnings };
}

export function sampleJob() {
  return {
    pieces: "piece,needle hours,drawing hours,sessions,price\nSmall flash script,1,0.25,1,140\nForearm custom floral,4,3,1,700\nHalf sleeve realism,12,8,3,2200\nCover-up shoulder,5,4,2,900\nMatching pair walk-in,0.75,0,1,120",
    settings: { ownerHourly: 45, shopCutPct: 40, boothRentPerMonth: 0, tattooHoursPerMonth: 0, setupMinutesPerSession: 30, suppliesPerSession: 18, touchUpPct: 8, cardFeePct: 3, quotedRate: 180, drawingPerTattooHour: 0.5 },
  };
}

const f2 = (v) => (v === null || !Number.isFinite(v) ? "" : v.toFixed(2));
export function reportCsv(r) {
  const out = [["Piece", "Needle hours", "All your hours", "Sessions", "Your price", "Cost to you", "Lowest price", "Profit over your target", "Effective hourly (all your time)", "Vs lowest price"]];
  for (const l of r.lines) out.push([l.label, l.needleHours, f2(l.allHours), l.sessions, l.hasPrice ? f2(l.price) : "", f2(l.cost), f2(l.floor), f2(l.profit), f2(l.effectiveHourly), l.meetsFloor === null ? "" : l.meetsFloor ? "meets" : "under"]);
  const q = (c) => { const s = String(c); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return out.map((row) => row.map(q).join(",")).join("\n") + "\n";
}

export const money = (v) => (v < 0 ? "-$" : "$") + Math.round(Math.abs(v)).toLocaleString("en-US");
export const money2 = (v) => (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v, d = 1) => v.toFixed(d) + "%";
