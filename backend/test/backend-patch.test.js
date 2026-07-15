"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "usaco-backend-patch-"));
process.env.USACO_IDE_USER_DATA_DIR = TEST_ROOT;
const { sanitizeStatement } = require("../src/statementSanitizer");
const illustration = require("../src/illustration");
const problemStore = require("../src/problemStore");
const settingsStore = require("../src/settingsStore");
const ai = require("../src/ai");
const verifyTests = require("../src/verifyTests");
const { buildApp } = require("../server");
const { ILLUSTRATION_CACHE_FILE } = require("../src/config");

test.after(async () => { await fsp.rm(TEST_ROOT, { recursive: true, force: true }); });

function withServer(run) {
  const server = http.createServer(buildApp());
  return new Promise((resolve, reject) => server.listen(0, "127.0.0.1", async () => {
    try { resolve(await run(`http://127.0.0.1:${server.address().port}`)); }
    catch (error) { reject(error); }
    finally { server.close(); }
  }));
}

test("statement sanitizer removes chrome and preserves example sections", () => {
  const result = sanitizeStatement("Copy\nTrang 2\n\n\nVÃ­ dá»¥\nInput\n1 2\nOutput\n3");
  assert.equal(result.text.includes("Copy"), false);
  assert.equal(result.text.includes("Trang 2"), false);
  assert.match(result.text, /VÃ­ dá»¥/);
  assert.deepEqual(result.removedNoiseLines.slice(0, 2), ["Copy", "Trang 2"]);
});

test("illustration selection rejects arithmetic and accepts graph/grid when configured", () => {
  const settings = { illustrationEnabled: true, illustrationProvider: "pollinations", pollinationsApiKey: "secret" };
  assert.equal(illustration.assess({ statementText: "Add two integers and print the sum." }, settings).shouldGenerate, false);
  const graph = illustration.assess({ topic: "graph", statementText: "Find a path through a grid maze." }, settings);
  assert.equal(graph.shouldGenerate, true);
  assert.equal(graph.provider, "pollinations");
  const clock = illustration.assess({
    title: "Dong ho",
    topic: "simulation",
    statementText: "A digital clock displays time in HH:MM:SS and rolls over every 60 seconds, 60 minutes, and 24 hours."
  }, { ...settings, illustrationMinDifficulty: 2000 });
  assert.equal(clock.shouldGenerate, true);
  assert.equal(clock.visualType, "clock");
});

test("illustration prompt is bounded, scrubbed, and URL encoded", () => {
  const settings = { illustrationEnabled: true, illustrationProvider: "pollinations", pollinationsApiKey: "" };
  const result = illustration.assess({ topic: "maze", statementText: `Contact alice@example.com. ${"grid maze ".repeat(1000)}` }, settings);
  assert.equal(result.shouldGenerate, true);
  assert.ok(result.prompt.length <= 1000);
  assert.equal(result.prompt.includes("alice@example.com"), false);
  const url = illustration.pollinationsUrl(result.prompt, "safe seed & value");
  assert.match(url, /^https:\/\/gen\.pollinations\.ai\/image\//);
  assert.ok(url.includes("%20"));
  assert.match(url, /[?&]seed=\d+(?:&|$)/);
  assert.equal(illustration.pollinationsUrl("same", "stable-seed"), illustration.pollinationsUrl("same", "stable-seed"));
});

test("illustration endpoint returns selective decisions without exposing its key", async () => {
  const oldSettings = settingsStore.getAiSettings;
  let previousCache = null;
  try { previousCache = await fsp.readFile(ILLUSTRATION_CACHE_FILE); } catch { /* no prior cache */ }
  await fsp.rm(ILLUSTRATION_CACHE_FILE, { force: true });
  settingsStore.getAiSettings = async () => ({ illustrationEnabled: true, illustrationProvider: "pollinations", pollinationsApiKey: "secret" });
  try {
    await withServer(async (base) => {
      const suggest = (statementText, topic) => fetch(`${base}/api/ai/illustration/suggest`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ statementText, topic })
      }).then((response) => response.json());
      assert.equal((await suggest("Add two integers.", "arithmetic")).shouldGenerate, false);
      const visual = await suggest("Find a path through a maze grid.", "graph");
      assert.equal(visual.shouldGenerate, true);
      assert.equal(visual.provider, "pollinations");
      assert.equal(visual.cached, false);
      assert.match(visual.imageUrl, /^\/api\/ai\/illustration\/image\/[a-f0-9]{64}$/);
      assert.equal(JSON.stringify(visual).includes("secret"), false);
      const reused = await suggest("Find a path through a maze grid.", "graph");
      assert.equal(reused.cached, true);
      assert.equal(reused.imageUrl, visual.imageUrl);
      const changed = await suggest("Find a different path through a larger maze grid.", "graph");
      assert.equal(changed.cached, false);
      assert.notEqual(changed.imageUrl, visual.imageUrl);
    });
  } finally {
    settingsStore.getAiSettings = oldSettings;
    if (previousCache) await fsp.writeFile(ILLUSTRATION_CACHE_FILE, previousCache);
    else await fsp.rm(ILLUSTRATION_CACHE_FILE, { force: true });
  }
});

test("disabled illustration setting returns stable false response", async () => {
  const oldSettings = settingsStore.getAiSettings;
  settingsStore.getAiSettings = async () => ({ illustrationEnabled: false, illustrationProvider: "none" });
  try {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/ai/illustration/suggest`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "maze", statementText: "A grid maze" })
      });
      assert.deepEqual(await response.json(), { shouldGenerate: false, reason: "Illustration generation is disabled.", warnings: [] });
    });
  } finally { settingsStore.getAiSettings = oldSettings; }
});

test("manual illustration requests can still generate when auto illustration is disabled", async () => {
  const oldSettings = settingsStore.getAiSettings;
  let previousCache = null;
  try { previousCache = await fsp.readFile(ILLUSTRATION_CACHE_FILE); } catch { /* no prior cache */ }
  await fsp.rm(ILLUSTRATION_CACHE_FILE, { force: true });
  settingsStore.getAiSettings = async () => ({ illustrationEnabled: false, illustrationProvider: "none", pollinationsApiKey: "" });
  try {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/ai/illustration/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: "clock", statementText: "A digital clock displays time in HH:MM:SS and rolls over every second.", manual: true })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.shouldGenerate, true);
      assert.equal(body.provider, "pollinations");
      assert.match(body.imageUrl, /^https:\/\/gen\.pollinations\.ai\/image\//);
    });
  } finally {
    settingsStore.getAiSettings = oldSettings;
    if (previousCache) await fsp.writeFile(ILLUSTRATION_CACHE_FILE, previousCache);
    else await fsp.rm(ILLUSTRATION_CACHE_FILE, { force: true });
  }
});

test("manual illustration bypasses the automation usefulness filter", async () => {
  const oldSettings = settingsStore.getAiSettings;
  settingsStore.getAiSettings = async () => ({ illustrationEnabled: false, illustrationProvider: "none", pollinationsApiKey: "" });
  try {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/ai/illustration/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manual: true, statementText: "Add two integers and print their sum. This deliberately simple task still needs an image when the user asks for one." })
      });
      const body = await response.json();
      assert.equal(body.shouldGenerate, true);
      assert.equal(body.visualType, "simulation");
      assert.match(body.imageUrl, /^https:\/\/gen\.pollinations\.ai\/image\//);
    });
  } finally {
    settingsStore.getAiSettings = oldSettings;
  }
});

test("Pollinations 402 is exposed as an actionable balance error", async () => {
  const oldSettings = settingsStore.getAiSettings;
  const oldFetch = global.fetch;
  const identity = illustration.cacheKey({ statementText: "billing test" }, "pollinations");
  let previousCache = null;
  try { previousCache = await fsp.readFile(ILLUSTRATION_CACHE_FILE); } catch { /* no prior cache */ }
  await fsp.writeFile(ILLUSTRATION_CACHE_FILE, JSON.stringify({ entries: {
    [identity.key]: { prompt: "billing test", statementHash: identity.statementHash, providerUrl: "https://example.invalid" }
  } }));
  settingsStore.getAiSettings = async () => ({ pollinationsApiKey: "secret" });
  global.fetch = async (url, options) => {
    if (String(url).startsWith("https://gen.pollinations.ai/")) {
      return new Response(JSON.stringify({ error: { message: "Insufficient balance." } }), { status: 402, headers: { "content-type": "application/json" } });
    }
    return oldFetch(url, options);
  };
  try {
    await withServer(async (base) => {
      const response = await oldFetch(`${base}/api/ai/illustration/image/${identity.key}`);
      const body = await response.json();
      assert.equal(response.status, 402);
      assert.equal(body.code, "POLLINATIONS_INSUFFICIENT_BALANCE");
      assert.match(body.error, /Số dư Pollinations/);
    });
  } finally {
    settingsStore.getAiSettings = oldSettings;
    global.fetch = oldFetch;
    if (previousCache) await fsp.writeFile(ILLUSTRATION_CACHE_FILE, previousCache);
    else await fsp.rm(ILLUSTRATION_CACHE_FILE, { force: true });
  }
});

test("generate-tests auto-adds, skips duplicate input, and persists provenance", async () => {
  const problem = await problemStore.createProblem({ title: "zz-ai-auto-add", statement: "Add one to n." });
  const oldSettings = settingsStore.getAiSettings;
  const oldGenerate = ai.generateTests;
  const oldVerify = verifyTests.verifyWithReference;
  settingsStore.getAiSettings = async () => ({ apiKey: "test", illustrationEnabled: false });
  ai.generateTests = async () => ({ tests: [
    { name: "single-element", category: "single-element", input: "1\n", expected: "2\n", expectedKnown: true, warning: "", reason: "legal" },
    { name: "duplicate", category: "small-random", input: "1\r\n", expected: "2\n", expectedKnown: true, warning: "", reason: "same input" }
  ], notes: [] });
  verifyTests.verifyWithReference = async () => ({ referenceUsed: false, referenceTrusted: false, verifiedCount: 0 });
  try {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/ai/generate-tests`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ problemId: problem.id })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.added, 1);
      assert.equal(body.skipped, 1);
      assert.equal(body.tests[0].provenance, "generated-unverified");
    });
    const reloaded = await problemStore.listTests(problem.id);
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].provenance, "generated-unverified");
    assert.equal(reloaded[0].category, "single-element");
  } finally {
    settingsStore.getAiSettings = oldSettings;
    ai.generateTests = oldGenerate;
    verifyTests.verifyWithReference = oldVerify;
    await problemStore.deleteProblem(problem.id);
  }
});
