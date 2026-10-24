// @ts-check
// Design checks. Each one says what it checks, against what, and whether it
// passed. The room, light and egress rules paraphrase the 2021 International
// Residential Code by section number; the code text is copyrighted and was
// not copied or checked line by line, and your jurisdiction may adopt other
// editions or amendments. Passing these is not code compliance.

import { bbox, area as polyArea, edges, EPS } from "./geom.mjs";
import { netBox, HABITABLE, SLEEP } from "./layout.mjs";

export function circulation(plan) {
  // rooms joined by doors or open sides
  const adj = new Map(plan.rooms.map((r) => [r.id, new Set()]));
  const join = (a, b) => { adj.get(a).add(b); adj.get(b).add(a); };
  for (const o of plan.openings) if (o.rooms.length === 2 && o.kind !== "window") join(o.rooms[0], o.rooms[1]);
  for (const w of plan.walls) if (w.type === "open") for (const a of w.rooms) for (const b of w.rooms) if (a !== b) join(a, b);
  const entry = plan.great.living.id;
  const kind = new Map(plan.rooms.map((r) => [r.id, r.kind]));
  const reach = (from, avoid) => {
    const seen = new Set([from]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      for (const n of adj.get(c)) if (!seen.has(n) && !avoid(n)) { seen.add(n); q.push(n); }
    }
    return seen;
  };
  const all = reach(entry, () => false);
  const unreachable = plan.rooms.filter((r) => !all.has(r.id)).map((r) => r.name);
  // every bedroom reachable without walking through another bedroom
  const throughBedroom = [];
  for (const r of plan.rooms) {
    if (!SLEEP.has(r.kind)) continue;
    const ok = reach(entry, (n) => SLEEP.has(kind.get(n)) && n !== r.id);
    if (!ok.has(r.id)) throughBedroom.push(r.name);
  }
  return { unreachable, throughBedroom };
}

export function egressOf(o) {
  // casement, net clear opening assumed: frame width less 4 in, height less 4 in
  const w = o.width * 12 - 4, h = o.height * 12 - 4;
  return { netSqFt: (w * h) / 144, clearW: w, clearH: h, sillIn: o.sill * 12 };
}

export function runChecks(plan, brief, style, extra = {}) {
  const out = [];
  const C = (group, label, pass, value, basis = "", severity = "rule") => out.push({ group, label, pass: Boolean(pass), value, basis, severity });
  const rooms = plan.rooms;
  const area = (plan.W - (plan.p.Wg || 0)) * plan.D;
  // program
  const nBeds = rooms.filter((r) => SLEEP.has(r.kind)).length;
  const full = rooms.filter((r) => r.kind === "bath" || r.kind === "ensuite").length;
  const half = rooms.filter((r) => r.kind === "half").length;
  C("Program", `Bedrooms: ${nBeds} asked ${brief.beds}`, nBeds === brief.beds, nBeds);
  C("Program", `Baths: ${full + half / 2} asked ${brief.baths}`, full + half / 2 === brief.baths, full + half / 2);
  C("Program", `Conditioned area ${Math.round(area)} sq ft against ${brief.area} asked (within 10%)`, Math.abs(area - brief.area) / brief.area <= 0.1, area);
  if (brief.maxWidth) C("Program", `Width ${plan.W} ft fits ${brief.maxWidth} ft`, plan.W <= brief.maxWidth + EPS, plan.W);
  if (brief.maxDepth) C("Program", `Depth ${plan.D + (plan.porch?.d || 0)} ft with porch fits ${brief.maxDepth} ft`, plan.D + (plan.porch?.d || 0) <= brief.maxDepth + EPS, plan.D);
  // rooms
  for (const r of rooms) {
    const nb = netBox(plan, r);
    const a = polyArea(r.poly);
    const lo = Math.min(nb.w, nb.d);
    if (SLEEP.has(r.kind)) {
      C("Rooms", `${r.name}: ${Math.round(a)} sq ft, least dimension ${lo.toFixed(1)} ft (at least 70 and 7)`, a >= 70 && lo >= 7, a, "IRC R304.2, R304.3 (paraphrased)");
      const closet = rooms.some((c) => c.kind === "closet" && c.owner === r.id) || (r.kind === "primary" && rooms.some((c) => c.kind === "wic"));
      C("Rooms", `${r.name} has a closet`, closet, closet, "convention, not code", "advice");
    } else if (HABITABLE.has(r.kind) && r.kind !== "kitchen") {
      C("Rooms", `${r.name}: least dimension ${lo.toFixed(1)} ft (at least 7)`, lo >= 7, lo, "IRC R304.3 (paraphrased)");
    }
  }
  C("Rooms", `Ceiling height ${plan.ceiling} ft (at least 7)`, plan.ceiling >= 7, plan.ceiling, "IRC R305.1 (paraphrased)");
  const hall = rooms.find((r) => r.kind === "hall");
  if (hall) {
    const hb = netBox(plan, hall);
    C("Rooms", `Hall clear width ${(Math.min(hb.w, hb.d) * 12).toFixed(0)} in (at least 36)`, Math.min(hb.w, hb.d) * 12 >= 36, Math.min(hb.w, hb.d), "IRC R311.6 (paraphrased)");
  }
  // light and ventilation
  for (const r of rooms) {
    if (!HABITABLE.has(r.kind)) continue;
    const glass = plan.openings.filter((o) => (o.kind === "window" || o.kind === "slider") && o.rooms.includes(r.id)).reduce((s, o) => s + o.width * o.height, 0);
    const a = polyArea(r.poly);
    const share = glass / a;
    // open-plan rooms borrow light through the open side; credit the group
    let pass = share >= 0.08;
    let note = "";
    if (!pass && ["living", "kitchen", "dining"].includes(r.kind)) {
      const grp = rooms.filter((x) => ["living", "kitchen", "dining"].includes(x.kind));
      const ga = grp.reduce((s, x) => s + polyArea(x.poly), 0);
      const gg = plan.openings.filter((o) => (o.kind === "window" || o.kind === "slider") && o.rooms.some((id) => grp.some((x) => x.id === id))).reduce((s, o) => s + o.width * o.height, 0);
      pass = gg / ga >= 0.08;
      note = ` (open plan: ${(100 * gg / ga).toFixed(1)}% across the great room)`;
    }
    C("Light", `${r.name}: glazing ${(100 * share).toFixed(1)}% of floor (at least 8%)${note}`, pass, share, "IRC R303.1 (paraphrased); openable area assumed to be at least half the glazing");
  }
  for (const r of rooms) {
    if (!["bath", "ensuite", "half", "laundry"].includes(r.kind)) continue;
    const win = plan.openings.some((o) => o.kind === "window" && o.rooms.includes(r.id));
    C("Light", `${r.name}: ${win ? "window" : "no window"}; an exhaust fan vented outside is specified either way`, true, win, "IRC R303.3 (paraphrased)", "advice");
  }
  // egress
  for (const r of rooms) {
    if (!SLEEP.has(r.kind)) continue;
    const ok = plan.openings.filter((o) => o.kind === "window" && o.egress && o.rooms.includes(r.id)).map(egressOf).filter((e) => e.netSqFt >= 5.7 && e.clearW >= 20 && e.clearH >= 24 && e.sillIn <= 44);
    const e0 = plan.openings.filter((o) => o.kind === "window" && o.rooms.includes(r.id)).map(egressOf)[0];
    C("Egress", `${r.name}: emergency escape window${e0 ? ` (net ${e0.netSqFt.toFixed(1)} sq ft, ${e0.clearW.toFixed(0)} x ${e0.clearH.toFixed(0)} in clear, sill ${e0.sillIn.toFixed(0)} in)` : ""}`, ok.length > 0, ok.length, "IRC R310.2 (paraphrased): 5.7 sq ft net, 24 in high, 20 in wide, sill at most 44 in; casement net opening assumed");
  }
  const entry = plan.openings.find((o) => o.kind === "entry");
  C("Egress", `Egress door ${entry.width * 12} in wide (32 in clear needs a 36 in door)`, entry.width >= 3, entry.width, "IRC R311.2 (paraphrased)");
  const kit = new Set((plan.kitchenLayout?.items || []).map((i) => i.kind));
  const missing = ["sink", "range", "fridge"].filter((k) => !kit.has(k));
  C("Plan", missing.length ? `Kitchen has no room for: ${missing.join(", ")}` : "Kitchen holds a sink, a range and a refrigerator", !missing.length, missing.length);
  const circ = circulation(plan);
  C("Plan", circ.unreachable.length ? `Rooms with no way in: ${circ.unreachable.join(", ")}` : "Every room can be reached from the entry", !circ.unreachable.length, circ.unreachable.length);
  C("Plan", circ.throughBedroom.length ? `Reached only through another bedroom: ${circ.throughBedroom.join(", ")}` : "No bedroom is reached through another bedroom", !circ.throughBedroom.length, circ.throughBedroom.length, "", "rule");
  if (plan.garage) C("Plan", "Garage separated from the house by 1/2 in gypsum (5/8 in type X at a ceiling under a room) and a solid or 20-minute door", true, true, "IRC R302.5, R302.6 (paraphrased); confirm with the local code", "advice");
  // structure
  const tk = extra.takeoff;
  if (tk) {
    const bad = tk.struct.headers.filter((hd) => hd.engineered);
    C("Structure", `Headers: ${tk.struct.headers.length} sized from NDS checks${bad.length ? `, ${bad.length} need an engineered beam` : ""}`, true, tk.struct.headers.length, "NDS 2018 ASD checks, SPF No. 2 (structure.mjs, from research/house-spans)");
    for (const s of tk.struct.studs) C("Structure", `Studs ${s.stud} at ${s.spacing} in: ratio ${s.ratio} under roof dead + ${brief.snow} psf snow and ${s.windPsf} psf wind`, s.pass, s.ratio, "NDS 3.7 and 3.9 (research/house-framing's stud check)");
    if (tk.struct.floor) {
      const f = tk.struct.floor;
      C("Structure", `Floor joists ${f.joist.size} at 16 in over ${f.joist.span} ft: ${f.joist.governs} ratio ${f.joist.ratio}`, f.joist.ratio <= 1, f.joist.ratio, "NDS ASD, 40 psf live, L/360");
      if (f.girder) C("Structure", `Girder ${f.girder.size}, posts at ${f.girder.postSpacing} ft: ratio ${f.girder.ratio}`, f.girder.ratio <= 1, f.girder.ratio, "NDS ASD");
    }
    C("Structure", `Roof: ${tk.struct.trusses.count} ${tk.struct.trusses.type} trusses spanning ${tk.struct.trusses.span} ft`, true, tk.struct.trusses.count, "designed and sealed by the truss maker (not checked here)", "advice");
  }
  // lateral proxy: full-height wall on each side
  for (const side of ["front", "back", "left", "right"]) {
    const isH = side === "front" || side === "back";
    const c = side === "front" || side === "left" ? 0 : isH ? plan.D : plan.W;
    const len = isH ? plan.W : plan.D;
    const ops = plan.openings.filter((o) => o.dir === (isH ? "h" : "v") && Math.abs(o.c - c) < EPS).map((o) => [o.pos - o.width / 2, o.pos + o.width / 2]).sort((a, b) => a[0] - b[0]);
    let x = 0, solid = 0, panels = 0;
    for (const [a, b] of ops) { if (a - x >= 4) { panels++; } solid += Math.max(0, a - x); x = Math.max(x, b); }
    if (len - x >= 4) panels++;
    solid += Math.max(0, len - x);
    const share = solid / len;
    C("Structure", `Bracing proxy, ${side} wall: ${solid.toFixed(1)} of ${len} ft solid (${Math.round(share * 100)}%), ${panels} panels of 4 ft or more`, share >= 0.4 && panels >= 2, share, "a proxy, not the IRC R602.10 braced-wall calculation; an engineer or the local prescriptive path must size the bracing", "advice");
  }
  if (brief.accessible) {
    const narrow = plan.openings.filter((o) => (o.kind === "door" || o.kind === "entry") && o.width < 3);
    C("Access", narrow.length ? `${narrow.length} doors narrower than 36 in` : "All passage and entry doors 36 in", !narrow.length, narrow.length, "ICC A117.1-style intent, not checked");
    // a 5 ft circle clear of a 2 ft run of fixtures along one side and a 2.5 ft tub across one end
    const bath = rooms.filter((r) => r.kind === "bath" || r.kind === "ensuite").map((r) => netBox(plan, r)).some((nb) => Math.min(nb.w, nb.d) - 2 >= 5 && Math.max(nb.w, nb.d) - 2.5 >= 5);
    C("Access", bath ? "A bath with room for a 5 ft turning circle" : "No bath is large enough for a 5 ft turning circle", bath, bath, "intent, fixture clearances not checked");
    C("Access", "No-step entry: grade or a ramp must meet the floor at the entry", true, true, "site work; the slab floor sits 8 in above grade", "advice");
  }
  return out;
}
