// Real estate photographer shoot profit: what a listing shoot really earns per hour once drive,
// shoot, editing and admin time are counted, and whether editing in-house beats outsourcing.
// Pure functions, no I/O. All money in the currency the user types.

export const TIERS = Object.freeze([1, 2, 3, 4]);

export const DEFAULTS = Object.freeze({
  // Price list: package fee per tier (small condo .. luxury home)
  t1Fee: 110, t2Fee: 175, t3Fee: 250, t4Fee: 380,
  // Photos delivered and on-site shoot minutes per tier
  t1Photos: 25, t2Photos: 35, t3Photos: 45, t4Photos: 60,
  t1ShootMin: 40, t2ShootMin: 55, t3ShootMin: 75, t4ShootMin: 105,
  // Time not on site
  driveMinutes: 30,        // one-way average drive to a listing
  adminMinutes: 15,        // booking, access, upload, delivery, invoicing per shoot
  // Editing
  editMinutesPerPhoto: 2,  // your own culling + HDR blend + retouch per delivered photo
  outsourceCostPerPhoto: 0.7, // what an editing service charges per delivered photo
  editInHouse: 1,          // 1 = you edit, 0 = outsourced
  // Costs
  mileageCost: 0.67,       // per mile (fuel + wear)
  milesOneWay: 14,
  gearCostPerShoot: 4,     // gear depreciation, batteries, cards, software per shoot
  paymentFeePct: 2.9,      // card fee on the invoice
  // Add-ons: sold fee, extra on-site minutes, extra editing minutes, direct cost per use
  droneFee: 100, droneMin: 20, droneEditMin: 12, droneCost: 3, droneTakePct: 35,
  twilightFee: 125, twilightMin: 35, twilightEditMin: 15, twilightCost: 0, twilightTakePct: 15,
  floorplanFee: 70, floorplanMin: 12, floorplanEditMin: 0, floorplanCost: 25, floorplanTakePct: 40,
  // Goals
  targetHourly: 50,        // what you want an hour of total time to earn
  shootsPerMonth: 30,
  monthlyOverhead: 450,    // insurance, software subscriptions, hosting, marketing
  // Mix of tiers sold (% of shoots)
  mix1: 25, mix2: 40, mix3: 25, mix4: 10,
});

const n = (v, d) => (v !== "" && v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : d);
const r2 = (x) => Math.round(x * 100) / 100;

export function clean(input = {}) {
  const o = {};
  for (const k of Object.keys(DEFAULTS)) o[k] = n(input[k], DEFAULTS[k]);
  const bad = [];
  for (const k of Object.keys(o)) if (o[k] < 0) bad.push(`${k} cannot be negative.`);
  if (o.paymentFeePct >= 100) bad.push("Payment fee must be below 100.");
  for (const t of TIERS) {
    if (o[`t${t}Photos`] <= 0) bad.push(`Tier ${t} needs at least one photo.`);
    if (o[`t${t}Fee`] <= 0) bad.push(`Tier ${t} needs a price above zero.`);
  }
  if (o.targetHourly <= 0) bad.push("Target hourly must be above zero.");
  if (o.droneTakePct > 100 || o.twilightTakePct > 100 || o.floorplanTakePct > 100) bad.push("Add-on take rates are percentages of shoots, 0 to 100.");
  const mixTotal = o.mix1 + o.mix2 + o.mix3 + o.mix4;
  if (!(mixTotal > 0)) bad.push("Give a mix of tiers that adds to more than zero.");
  o.editInHouse = o.editInHouse >= 0.5 ? 1 : 0;
  return { o, error: bad.length ? bad.join(" ") : null };
}

// One tier, bare package (no add-ons) plus the expected add-on revenue and time at the stated take rates.
export function tierCase(o, t, withAddons = true) {
  const photos = o[`t${t}Photos`], fee = o[`t${t}Fee`];
  const shootMin = o[`t${t}ShootMin`];
  const driveMin = 2 * o.driveMinutes;
  const take = withAddons ? { drone: o.droneTakePct / 100, twilight: o.twilightTakePct / 100, floorplan: o.floorplanTakePct / 100 } : { drone: 0, twilight: 0, floorplan: 0 };
  let addRevenue = 0, addMin = 0, addEditMin = 0, addCost = 0;
  for (const k of ["drone", "twilight", "floorplan"]) {
    addRevenue += o[`${k}Fee`] * take[k];
    addMin += o[`${k}Min`] * take[k];
    addEditMin += o[`${k}EditMin`] * take[k];
    addCost += o[`${k}Cost`] * take[k];
  }
  const editMin = o.editInHouse ? photos * o.editMinutesPerPhoto + addEditMin : 0;
  const editCash = o.editInHouse ? 0 : photos * o.outsourceCostPerPhoto + (addEditMin > 0 ? addEditMin / Math.max(o.editMinutesPerPhoto, 0.0001) * o.outsourceCostPerPhoto : 0);
  const totalMin = driveMin + shootMin + addMin + editMin + o.adminMinutes;
  const revenue = fee + addRevenue;
  const mileage = 2 * o.milesOneWay * o.mileageCost;
  const cost = mileage + o.gearCostPerShoot + editCash + addCost + revenue * o.paymentFeePct / 100;
  const profit = revenue - cost;
  const hours = totalMin / 60;
  const hourly = profit / hours;
  // package fee that makes this tier (with its expected add-ons) earn the target hourly for all the time it takes
  const nonFeeCost = cost - revenue * o.paymentFeePct / 100;
  const feeNeeded = (o.targetHourly * hours + nonFeeCost) / (1 - o.paymentFeePct / 100) - addRevenue;
  return {
    tier: t, photos, fee, addRevenue: r2(addRevenue), revenue: r2(revenue), cost: r2(cost), profit: r2(profit),
    minutes: { drive: driveMin, shoot: r2(shootMin + addMin), edit: r2(editMin), admin: o.adminMinutes, total: r2(totalMin) },
    hours: r2(hours), hourly: r2(hourly), feeForTarget: r2(Math.max(feeNeeded, 0)),
  };
}

// Break-even: at how many delivered photos per month does an editing service stop being cheaper than your own time?
export function editBreakEven(o) {
  const perPhotoOwn = o.editMinutesPerPhoto / 60 * o.targetHourly;
  const diff = perPhotoOwn - o.outsourceCostPerPhoto;
  return { ownCostPerPhoto: r2(perPhotoOwn), outsourceCostPerPhoto: o.outsourceCostPerPhoto, savingPerPhoto: r2(diff), outsourceWins: diff > 0 };
}

export function estimate(input) {
  const { o, error } = clean(input);
  if (error) return { error };
  const cases = TIERS.map((t) => tierCase(o, t));
  const bare = TIERS.map((t) => tierCase(o, t, false));
  const mixTotal = o.mix1 + o.mix2 + o.mix3 + o.mix4;
  const mix = [o.mix1, o.mix2, o.mix3, o.mix4].map((m) => m / mixTotal);
  const avg = (key) => cases.reduce((a, c, i) => a + c[key] * mix[i], 0);
  const avgProfit = avg("profit");
  const avgHours = cases.reduce((a, c, i) => a + c.hours * mix[i], 0);
  const monthProfit = avgProfit * o.shootsPerMonth - o.monthlyOverhead;
  const monthHours = avgHours * o.shootsPerMonth;
  const effectiveHourly = monthHours > 0 ? monthProfit / monthHours : 0;
  const be = editBreakEven(o);
  const findings = [];
  const losers = cases.filter((c) => c.hourly < o.targetHourly);
  if (losers.length) {
    findings.push({ severity: "high", title: `${losers.length > 1 ? "Tiers" : "Tier"} ${losers.map((c) => c.tier).join(", ")} ${losers.length > 1 ? "earn" : "earns"} below your ${o.targetHourly}/hour target`,
      detail: `Counting drive, shoot, editing and admin time, tier ${losers[0].tier} earns ${losers[0].hourly} an hour. The package fee that reaches your target is ${losers[0].feeForTarget} (you charge ${losers[0].fee}).` });
  } else {
    findings.push({ severity: "info", title: "Every tier clears your hourly target", detail: "Check it still holds once travel runs longer than your average drive." });
  }
  const worst = cases.reduce((a, b) => (b.hourly < a.hourly ? b : a));
  const best = cases.reduce((a, b) => (b.hourly > a.hourly ? b : a));
  findings.push({ severity: "info", title: `Hourly earnings run from ${best.hourly} (tier ${best.tier}) to ${worst.hourly} (tier ${worst.tier})`,
    detail: "Large homes take more of your day but the fee rarely rises in step. The tier with the lowest hourly is the one to reprice, bundle or turn down when the calendar is full." });
  if (o.editInHouse && be.outsourceWins) {
    const saved = r2(be.savingPerPhoto * cases.reduce((a, c, i) => a + c.photos * mix[i], 0) * o.shootsPerMonth);
    findings.push({ severity: "medium", title: `Outsourcing editing would free time worth about ${saved} a month`,
      detail: `Your own editing costs ${be.ownCostPerPhoto} per photo at your target rate against ${be.outsourceCostPerPhoto} from a service. Only worth it if the hours freed are re-sold as shoots.` });
  }
  if (!o.editInHouse && !be.outsourceWins) {
    findings.push({ severity: "medium", title: "Editing yourself would cost less than the service",
      detail: `At your target rate your time costs ${be.ownCostPerPhoto} per photo against ${be.outsourceCostPerPhoto} outsourced, but only if you have the hours to spare.` });
  }
  const addonLift = r2(avg("profit") - TIERS.reduce((a, t, i) => a + bare[i].profit * mix[i], 0));
  findings.push({ severity: "info", title: `Add-ons at your take rates change average profit per shoot by ${addonLift}`,
    detail: "Drone, twilight and floor plans earn only after their extra on-site, editing and direct cost. Raise a take rate by pitching it at booking, not at delivery." });
  return {
    o, cases, findings, edit: be,
    month: { avgProfit: r2(avgProfit), avgHours: r2(avgHours), profit: r2(monthProfit), hours: r2(monthHours), effectiveHourly: r2(effectiveHourly),
      shootsToCoverOverhead: shootsAboveTarget(o, avgProfit, avgHours) },
  };
}

// Shoots per month before the pay above your target hourly covers the fixed monthly overhead.
function shootsAboveTarget(o, avgProfit, avgHours) {
  const perShoot = avgProfit - o.targetHourly * avgHours;
  if (!(perShoot > 0)) return null;
  return Math.ceil(o.monthlyOverhead / perShoot);
}

export const money = (x) => (x < 0 ? "-" : "") + "$" + Math.abs(Math.round(x * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (x) => (Math.round(x * 1000) / 10).toFixed(1) + "%";
