"use strict";

// Route-level smoke test for GET /api/arena/roadmap — proves the wiring
// (problemStore -> computeSkillMap -> ratingStore -> roadmap.js) doesn't
// crash and returns the documented shape. Read-only route — no real-file
// snapshot/restore needed (roadmap.js itself never writes anything).

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { buildApp } = require("../server");

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

test("GET /api/arena/roadmap returns the documented shape", async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/arena/roadmap`);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.ok, true);
    assert.ok(Number.isFinite(json.progressPct));
    assert.ok(Array.isArray(json.clusters));
    assert.ok(json.confidence && json.confidence.level);
  });
});
