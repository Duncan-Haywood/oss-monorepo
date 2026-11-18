// Writes the reference cases that eval/reference.py fits with statsmodels.
//   node eval/cases.mjs   (writes eval/cases/*.csv and eval/cases/cases.json)
import { mkdirSync, writeFileSync } from "node:fs";
import { parseAttributes } from "../engine.mjs";
import { simulate } from "../simulate.mjs";

export const CASES = [
  {
    name: "two-concepts-categorical",
    levels: "Brand: A, B, C\nColour: Red, Blue\nSize: S, M, L",
    numeric: [], price: "",
    sim: { n: 60, versions: 4, tasks: 8, concepts: 2, none: false, seed: 11, designSeed: 3,
      mean: { "Brand: B": 0.4, "Brand: C": -0.3, "Colour: Blue": 0.2, "Size: M": 0.5, "Size: L": 0.7 }, sd: { other: 0 } },
  },
  {
    name: "five-concepts-two-numeric",
    levels: "Price#: 20, 30, 40, 50\nStorage GB#: 64, 128, 256\nCamera: Basic, Dual, Triple\nBattery: Day, Two days",
    numeric: ["Price", "Storage GB"], price: "Price",
    sim: { n: 150, versions: 6, tasks: 10, concepts: 5, none: true, seed: 12, designSeed: 4,
      mean: { Price: -0.08, "Storage GB": 0.004, "Camera: Dual": 0.3, "Camera: Triple": 0.6, "Battery: Two days": 0.5, None: -1 }, sd: { Price: 0.03, other: 0.4 } },
  },
  {
    name: "three-concepts-none-homogeneous",
    levels: "Plan: Basic, Plus, Pro\nSupport: Email, Chat, Phone\nPrice#: 5, 10, 15",
    numeric: ["Price"], price: "Price",
    sim: { n: 100, versions: 5, tasks: 9, concepts: 3, none: true, seed: 13, designSeed: 5,
      mean: { "Plan: Plus": 0.6, "Plan: Pro": 0.9, "Support: Chat": 0.3, "Support: Phone": 0.2, Price: -0.15, None: 0.2 }, sd: { other: 0 } },
  },
];

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const dir = new URL("./cases/", import.meta.url);
  mkdirSync(dir, { recursive: true });
  for (const c of CASES) writeFileSync(new URL(`${c.name}.csv`, dir), simulate({ attributes: parseAttributes(c.levels), ...c.sim }));
  writeFileSync(new URL("cases.json", dir), JSON.stringify(CASES.map(({ name, levels, numeric, price }) => ({ name, levels, numeric, price })), null, 1) + "\n");
}
