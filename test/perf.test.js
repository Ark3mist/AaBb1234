const { test } = require("node:test");
const assert = require("node:assert/strict");
const { interp, parseHHMM, etpWeight, altitudeCapability, criticalFuel, B738 } = require("../perf.js");

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

test("interp: exact, between, out of range, null neighbour", () => {
  assert.equal(interp([0, 10], [0, 100], 10), 100);
  near(interp([0, 10], [0, 100], 2.5), 25);
  assert.equal(interp([0, 10], [0, 100], 11), null);
  assert.equal(interp([0, 10, 20], [null, 5, 6], 5), null);
  assert.equal(interp([0, 10, 20], [null, 5, 6], 10), 5);
});

test("parseHHMM", () => {
  assert.equal(parseHHMM("1430"), 870);
  assert.equal(parseHHMM("14:30"), 870);
  assert.equal(parseHHMM("930"), 570);
  assert.equal(parseHHMM("2460"), null);
  assert.equal(parseHHMM(""), null);
});

test("etpWeight: basic and midnight rollover", () => {
  const r = etpWeight({ zfw: 60000, fob: 15000, nowUtc: "1200", etaUtc: "1330", burnKgH: 2400 });
  assert.equal(r.minutes, 90);
  near(r.fuelToBurn, 3600);
  near(r.fuelRemaining, 11400);
  near(r.grossWeight, 71400);
  assert.equal(r.warning, null);
  assert.equal(etpWeight({ zfw: 60000, fob: 15000, nowUtc: "2330", etaUtc: "0030", burnKgH: 2400 }).minutes, 60);
  assert.ok(etpWeight({ zfw: 60000, fob: 1000, nowUtc: "1200", etaUtc: "1300", burnKgH: 2400 }).warning);
});

test("altitude capability: chart points, interpolation, anti-ice, limits", () => {
  const d = B738.altitudeCapability;
  assert.equal(altitudeCapability(d, "lrc", 85, 0), 15200);
  assert.equal(altitudeCapability(d, "lrc", 85, -20), 15200);
  assert.equal(altitudeCapability(d, "lrc", 40, 20), 31800);
  assert.equal(altitudeCapability(d, "kias310", 60, 15), 16500);
  near(altitudeCapability(d, "lrc", 72.5, 10), (20900 + 19200) / 2);
  near(altitudeCapability(d, "lrc", 85, 12.5), (15200 + 12600) / 2);
  assert.equal(altitudeCapability(d, "lrc", 85, 10, "engine"), 14000);
  assert.equal(altitudeCapability(d, "kias310", 85, 10, "engineWing"), 9300);
  assert.equal(altitudeCapability(d, "lrc", 86, 10), null);
  assert.equal(altitudeCapability(d, "lrc", 60, 21), null);
});

test("critical fuel: chart points, wind, corrections, limits", () => {
  const d = B738.criticalFuel;
  const base = { isaDev: 0, icing: false, windKt: 0 };
  near(criticalFuel(d, { ...base, distNm: 400, weightT: 45 }).total, 3.4);
  near(criticalFuel(d, { ...base, distNm: 1400, weightT: 85 }).total, 12.9);
  near(criticalFuel(d, { ...base, distNm: 1000, weightT: 70 }).total, (8.8 + 9.0) / 2);
  near(criticalFuel(d, { ...base, distNm: 1000, weightT: 65, windKt: 50 }).total, 8.8 + 1.4);
  near(criticalFuel(d, { ...base, distNm: 1000, weightT: 65, windKt: -50 }).total, 8.8 - 1.0);
  near(criticalFuel(d, { ...base, distNm: 1000, weightT: 65, windKt: 75 }).windCorr, (1.4 + 3.5) / 2);
  near(criticalFuel(d, { ...base, distNm: 1000, weightT: 65, isaDev: 20 }).total, 8.8 * 1.01);
  near(criticalFuel(d, { ...base, distNm: 1000, weightT: 65, icing: true }).total, 8.8 * 1.17);
  assert.ok(criticalFuel(d, { ...base, distNm: 700, weightT: 45 }).error);
  assert.ok(criticalFuel(d, { ...base, distNm: 1300, weightT: 65, windKt: 100 }).error);
  assert.ok(criticalFuel(d, { ...base, distNm: 350, weightT: 65 }).error);
  assert.ok(criticalFuel(d, { ...base, distNm: 1000, weightT: 65, windKt: -60 }).error);
});

test("altitude capability interpolates on both axes at once: weight, then ISA (bilinear from the four chart corners)", () => {
  const d = B738.altitudeCapability;
  // Photo case: GW 68.403 t, ISA +12. Corners: 65 t and 70 t, ISA+10 and ISA+15.
  const f = (68.403 - 65) / 5;
  const at10 = 22500 + (20900 - 22500) * f, at15 = 21300 + (19700 - 21300) * f;     // weight first
  const lrc = at10 + (at15 - at10) * 0.4;                                             // then ISA, 12 is 40% of 10..15
  near(altitudeCapability(d, "lrc", 68.403, 12), lrc, 1e-9);
  near(lrc, 20931, 1);
  near(altitudeCapability(d, "lrc", 68.403, 12, "engine"), lrc - 1200, 1e-9);
  near(altitudeCapability(d, "lrc", 68.403, 12, "engineWing"), lrc - 5500, 1e-9);
  const k10 = 17500 + (16700 - 17500) * f, k15 = 15800 + (15100 - 15800) * f;          // 310 KIAS chart, 65 t and 70 t rows
  const k = k10 + (k15 - k10) * 0.4;
  near(altitudeCapability(d, "kias310", 68.403, 12), k, 1e-9);
  near(k, 16303, 1);
  near(altitudeCapability(d, "kias310", 68.403, 12, "engineWing"), k - 4900, 1e-9);
  // Not the next-higher-column rule: ISA+12 must sit between the ISA+10 and ISA+15 answers.
  assert.ok(altitudeCapability(d, "lrc", 68.403, 12) < altitudeCapability(d, "lrc", 68.403, 10));
  assert.ok(altitudeCapability(d, "lrc", 68.403, 12) > altitudeCapability(d, "lrc", 68.403, 15));
  // Midpoint of a cell on both axes is the mean of its four corners (a bilinear surface is linear along each axis).
  near(altitudeCapability(d, "lrc", 72.5, 12.5), (20900 + 19200 + 19700 + 17400) / 4, 1e-9);
  near(altitudeCapability(d, "lrc", 47.5, 17.5), (30500 + 27700 + 29200 + 25800) / 4, 1e-9);
  // Exactly on a column the answer is that column, interpolated in weight only.
  near(altitudeCapability(d, "lrc", 68.403, 15), 21300 + (19700 - 21300) * f, 1e-9);
  near(altitudeCapability(d, "lrc", 68.403, 20), 19800 + (17300 - 19800) * f, 1e-9);
  // No extrapolation on either axis; below ISA+10 the chart says "and below", so the ISA+10 column is used.
  assert.equal(altitudeCapability(d, "lrc", 68.403, 20.1), null);
  assert.equal(altitudeCapability(d, "lrc", 39.9, 12), null);
  assert.equal(altitudeCapability(d, "lrc", 85.1, 12), null);
  near(altitudeCapability(d, "lrc", 68.403, -5), altitudeCapability(d, "lrc", 68.403, 10), 1e-9);
});

test("reference data: the CFM56-7B24 in-flight LRC table (QRH tab only, not used by the calculators)", () => {
  const { B738, B738_PI_B24: b24 } = require("../perf.js");
  assert.deepEqual(b24.weights, B738.altitudeCapability.weights);
  assert.equal(b24.alt.length, 3); b24.alt.forEach((c) => assert.equal(c.length, 10));
  // spot values straight from the QRH (85 t row, 65 t row, 40 t row) and the anti-ice reductions
  assert.deepEqual([b24.alt[0][9], b24.alt[1][9], b24.alt[2][9]], [9500, 6400, 3400]);
  assert.deepEqual([b24.alt[0][5], b24.alt[1][5], b24.alt[2][5]], [21100, 18600, 16300]);
  assert.deepEqual([b24.alt[0][0], b24.alt[1][0], b24.alt[2][0]], [33800, 33000, 31800]);
  assert.deepEqual(b24.antiIce, { engine: 2000, engineWing: 6500 });
  // never above the B26 table; identical at 50 t and below; altitude falls with weight and with ISA
  const b26 = B738.altitudeCapability.lrc.alt;
  for (let c = 0; c < 3; c++) for (let i = 0; i < 10; i++) {
    assert.ok(b24.alt[c][i] <= b26[c][i], `col ${c} row ${i}`);
    if (b24.weights[i] <= 50) assert.equal(b24.alt[c][i], b26[c][i]);
    if (i > 0) assert.ok(b24.alt[c][i] <= b24.alt[c][i - 1]);
    if (c > 0) assert.ok(b24.alt[c][i] <= b24.alt[c - 1][i]);
  }
  assert.equal(b26[0][9] - b24.alt[0][9], 5700);   // 85 t, ISA+10: the largest gap on the chart pair at that column
});
