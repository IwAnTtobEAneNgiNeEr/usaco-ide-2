"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REQUIRED = [
  "USACO_E2E_BASE_URL", "USACO_E2E_OUTPUT_DIR", "USACO_E2E_PROFILE_DIR",
  "USACO_E2E_CHROME_PATH", "USACO_E2E_PUPPETEER_PATH",
];

function within(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveConfig(env, sourceRoot, io = fs) {
  const missing = REQUIRED.filter((key) => !env[key]);
  if (missing.length) throw new Error(`Set ${missing.join(", ")} before browser verification.`);

  let base;
  try { base = new URL(env.USACO_E2E_BASE_URL); } catch { throw new Error("Use an explicit HTTP loopback URL and port."); }
  if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || !base.port || Number(base.port) === 0 ||
      base.username || base.password || base.search || base.hash || base.pathname !== "/") {
    throw new Error("Use an explicit HTTP loopback URL and port without credentials, path or query.");
  }

  for (const key of REQUIRED.slice(1)) {
    if (!path.isAbsolute(env[key])) throw new Error(`${key} must be an absolute path.`);
  }

  let source, output, profile, chrome, puppeteer;
  try {
    source = io.realpathSync(sourceRoot);
    output = io.realpathSync(env.USACO_E2E_OUTPUT_DIR);
    profile = io.realpathSync(env.USACO_E2E_PROFILE_DIR);
    chrome = io.realpathSync(env.USACO_E2E_CHROME_PATH);
    puppeteer = io.realpathSync(env.USACO_E2E_PUPPETEER_PATH);
    if (!io.statSync(output).isDirectory() || !io.statSync(profile).isDirectory() ||
        !io.statSync(chrome).isFile() || !io.statSync(puppeteer).isDirectory()) throw new Error("wrong type");
  } catch {
    throw new Error("Browser, dependency and owned directories must already exist with the expected type.");
  }

  if (within(source, output) || within(output, source) || within(source, profile) || within(profile, source)) {
    throw new Error("Output and profile must be outside the source tree.");
  }
  if (within(output, profile) || within(profile, output)) throw new Error("Output and profile must be distinct directories.");
  try {
    if (io.readdirSync(output).length || io.readdirSync(profile).length) throw new Error("nonempty");
    io.accessSync(output, io.constants.W_OK);
    io.accessSync(profile, io.constants.W_OK);
  } catch {
    throw new Error("Output and profile must be empty, owned writable directories.");
  }
  return { baseUrl: base.href, output, profile, chrome, puppeteer };
}

function browserOptions(config) {
  return {
    executablePath: config.chrome,
    userDataDir: config.profile,
    headless: "new",
    args: ["--disable-gpu", "--force-color-profile=srgb"],
    defaultViewport: { width: 1600, height: 940, deviceScaleFactor: 1 },
  };
}

module.exports = { resolveConfig, browserOptions };
