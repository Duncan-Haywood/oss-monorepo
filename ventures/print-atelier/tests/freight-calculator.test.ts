import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateVolumetricFreight,
  type ArtworkDimensionsSpec,
} from "../src/lib/freight-calculator";

test("calculates standard fine art paper packaging accurately", () => {
  const spec: ArtworkDimensionsSpec = {
    widthInches: 18,
    heightInches: 24,
    depthInches: 0.2,
    medium: "fine_art_paper",
  };

  const res = calculateVolumetricFreight(spec);
  assert.equal(res.isOversizedFreight, false);
  assert.equal(res.recommendedPackaging, "standard_flat_mailer");
  assert.ok(res.billableWeightLbs > 0);
});

test("calculates volumetric weight and oversized crate recommendation for large framed canvas", () => {
  const spec: ArtworkDimensionsSpec = {
    widthInches: 48,
    heightInches: 60,
    depthInches: 2.5,
    medium: "framed_canvas",
    frameMaterial: "wood",
  };

  const res = calculateVolumetricFreight(spec);
  assert.equal(res.isOversizedFreight, true);
  assert.equal(res.recommendedPackaging, "reinforced_wood_crate");
  assert.ok(res.oversizeSurchargeUsd > 0);
  assert.ok(res.volumetricWeightLbs > 0);
  assert.ok(res.actualWeightLbs > 0);
});
