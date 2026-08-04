/**
 * CLI Script: AI Bulk Tagging of Survey Cards
 * Run via `npx ts-node scripts/bulk-tag-cards.ts`
 */

import { SEED_SURVEYS } from "../src/lib/surveyData";
import { getTraitsForItem, CARD_TRAITS_REGISTRY } from "../src/lib/cardTraitsData";

function runBulkTagging() {
  console.log("=========================================");
  console.log("   CARD TRAIT METADATA BULK TAGGING AUDIT ");
  console.log("=========================================");

  let totalItems = 0;
  let registeredCount = 0;
  let synthesizedCount = 0;

  for (const survey of SEED_SURVEYS) {
    console.log(`\nSurvey: ${survey.title} (${survey.slug})`);
    console.log(`-----------------------------------------`);

    for (const item of survey.items) {
      totalItems++;
      const isExplicit = Boolean(CARD_TRAITS_REGISTRY[item.slug] || CARD_TRAITS_REGISTRY[item.label]);
      if (isExplicit) registeredCount++;
      else synthesizedCount++;

      const traits = getTraitsForItem(item);
      console.log(`  [${isExplicit ? "EXPLICIT" : "SYNTHESIZED"}] ${item.label}`);
      console.log(`      Love Languages: ${traits.loveLanguages.join(", ")}`);
      console.log(`      Drivers: ${traits.relationalDrivers.join(", ")}`);
      console.log(`      Stress Response: ${traits.stressResponse.join(", ")}`);
      console.log(`      Vulnerability: ${traits.effortProfile.vulnerabilityLevel}`);
    }
  }

  console.log("\n=========================================");
  console.log(` Total Items Audited: ${totalItems}`);
  console.log(` Explicitly Tagged:   ${registeredCount}`);
  console.log(` Auto-Synthesized:    ${synthesizedCount}`);
  console.log(" Coverage:            100%");
  console.log("=========================================\n");
}

runBulkTagging();
