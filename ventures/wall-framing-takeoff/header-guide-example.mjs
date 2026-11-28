// Worked examples for the header guide (docs/posts/2026-11-28-window-and-door-headers-...).
// Every figure the guide quotes comes from this file; header-guide-example.test.mjs pins them.
import { pathToFileURL } from "node:url";
import { layoutWall, openingGeometry, takeoff, defaultStock, PRECUT } from "./engine.mjs";
import { resolveHeaders } from "./headers.mjs";
import { gangOpenings } from "./ganged.mjs";
import { shallowHeaders } from "./shallowheaders.mjs";

/** The made-up table the header size checker page ships with (header-calculator.html). Not code values. */
export const SAMPLE_TABLE = [
  { upTo: 36, header: "2x6", plies: 2 },
  { upTo: 60, header: "2x8", plies: 2 },
  { upTo: 84, header: "2x10", plies: 2 },
  { upTo: 120, header: "2x12", plies: 2 },
];

const base = (walls, extra = {}) => ({
  studSpacing: 16, studLength: PRECUT["8ft"], kerf: 0.125, topPlateLap: 24,
  cornerExtraStuds: 2, teeExtraStuds: 2, defaultHeaderHeight: 82.5, stock: defaultStock(), walls, ...extra,
});

const pieces = (plan, wall, role) => layoutWall(plan, wall).members.filter((m) => m.kind === role);

export function checkerExample() {
  const plan = base([{ id: "A", length: 240, stud: "2x4", openings: [
    { kind: "window", label: "4 ft window", offset: 12, width: 48, height: 48, header: "auto" },
    { kind: "door", label: "3 ft door", offset: 90, width: 36, height: 82.5, header: "2x6", headerPlies: 2 },
    { kind: "window", label: "6 ft window", offset: 150, width: 72, height: 48, header: "2x8", headerPlies: 2 },
  ] }], { headerTable: SAMPLE_TABLE });
  return resolveHeaders(plan).rows.map((r) => ({ opening: r.opening, required: r.required, chosen: r.chosen, status: r.status }));
}

export function tooWide() {
  const plan = base([{ id: "Garage", length: 288, stud: "2x4", openings: [{ kind: "door", offset: 48, width: 192, height: 82.5, header: "auto" }] }], { headerTable: SAMPLE_TABLE });
  return resolveHeaders(plan).errors;
}

/** One 36 in door, 2x10 header, in a 12 ft wall: header pieces in a bearing wall, a 2x6 wall and a partition. */
export function doorHeaders() {
  const door = { kind: "door", label: "Door", offset: 48, width: 36, height: 82.5, header: "2x10" };
  const out = {};
  for (const [name, wall] of Object.entries({
    bearing2x4: { id: "W", length: 144, stud: "2x4", openings: [{ ...door }] },
    bearing2x6: { id: "W", length: 144, stud: "2x6", openings: [{ ...door }] },
    partition: { id: "W", length: 144, stud: "2x4", bearing: false, openings: [{ ...door }] },
  })) {
    const plan = base([wall]);
    const lay = layoutWall(plan, wall);
    const h = lay.members.filter((m) => m.kind === "header");
    const g = openingGeometry(plan, wall, wall.openings[0]);
    out[name] = {
      headerPieces: h.length, headerLength: h[0]?.length, jacks: lay.members.filter((m) => m.kind === "jack").length,
      kings: lay.members.filter((m) => m.kind === "king").length, jackLength: g.jack, topCripple: g.topCripple,
      cripples: lay.members.filter((m) => m.kind.startsWith("cripple")).length,
      notes: lay.notes.filter((n) => /spacer|single-ply|non-bearing/i.test(n)),
    };
  }
  return out;
}

export function garageDoor() {
  const wall = { id: "Garage", length: 288, stud: "2x4", openings: [{ kind: "door", label: "Garage door", offset: 48, width: 192, height: 82.5, header: "2x12" }] };
  const plan = base([wall]);
  const r = takeoff(plan);
  return { ok: r.ok, errors: r.errors };
}

/** A 6 ft window on the default one jack a side, then on two: header length and the wide-opening note. */
export function wideWindow() {
  const out = {};
  for (const jacks of [undefined, 2]) {
    const op = { kind: "window", label: "6 ft window", offset: 48, width: 72, height: 48, header: "2x10" };
    if (jacks) op.jacks = jacks;
    const wall = { id: "Living", length: 192, stud: "2x4", openings: [op] };
    const lay = layoutWall(base([wall]), wall);
    out[jacks ? "twoJacks" : "default"] = {
      headerLength: lay.members.find((m) => m.kind === "header").length,
      jacks: lay.members.filter((m) => m.kind === "jack").length,
      note: lay.notes.find((n) => /wider than 4 ft/.test(n)) ?? null,
    };
  }
  return out;
}

export function ganged() {
  const plan = base([{ id: "Living", length: 192, stud: "2x4", openings: [
    { kind: "window", label: "Left", offset: 48, width: 36, height: 48, header: "2x8" },
    { kind: "window", label: "Right", offset: 87, width: 36, height: 48, header: "2x8" },
  ] }]);
  const g = gangOpenings(plan);
  return { width: g.plan.walls[0].openings[0].width, notes: g.notes };
}

export function shallow() {
  const wall = { id: "Hall", length: 144, stud: "2x4", openings: [{ kind: "door", label: "Door", offset: 48, width: 36, height: 85.5, headerHeight: 85.5, header: "2x10" }] };
  const plan = base([wall]);
  const g = openingGeometry(plan, wall, wall.openings[0]);
  const notes = shallowHeaders(plan);
  return { topCripple: g.topCripple, newHeader: wall.openings[0].header, notes };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify({ checker: checkerExample(), tooWide: tooWide(), doorHeaders: doorHeaders(), garageDoor: garageDoor(), wideWindow: wideWindow(), ganged: ganged(), shallow: shallow() }, null, 2));
}
