import { catalogArtworks, type CatalogArtwork } from "../../src/lib/marketplace.ts";

/**
 * Fixtures for tests that need a listing which can actually be sold.
 *
 * A listing needs a print file before it may be checked out — a POD partner
 * sent no artwork has nothing to print, and discovering that after the buyer
 * has paid is the defect `validateCheckoutLineItem`'s print-file blocker
 * exists to prevent. No artist file exists in this repository yet, so no
 * seeded artwork carries one and nothing in the seeded catalog is sellable.
 *
 * That is a fact about the operator's state, not about the code, and the tests
 * below it should not depend on it either way. They supply their own file here
 * rather than reaching into the catalog and hoping it is sellable today.
 *
 * `.test` is a reserved TLD (RFC 2606) and can never resolve, so a fixture URL
 * cannot be mistaken for a real asset host or accidentally fetched — which is
 * exactly what went wrong with the two fabricated hosts recorded in
 * `catalog-print-file-provenance.test.ts`.
 */
export const TEST_PRINT_FILE_BASE = "https://files.example.test/prints";

export function testPrintFileUrl(slug: string): string {
  return `${TEST_PRINT_FILE_BASE}/${slug}.tif`;
}

/** One catalog artwork, with a print file, so it can be sold in a test. */
export function withPrintFile(artwork: CatalogArtwork): CatalogArtwork {
  return { ...artwork, printFileUrl: testPrintFileUrl(artwork.slug) };
}

/**
 * The seeded catalog with a print file on every artwork. Pass this as the
 * `artworks` argument wherever a test exercises pricing, routing or session
 * building rather than the print-file rule itself.
 */
export function sellableCatalog(artworks: CatalogArtwork[] = catalogArtworks): CatalogArtwork[] {
  return artworks.map(withPrintFile);
}

/** One artwork from the sellable catalog, by slug. */
export function sellableArtwork(slug: string): CatalogArtwork {
  const artwork = catalogArtworks.find((candidate) => candidate.slug === slug);
  if (!artwork) {
    throw new Error(`No seeded artwork "${slug}" — fixture is stale.`);
  }
  return withPrintFile(artwork);
}
