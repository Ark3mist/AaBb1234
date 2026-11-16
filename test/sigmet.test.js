const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../crz.js");

// A trimmed copy of the live aviationweather.gov feed (/api/data/isigmet?format=json) taken 16 Nov 2026 ~11:50 UTC.
const live = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "isigmet-live-20261116.json"), "utf8"));
const NOW = Date.UTC(2026, 10, 16, 11, 50);
const ofp = C.parseOFP(fs.readFileSync(path.join(__dirname, "fixtures", "ofp-mh109.txt"), "utf8"));
const route = C.makeRoute(ofp.points);
const VCBI = { id: "VCBI", lat: 7.1808, lon: 79.8841 }, VTSP = { id: "VTSP", lat: 8.1132, lon: 98.3169 };
const res = C.parseISigmet(live);
const by = (id) => res.items.find((i) => i.id === id);

test("live feed: every record is read, none dropped", () => {
  assert.equal(res.items.length, live.length);
  assert.equal(res.rejected, 0);
});

test("live feed: AREAS records keep all their rings; longitudes past 180 survive", () => {
  assert.deepEqual(by("PAZA JULIET 3").rings.map((r) => r.length), [6, 6]);
  assert.deepEqual(by("LYBA T02").rings.map((r) => r.length), [25, 4, 24]);
  assert.ok(Math.max(...by("PAZA JULIET 3").rings.flat().map((p) => p.lon)) > 180);
  assert.ok(res.items.every((i) => i.geom === "AREA"));
});

test("live feed: hazard, qualifier, series, validity and levels", () => {
  const w = by("WMFC 14");
  assert.equal(w.hazard, "TS"); assert.equal(w.hazardName, "Thunderstorm"); assert.equal(w.qualifier, "EMBD");
  assert.equal(w.fir, "WMFC"); assert.equal(w.firName, "WMFC KUALA LUMPUR");
  assert.equal(w.from, 1794826800 * 1000); // epoch seconds became milliseconds (11:00Z, per the raw text VALID 161100/161400)
  assert.equal(w.to, w.from + 3 * 3600e3);
  assert.ok(w.to - w.from > 0 && w.to - w.from <= 6 * 3600e3);
  assert.equal(w.top, null); assert.equal(w.base, null);
  assert.equal(w.levels, "top FL530");                       // top is in the text only
  assert.equal(by("NZZO 7").levels, "top FL530");            // base not stated in the feed, top 53000 ft
  assert.equal(by("RPHI 2").levels, "SFC/FL090");            // base 0 = surface
  assert.equal(by("NZZO 7").hazard, "TC"); assert.equal(by("NZZO 7").qualifier, "XAVIER");
  assert.equal(by("RPHI 2").hazard, "VA");
  assert.equal(by("SOOO 10").levels, "FL170/FL205");
  assert.equal(by("SOOO 10").qualifier, "SEV");
});

test("validity states", () => {
  const w = by("WMFC 14");
  assert.equal(C.sigState(w, w.from + 60e3), "active");
  assert.equal(C.sigState(w, w.from - 60e3), "future");
  assert.equal(C.sigState(w, w.to + 60e3), "expired");
  assert.equal(C.sigState({ from: null, to: null }, NOW), "unknown");
});

test("level band: unknown limits count as inside, known limits are respected", () => {
  assert.equal(C.sigCoversLevel(by("WMFC 14"), 350), true);     // no limits given
  assert.equal(C.sigCoversLevel(by("SOOO 10"), 350), false);    // FL170/FL205
  assert.equal(C.sigCoversLevel(by("SOOO 10"), 190), true);
  assert.equal(C.sigCoversLevel(by("NZZO 7"), 350), true);
  assert.equal(C.sigCoversLevel(by("NZZO 7"), 540), false);
  assert.equal(C.sigCoversLevel(by("WMFC 14"), NaN), null);
});

test("point in polygon: inside, outside, antimeridian, and a polygon on the far side of the world", () => {
  const sq = [{ lat: -1, lon: -1 }, { lat: -1, lon: 1 }, { lat: 1, lon: 1 }, { lat: 1, lon: -1 }];
  assert.equal(C.pointInPoly({ lat: 0, lon: 0 }, sq), true);
  assert.equal(C.pointInPoly({ lat: 0, lon: 2 }, sq), false);
  assert.equal(C.pointInPoly({ lat: 2, lon: 0 }, sq), false);
  const am = [{ lat: -1, lon: 179 }, { lat: -1, lon: 181 }, { lat: 1, lon: 181 }, { lat: 1, lon: 179 }];
  assert.equal(C.pointInPoly({ lat: 0, lon: -179.5 }, am), true);
  assert.equal(C.pointInPoly({ lat: 0, lon: 179.5 }, am), true);
  assert.equal(C.pointInPoly({ lat: 0, lon: -178 }, am), false);
  // regression: a Colombian polygon must not contain a point near Kuala Lumpur
  assert.equal(C.pointInPoly({ lat: 3, lon: 101.7 }, by("SKED A1").rings[0]), false);
  assert.equal(C.pointInPoly({ lat: 5, lon: -78 }, by("SKED A1").rings[0]), true);
});

test("live feed vs the MH109 route: only the Kuala Lumpur and Jakarta approach SIGMETs touch it", () => {
  const hits = res.items.map((i) => ({ i, h: C.sigmetHits(route, i, [VCBI, VTSP], 5) })).filter((x) => x.h.route || x.h.airports.length);
  assert.deepEqual(hits.map((x) => x.i.id).sort(), ["WIIF 17", "WMFC 14"]);
  for (const x of hits) assert.ok(x.h.from > 1300 && x.h.to <= route.total + 1e-6, x.i.id + " " + x.h.from);
});

test("a polygon laid over RULKA is found, with the airports it covers (synthetic geometry)", () => {
  const rulka = ofp.points.find((p) => p.name === "RULKA");
  const ring = [-1, 1].flatMap((a) => [-1, 1].map((b) => ({ lat: rulka.lat + a * 0.8, lon: rulka.lon + b * 0.8 }))); // not in order: fix below
  const sq = [ring[0], ring[1], ring[3], ring[2]];
  const it = { geom: "AREA", rings: [sq] };
  const h = C.sigmetHits(route, it, [VCBI, { id: "ON", lat: rulka.lat, lon: rulka.lon }], 5);
  assert.equal(h.route, true); assert.deepEqual(h.airports, ["ON"]);
  assert.ok(Math.abs(h.from - route.cum[ofp.points.findIndex((p) => p.name === "RULKA")]) < 100);
  assert.equal(C.sigmetHits(route, { geom: "LINE", rings: [sq] }, [], 5).route, false);
});

test("relevance box", () => {
  const pts = [...ofp.points, VCBI, VTSP];
  assert.equal(C.sigNear(by("WMFC 14").rings, pts, 7), true);
  assert.equal(C.sigNear(by("SKED A1").rings, pts, 7), false);          // Colombia
  assert.equal(C.sigNear(by("PAZA JULIET 3").rings, pts, 7), false);      // across the antimeridian
  assert.equal(C.sigNear(by("LYBA T02").rings, pts, 7), false);         // Balkans
});

test("odd input is counted, not trusted", () => {
  assert.deepEqual(C.parseISigmet([]), { items: [], rejected: 0 });
  assert.deepEqual(C.parseISigmet(null), { items: [], rejected: 0 });
  assert.equal(C.parseISigmet({ error: "x" }).rejected, 1);
  const r = C.parseISigmet([null, 5, {}, { hazard: "TS", coords: [] }, { hazard: "TS", coords: [{ lat: 1, lon: 1 }, { lat: 1, lon: 2 }, { lat: 2, lon: 2 }], validTimeFrom: "2026-11-16T10:00:00Z", validTimeTo: 1794830000 }]);
  assert.equal(r.items.length, 1); assert.equal(r.rejected, 4);
  assert.equal(r.items[0].from, Date.UTC(2026, 10, 16, 10)); assert.equal(r.items[0].to, 1794830000 * 1000);
  assert.equal(C.sigHazard("TS GR").code, "TS"); assert.equal(C.sigHazard("RDOACT CLD").code, "RDO");
  assert.equal(C.sigHazard("WEIRD").name, "WEIRD");
});
