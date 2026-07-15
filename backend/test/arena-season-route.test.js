"use strict";

// Route-level test for GET /api/arena/season (S11). This route WRITES to the
// real data/arena-season.json (lazy rollover/update) — snapshotted and
// restored, same technique as arena-match-route.test.js. It only READS
// data/arena-rating.json, so no restore is needed for that file from here.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const fsp = require("node:fs/promises");

const config = require("../src/config");
const { buildApp } = require("../server");

const SEASON_FILE = path.join(config.DATA_DIR, "arena-season.json");
let snapshot;
test.before(async () => { snapshot = await fsp.readFile(SEASON_FILE, "utf8").catch(() => null); });
test.after(async () => {
  if (snapshot == null) await fsp.rm(SEASON_FILE, { force: true });
  else await fsp.writeFile(SEASON_FILE, snapshot, "utf8");
});

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", async () => {
      const port = server.address().port;
      try { resolve(await run(`http://127.0.0.1:${port}`)); }
      catch (e) { reject(e); }
      finally { server.close(); }
    });
  });
}

test("GET /api/arena/season returns the documented shape and is idempotent within the same call window", async () => {
  await withServer(async (base) => {
    const r1 = await fetch(`${base}/api/arena/season`);
    const j1 = await r1.json();
    assert.equal(r1.status, 200);
    assert.ok(j1.current.seasonId);
    assert.ok(Array.isArray(j1.history));

    const r2 = await fetch(`${base}/api/arena/season`);
    const j2 = await r2.json();
    assert.equal(j2.current.seasonId, j1.current.seasonId, "calling again moments later must not roll over again");
  });
});
