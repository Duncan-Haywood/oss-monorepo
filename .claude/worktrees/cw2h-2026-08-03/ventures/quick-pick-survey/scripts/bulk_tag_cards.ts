import { deriveCardMetadata, SeedItem } from "../src/lib/surveyData";

/**
 * AI Bulk Card Metadata Tagging & Verification Utility
 */
export function bulkTagAllCards(items: SeedItem[]): (SeedItem & { metadata: ReturnType<typeof deriveCardMetadata> })[] {
  return items.map((item) => {
    const meta = deriveCardMetadata(item);
    return {
      ...item,
      metadata: {
        ...meta,
        ...item.metadata,
      },
    };
  });
}

if (require.main === module) {
  console.log("🚀 Running AI Bulk Card Metadata Tagging...");
  const sample: SeedItem = {
    slug: "repairs-after-fights",
    label: "Repairs quickly after a fight",
    category: "Relationship",
    dimensions: ["warmth", "stability"],
  };
  const tagged = bulkTagAllCards([sample]);
  console.log("Tagged Sample Result:", JSON.stringify(tagged[0], null, 2));
  console.log("✅ Card tagging pipeline ready!");
}
