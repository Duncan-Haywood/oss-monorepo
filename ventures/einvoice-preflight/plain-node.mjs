// Node binding for plain-schematron.mjs: slimdom for the DOM, fontoxpath from
// node_modules (`npm i --no-save slimdom fontoxpath`), rules from ./plain/.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlainRunner } from "./plain-schematron.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const PLAIN_RULES_DIR = process.env.EINVOICE_PLAIN_DIR || join(here, "plain");

let runner;
function load() {
  if (runner !== undefined) return runner;
  try {
    const require = createRequire(import.meta.url);
    const { parseXmlDocument } = require("slimdom");
    runner = createPlainRunner({ fontoxpath: require("fontoxpath"), parseXml: (xml) => parseXmlDocument(xml) });
  } catch {
    runner = null;
  }
  return runner;
}

const cache = new Map();
const loadRules = async (file) => {
  if (!cache.has(file)) {
    try { cache.set(file, JSON.parse(readFileSync(join(PLAIN_RULES_DIR, file), "utf8"))); } catch { cache.set(file, null); }
  }
  return cache.get(file);
};

export const plainAvailable = () => load() !== null;

// Same result shape as runSchematron(), asynchronously.
export async function runPlain(xml) {
  const r = load();
  if (!r) return { status: "unavailable", syntax: "", findings: [], sets: [] };
  return r.run(xml, loadRules);
}
