# EDTO CRZ

Offline web app for B737 engine-inop EDTO calculations. Bottom tabs: **CRZ | EDTO | APP**.

One `index.html` (all CSS and app code inline) plus `perf.js` (chart data and calculations) and
`crz.js` (OFP parser, route geometry, renomination maths). No build step. Hosted from the repo root on GitHub Pages.

## CRZ tab
- **Import OFP** (PDF or pasted text, read on the device only): departure, destination, cruise level, speed,
  route, every waypoint, wind table, EDTO alternates and the OFP's EDTO points.
- **Map:** route, waypoints and a 60 minute ring (420 NM, or the OFP's EEP distance) around each EDTO alternate.
- **Renominate EDTO alternates:** type two airports; the rings, EEP/EXP, EDP and ETP are redrawn, and the FMC
  steps from the MAS "EDTO Basics & Procedures" handout are listed with the numbers to type
  (halfway fix, 90 degree line, EDP, then the into-wind shift to the ETP).
- Bundled data: `airports.js` (airportsdata, MIT), `world50.js` (Natural Earth), `wmm.js` (WMM2025, valid to 2030),
  `vendor/pdfjs` (Apache 2.0).

## EDTO tab
- **Altitude capability:** ZFW, fuel on board, current UTC, ETA ETP, burn rate, ISA, anti-ice →
  time to ETP, fuel to burn, fuel remaining, gross weight at ETP, altitude capability (LRC and 310 KIAS).
- **Critical fuel:** distance, weight at critical point, wind, ISA, icing → engine-inop critical fuel.
- Data: B737-800, D6-27370-8H6-MAS OI.4.6 (1 Oct 2024). **737-8 has no data yet.**
- Linear interpolation only, never extrapolates. Altitudes round down to 100 ft, critical fuel up to 100 kg.

## Run locally
```bash
python3 -m http.server 8000
```

## Test
```bash
npm test
```

## Release
Bump the version in three places, all to the same value: `version.json`, `APP_VERSION` in `index.html`, `CACHE` in `sw.js`.
