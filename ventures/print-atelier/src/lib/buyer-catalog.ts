import {
  calculatePrintEconomics,
  catalogArtworks,
  type CatalogArtwork,
} from "./marketplace";
import { buildCheckoutAddHref, validateCheckoutLineItem } from "./checkout";
import { resolvePrintHref } from "./seo";
import {
  filterStorefrontListings,
  listStorefrontArtists,
  listStorefrontStyles,
} from "./storefront-catalog";

export const BUYER_PRINT_SIZES = ["Small", "Medium", "Large", "Oversized"] as const;
export type BuyerPrintSize = (typeof BUYER_PRINT_SIZES)[number];

export const BUYER_SORTS = ["recommended", "price-asc", "price-desc", "artist"] as const;
export type BuyerSort = (typeof BUYER_SORTS)[number];

export type BuyerCatalogQuery = {
  query?: string;
  styles?: string[];
  sizes?: BuyerPrintSize[];
  artists?: string[];
  checkoutReadyOnly?: boolean;
  sort?: BuyerSort;
};

export type BuyerCatalogListing = {
  artwork: CatalogArtwork;
  printHref: string;
  checkoutHref: string;
  size: BuyerPrintSize;
  checkoutEligible: boolean;
  checkoutBlockers: string[];
  artistShare: number;
};

export type BuyerCatalogResult = {
  listings: BuyerCatalogListing[];
  totalLive: number;
  matched: number;
  query: BuyerCatalogQuery;
  styles: string[];
  artists: string[];
};

type SearchParamValue = string | string[] | undefined;

function asList(value: SearchParamValue): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function first(value: SearchParamValue): string {
  return asList(value)[0] ?? "";
}

export function isBuyerPrintSize(value: string): value is BuyerPrintSize {
  return (BUYER_PRINT_SIZES as readonly string[]).includes(value);
}

export function isBuyerSort(value: string): value is BuyerSort {
  return (BUYER_SORTS as readonly string[]).includes(value);
}

/**
 * Map retail price to a framed-size band so the shop filters stay useful
 * before the catalog stores physical dimensions.
 */
export function deriveBuyerPrintSize(artwork: CatalogArtwork): BuyerPrintSize {
  if (artwork.retailPrice < 70) return "Small";
  if (artwork.retailPrice < 90) return "Medium";
  if (artwork.retailPrice < 110) return "Large";
  return "Oversized";
}

export function parseBuyerCatalogSearchParams(
  params: Record<string, SearchParamValue>,
): BuyerCatalogQuery {
  const sortRaw = first(params.sort);
  return {
    query: first(params.q),
    styles: asList(params.style),
    sizes: asList(params.size).filter(isBuyerPrintSize),
    artists: asList(params.artist),
    checkoutReadyOnly: first(params.ready) === "1" || first(params.ready) === "true",
    sort: isBuyerSort(sortRaw) ? sortRaw : "recommended",
  };
}

export function buildBuyerPortalHref(query: BuyerCatalogQuery = {}): string {
  const params = new URLSearchParams();
  const search = query.query?.trim();
  if (search) {
    params.set("q", search);
  }
  for (const style of query.styles ?? []) {
    params.append("style", style);
  }
  for (const size of query.sizes ?? []) {
    params.append("size", size);
  }
  for (const artist of query.artists ?? []) {
    params.append("artist", artist);
  }
  if (query.checkoutReadyOnly) {
    params.set("ready", "1");
  }
  if (query.sort && query.sort !== "recommended") {
    params.set("sort", query.sort);
  }
  const encoded = params.toString();
  return encoded ? `/buyer-portal?${encoded}` : "/buyer-portal";
}

function sortListings(listings: BuyerCatalogListing[], sort: BuyerSort): BuyerCatalogListing[] {
  return [...listings].sort((left, right) => {
    if (sort === "price-asc") {
      return left.artwork.retailPrice - right.artwork.retailPrice;
    }
    if (sort === "price-desc") {
      return right.artwork.retailPrice - left.artwork.retailPrice;
    }
    if (sort === "artist") {
      return (
        left.artwork.artistName.localeCompare(right.artwork.artistName) ||
        left.artwork.title.localeCompare(right.artwork.title)
      );
    }

    if (left.checkoutEligible !== right.checkoutEligible) {
      return left.checkoutEligible ? -1 : 1;
    }
    if (right.artwork.salesLast30Days !== left.artwork.salesLast30Days) {
      return right.artwork.salesLast30Days - left.artwork.salesLast30Days;
    }
    return (right.artwork.readinessScore ?? 0) - (left.artwork.readinessScore ?? 0);
  });
}

export function searchBuyerCatalog(
  query: BuyerCatalogQuery = {},
  artworks: readonly CatalogArtwork[] = catalogArtworks,
): BuyerCatalogResult {
  const styles = query.styles ?? [];
  const artists = query.artists ?? [];
  const sizes = query.sizes ?? [];
  const sort = query.sort ?? "recommended";

  let candidates = filterStorefrontListings(artworks, {
    query: query.query,
    artist: artists.length === 1 ? artists[0] : undefined,
    style: styles.length === 1 ? styles[0] : undefined,
  });

  if (styles.length > 1) {
    candidates = candidates.filter((artwork) => styles.includes(artwork.style));
  }
  if (artists.length > 1) {
    candidates = candidates.filter((artwork) => artists.includes(artwork.artistName));
  }

  let listings: BuyerCatalogListing[] = candidates.map((artwork) => {
    const eligibility = validateCheckoutLineItem(artwork);
    const economics = calculatePrintEconomics({
      retailPrice: artwork.retailPrice,
      fulfillmentCost: artwork.fulfillmentCost,
    });
    return {
      artwork,
      printHref: resolvePrintHref(artwork),
      checkoutHref: buildCheckoutAddHref(artwork.slug),
      size: deriveBuyerPrintSize(artwork),
      checkoutEligible: eligibility.eligible,
      checkoutBlockers: eligibility.blockers,
      artistShare: economics.artistShare,
    };
  });

  if (sizes.length > 0) {
    listings = listings.filter((listing) => sizes.includes(listing.size));
  }
  if (query.checkoutReadyOnly) {
    listings = listings.filter((listing) => listing.checkoutEligible);
  }

  return {
    listings: sortListings(listings, sort),
    totalLive: artworks.filter((artwork) => artwork.status === "Live").length,
    matched: listings.length,
    query: { ...query, sort },
    styles: listStorefrontStyles(artworks),
    artists: listStorefrontArtists(artworks),
  };
}

export { listStorefrontArtists, listStorefrontStyles };
