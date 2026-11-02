"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { resolveConfig, browserOptions } = require("./visual-e2e-config.cjs");

const ROOT = path.resolve("/synthetic/source");
const OUTPUT = path.resolve("/synthetic/output");
const PROFILE = path.resolve("/synthetic/profile");
const CHROME = path.resolve("/synthetic/chrome");
const PUPPETEER = path.resolve("/synthetic/puppeteer-core");
const env = {
  USACO_E2E_BASE_URL: "http://127.0.0.1:5099",
  USACO_E2E_OUTPUT_DIR: OUTPUT,
  USACO_E2E_PROFILE_DIR: PROFILE,
  USACO_E2E_CHROME_PATH: CHROME,
  USACO_E2E_PUPPETEER_PATH: PUPPETEER,
};

function fakeFs(overrides = {}) {
  return {
    constants: { W_OK: 2 },
    realpathSync: (value) => overrides.realpaths?.[value] || value,
    statSync: (value) => ({
      isDirectory: () => [ROOT, OUTPUT, PROFILE, PUPPETEER].includes(value),
      isFile: () => value === CHROME,
    }),
    readdirSync: (value) => overrides.nonempty === value ? ["existing"] : [],
    accessSync: () => {},
  };
}

test("missing environment fails before loading a browser dependency", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "xuong-visual-e2e.cjs")], {
    encoding: "utf8", env: { PATH: process.env.PATH },
  });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /USACO_E2E_BASE_URL/);
  assert.doesNotMatch(result.stderr, /C:\/Users\/Admin/);
});

test("explicit owned directories and local endpoint build sandboxed browser options", () => {
  const config = resolveConfig(env, ROOT, fakeFs());
  const options = browserOptions(config);
  assert.equal(config.baseUrl, "http://127.0.0.1:5099/");
  assert.equal(options.userDataDir, PROFILE);
  assert.equal(options.executablePath, CHROME);
  assert.ok(!options.args.includes("--no-sandbox"));
});

test("non-loopback endpoints and credentials are rejected", () => {
  for (const base of ["http://example.com:5099", "http://user:pass@127.0.0.1:5099", "https://127.0.0.1:5099", "http://127.0.0.1:0", "http://127.0.0.1:5099/?token=x"]) {
    assert.throws(() => resolveConfig({ ...env, USACO_E2E_BASE_URL: base }, ROOT, fakeFs()), /loopback/);
  }
});

test("output and profile must be distinct empty directories outside source", () => {
  assert.throws(() => resolveConfig({ ...env, USACO_E2E_OUTPUT_DIR: ROOT }, ROOT, fakeFs()), /outside/);
  assert.throws(() => resolveConfig({ ...env, USACO_E2E_PROFILE_DIR: OUTPUT }, ROOT, fakeFs()), /distinct/);
  assert.throws(() => resolveConfig(env, ROOT, fakeFs({ nonempty: PROFILE })), /empty/);
  assert.throws(() => resolveConfig(env, ROOT, fakeFs({ realpaths: { [OUTPUT]: ROOT } })), /outside/);
});

test("a missing or relative dependency path fails explicitly", () => {
  assert.throws(() => resolveConfig({ ...env, USACO_E2E_PUPPETEER_PATH: "node_modules/puppeteer-core" }, ROOT, fakeFs()), /absolute/);
  assert.throws(() => resolveConfig({ ...env, USACO_E2E_PUPPETEER_PATH: "" }, ROOT, fakeFs()), /USACO_E2E_PUPPETEER_PATH/);
});
