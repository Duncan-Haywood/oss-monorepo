// @ts-check
// Stack several floors' plans into one plan, so one cutting-stock order covers the whole house
// (offcuts from the first floor's boards can be the second floor's short pieces).
// Wall ids get the floor's name in front, tee laps follow the new ids, and the lumber list is
// the union of the floors'. Pure; the input plans are not changed.

const SHARED = ["studSpacing", "kerf", "topPlateLap", "cornerExtraStuds", "teeExtraStuds"];

/**
 * @param {{ name: string, plan: any }[]} floors
 * @returns {{ ok: boolean, errors: string[], notes: string[], plan?: any }}
 */
export function stackFloors(floors) {
  const errors = [];
  if (!Array.isArray(floors) || floors.length < 1) return { ok: false, errors: ["Give at least one floor."], notes: [] };
  const names = new Set();
  for (const [i, f] of floors.entries()) {
    if (!f || typeof f !== "object" || typeof f.name !== "string" || !f.name.trim()) { errors.push(`Floor ${i + 1}: needs a name.`); continue; }
    if (names.has(f.name)) errors.push(`Floor name "${f.name}" is used twice.`);
    names.add(f.name);
    if (!f.plan || typeof f.plan !== "object" || !Array.isArray(f.plan.walls) || !f.plan.walls.length) errors.push(`Floor "${f.name}": the plan has no walls.`);
    else if (f.plan.walls.some((w) => !w || typeof w.id !== "string" || !w.id.trim())) errors.push(`Floor "${f.name}": every wall needs a name.`);
  }
  if (errors.length) return { ok: false, errors, notes: [] };
  const first = floors[0].plan;
  for (const f of floors.slice(1)) for (const k of SHARED) {
    if (f.plan[k] !== undefined && first[k] !== undefined && f.plan[k] !== first[k]) errors.push(`Floor "${f.name}" has ${k} ${f.plan[k]} but "${floors[0].name}" has ${first[k]}; one order needs one setting.`);
  }
  if (errors.length) return { ok: false, errors, notes: [] };
  const commonLen = first.studLength;
  const notes = [];
  const walls = [];
  const stock = [];
  const seen = new Set();
  for (const { name, plan } of floors) {
    const map = new Map(plan.walls.map((w) => [w.id, `${name} ${w.id}`]));
    for (const w of plan.walls) {
      const c = JSON.parse(JSON.stringify(w));
      c.id = map.get(w.id);
      if (c.tee && typeof c.tee.wall === "string") c.tee.wall = map.get(c.tee.wall) ?? c.tee.wall;
      if (c.studLength === undefined && plan.studLength !== commonLen && plan.studLength !== undefined) c.studLength = plan.studLength;
      walls.push(c);
    }
    for (const s of plan.stock || []) {
      const key = JSON.stringify([s.size, s.length, s.price, s.label ?? null]);
      if (!seen.has(key)) { seen.add(key); stock.push({ ...s }); }
    }
    notes.push(`${name}: ${plan.walls.length} walls`);
  }
  const out = { ...JSON.parse(JSON.stringify(first)), walls, stock };
  return { ok: true, errors: [], notes: [`Stacked ${floors.length} floors into one order (${notes.join(", ")}).`], plan: out };
}
