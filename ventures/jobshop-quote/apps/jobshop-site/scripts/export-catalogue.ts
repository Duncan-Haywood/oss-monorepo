// Writes catalogue-export/: the static copy of the site the catalogue serves at
// https://marisstella.app/jobshop/ (src/site/catalogue.ts says why it is committed).
//
//   pnpm export:catalogue
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CATALOGUE_EXPORT_DIR, catalogueFiles } from "../src/site/catalogue.ts";

rmSync(CATALOGUE_EXPORT_DIR, { recursive: true, force: true });
const files = catalogueFiles();
for (const [rel, contents] of files) {
  const file = join(CATALOGUE_EXPORT_DIR, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}
console.log(`Wrote ${files.size} files to ${CATALOGUE_EXPORT_DIR}`);
