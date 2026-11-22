// An invented example site, dated relative to `today` so it always looks
// current: a small food plant with six assets. Every name and number here is
// made up for the demo; none of it is a real plant's history.

import { fmtDay } from "./schedule.mjs";

export function exampleData(today) {
  const d = (offset) => fmtDay(today + offset);
  // compressor runs ~16 h a day; readings every two weeks for a year
  const compReadings = [];
  for (let k = 26; k >= 0; k--) compReadings.push({ date: d(-14 * k), value: Math.round(31000 + (26 - k) * 14 * 16.2 + (k % 3) * 4) });
  const forkReadings = [];
  for (let k = 12; k >= 0; k--) forkReadings.push({ date: d(-30 * k), value: Math.round(4200 + (12 - k) * 30 * 3.1) });
  const assets = [
    { id: "A1", name: "Air compressor 1 (rotary screw, 37 kW)", location: "Compressor room", category: "Compressed air", inService: d(-3650), meterUnit: "hours", meterStart: 0, criticality: "high", readings: compReadings },
    { id: "A2", name: "Conveyor 3 gearbox", location: "Line 3", category: "Conveyors", inService: d(-1460), meterUnit: "", criticality: "high", readings: [], costs: { planned: 650, failure: 5200 } },
    { id: "A3", name: "Case sealer", location: "Line 3 end", category: "Packaging", inService: d(-1100), meterUnit: "", criticality: "medium", readings: [] },
    { id: "A4", name: "Forklift 2 (electric)", location: "Warehouse", category: "Mobile", inService: d(-2200), meterUnit: "hours", criticality: "medium", readings: forkReadings },
    { id: "A5", name: "Rooftop unit RTU-2", location: "Roof, office side", category: "HVAC", inService: d(-2900), meterUnit: "", criticality: "low", readings: [] },
    { id: "A6", name: "Steam boiler", location: "Boiler house", category: "Steam", inService: d(-5000), meterUnit: "", criticality: "high", readings: [] },
  ];
  const plans = [
    { id: "P1", assetId: "A1", title: "Compressor: oil and filter change", start: d(-360), every: { n: 6, unit: "month" }, meter: { every: 2000, startAt: compReadings[0].value }, mode: "floating", hours: 2, trade: "mechanical", steps: ["Lock out and bleed down", "Drain oil, change oil filter and separator", "Refill, run 10 min, check for leaks"], parts: [{ partId: "S1", qty: 1 }, { partId: "S2", qty: 2 }], completions: [{ date: d(-240), meter: compReadings[9].value }, { date: d(-110), meter: compReadings[19].value }] },
    { id: "P2", assetId: "A1", title: "Compressor: weekly walk-round", start: d(-364), every: { n: 1, unit: "week" }, mode: "fixed", hours: 0.25, trade: "operator", steps: ["Check oil level and drain the condensate trap", "Note discharge temperature and pressure"], completions: Array.from({ length: 50 }, (_, i) => ({ date: d(-364 + 7 * i + (i % 9 === 4 ? 3 : 0)) })).filter((_, i) => i !== 17 && i !== 33) },
    { id: "P3", assetId: "A2", title: "Gearbox: oil sample and vibration reading", start: d(-365), every: { n: 3, unit: "month" }, mode: "fixed", hours: 1, trade: "mechanical", completions: [{ date: d(-362) }, { date: d(-272) }, { date: d(-170) }, { date: d(-88) }] },
    { id: "P4", assetId: "A3", title: "Case sealer: belts, blades and glue nozzles", start: d(-300), every: { n: 1, unit: "month" }, mode: "fixed", hours: 1.5, trade: "mechanical", parts: [{ partId: "S4", qty: 1 }], completions: [{ date: d(-300) }, { date: d(-270) }, { date: d(-238) }, { date: d(-210) }, { date: d(-176) }, { date: d(-150) }, { date: d(-118) }, { date: d(-92) }, { date: d(-61) }, { date: d(-30) }] },
    { id: "P5", assetId: "A4", title: "Forklift: 500-hour service", start: d(-360), meter: { every: 500, startAt: 4200 }, mode: "fixed", hours: 3, trade: "mobile", completions: [{ date: d(-200), meter: 4700 }, { date: d(-40), meter: 5195 }] },
    { id: "P6", assetId: "A5", title: "RTU-2: filters and coil clean", start: d(-180), every: { n: 3, unit: "month" }, mode: "floating", hours: 2, trade: "HVAC", parts: [{ partId: "S3", qty: 4 }], completions: [{ date: d(-180) }, { date: d(-85) }] },
    { id: "P7", assetId: "A6", title: "Boiler: annual inspection prep", start: d(20), every: { n: 1, unit: "year" }, mode: "fixed", hours: 8, trade: "boiler", completions: [] },
  ];
  // conveyor gearbox output bearing failures (days between: invented, rising with age)
  const fails = [
    { id: "WO101", assetId: "A2", type: "CM", title: "Gearbox output bearing seized", failure: true, created: d(-1460 + 410), completed: d(-1460 + 411), downtimeHours: 9, labourHours: 7, status: "done", failureCode: "bearing" },
    { id: "WO102", assetId: "A2", type: "CM", title: "Gearbox output bearing noisy, replaced", failure: true, created: d(-1460 + 930), completed: d(-1460 + 930), downtimeHours: 6, labourHours: 6, status: "done", failureCode: "bearing" },
    { id: "WO103", assetId: "A2", type: "CM", title: "Gearbox output bearing failed", failure: true, created: d(-1460 + 1290), completed: d(-1460 + 1291), downtimeHours: 11, labourHours: 8, status: "done", failureCode: "bearing" },
    { id: "WO104", assetId: "A3", type: "CM", title: "Sealer jammed: glue pot heater", failure: true, created: d(-900), completed: d(-900), downtimeHours: 2, labourHours: 1.5, status: "done", failureCode: "electrical" },
    { id: "WO105", assetId: "A3", type: "CM", title: "Sealer: flap folder sensor", failure: true, created: d(-610), completed: d(-610), downtimeHours: 1, labourHours: 1, status: "done", failureCode: "sensor" },
    { id: "WO106", assetId: "A3", type: "CM", title: "Sealer: drive belt snapped", failure: true, created: d(-180), completed: d(-180), downtimeHours: 1.5, labourHours: 1, status: "done", failureCode: "belt", parts: [{ partId: "S4", qty: 1 }] },
    { id: "WO107", assetId: "A3", type: "CM", title: "Sealer: glue nozzle blocked", failure: true, created: d(-35), completed: d(-35), downtimeHours: 0.5, labourHours: 0.5, status: "done", failureCode: "glue" },
    { id: "WO108", assetId: "A1", type: "CM", title: "Compressor tripped on high temperature", failure: true, created: d(-75), completed: d(-74), downtimeHours: 5, labourHours: 3, status: "done", failureCode: "cooling", meter: compReadings[21].value + 50 },
    { id: "WO109", assetId: "A5", type: "CM", title: "RTU-2 not cooling: contactor", status: "open", priority: "normal", failure: true, created: d(-2), due: d(3), estHours: 2, trade: "HVAC", parts: [{ partId: "S5", qty: 1 }] },
  ];
  const parts = [
    { id: "S1", name: "Compressor oil filter", onHand: 3, unitCost: 38, leadDays: 10, serviceLevel: 0.95 },
    { id: "S2", name: "Compressor oil, 5 L", onHand: 3, unitCost: 61, leadDays: 7, serviceLevel: 0.95 },
    { id: "S3", name: "Pleated filter 24x24x2", onHand: 6, unitCost: 9.5, leadDays: 5, serviceLevel: 0.9 },
    { id: "S4", name: "Case sealer drive belt", onHand: 1, unitCost: 44, leadDays: 21, serviceLevel: 0.95 },
    { id: "S5", name: "Contactor 3-pole 40 A", onHand: 0, unitCost: 52, leadDays: 3, serviceLevel: 0.9 },
    { id: "S6", name: "Gearbox output bearing 6310-2RS", onHand: 1, unitCost: 86, leadDays: 14, serviceLevel: 0.99, minQty: 1 },
  ];
  // PM work orders matching each completion, so parts usage has a history
  const wos = [...fails];
  let n = 200;
  for (const p of plans) for (const c of p.completions) wos.push({ id: `WO${n++}`, assetId: p.assetId, planId: p.id, type: "PM", title: p.title, status: "done", created: c.date, completed: c.date, labourHours: p.hours, parts: (p.parts || []).map((x) => ({ ...x })), meter: c.meter ?? undefined });
  return { version: 1, assets, plans, workOrders: wos, parts, nextId: 400, example: true };
}
