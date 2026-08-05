/**
 * Gallery Art Fair Booth Layout Planner & QR Checkout Engine
 *
 * Plans wall grid space for art fair booths, optimizes visual hanging density,
 * generates dynamic QR code checkout links with booth-specific promo discounts,
 * and tracks real-time sales velocity by booth wall section.
 */

import { SITE_URL_UNCONFIGURED_HINT, resolveSiteUrl } from './site-url';

export interface BoothDimensions {
  boothId: string;
  fairName: string;
  totalWidthMeters: number;
  wallHeightMeters: number;
  numberOfWalls: number;
  boothType: 'corner' | 'inline' | 'island';
}

export interface ExhibitionArtwork {
  artworkId: string;
  title: string;
  artistName: string;
  widthMeters: number;
  heightMeters: number;
  retailPriceUsd: number;
  category: 'framed_print' | 'original_canvas' | 'sculpture_pedestal';
  wallSection?: 'A' | 'B' | 'C' | 'D';
}

export interface LayoutOptimizationResult {
  boothId: string;
  totalWallAreaSqMeters: number;
  artworkOccupiedSqMeters: number;
  hangingDensityPercentage: number;
  densityStatus: 'optimal' | 'sparse' | 'overcrowded';
  suggestedHangingHeightCm: number;
  wallAssignments: Array<{
    section: 'A' | 'B' | 'C' | 'D';
    artworkCount: number;
    totalValueUsd: number;
  }>;
}

export interface QRCodeCheckoutPayload {
  boothId: string;
  artworkId: string;
  fairPromoCode: string;
  discountPercentage: number;
  checkoutUrl: string;
  qrCodeDataUri: string;
}

/**
 * Optimizes booth hanging layout for maximum visual impact and foot-traffic conversion
 */
export function optimizeBoothLayout(
  booth: BoothDimensions,
  artworks: ExhibitionArtwork[]
): LayoutOptimizationResult {
  const totalWallArea = booth.totalWidthMeters * booth.wallHeightMeters * booth.numberOfWalls;

  let occupiedArea = 0;
  artworks.forEach((art) => {
    occupiedArea += art.widthMeters * art.heightMeters;
  });

  const hangingDensity = Math.round((occupiedArea / Math.max(1, totalWallArea)) * 100 * 10) / 10;

  let densityStatus: 'optimal' | 'sparse' | 'overcrowded' = 'optimal';
  if (hangingDensity < 25) {
    densityStatus = 'sparse';
  } else if (hangingDensity > 65) {
    densityStatus = 'overcrowded';
  }

  // Standard eye-level center hanging height is 145 cm (57 inches)
  const suggestedHangingHeightCm = 145;

  const sections: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'].slice(
    0,
    Math.min(4, booth.numberOfWalls)
  ) as Array<'A' | 'B' | 'C' | 'D'>;

  const wallAssignments = sections.map((sec, idx) => {
    const assigned = artworks.filter((a, i) => (a.wallSection ? a.wallSection === sec : i % sections.length === idx));
    const totalVal = assigned.reduce((sum, a) => sum + a.retailPriceUsd, 0);
    return {
      section: sec,
      artworkCount: assigned.length,
      totalValueUsd: totalVal,
    };
  });

  return {
    boothId: booth.boothId,
    totalWallAreaSqMeters: Math.round(totalWallArea * 100) / 100,
    artworkOccupiedSqMeters: Math.round(occupiedArea * 100) / 100,
    hangingDensityPercentage: hangingDensity,
    densityStatus,
    suggestedHangingHeightCm,
    wallAssignments,
  };
}

/**
 * Generates dynamic booth QR code checkout payload with fair discount and attribution parameters
 *
 * `baseUrl` used to default to the literal `'https://printatelier.com'`, which
 * is a domain this venture does not serve — see `src/lib/site-url.ts`. A
 * default parameter is the worst place for that: every call site reads as
 * correct, and the wrong origin only appears in the output.
 *
 * The output here is printed and stuck to a wall at a paid stand, then scanned
 * by a visitor holding a card. There is no later step at which a wrong origin
 * could be caught, and no relative form a QR scanner can resolve, so this
 * throws rather than returning a payload that looks printable. Callers that
 * name an origin explicitly are unaffected.
 */
export function generateBoothQRCheckout(
  boothId: string,
  fairName: string,
  artwork: ExhibitionArtwork,
  baseUrl: string | null = resolveSiteUrl()
): QRCodeCheckoutPayload {
  if (baseUrl === null) {
    throw new Error(
      `Refusing to generate a booth QR checkout link for booth ${boothId}: ` +
        `no site origin is configured, and a QR code cannot carry a relative link. ` +
        SITE_URL_UNCONFIGURED_HINT
    );
  }

  const sanitizedFair = fairName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const fairPromoCode = `${sanitizedFair.toUpperCase()}-10OFF`;
  const discountPercentage = 10;

  const checkoutUrl = `${baseUrl}/checkout?art=${encodeURIComponent(
    artwork.artworkId
  )}&booth=${encodeURIComponent(boothId)}&promo=${encodeURIComponent(
    fairPromoCode
  )}&src=art_fair_qr`;

  // Simulated SVG QR Code data URI for fair checkout
  const qrCodeDataUri = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150"><rect width="150" height="150" fill="%23ffffff"/><text x="75" y="75" font-family="sans-serif" font-size="12" text-anchor="middle">QR: ${artwork.artworkId}</text></svg>`;

  return {
    boothId,
    artworkId: artwork.artworkId,
    fairPromoCode,
    discountPercentage,
    checkoutUrl,
    qrCodeDataUri,
  };
}
