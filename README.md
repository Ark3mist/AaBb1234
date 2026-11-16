# EDTO CRZ

Offline web app for B737 engine-inop EDTO calculations. Bottom tabs: **CRZ | EDTO | REF | OMA**.

One `index.html` (all CSS and app code inline) plus `perf.js` (chart data and calculations) and
`crz.js` (OFP parser, WGS84 route geometry, renomination maths). No build step. Hosted from the repo root on GitHub Pages.

## CRZ tab
- **Import OFP** (PDF or pasted text, read on the device only): departure, destination, cruise level, speed,
  route, every waypoint, wind table, EDTO alternates and the OFP's EDTO points.
- **Map:** optional wind barbs from the OFP wind table at a level you choose; route, waypoints and a 60 minute ring (420 NM, or the OFP's EEP distance) around each EDTO alternate, and faint rings for the other en-route adequate airports (ERA).
- **Renominate EDTO alternates:** type two airports; the rings, EEP/EXP, EDP and ETP are redrawn, and the FMC
  steps from the MAS "EDTO Basics & Procedures" handout are listed with the numbers to type
  (halfway fix, 90 degree line, EDP, then the into-wind shift to the ETP).
- Bundled data: `airports.js` (airportsdata, MIT), `world50.js` (Natural Earth), `wmm.js` (WMM2025, valid to 2030),
  `vendor/pdfjs` (Apache 2.0).

## SIGMET layer (CRZ map)
**Show SIGMET** draws the current international SIGMETs from aviationweather.gov on the map, lists those near the
route (tap one for the full text, which also highlights it), and flags those that cross the route or cover an
alternate. **Update SIGMET** reloads the feed; a prompt appears when there is no data or it is more than 30 minutes old.
Only the area is drawn: for a SIGMET given as a line, read the text.

aviationweather.gov sends no CORS header, so a web page cannot read it directly (checked 16 Nov 2026). The app reads a
relay instead. The feed address defaults to `raw.githubusercontent.com/Ark3mist/EDTO-CRZ-APP/sigmet-data/sigmet.json`
and can be changed under Settings > SIGMET feed. It accepts either the raw `isigmet?format=json` array or
`{ "generatedAt": <ms>, "records": [...] }`. The age shown is the age of the relay's copy, not of the last tap.
**Until a relay is publishing to that address, the layer shows "not published yet".**

## REF tab
Short reference: EDTO terms, diversion strategies, the renomination steps and both critical fuel checks,
summarised from the MAS "EDTO Basics & Procedures" handout.

## OMA tab
OM-A (Rev 10.3.0, 10 Mar 2026) EDTO policy in flight order: airports and minima, period of suitability,
fuel, crew preparation, before the EEP, and inside the EDTO segment. Paragraph numbers are shown.

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
