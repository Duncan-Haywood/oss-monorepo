import test from 'node:test';
import assert from 'node:assert/strict';
import {
  optimizeBoothLayout,
  generateBoothQRCheckout,
  BoothDimensions,
  ExhibitionArtwork,
} from '../src/lib/art-fair-checkout';

test('optimizeBoothLayout calculates density and wall section assignments', () => {
  const booth: BoothDimensions = {
    boothId: 'booth-art-basel-42',
    fairName: 'Art Basel Miami',
    totalWidthMeters: 6,
    wallHeightMeters: 3,
    numberOfWalls: 3,
    boothType: 'corner',
  };

  const artworks: ExhibitionArtwork[] = [
    {
      artworkId: 'art-101',
      title: 'Neon Horizons',
      artistName: 'Maya Lin',
      widthMeters: 1.5,
      heightMeters: 2.0,
      retailPriceUsd: 4500,
      category: 'framed_print',
      wallSection: 'A',
    },
    {
      artworkId: 'art-102',
      title: 'Urban Synthesis',
      artistName: 'Kai Vance',
      widthMeters: 1.2,
      heightMeters: 1.5,
      retailPriceUsd: 3200,
      category: 'original_canvas',
      wallSection: 'B',
    },
  ];

  const layout = optimizeBoothLayout(booth, artworks);

  assert.equal(layout.boothId, 'booth-art-basel-42');
  assert.equal(layout.totalWallAreaSqMeters, 54); // 6 * 3 * 3 = 54
  assert.ok(layout.artworkOccupiedSqMeters > 4); // (1.5*2) + (1.2*1.5) = 3 + 1.8 = 4.8
  assert.equal(layout.suggestedHangingHeightCm, 145);
  assert.equal(layout.wallAssignments.length, 3);
});

test('generateBoothQRCheckout creates valid payload and checkout URL', () => {
  const artwork: ExhibitionArtwork = {
    artworkId: 'art-101',
    title: 'Neon Horizons',
    artistName: 'Maya Lin',
    widthMeters: 1.5,
    heightMeters: 2.0,
    retailPriceUsd: 4500,
    category: 'framed_print',
  };

  const qr = generateBoothQRCheckout('booth-42', 'Frieze London', artwork);

  assert.equal(qr.boothId, 'booth-42');
  assert.equal(qr.artworkId, 'art-101');
  assert.equal(qr.fairPromoCode, 'FRIEZELONDON-10OFF');
  assert.equal(qr.discountPercentage, 10);
  assert.ok(qr.checkoutUrl.includes('art=art-101'));
  assert.ok(qr.checkoutUrl.includes('booth=booth-42'));
  assert.ok(qr.qrCodeDataUri.startsWith('data:image/svg+xml'));
});
