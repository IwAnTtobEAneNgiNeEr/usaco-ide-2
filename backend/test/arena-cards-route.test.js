"use strict";

// Route-level test for routes/arena-cards.js. Touches the REAL
// data/arena-cards.json (routes/arena-cards.js hardcodes that path by design,
// same as arena-rating.js) — snapshotted and restored, same technique as
// arena-match-route.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "usaco-arena-cards-"));
process.env.USACO_IDE_USER_DATA_DIR = TEST_ROOT;

const config = require("../src/config");
const { buildApp } = require("../server");

const CARDS_FILE = path.join(config.DATA_DIR, "arena-cards.json");
let snapshot;
test.before(async () => { snapshot = await fsp.readFile(CARDS_FILE, "utf8").catch(() => null); });
test.after(async () => {
  if (snapshot == null) await fsp.rm(CARDS_FILE, { force: true });
  else await fsp.writeFile(CARDS_FILE, snapshot, "utf8");
  await fsp.rm(TEST_ROOT, { recursive: true, force: true });
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
async function getJson(base, p) { const r = await fetch(`${base}${p}`); return { status: r.status, json: await r.json() }; }
async function postJson(base, p, body) {
  const r = await fetch(`${base}${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
  return { status: r.status, json: await r.json() };
}

test("GET /api/arena/cards lists all 10 species with a completion summary", async () => {
  await withServer(async (base) => {
    const r = await getJson(base, "/api/arena/cards");
    assert.equal(r.status, 200);
    assert.equal(r.json.species.length, 10);
    assert.equal(r.json.summary.total, 10);
  });
});

test("GET /api/arena/cards/:tag on an uncaught species returns a zeroed placeholder", async () => {
  await withServer(async (base) => {
    const r = await getJson(base, "/api/arena/cards/de-quy-sau");
    assert.equal(r.status, 200);
    assert.equal(r.json.card.count, 0);
  });
});

test("GET /api/arena/cards/:tag on an invalid tag 404s", async () => {
  await withServer(async (base) => {
    const r = await getJson(base, "/api/arena/cards/not-a-real-species");
    assert.equal(r.status, 404);
  });
});

test("POST /train on an uncaught species is rejected", async () => {
  await withServer(async (base) => {
    const r = await postJson(base, "/api/arena/cards/sai-kieu-doc/train", { correct: true });
    assert.equal(r.status, 400);
  });
});
