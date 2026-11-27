// Regenerates src/site/legal-docs.ts from the app's own legal documents (apps/payapps/docs/legal/*.md),
// so the marketing site's Terms, Refund Policy and Acceptable Use pages say exactly what the app makes
// a customer accept. The site build runs without file access in the Worker, so the text is bundled.
//
//   pnpm sync:legal        (then `pnpm export:catalogue`)
//
// test/unit/legal.test.ts fails when the two drift apart.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { LEGAL_DOCS_FILE, legalDocsSource } from "@site/legal-source";

writeFileSync(LEGAL_DOCS_FILE, legalDocsSource());
console.log(`wrote ${join(LEGAL_DOCS_FILE)}`);
