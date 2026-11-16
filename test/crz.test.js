const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../crz.js");

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);
const ofp = C.parseOFP(fs.readFileSync(path.join(__dirname, "fixtures", "ofp-mh109.txt"), "utf8"));
const VCBI = { id: "VCBI", lat: 7.1808, lon: 79.8841 }, VTSP = { id: "VTSP", lat: 8.1132, lon: 98.3169 };
const byName = (n) => ofp.points.find((p) => p.name === n);

test("geometry: distance, bearing, destination, ground speed", () => {
  // WGS84: one degree of longitude on the equator is 111,319.49 m; one of latitude there is 110,574.39 m
  near(C.dist({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 111319.49 / 1852, 0.001);
  near(C.dist({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 110574.39 / 1852, 0.001);
  // Vincenty's published check line (Flinders Peak to Buninyong): 54,972.271 m, azimuth 306 deg 52 min 05.37 s
  const FP = { lat: -(37 + 57 / 60 + 3.7203 / 3600), lon: 144 + 25 / 60 + 29.5244 / 3600 }, BU = { lat: -(37 + 39 / 60 + 10.1561 / 3600), lon: 143 + 55 / 60 + 35.3839 / 3600 };
  near(C.dist(FP, BU) * 1852, 54972.271, 0.01);
  near(C.bearing(FP, BU), 306 + 52 / 60 + 5.37 / 3600, 1e-5);
  near(C.dist(C.dest(FP, 306 + 52 / 60 + 5.37 / 3600, 54972.271 / 1852), BU) * 1852, 0, 0.01);
  assert.equal(C.dist(FP, FP), 0);
  near(C.bearing({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 0, 1e-9);
  near(C.bearing({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }), 90, 1e-9);
  const p = C.dest({ lat: 5, lon: 90 }, 37, 250);
  near(C.dist({ lat: 5, lon: 90 }, p), 250, 1e-6);
  near(C.bearing({ lat: 5, lon: 90 }, p), 37, 1e-6);
  near(C.groundSpeed(480, 90, 90, 40), 440, 1e-9);   // headwind
  near(C.groundSpeed(480, 90, 270, 40), 520, 1e-9);  // tailwind
  assert.equal(C.groundSpeed(100, 0, 90, 150), null);
  assert.equal(C.fmtLatLon({ lat: 6.265, lon: 88.5317 }), "N0615.9 E08831.9");
});

test("OFP: header, route, level and speed", () => {
  assert.deepEqual(ofp.warnings, []);
  assert.equal(ofp.flight, "MAS 109");
  assert.equal(ofp.acType, "B738");
  assert.equal(ofp.depIcao, "VOCI"); assert.equal(ofp.destIcao, "WMKK");
  assert.equal(ofp.std, "1905"); assert.equal(ofp.sta, "2325");
  assert.deepEqual(ofp.date, { d: 15, mo: 10, y: 2026 });
  assert.equal(ofp.cruiseFL, 350);
  assert.equal(ofp.mach, 0.79); assert.equal(ofp.costIndex, 30); assert.equal(ofp.cruiseTas, 467);
  assert.equal(ofp.route, "VOCI DODSI W46 MDI M300 OKABU P756 ISVUR R461 PUGER PUGER1G WMKK");
  assert.equal(ofp.grdDist, 1697); assert.equal(ofp.zfw, 60500); assert.equal(ofp.takeoffFuel, 15422);
});

test("OFP: waypoints with coordinates and nav-log data", () => {
  assert.equal(ofp.points.length, 33);
  assert.equal(ofp.points[0].name, "VOCI"); assert.equal(ofp.points[32].name, "WMKK");
  const r = byName("RULKA");
  near(r.lat, 6 + 26 / 60, 1e-9); near(r.lon, 88, 1e-9);
  assert.equal(r.fl, "350"); assert.equal(r.eltm, 101); assert.equal(r.tas, 467); assert.equal(r.gs, 454);
  assert.equal(r.windDir, 128); assert.equal(r.windKt, 17); assert.equal(r.dist, 735); assert.equal(r.efob, 9580);
  assert.equal(byName("ETP1").pseudo, true); assert.equal(byName("T-O-C").pseudo, true); assert.equal(r.pseudo, false);
  assert.equal(byName("VOCI").efob, 15422); assert.equal(byName("WMKK").eltm, 238);
  assert.equal(byName("DODSI").tas, undefined);     // climb: no TAS column
});

test("OFP: EDTO alternates, points and speeds", () => {
  const e = ofp.edto;
  assert.equal(e.planned, true); assert.equal(e.ruleMin, 120); assert.equal(e.oneHourNm, 420);
  assert.deepEqual(e.alternates, ["VCBI", "VTSP"]);
  assert.deepEqual(e.adequate, ["VOCI", "VCBI", "VTSP", "WIMM", "WMKK"]);
  assert.deepEqual(e.points.map((p) => p.name), ["SETP1", "EEP", "ETP1", "EXP", "SETP2", "SETP3"]);
  const etp = e.points[2];
  assert.deepEqual(etp.airports, ["VCBI", "VTSP"]); assert.deepEqual(etp.dist, [520, 594]); assert.deepEqual(etp.wc, [-30, 15]);
  assert.equal(etp.eltm, 105); assert.equal(etp.divTimeMin, 98); assert.equal(etp.critFuel, 5.3); assert.equal(etp.fob, 9.4); assert.equal(etp.cond, "DX");
  near(etp.lat, 6.265, 1e-9); near(etp.lon, 88 + 31.9 / 60, 1e-9);
  assert.equal(e.divTas, 349);
  assert.deepEqual(e.speeds.map((s) => s.code + " " + s.speed), ["DX 310 IAS", "1X 310 IAS", "DC LRC"]);
});

test("OFP: wind table, including rows where a column is missing", () => {
  const w = ofp.winds.RULKA;
  assert.deepEqual(w.map((x) => x.fl), [430, 370, 350, 330, 290, 100]);
  assert.deepEqual(w.find((x) => x.fl === 100), { fl: 100, dir: 250, kt: 34, oat: 10, cruise: false });
  assert.equal(w.find((x) => x.fl === 350).cruise, true);
  assert.deepEqual(ofp.winds.CLIMB.map((x) => x.fl), [350, 310, 200, 150, 100]);   // short column
  assert.equal(ofp.winds["T-O-C"].find((x) => x.fl === 100).dir, 355);                // row with CLIMB missing
  assert.deepEqual(ofp.winds["T-O-D"].map((x) => x.fl), [350]);                       // "NO WX DATA" rows
  assert.equal(ofp.winds.DESCENT.length, 5);
});

test("60 min rings reproduce the OFP entry and exit points", () => {
  const route = C.makeRoute(ofp.points);
  const out = C.ringCrossings(route, VCBI, 420).filter((x) => x.exit);
  const inn = C.ringCrossings(route, VTSP, 420).filter((x) => !x.exit);
  assert.equal(out.length, 1); assert.equal(inn.length, 1);
  near(C.dist(out[0], byName("ENTRY")), 0, 1);
  near(C.dist(inn[0], byName("EXIT")), 0, 1);
  near(C.dist(out[0], VCBI), 420, 0.001);
});

test("renomination: halfway point, 90 degree radial, EDP", () => {
  const route = C.makeRoute(ofp.points);
  const r = C.renominate(route, VCBI, VTSP, { tas: 480, windKt: 0 });
  near(r.trackDist, C.dist(VCBI, VTSP), 1e-9);
  near(r.half * 2, r.trackDist, 1e-9);
  near(C.dist(r.mid, VCBI), C.dist(r.mid, VTSP), 0.01);
  near(r.edpDist1, r.edpDist2, 0.01);                       // equidistant
  assert.equal(r.side, "right"); assert.equal(r.radialOffset, "+90");
  near(C.norm360(r.radialT - r.trackT), 90, 4);             // about 90 degrees off the track
  near(C.dist(C.dest(r.mid, r.radialT, r.radialDist), r.edp), 0, 0.01);
  assert.equal(r.edpLeg.before.name, "RULKA"); assert.equal(r.edpLeg.after.name, "TOPIN");   // pseudo points skipped
  near(r.etpShift, 0, 0.01); assert.equal(r.shiftDir, 0);   // nil wind: ETP = EDP
  // swapping the airports mirrors the side
  const s = C.renominate(route, VTSP, VCBI, { windKt: 0 });
  assert.equal(s.side, "left"); near(C.dist(s.edp, r.edp), 0, 0.01);
});

test("renomination: ETP moves into the wind and times are equal there", () => {
  const route = C.makeRoute(ofp.points);
  // westerly wind = tailwind on this eastbound route: VCBI (behind) takes longer, ETP moves back
  const r = C.renominate(route, VCBI, VTSP, { tas: 349, windDir: 250, windKt: 34 });
  assert.ok(r.t1 > r.t2); assert.equal(r.shiftDir, -1); assert.ok(r.etpShift < 0);
  near(r.formulaShift, (Math.abs(r.dtMin) / 2) * (349 / 60), 1e-9);
  const t = (ea) => (C.dist(r.etp, ea) / C.groundSpeed(349, C.bearing(r.etp, ea), 250, 34)) * 60;
  near(t(VCBI), t(VTSP), 0.01); near(r.etpTime, t(VCBI), 0.01);
  near(C.dist(r.etp, byName("ETP1")), 0, 25);              // close to the OFP's own ETP (one wind used, not a forecast along each track)
  // easterly wind: the other way
  const e = C.renominate(route, VCBI, VTSP, { tas: 467, windDir: 90, windKt: 40 });
  assert.equal(e.shiftDir, 1); assert.ok(e.etpShift > 0);
});

test("renomination: both airports ahead of the route still gives an ETP", () => {
  const route = C.makeRoute(ofp.points);
  const WMKP = { id: "WMKP", lat: 5.2971, lon: 100.2769 };
  const r = C.renominate(route, VTSP, WMKP, { tas: 463, windDir: 96, windKt: 18 });
  assert.ok(r.etp, r.etpError);
  const t = (ea) => (C.dist(r.etp, ea) / C.groundSpeed(463, C.bearing(r.etp, ea), 96, 18)) * 60;
  near(t(VTSP), t(WMKP), 0.01);
  assert.ok(Math.abs(r.etpShift) < 30);
});

test("renomination: errors", () => {
  const route = C.makeRoute(ofp.points);
  assert.ok(C.renominate(route, VCBI, VCBI, {}).error);
  // two airports far to the north-west: nowhere on the route is equidistant
  assert.ok(C.renominate(route, { id: "AAAA", lat: 40, lon: 10 }, { id: "BBBB", lat: 41, lon: 30 }, {}).error);
});

test("shift from FMC ETAs (handout: 3 min at 480 kt = 12 NM)", () => {
  const s = C.shiftFromEtas("1531", "1534", 480);
  assert.equal(s.dtMin, -3); near(s.shift, 12, 1e-9); assert.equal(s.longer, 2);
  assert.equal(C.shiftFromEtas("2359", "0002", 480).dtMin, -3);
  assert.equal(C.shiftFromEtas("15", "1534", 480), null);
});
