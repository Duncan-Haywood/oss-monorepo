import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTintBid, naiveFlatQuote, pricingGap, DEFAULTS, WINDOW_PRESETS, FILM_TIERS,
} from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

// --- Hand-verified breakdown at DEFAULTS (full kit, ceramic, no removal) ---
//
// rawSqFt = 2*4.0 + 2*3.5 + 2*1.4 + 1*9.5 = 27.3 -> totalSqFt = 27.3*1.15 = 31.395
// filmCost = 31.395 * 5.5 = 172.6725
// installMinutes = 2*12 + 2*12 + 2*16 + 1*40 = 120 -> laborHours = 2.0
// laborCost = 2.0 * 28 = 56
// directCost = 172.6725 + 56 + 12 + 0 = 240.6725
// priceAtMargin = 240.6725 / 0.65 = 370.2654
// finalPrice = max(370.2654, 120) = 370.2654 (minimum not applied)

test('calculateTintBid matches the hand-verified breakdown at DEFAULTS', () => {
  const q = calculateTintBid(DEFAULTS);
  assert.equal(q.totalPanes, 7);
  close(q.rawSqFt, 27.3);
  close(q.totalSqFt, 31.395);
  close(q.filmCost, 172.6725);
  close(q.installMinutes, 120);
  assert.equal(q.removalMinutes, 0);
  close(q.laborHours, 2.0);
  close(q.laborCost, 56);
  close(q.directCost, 240.6725);
  close(q.priceAtMargin, 370.2654);
  assert.equal(q.minimumApplied, false);
  close(q.finalPrice, 370.2654);
});

// --- A small job with old flat rates left on the table isn't real ---

test('a two-window front-only dyed-film job is a fraction of the full-kit ceramic cost, and floors at the minimum', () => {
  const small = calculateTintBid({
    ...DEFAULTS,
    rearDoorWindows: 0,
    quarterWindows: 0,
    rearWindshield: 0,
    filmTier: 'dyed',
  });
  close(small.rawSqFt, 8.0);
  close(small.totalSqFt, 9.2);
  close(small.filmCost, 16.1);
  close(small.installMinutes, 24);
  close(small.laborCost, 11.2);
  close(small.directCost, 39.3);
  close(small.priceAtMargin, 60.4615);
  assert.equal(small.minimumApplied, true);
  assert.equal(small.finalPrice, DEFAULTS.minimumJobFee);
});

// --- Film tier changes material cost, and only material cost ---

test('a pricier film tier raises film cost proportionally, holding labor fixed', () => {
  const dyed = calculateTintBid({ ...DEFAULTS, filmTier: 'dyed' });
  const carbon = calculateTintBid({ ...DEFAULTS, filmTier: 'carbon' });
  const ceramic = calculateTintBid({ ...DEFAULTS, filmTier: 'ceramic' });
  assert.ok(dyed.filmCost < carbon.filmCost);
  assert.ok(carbon.filmCost < ceramic.filmCost);
  close(ceramic.filmCost / dyed.filmCost, FILM_TIERS.ceramic.costPerSqFt / FILM_TIERS.dyed.costPerSqFt, 0.001);
  // Labor is film-tier-independent.
  assert.equal(dyed.laborCost, carbon.laborCost);
  assert.equal(carbon.laborCost, ceramic.laborCost);
});

// --- Removing old tint adds labor time, and only on the panes selected ---

test('removing old tint adds removal minutes only when requested', () => {
  const kept = calculateTintBid({ ...DEFAULTS, removeOldTint: false });
  const stripped = calculateTintBid({ ...DEFAULTS, removeOldTint: true });
  assert.equal(kept.removalMinutes, 0);
  close(stripped.removalMinutes, 82); // 2*8 + 2*8 + 2*10 + 1*30 = 16 + 16 + 20 + 30 = 82
  assert.ok(stripped.totalMinutes > kept.totalMinutes);
  assert.ok(stripped.laborCost > kept.laborCost);
  assert.ok(stripped.finalPrice > kept.finalPrice);
});

test('rear windshield removal alone adds exactly 30 minutes (a defroster-grid strip, not a fast peel)', () => {
  const base = { ...DEFAULTS, frontDoorWindows: 0, rearDoorWindows: 0, quarterWindows: 0, rearWindshield: 1, wasteFactorPercent: 0, boothOverhead: 0, mobileFee: 0 };
  const kept = calculateTintBid({ ...base, removeOldTint: false });
  const stripped = calculateTintBid({ ...base, removeOldTint: true });
  close(kept.installMinutes, 40);
  close(stripped.removalMinutes, 30);
  // 30 extra minutes at $28/hr is exactly $14 more labor.
  close(stripped.laborCost - kept.laborCost, 14, 0.001);
});

// --- Per-pane install time is not uniform: a curved quarter window is slower than a flat front door ---

test('a rear quarter window takes longer to install than a front door window at the same count', () => {
  assert.ok(WINDOW_PRESETS.quarter.installMinutes > WINDOW_PRESETS.frontDoor.installMinutes);
  const doorsOnly = calculateTintBid({ ...DEFAULTS, frontDoorWindows: 2, rearDoorWindows: 0, quarterWindows: 0, rearWindshield: 0 });
  const quartersOnly = calculateTintBid({ ...DEFAULTS, frontDoorWindows: 0, rearDoorWindows: 0, quarterWindows: 2, rearWindshield: 0 });
  assert.ok(quartersOnly.installMinutes > doorsOnly.installMinutes);
});

// --- Waste factor scales material cost only ---

test('a higher waste factor raises film cost proportionally and does not touch labor', () => {
  const lowWaste = calculateTintBid({ ...DEFAULTS, wasteFactorPercent: 0 });
  const highWaste = calculateTintBid({ ...DEFAULTS, wasteFactorPercent: 30 });
  close(highWaste.totalSqFt / lowWaste.totalSqFt, 1.3, 0.001);
  assert.equal(lowWaste.laborCost, highWaste.laborCost);
});

// --- Minimum job fee floor ---

test('a job priced above the minimum is not floored', () => {
  const q = calculateTintBid(DEFAULTS);
  assert.equal(q.minimumApplied, false);
  assert.ok(q.finalPrice > DEFAULTS.minimumJobFee);
});

// --- naiveFlatQuote and pricingGap ---

test('naiveFlatQuote is exactly the flat rate typed in', () => {
  assert.equal(naiveFlatQuote({ naiveFlatRate: 200 }), 200);
  assert.equal(naiveFlatQuote({ naiveFlatRate: 250 }), 250);
});

test('pricingGap shows a full ceramic kit is underpriced by a flat per-vehicle rate', () => {
  const gap = pricingGap(DEFAULTS);
  close(gap.finalPrice, 370.2654);
  assert.equal(gap.naiveQuote, 200);
  assert.ok(gap.dollarGap > 0);
  assert.equal(gap.underpriced, true);
  close(gap.percentGap, 0.8513, 0.01);
});

test('pricingGap can also show a tiny job overpriced by the same flat per-vehicle rate', () => {
  const gap = pricingGap({
    ...DEFAULTS,
    rearDoorWindows: 0,
    quarterWindows: 0,
    rearWindshield: 0,
    filmTier: 'dyed',
  });
  assert.equal(gap.naiveQuote, 200);
  assert.ok(gap.finalPrice < gap.naiveQuote);
  assert.equal(gap.underpriced, false);
});

// --- Validation ---

test('rejects an unknown film tier', () => {
  assert.throws(() => calculateTintBid({ ...DEFAULTS, filmTier: 'holographic' }), /film tier/i);
});

test('rejects more than two front door windows', () => {
  assert.throws(() => calculateTintBid({ ...DEFAULTS, frontDoorWindows: 3 }), /front door windows/i);
});

test('rejects a negative window count', () => {
  assert.throws(() => calculateTintBid({ ...DEFAULTS, quarterWindows: -1 }), /rear quarter windows/i);
});

test('rejects a non-integer window count', () => {
  assert.throws(() => calculateTintBid({ ...DEFAULTS, frontDoorWindows: 1.5 }), /whole number/i);
});

test('rejects selecting zero windows entirely', () => {
  assert.throws(
    () => calculateTintBid({ ...DEFAULTS, frontDoorWindows: 0, rearDoorWindows: 0, quarterWindows: 0, rearWindshield: 0 }),
    /at least one window/i,
  );
});

test('rejects a target margin of 100% or more (would divide by zero or go negative)', () => {
  assert.throws(() => calculateTintBid({ ...DEFAULTS, targetMarginPercent: 100 }), /margin/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculateTintBid({ ...DEFAULTS, installerRate: 'lots' }), /installer rate/i);
});

// --- DEFAULTS sanity ---

test('DEFAULTS produce a finite, positive price', () => {
  const q = calculateTintBid(DEFAULTS);
  assert.ok(Number.isFinite(q.finalPrice));
  assert.ok(q.finalPrice > 0);
});
