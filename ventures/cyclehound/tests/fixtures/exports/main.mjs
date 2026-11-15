import def, { used, renamed as r } from "./a.mjs";
import * as everything from "./ns.mjs";
import { viaStar, viaNamed, fromNs } from "./lib/index.mjs";
import "./side.mjs";
const lazy = await import("./lazy.mjs");
console.log(def, used, r, everything, viaStar, viaNamed, fromNs, lazy);
