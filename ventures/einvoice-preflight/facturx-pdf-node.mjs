// Node helper for facturx-pdf.mjs: reads the two embedded fonts from fonts/.
import { readFileSync } from "node:fs";

export function readFontsSync() {
  const at = (name) => new Uint8Array(readFileSync(new URL(`./fonts/${name}`, import.meta.url)));
  return { regular: at("PreflightSans-Regular.ttf"), bold: at("PreflightSans-Bold.ttf") };
}
