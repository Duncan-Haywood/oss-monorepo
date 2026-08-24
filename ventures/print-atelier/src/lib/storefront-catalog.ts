import type { CatalogArtwork } from "./marketplace";

export type StorefrontFilters = {
  query?: string;
  style?: string;
  artist?: string;
};

export function normalizeStorefrontQuery(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isStyleFilter(value: string | undefined, styles: string[]): value is string {
  return Boolean(value && styles.includes(value));
}

export function filterStorefrontListings(
  artworks: readonly CatalogArtwork[],
  filters: StorefrontFilters = {},
): CatalogArtwork[] {
  const query = normalizeStorefrontQuery(filters.query);
  const style = filters.style && filters.style !== "All" ? filters.style : undefined;
  const artist = filters.artist?.trim();

  return artworks.filter((artwork) => {
    if (artwork.status !== "Live") {
      return false;
    }
    if (style && artwork.style !== style) {
      return false;
    }
    if (artist && artwork.artistName !== artist) {
      return false;
    }
    if (!query) {
      return true;
    }
    const haystack = [artwork.title, artwork.artistName, artwork.style, ...artwork.tags]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

export function listStorefrontArtists(artworks: readonly CatalogArtwork[]): string[] {
  return Array.from(
    new Set(
      artworks.filter((artwork) => artwork.status === "Live").map((artwork) => artwork.artistName),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function listStorefrontStyles(artworks: readonly CatalogArtwork[]): string[] {
  return Array.from(
    new Set(
      artworks.filter((artwork) => artwork.status === "Live").map((artwork) => artwork.style),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function buildStorefrontHref(filters: StorefrontFilters): string {
  const params = new URLSearchParams();
  const query = filters.query?.trim();
  if (query) {
    params.set("q", query);
  }
  if (filters.style && filters.style !== "All") {
    params.set("style", filters.style);
  }
  if (filters.artist?.trim()) {
    params.set("artist", filters.artist.trim());
  }
  const encoded = params.toString();
  return encoded ? `/storefront?${encoded}` : "/storefront";
}
