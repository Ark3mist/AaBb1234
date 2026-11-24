// CRZ: flight plan (OFP) parser, route geometry and EDTO alternate renomination. No DOM.
// Loaded by index.html as a plain script (window.CRZ) and by the tests (require).
// The OFP is read on the device only; nothing is uploaded.
(function (root) {
  "use strict";

  // =====================================================================
  // Geometry on the WGS84 ellipsoid (Vincenty). Distances in NM, angles in degrees (true).
  // =====================================================================
  const R_NM = 3440.065, D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const WGS_A = 6378137, WGS_F = 1 / 298.257223563, WGS_B = WGS_A * (1 - WGS_F), M_PER_NM = 1852;
  const norm360 = (d) => ((d % 360) + 360) % 360;

  // Spherical versions: only a fallback if the ellipsoid iteration does not settle (near-antipodal points).
  function sphDist(a, b) {
    const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
    const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function sphBearing(a, b) {
    const p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
    const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return norm360(Math.atan2(y, x) * R2D);
  }

  /** Vincenty inverse: { d: NM, brg: initial bearing } or null if it does not converge. */
  function inverse(a, b) {
    const L = ((((b.lon - a.lon) % 360) + 540) % 360 - 180) * D2R;
    if (Math.abs(L) < 1e-13 && Math.abs(a.lat - b.lat) < 1e-11) return { d: 0, brg: 0 };
    const U1 = Math.atan((1 - WGS_F) * Math.tan(a.lat * D2R)), U2 = Math.atan((1 - WGS_F) * Math.tan(b.lat * D2R));
    const sU1 = Math.sin(U1), cU1 = Math.cos(U1), sU2 = Math.sin(U2), cU2 = Math.cos(U2);
    let lam = L, sinS, cosS, sig, cos2a, cos2m, sinL, cosL;
    for (let i = 0; ; i++) {
      if (i === 200) return null;
      sinL = Math.sin(lam); cosL = Math.cos(lam);
      sinS = Math.hypot(cU2 * sinL, cU1 * sU2 - sU1 * cU2 * cosL);
      if (sinS === 0) return { d: 0, brg: 0 };
      cosS = sU1 * sU2 + cU1 * cU2 * cosL;
      sig = Math.atan2(sinS, cosS);
      const sinA = (cU1 * cU2 * sinL) / sinS;
      cos2a = 1 - sinA * sinA;
      cos2m = cos2a ? cosS - (2 * sU1 * sU2) / cos2a : 0;
      const C = (WGS_F / 16) * cos2a * (4 + WGS_F * (4 - 3 * cos2a));
      const next = L + (1 - C) * WGS_F * sinA * (sig + C * sinS * (cos2m + C * cosS * (-1 + 2 * cos2m * cos2m)));
      const done = Math.abs(next - lam) < 1e-12;
      lam = next;
      if (done) break;
    }
    const u2 = (cos2a * (WGS_A * WGS_A - WGS_B * WGS_B)) / (WGS_B * WGS_B);
    const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
    const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
    const dS = B * sinS * (cos2m + (B / 4) * (cosS * (-1 + 2 * cos2m * cos2m) - (B / 6) * cos2m * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2m * cos2m)));
    sinL = Math.sin(lam); cosL = Math.cos(lam);
    return { d: (WGS_B * A * (sig - dS)) / M_PER_NM, brg: norm360(Math.atan2(cU2 * sinL, cU1 * sU2 - sU1 * cU2 * cosL) * R2D) };
  }
  /** Geodesic distance, NM. */
  function dist(a, b) { const r = inverse(a, b); return r ? r.d : sphDist(a, b); }
  /** Initial geodesic bearing a -> b, degrees true. */
  function bearing(a, b) { const r = inverse(a, b); return r ? r.brg : sphBearing(a, b); }
  /** Point d NM from a on initial bearing brg (Vincenty direct). */
  function dest(a, brg, d) {
    const s = d * M_PER_NM, a1 = brg * D2R, sA1 = Math.sin(a1), cA1 = Math.cos(a1);
    const tU1 = (1 - WGS_F) * Math.tan(a.lat * D2R), cU1 = 1 / Math.sqrt(1 + tU1 * tU1), sU1 = tU1 * cU1;
    const sig1 = Math.atan2(tU1, cA1), sinA = cU1 * sA1, cos2a = 1 - sinA * sinA;
    const u2 = (cos2a * (WGS_A * WGS_A - WGS_B * WGS_B)) / (WGS_B * WGS_B);
    const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
    const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
    let sig = s / (WGS_B * A), sinS, cosS, cos2m;
    for (let i = 0; i < 100; i++) {
      cos2m = Math.cos(2 * sig1 + sig); sinS = Math.sin(sig); cosS = Math.cos(sig);
      const dS = B * sinS * (cos2m + (B / 4) * (cosS * (-1 + 2 * cos2m * cos2m) - (B / 6) * cos2m * (-3 + 4 * sinS * sinS) * (-3 + 4 * cos2m * cos2m)));
      const next = s / (WGS_B * A) + dS;
      const done = Math.abs(next - sig) < 1e-12;
      sig = next;
      if (done) break;
    }
    cos2m = Math.cos(2 * sig1 + sig); sinS = Math.sin(sig); cosS = Math.cos(sig);
    const x = sU1 * sinS - cU1 * cosS * cA1;
    const lat = Math.atan2(sU1 * cosS + cU1 * sinS * cA1, (1 - WGS_F) * Math.hypot(sinA, x));
    const lam = Math.atan2(sinS * sA1, cU1 * cosS - sU1 * sinS * cA1);
    const C = (WGS_F / 16) * cos2a * (4 + WGS_F * (4 - 3 * cos2a));
    const L = lam - (1 - C) * WGS_F * sinA * (sig + C * sinS * (cos2m + C * cosS * (-1 + 2 * cos2m * cos2m)));
    return { lat: lat * R2D, lon: ((a.lon + L * R2D + 540) % 360) - 180 };
  }
  /** Ground speed along track trk with wind FROM windDir at windKt. null if the wind is too strong to hold the track. */
  function groundSpeed(tas, trk, windDir, windKt) {
    const a = (windDir - trk) * D2R, x = windKt * Math.sin(a);
    if (Math.abs(x) >= tas) return null;
    const gs = Math.sqrt(tas * tas - x * x) - windKt * Math.cos(a);
    return gs > 0 ? gs : null;
  }
  /** "N0615.9 E08831.9" style. */
  function fmtLatLon(p) {
    const f = (v, pos, neg, w) => {
      const a = Math.abs(v); let d = Math.floor(a), m = Math.round((a - d) * 600) / 10;
      if (m >= 60) { d += 1; m = 0; }
      return (v >= 0 ? pos : neg) + String(d).padStart(w, "0") + m.toFixed(1).padStart(4, "0");
    };
    return f(p.lat, "N", "S", 2) + " " + f(p.lon, "E", "W", 3);
  }

  /** Route as a polyline with cumulative distance. pts: [{name, lat, lon, ...}] */
  function makeRoute(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1] || 0;
    function at(s) {
      s = Math.max(0, Math.min(total, s));
      let i = 1;
      while (i < pts.length - 1 && cum[i] < s) i++;
      const a = pts[i - 1], b = pts[i], len = cum[i] - cum[i - 1];
      const p = len > 0 ? dest(a, bearing(a, b), s - cum[i - 1]) : { lat: a.lat, lon: a.lon };
      return { lat: p.lat, lon: p.lon, s, leg: i - 1 };
    }
    return { pts, cum, total, at };
  }

  /** Sampled WGS84 great-circle route between two airports {id, lat, lon}. */
  function directRoute(a, b, stepNm) {
    const total = dist(a, b);
    if (total < 1) return null;
    const brg = bearing(a, b), step = stepNm > 0 ? stepNm : 50;
    const n = Math.max(1, Math.ceil(total / step));
    const pts = [{ name: a.id, lat: a.lat, lon: a.lon, pseudo: false }];
    for (let i = 1; i < n; i++) {
      const p = dest(a, brg, (total * i) / n);
      pts.push({ name: "GC" + i, lat: p.lat, lon: p.lon, pseudo: true });
    }
    pts.push({ name: b.id, lat: b.lat, lon: b.lon, pseudo: false });
    return { pts, dist: total, bearing: brg };
  }

  /** All along-route distances where f changes sign, found by 5 NM scan then bisection. */
  function crossings(route, f) {
    const out = [], STEP = 5;
    let s0 = 0, f0 = f(route.at(0));
    for (let s = STEP; s0 < route.total; s += STEP) {
      const s1 = Math.min(s, route.total), f1 = f(route.at(s1));
      if (f0 === 0) out.push({ s: s0, rising: f1 > 0 });
      else if (f0 * f1 < 0) {
        let lo = s0, hi = s1, flo = f0;
        for (let k = 0; k < 40; k++) {
          const mid = (lo + hi) / 2, fm = f(route.at(mid));
          if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; }
        }
        out.push({ s: (lo + hi) / 2, rising: f1 > f0 });
      }
      s0 = s1; f0 = f1;
    }
    return out;
  }

  /** Where the route leaves (exit) and enters (entry) a circle of radius NM around c. */
  function ringCrossings(route, c, radius) {
    return crossings(route, (p) => dist(p, c) - radius).map((x) => Object.assign(route.at(x.s), { exit: x.rising }));
  }

  /** The real fixes either side of along-route distance s (pseudo points such as ETP1 or T-O-C are skipped). */
  function legAt(route, s) {
    let before = null, after = null;
    for (let i = 0; i < route.pts.length; i++) {
      if (route.pts[i].pseudo) continue;
      if (route.cum[i] <= s + 1e-6) before = route.pts[i];
      else { after = route.pts[i]; break; }
    }
    return { before, after };
  }

  // =====================================================================
  // EDTO alternate renomination (MAS "EDTO Basics & Procedures", steps 2 and 3)
  // =====================================================================
  /**
   * ea1, ea2: {id, lat, lon}. opts: { tas, windDir, windKt, magVar(lat, lon) -> deg east positive }.
   * Returns the numbers the FMC procedure produces, or { error }.
   */
  function renominate(route, ea1, ea2, opts) {
    opts = opts || {};
    const magVar = opts.magVar || (() => 0);
    const toMag = (trk, p) => norm360(trk - magVar(p.lat, p.lon));
    const tas = Number.isFinite(opts.tas) && opts.tas > 0 ? opts.tas : 480;
    const windKt = Number.isFinite(opts.windKt) ? opts.windKt : 0;
    const windDir = Number.isFinite(opts.windDir) ? opts.windDir : 0;

    // Step 2: direct track EA1 -> EA2, halfway point, 90 degree line to the route
    const trackDist = dist(ea1, ea2);
    if (trackDist < 1) return { error: "Choose two different airports." };
    const trackT = bearing(ea1, ea2);
    const half = trackDist / 2;
    const mid = dest(ea1, trackT, half);

    // The line at 90 degrees through the halfway point is where both airports are equally far, so the EDP is where the route's distance to EA1 equals its distance to EA2.
    const xs = crossings(route, (p) => dist(p, ea1) - dist(p, ea2));
    if (!xs.length) return { error: "The route never passes a point equally distant from " + ea1.id + " and " + ea2.id + ". Check the airport order and the route.", trackT, trackM: toMag(trackT, ea1), trackDist, half, mid };
    const edp = xs.map((x) => route.at(x.s)).sort((a, b) => dist(a, mid) - dist(b, mid))[0];
    const radialT = bearing(mid, edp), radialDist = dist(mid, edp);
    // Is the route to the right or left of the EA1 -> EA2 track? (handout: right = add 90, left = subtract 90)
    const side = norm360(radialT - trackT) < 180 ? "right" : "left";
    const edpDist1 = dist(edp, ea1), edpDist2 = dist(edp, ea2);

    // Step 3: time to each airport from a point, with the wind
    const timeTo = (p, ea) => {
      const gs = groundSpeed(tas, bearing(p, ea), windDir, windKt);
      return gs ? (dist(p, ea) / gs) * 60 : null;
    };
    const t1 = timeTo(edp, ea1), t2 = timeTo(edp, ea2);
    const out = {
      ea1, ea2, trackT, trackM: toMag(trackT, ea1), trackDist, half, mid,
      radialT, radialM: toMag(radialT, mid), radialOffset: side === "right" ? "+90" : "-90", side, radialDist,
      edp, edpLeg: legAt(route, edp.s), edpDist1, edpDist2,
      tas, windDir, windKt, nmPerMin: tas / 60, t1, t2,
    };
    if (t1 == null || t2 == null) { out.etpError = "Wind too strong for the entered TAS."; return out; }

    // Handout formula: shift = (time difference / 2) x NM per minute, moved into the wind,
    // which is toward the airport that takes longer to reach.
    const dt = t1 - t2;
    out.dtMin = dt;
    out.formulaShift = (Math.abs(dt) / 2) * (tas / 60);
    // Exact ETP: where the two times are equal. Search outward from the EDP in both directions
    // and take the nearest. (The airport that takes longer is normally "into the wind", but when
    // both airports lie ahead of the route that rule has no direction, so the search decides.)
    const g = (s) => { const p = route.at(s), a = timeTo(p, ea1), b = timeTo(p, ea2); return a == null || b == null ? NaN : a - b; };
    let lo = edp.s, hi = edp.s, glo = dt, found = Math.abs(dt) < 1e-6;
    out.shiftDir = 0;
    const prev = { "-1": edp.s, "1": edp.s }, dead = { "-1": false, "1": false };
    for (let step = 10; !found && step <= 800 && !(dead[-1] && dead[1]); step += 10) {
      for (const dir of [-1, 1]) {
        if (dead[dir] || found) continue;
        const s = Math.max(0, Math.min(route.total, edp.s + dir * step)), v = g(s);
        if (Number.isNaN(v)) { dead[dir] = true; continue; }
        if (v * dt <= 0) { lo = prev[dir]; hi = s; found = true; out.shiftDir = dir; }
        else { prev[dir] = s; if (s === 0 || s === route.total) dead[dir] = true; }
      }
    }
    if (!found) { out.etpError = "Could not find an equal-time point on the route."; return out; }
    if (out.shiftDir !== 0) {
      for (let k = 0; k < 50; k++) {
        const m = (lo + hi) / 2, v = g(m);
        if (v * glo <= 0) hi = m; else { lo = m; glo = v; }
      }
    }
    const etp = route.at((lo + hi) / 2);
    out.etp = etp;
    out.etpShift = etp.s - edp.s;                 // signed NM along the route; negative = back toward departure
    out.etpLeg = legAt(route, etp.s);
    out.etpDist1 = dist(etp, ea1); out.etpDist2 = dist(etp, ea2);
    out.etpTime = timeTo(etp, ea1);
    return out;
  }

  /** Handout formula from two FMC ETAs ("1531", "1534"): shift NM and which airport takes longer. */
  function shiftFromEtas(eta1, eta2, tas) {
    const hm = (s) => { const m = /^(\d{1,2}):?(\d{2})$/.exec(String(s || "").trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
    const a = hm(eta1), b = hm(eta2);
    if (a == null || b == null) return null;
    let d = a - b;
    if (d > 720) d -= 1440; else if (d < -720) d += 1440;   // across midnight
    const t = Number.isFinite(tas) && tas > 0 ? tas : 480;
    return { dtMin: d, shift: (Math.abs(d) / 2) * (t / 60), longer: d > 0 ? 1 : d < 0 ? 2 : 0 };
  }

  // =====================================================================
  // OFP parser (LIDO layout as used by MAS)
  // =====================================================================
  const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
  const COORD = /([NS])(\d{2})(\d{2}\.\d)\s*([EW])(\d{3})(\d{2}\.\d)/g;
  // Points that lie on the route but are not fixes in the FMC database.
  const PSEUDO = /^(SETP\d+|ETP\d*|EEP\d*|EXP\d*|ENTRY|EXIT|T-O-C|T-O-D|TOC|TOD|CP\d*)$/;
  const dm = (h, d, m) => { const v = +d + +m / 60; return h === "S" || h === "W" ? -v : v; };
  const hm = (s) => +s.slice(0, s.length - 2) * 60 + +s.slice(-2);   // "0145" -> minutes

  function parseOFP(text) {
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const all = lines.join("\n");
    const out = { warnings: [], points: [], edto: { alternates: [], points: [] } };
    let m;

    // ---- header ----
    m = /([A-Z]{4})\/([A-Z]{3})\s+(\d{4})\s*UTC\s+([A-Z]{4})\/([A-Z]{3})\s+(\d{4})\s*UTC/.exec(all);
    if (m) Object.assign(out, { depIcao: m[1], depIata: m[2], std: m[3], destIcao: m[4], destIata: m[5], sta: m[6] });
    m = /\b(\d{2})\s?(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s?(\d{4}|\d{2})\b/.exec(all);
    if (m) out.date = { d: +m[1], mo: MONTHS[m[2]], y: m[3].length === 2 ? 2000 + +m[3] : +m[3] };
    m = /\b(MAS|[A-Z]{2,3})\s?(\d{1,4})\s+OFP\b/.exec(all) || /^\s*([A-Z0-9]{2})\s?(\d{1,4})\/\d{2}[A-Z]{3}\d{2}/im.exec(all);
    if (m) out.flight = (m[1] + " " + m[2]).trim();
    m = /^\s*(B7\d\w|A3\d\w|B38M|[AB]\d{3})\s+[A-Z]{4}\/[A-Z]{3}/m.exec(all); if (m) out.acType = m[1];
    m = /(\d{1,2}):(\d{2})\s*HRS\s+(\d{1,2}):(\d{2})\s*HRS/.exec(all);
    if (m) { out.blkMin = +m[1] * 60 + +m[2]; out.fltMin = +m[3] * 60 + +m[4]; }
    m = /GRD\s*DIST:?\s*(\d{2,5})/.exec(all); if (m) out.grdDist = +m[1];
    m = /AIR\s*DIST:?\s*(\d{2,5})/.exec(all) || /\bESAD\s+(\d{2,5})/.exec(all); if (m) out.airDist = +m[1];
    m = /AVG\s*W\/C:?\s*([PM])\s?(\d{1,3})/.exec(all); if (m) out.avgWc = (m[1] === "P" ? 1 : -1) * +m[2];
    m = /AVG\s*ISA:?\s*([PM])\s?(\d{1,2})/.exec(all); if (m) out.avgIsa = (m[1] === "P" ? 1 : -1) * +m[2];
    m = /DIST\/EET\s+(\d{2,5})\/(\d{1,2}):(\d{2})/.exec(all);
    if (m) { if (out.grdDist == null) out.grdDist = +m[1]; out.eetMin = +m[2] * 60 + +m[3]; }
    m = /\bZFW\s+(\d{4,6})/.exec(all); if (m) out.zfw = +m[1];
    m = /EST\s+T\/OFF\s+FUEL\s+(\d{3,6})/.exec(all); if (m) out.takeoffFuel = +m[1];

    // ---- route, level, speed ----
    m = /FMS\s+COST\s+INDEX:?\s*(\S+)/.exec(all) || /\b(M\d{2}\/CI\d+(?:\/M\d{2}\/CI\d+)?)\b/.exec(all);
    if (m) {
      out.speedPlan = m[1];
      const s = /M(\d{2})\/CI(\d+)/.exec(m[1]);
      if (s) { out.mach = +s[1] / 100; out.costIndex = +s[2]; }
    }
    m = /\b[A-Z]{4}\/F(\d{3})(?:\s+[A-Z0-9]{2,5}\/F\d{3})*/.exec(all);
    if (m) { out.levelPlan = m[0].replace(/\s+/g, " "); out.cruiseFL = +m[1]; }
    {
      // the ATC route: from the line after "ROUTE: xxxx-xxxx" down to the level plan
      const i = lines.findIndex((l) => /ROUTE:\s*[A-Z]{4}-[A-Z]{4}/.test(l));
      if (i >= 0) {
        const parts = [];
        for (let k = i + 1; k < Math.min(lines.length, i + 8); k++) {
          const t = lines[k].replace(/^.*?:\s{2,}/, "").trim();
          if (!t || /^[A-Z]{4}\/F\d{3}/.test(t) || /:/.test(t)) break;
          parts.push(t);
        }
        if (parts.length) out.route = parts.join(" ").replace(/\s+/g, " ");
      }
    }

    // ---- EDTO ----
    m = /EDTO\s+RULE\s+TIME:?\s*(\d{2,3})\s*MIN/.exec(all); if (m) out.edto.ruleMin = +m[1];
    m = /\bEDTO:\s*(YES|NO)\b/.exec(all); if (m) out.edto.planned = m[1] === "YES";
    m = /\bEA:\s*([A-Z]{4}(?:\s*-\s*[A-Z]{4})*)/.exec(all);
    if (m) out.edto.alternates = m[1].split("-").map((s) => s.trim());
    m = /\bERA:\s*([A-Z]{4}(?:\s*-\s*[A-Z]{4})+)/.exec(all);
    if (m) out.edto.adequate = m[1].split("-").map((s) => s.trim());
    const speeds = [...all.matchAll(/\((DX|1X|DC)\)\s*-\s*([^\n]*?)\s*-\s*([^\n]+)/g)];
    if (speeds.length) out.edto.speeds = speeds.map((s) => ({ code: s[1], what: s[2].trim(), speed: s[3].trim() }));
    {
      // "ETP1  VCBI/VTSP  0145 0138  520/594  103/031  0.0  5.3  9.4  DX" then a coordinates line
      const ROW = /^\s*(SETP\d*|ETP\d*|EEP\d*|EXP\d*|CP\d*)\s+([A-Z]{4}(?:\/[A-Z]{4})?)\s+(\d{4})\s+(\d{4})\s+(\d{1,4})(?:\/(\d{1,4}))?\s+\S+\s+(\d+\.\d)\s+(\d+\.\d)\s+(\d+\.\d)\s+([A-Z0-9]{2})\b/;
      const start = lines.findIndex((l) => /^\s*EDTO\s+INFORMATION/.test(l));
      for (let i = start; start >= 0 && i < lines.length; i++) {
        if (/ENRTE\s+ALTNS|^\s*PAGE\s+\d/.test(lines[i]) && i > start + 2) break;
        const r = ROW.exec(lines[i]);
        if (!r) continue;
        const c = [...(lines[i + 1] || "").matchAll(COORD)][0];
        const pt = {
          name: r[1], airports: r[2].split("/"), eltm: hm(r[3]), divTimeMin: hm(r[4]),
          dist: r[6] != null ? [+r[5], +r[6]] : [+r[5]], ice: +r[7], critFuel: +r[8], fob: +r[9], cond: r[10],
        };
        if (c) { pt.lat = dm(c[1], c[2], c[3]); pt.lon = dm(c[4], c[5], c[6]); }
        // second line: ISA deviations then wind components, e.g. "P14/P15 M030/P015" (P = tailwind)
        const wc = /\s([PM]\d{3}(?:\/[PM]\d{3})?)\s*$/.exec(lines[i + 1] || "");
        if (wc) pt.wc = wc[1].split("/").map((w) => (w[0] === "P" ? 1 : -1) * +w.slice(1));
        out.edto.points.push(pt);
      }
      // alternates named by the EEP/ETP/EXP rows, if the "EA:" line was not found
      if (!out.edto.alternates.length) {
        const seen = [];
        out.edto.points.filter((p) => /^(EEP|ETP|EXP)/.test(p.name)).forEach((p) => p.airports.forEach((a) => { if (!seen.includes(a)) seen.push(a); }));
        out.edto.alternates = seen;
      }
      const eep = out.edto.points.find((p) => /^EEP/.test(p.name));
      if (eep && eep.dist[0]) out.edto.oneHourNm = eep.dist[0];
      // still-air speed the OFP used for the ETP diversion: distance / time, less the wind component
      const etp = out.edto.points.find((p) => /^ETP/.test(p.name) && p.wc && p.wc.length === p.dist.length && p.divTimeMin > 0);
      if (etp) out.edto.divTas = Math.round(etp.dist.reduce((t, d, k) => t + (d / etp.divTimeMin) * 60 - etp.wc[k], 0) / etp.dist.length);
    }

    // ---- coordinates section ----
    const coords = {};
    const ci = lines.findIndex((l) => /COORDINATES\s+INFORMATION/i.test(l));
    if (ci >= 0) {
      let prevNames = null;
      for (let i = ci + 1; i < lines.length; i++) {
        const l = lines[i];
        const pairs = [...l.matchAll(COORD)];
        if (pairs.length) {
          if (prevNames && prevNames.length === pairs.length) {
            pairs.forEach((p, k) => {
              if (!(prevNames[k] in coords)) coords[prevNames[k]] = { lat: dm(p[1], p[2], p[3]), lon: dm(p[4], p[5], p[6]), order: Object.keys(coords).length };
            });
          } else out.warnings.push(`Could not match names to coordinates near: "${l.trim().slice(0, 60)}"`);
          prevNames = null;
          continue;
        }
        const toks = l.trim().split(/\s+/).filter((t) => t && t !== "WPT");
        if (toks.length && toks.every((t) => /^[A-Z0-9][A-Z0-9-]{0,11}$/.test(t)) && !/^PAGE$/i.test(toks[0])) prevNames = toks;
      }
    }

    // ---- wind information: blocks of up to four points, one row per level ----
    //   " AVDEL            ESPAP ..."  then  " 430 112/035 M63  430 079/028 M62 ..."  ("*" marks the cruise level)
    const winds = {};
    const wi = lines.findIndex((l) => /WIND\s+INFORMATION/.test(l));
    if (wi >= 0) {
      let heads = null;
      for (let i = wi + 1; i < lines.length; i++) {
        const l = lines[i];
        if (/COORDINATES\s+INFORMATION|RVSM\s+CHECK/.test(l)) break;
        if (/^\s*PAGE\s+\d/.test(l)) continue;
        const cells = [...l.matchAll(/(\*?)(\d{3})\s+(\d{3})\/(\d{3})\s+([MP])(\d{2})/g)];
        if (cells.length && heads) {
          for (const c of cells) {
            const pos = c.index + (c[1] ? 1 : 0);
            const h = heads.reduce((a, b) => (Math.abs(b.pos - pos) < Math.abs(a.pos - pos) ? b : a));
            const row = { fl: +c[2], dir: +c[3], kt: +c[4], oat: (c[5] === "P" ? 1 : -1) * +c[6], cruise: !!c[1] };
            const list = winds[h.name] || (winds[h.name] = []);
            if (!list.some((w) => w.fl === row.fl)) list.push(row);
          }
          continue;
        }
        if (/NO\s+WX\s+DATA/.test(l)) continue;
        const names = [...l.matchAll(/[A-Z0-9][A-Z0-9-]{1,11}/g)];
        if (names.length && l.replace(/[A-Z0-9-]/g, "").trim() === "") heads = names.map((n) => ({ name: n[0], pos: n.index }));
      }
    }
    out.winds = winds;

    // ---- nav log: two lines per point ----
    //   WPT  FL   W/V     TAS MTK  WS |TIME ELTM      | USED
    //   AWY  MORA TDEV    GS  TTK  TP |DIST ETO / ATO | EFOB AFOB
    const log = [];
    let inLog = false;
    const L1 = /^(\S*)\s+(CLB|DES|\d{2,3})\s+(\d{3})\/(\d{2,3})\b([^|]*)\|\s*(?:\d{1,3}\s+)?(\d{4})\s*\|/;
    const readRow = (name, l1, l2) => {
      const r = L1.exec(l1);
      if (!r) return null;
      const e = { name, fl: r[2], windDir: +r[3], windKt: +r[4], eltm: hm(r[6]) };
      const nums = r[5].trim().split(/\s+/).filter(Boolean).map(Number);
      // with a TAS the columns are TAS MTK [WS]; without (climb/descent) only MTK
      if (nums.length >= 2 && nums[0] >= 200) e.tas = nums[0];
      if (l2) {
        const p = l2.split("|");
        if (p.length >= 3) {
          const d = /^\s*(\d{1,5})\b/.exec(p[1]); if (d) e.dist = +d[1];
          const f = /^\s*(\d{3,6})\b/.exec(p[2]); if (f) e.efob = +f[1];
          const a = /^(\S+)\s+\d/.exec(p[0]); if (a && name && !/^\s/.test(p[0])) e.awy = a[1];
          if (e.tas) { const g = p[0].trim().split(/\s+/); const gi = g.findIndex((t) => /^[PM]\d{1,2}$/.test(t)); if (gi >= 0 && +g[gi + 1] >= 200) e.gs = +g[gi + 1]; }
        }
      }
      return e;
    };
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (/^\s*WPT\s+FL\b/.test(l)) {
        const before = lines.slice(Math.max(0, i - 4), i).join(" ");
        inLog = !/RECLEARANCE/i.test(before);
        continue;
      }
      if (!inLog) continue;
      if (/WIND\s+INFORMATION|COORDINATES\s+INFORMATION/.test(l)) { inLog = false; continue; }
      let e;
      const a = /^([A-Z]{4})\/\S+\s*$/.exec(l);                     // "VOCI/27/DODSI1A" then its data lines
      if (a && lines[i + 1] && (e = readRow(a[1], "X" + lines[i + 1], lines[i + 2]))) { log.push(e); i += 2; continue; }
      const n = /^([A-Z0-9][A-Z0-9-]{0,11})\s/.exec(l);
      if (n && (e = readRow(n[1], l, lines[i + 1]))) { log.push(e); i++; }
    }
    const byName = {};
    for (const e of log) if (!(e.name in byName)) byName[e.name] = e;

    // ---- merge ----
    const names = Object.keys(coords).sort((a, b) => coords[a].order - coords[b].order);
    if (!names.length) out.warnings.push("No COORDINATES INFORMATION section found: the route cannot be drawn.");
    if (!log.length) out.warnings.push("No nav log (WPT / FL / ELTM) found.");
    let missing = 0;
    for (const n of names) {
      const e = byName[n] || null;
      if (!e) missing++;
      out.points.push(Object.assign({ name: n, lat: coords[n].lat, lon: coords[n].lon, pseudo: PSEUDO.test(n) }, e ? {
        fl: e.fl, eltm: e.eltm, windDir: e.windDir, windKt: e.windKt, tas: e.tas, gs: e.gs, dist: e.dist, efob: e.efob, awy: e.awy,
      } : {}));
    }
    if (log.length && missing) out.warnings.push(`${missing} point(s) have coordinates but no nav-log line.`);
    if (!out.depIcao && out.points.length) out.depIcao = out.points[0].name;
    if (!out.destIcao && out.points.length) out.destIcao = out.points[out.points.length - 1].name;

    // cruise level and TAS from the log, between top of climb and top of descent
    const cruise = log.filter((e) => /^\d+$/.test(e.fl) && e.tas);
    if (cruise.length) {
      if (out.cruiseFL == null) out.cruiseFL = +cruise[0].fl;
      const levels = [...new Set(cruise.map((e) => +e.fl))];
      out.cruiseLevels = levels;
      out.cruiseTas = Math.round(cruise.reduce((s, e) => s + e.tas, 0) / cruise.length);
    }
    if (out.edto.planned === false) out.warnings.push("This OFP says EDTO: NO.");
    if (out.edto.planned !== false && !out.edto.alternates.length) out.warnings.push("No EDTO alternates (EA:) found in the OFP.");
    return out;
  }

  const CRZ = { R_NM, norm360, dist, bearing, dest, groundSpeed, fmtLatLon, makeRoute, directRoute, crossings, ringCrossings, legAt, renominate, shiftFromEtas, parseOFP };
  if (typeof module === "object" && module.exports) module.exports = CRZ;
  else root.CRZ = CRZ;
})(typeof self !== "undefined" ? self : this);
