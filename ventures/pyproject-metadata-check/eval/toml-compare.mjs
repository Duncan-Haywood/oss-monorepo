// Shared by the differential test and the real-file eval: tags parseToml output the way tomllib_dump.py does.
import { parseToml } from "../toml.mjs";
export function agree(src, py) {
  let js;
  try { js = parseToml(src).data; } catch (e) { return { jsError: e.message, agree: !!py.error }; }
  if (py.error) return { agree: false, why: "tomllib refuses: " + py.error };
  return { agree: deepSame(js, py.ok) };
}
export function deepSame(js, py) {
  if (typeof js === "number" || typeof js === "bigint") {
    if (typeof js === "bigint") return py && py.$int === js.toString();
    if (Number.isNaN(js)) return py && py.$float === "nan";
    if (!Number.isFinite(js)) return py && py.$float === (js > 0 ? "inf" : "-inf");
    if (!py || typeof py !== "object") return false;
    if (py.$int !== undefined) return Number.isInteger(js) && BigInt(py.$int) === BigInt(js);
    if (py.$float !== undefined) return Number(py.$float) === js;
    return false;
  }
  if (typeof js !== "object" || js === null) return js === py;
  if (Array.isArray(js)) return Array.isArray(py) && js.length === py.length && js.every((x, i) => deepSame(x, py[i]));
  if (js.$toml) return py && py.$toml === js.$toml;
  if (!py || typeof py !== "object" || Array.isArray(py) || py.$int || py.$float || py.$toml) return false;
  const a = Object.keys(js).sort(), b = Object.keys(py).sort();
  return a.length === b.length && a.every((k, i) => k === b[i] && deepSame(js[k], py[k]));
}
