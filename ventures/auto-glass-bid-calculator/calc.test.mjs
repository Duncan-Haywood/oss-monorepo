import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBid,
  formatBidSummary,
  suggestedGlassKit,
  suggestedSourceKit,
  suggestedCalibrationKit,
  suggestedServiceKit,
  JOB_PRESETS,
  GLASS_POSITION_PRESETS,
  GLASS_SOURCE_PRESETS,
  CALIBRATION_PRESETS,
  SERVICE_PRESETS,
  PAYER_PRESETS,
} from './calc.mjs';

const rates = () => ({
  hoursRR: 1.1,
  hoursCalibration: 0,
  tripHours: 0,
  wiperServiceHours: 0.1,
  siteHours: 0.25,
  glassCost: 240,
  moldingCost: 35,
  urethaneKitCost: 30,
  calibrationCost: 0,
  tripFee: 0,
  wiperServiceCost: 12,
  hourlyWage: 28,
  burdenRate: 22,
  travelAndEquipment: 25,
  overheadRate: 14,
  targetMargin: 32,
  cashDiscountPercent: 0,
  deductible: 0,
});

const coupon = () => ({
  ...rates(),
  position: 'windshield',
  glassSource: 'economy',
  calibration: 'none',
  service: 'in-shop',
  payer: 'cash',
  addWiperService: false,
});

test('the $249-coupon-shaped job — economy glass, no ADAS, in-shop, cash — prices from labor, glass, and overhead', () => {
  const result = calculateBid(coupon());
  assert.equal(result.totalHours, 1.35);
  assert.equal(result.calibrationMissing, false);
  assert.ok(Math.abs(result.laborCost - 46.116) < 1e-9);
  assert.ok(Math.abs(result.materialCost - 305) < 1e-9);
  assert.ok(Math.abs(result.totalCost - 428.77224) < 1e-6);
  assert.ok(Math.abs(result.price - 630.547411764706) < 1e-6);
  assert.equal(result.cashSavings, 0);
});

test('ADAS is required but neither calibration hours nor cost were entered — the bid is flagged, not silently priced wrong', () => {
  const result = calculateBid({
    ...rates(),
    glassSource: 'oee',
    calibration: 'dynamic',
    position: 'windshield',
    service: 'in-shop',
    payer: 'cash',
    addWiperService: false,
  });
  assert.equal(result.calibrationMissing, true);
});

test('pricing the same calibration correctly clears the flag', () => {
  const kit = suggestedCalibrationKit('dynamic');
  const result = calculateBid({
    ...rates(),
    glassSource: 'oee',
    calibration: 'dynamic',
    position: 'windshield',
    service: 'in-shop',
    payer: 'cash',
    addWiperService: false,
    hoursCalibration: kit.hoursCalibration,
    calibrationCost: kit.calibrationCost,
  });
  assert.equal(result.calibrationMissing, false);
});

test('a mobile, insurance-billed OEM windshield with dual calibration splits the deductible from what the insurer is billed', () => {
  const result = calculateBid({
    hoursRR: 1.1,
    hoursCalibration: 1.7,
    tripHours: 0.35,
    wiperServiceHours: 0.1,
    siteHours: 0.25,
    glassCost: 650,
    moldingCost: 35,
    urethaneKitCost: 30,
    calibrationCost: 210,
    tripFee: 45,
    wiperServiceCost: 12,
    hourlyWage: 32,
    burdenRate: 24,
    travelAndEquipment: 30,
    overheadRate: 15,
    targetMargin: 35,
    cashDiscountPercent: 0,
    deductible: 100,
    position: 'windshield',
    glassSource: 'oem',
    calibration: 'dual',
    service: 'mobile',
    payer: 'insurance',
    addWiperService: true,
  });
  assert.equal(result.totalHours, 3.5);
  assert.ok(Math.abs(result.totalCost - 1323.512) < 1e-3);
  assert.ok(Math.abs(result.price - 2036.1723076923079) < 1e-6);
  assert.equal(result.customerCollects, 100);
  assert.ok(Math.abs(result.insurerBills - 1936.1723076923079) < 1e-6);
  assert.equal(result.calibrationMissing, false);
});

test('a cash discount is applied after the target-margin price, and reported as savings', () => {
  const result = calculateBid({
    hoursRR: 1.1,
    hoursCalibration: 0,
    tripHours: 0.35,
    wiperServiceHours: 0,
    siteHours: 0.25,
    glassCost: 240,
    moldingCost: 35,
    urethaneKitCost: 30,
    calibrationCost: 0,
    tripFee: 45,
    wiperServiceCost: 0,
    hourlyWage: 28,
    burdenRate: 22,
    travelAndEquipment: 25,
    overheadRate: 14,
    targetMargin: 32,
    cashDiscountPercent: 15,
    deductible: 0,
    position: 'windshield',
    glassSource: 'economy',
    calibration: 'none',
    service: 'mobile',
    payer: 'cash',
    addWiperService: false,
    proposedPrice: 300,
  });
  assert.ok(Math.abs(result.listPrice - 726.0324705882354) < 1e-6);
  assert.ok(Math.abs(result.price - 617.1276) < 1e-4);
  assert.ok(Math.abs(result.cashSavings - 108.90487058823533) < 1e-6);
  assert.equal(result.proposed.belowBreakEven, true);
  assert.ok(Math.abs(result.proposed.profit - -193.70208) < 1e-4);
});

test('insurance jobs never discount and never report cash savings', () => {
  const result = calculateBid({ ...rates(), position: 'windshield', glassSource: 'economy', calibration: 'none', service: 'in-shop', payer: 'insurance', addWiperService: false, cashDiscountPercent: 25, deductible: 50 });
  assert.equal(result.cashSavings, 0);
  assert.equal(result.price, result.listPrice);
});

test('a windshield priced with zero hours and zero material is not divided by zero anywhere', () => {
  const result = calculateBid({
    ...rates(),
    hoursRR: 0, hoursCalibration: 0, tripHours: 0, wiperServiceHours: 0, siteHours: 0,
    glassCost: 0, moldingCost: 0, urethaneKitCost: 0, calibrationCost: 0, tripFee: 0, wiperServiceCost: 0,
    travelAndEquipment: 0, overheadRate: 0, targetMargin: 0,
    position: 'windshield', glassSource: 'economy', calibration: 'none', service: 'in-shop', payer: 'cash', addWiperService: false,
  });
  assert.equal(result.totalCost, 0);
  assert.equal(result.price, 0);
  assert.equal(result.effectiveHourlyRate, null);
});

test('target margin at or above 100% is rejected rather than dividing by zero or going negative', () => {
  assert.throws(() => calculateBid({ ...coupon(), targetMargin: 100 }), /less than 100/);
});

test('a cash discount at or above 100% is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), cashDiscountPercent: 100 }), /less than 100/);
});

test('an unknown glass position, source, calibration, service, or payer is rejected', () => {
  assert.throws(() => calculateBid({ ...coupon(), position: 'sunroof' }), /Unknown glass position/);
  assert.throws(() => calculateBid({ ...coupon(), glassSource: 'stolen' }), /Unknown glass source/);
  assert.throws(() => calculateBid({ ...coupon(), calibration: 'psychic' }), /Unknown calibration requirement/);
  assert.throws(() => calculateBid({ ...coupon(), service: 'teleport' }), /Unknown service type/);
  assert.throws(() => calculateBid({ ...coupon(), payer: 'crypto' }), /Unknown payer/);
});

test('suggested kits cover every listed preset id with no gaps', () => {
  for (const { id } of GLASS_POSITION_PRESETS) assert.ok(suggestedGlassKit(id));
  for (const { id } of GLASS_SOURCE_PRESETS) assert.ok(suggestedSourceKit(id));
  for (const { id } of CALIBRATION_PRESETS) assert.ok(suggestedCalibrationKit(id));
  for (const { id } of SERVICE_PRESETS) assert.ok(suggestedServiceKit(id));
});

test('every payer preset id is priceable', () => {
  for (const { id } of PAYER_PRESETS) {
    assert.doesNotThrow(() => calculateBid({ ...coupon(), payer: id }));
  }
});

test('every job preset prices cleanly with its suggested kits', () => {
  for (const job of JOB_PRESETS) {
    const glass = suggestedGlassKit(job.position);
    const source = suggestedSourceKit(job.glassSource);
    const calibration = suggestedCalibrationKit(job.calibration);
    const svc = suggestedServiceKit(job.service);
    const result = calculateBid({
      ...rates(),
      ...glass,
      ...source,
      ...calibration,
      ...svc,
      position: job.position,
      glassSource: job.glassSource,
      calibration: job.calibration,
      service: job.service,
      payer: job.payer,
      addWiperService: false,
    });
    assert.ok(result.price > 0, `${job.label} should price above zero`);
    assert.equal(result.calibrationMissing, false, `${job.label} should not flag calibration as missing when the suggested kit is applied`);
  }
});

test('formatBidSummary never prints wages, burden, overhead, or margin', () => {
  const result = calculateBid(coupon());
  const summary = formatBidSummary(result, 'Windshield replacement');
  assert.match(summary, /Proposed price/);
  assert.doesNotMatch(summary, /wage/i);
  assert.doesNotMatch(summary, /burden/i);
  assert.doesNotMatch(summary, /overhead/i);
  assert.doesNotMatch(summary, /margin/i);
});

test('formatBidSummary names the insurer/customer split on an insurance job', () => {
  const result = calculateBid({ ...rates(), position: 'windshield', glassSource: 'economy', calibration: 'none', service: 'in-shop', payer: 'insurance', addWiperService: false, deductible: 50 });
  const summary = formatBidSummary(result);
  assert.match(summary, /Billed to insurer/);
  assert.match(summary, /collected from customer/);
});

test('formatBidSummary names the calibration requirement on the scope line', () => {
  const kit = suggestedCalibrationKit('static');
  const result = calculateBid({
    ...rates(), ...kit,
    position: 'windshield', glassSource: 'oem', calibration: 'static', service: 'in-shop', payer: 'cash', addWiperService: false,
  });
  const summary = formatBidSummary(result);
  assert.match(summary, /Static calibration/);
});
