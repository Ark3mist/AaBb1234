const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("release versions match across version.json, index.html, and sw.js", () => {
  const verJson = JSON.parse(fs.readFileSync(path.join(root, "version.json"), "utf8")).version;
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

  const appVer = html.match(/const\s+APP_VERSION\s*=\s*"([^"]+)"/)?.[1];
  const swCache = sw.match(/const\s+CACHE\s*=\s*"edto-crz-([^"]+)"/)?.[1];

  assert.ok(verJson, "version.json must define version");
  assert.equal(appVer, verJson, "APP_VERSION in index.html must match version.json");
  assert.equal(swCache, verJson, "CACHE in sw.js must match version.json");
});
