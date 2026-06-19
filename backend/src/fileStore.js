"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { PROBLEMS_DIR } = require("./config");

// ---------------------------------------------------------------------------
// Keyed async lock. Read-modify-write sequences over the same JSON file (meta,
// tests/meta, history) lose the first writer's update when they interleave —
// serialize them per key (problem id, contest problem path, …). Reads stay
// lock-free. The map self-cleans once a key's chain drains.
// ---------------------------------------------------------------------------

const locks = new Map(); // key -> tail of the op chain (settled-safe promise)

function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  const run = prev.then(fn, fn); // run even if the previous op failed
  const tail = run.then(() => {}, () => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return run;
}

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
  return dirPath;
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath, fallback = "") {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    throw error;
  }
}

// Write-temp-then-rename so a crash mid-write can never leave a truncated
// main.cpp or half a meta.json on disk (readJson would silently "heal" such
// corruption to defaults, losing history/verdicts). rename() replaces the
// destination atomically on POSIX and Windows; if the destination is briefly
// locked (Windows AV / indexer), retry once, then fall back to a direct write
// rather than failing the save.
async function writeFileAtomic(filePath, data) {
  await ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fsp.writeFile(tmpPath, data, "utf8");
    try {
      await fsp.rename(tmpPath, filePath);
    } catch {
      await new Promise((r) => setTimeout(r, 15));
      await fsp.rename(tmpPath, filePath);
    }
  } catch {
    await fsp.rm(tmpPath, { force: true }).catch(() => {});
    await fsp.writeFile(filePath, data, "utf8");
  }
  return filePath;
}

async function writeText(filePath, content) {
  return writeFileAtomic(filePath, content == null ? "" : String(content));
}

async function readJson(filePath, fallback = null) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") return fallback;
    if (error instanceof SyntaxError) return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  return writeFileAtomic(filePath, JSON.stringify(value, null, 2));
}

async function listSubdirs(dirPath) {
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function listFiles(dirPath) {
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function removeDir(dirPath) {
  await fsp.rm(dirPath, { recursive: true, force: true });
}

async function removeFile(filePath) {
  await fsp.rm(filePath, { force: true });
}

// Turn an arbitrary title into a safe, unique folder slug inside PROBLEMS_DIR.
function slugify(value) {
  const base = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "problem";
}

// Reject ids that try to escape the problems directory.
function isSafeId(id) {
  if (typeof id !== "string" || id.length === 0 || id.length > 100) return false;
  if (id.includes("/") || id.includes("\\") || id.includes("..")) return false;
  return /^[a-z0-9][a-z0-9-]*$/.test(id);
}

function problemDir(id) {
  return path.join(PROBLEMS_DIR, id);
}

async function uniqueId(baseSlug) {
  let candidate = baseSlug;
  let counter = 2;
  while (await pathExists(problemDir(candidate))) {
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
  return candidate;
}

module.exports = {
  withLock,
  ensureDir,
  ensureDirSync,
  pathExists,
  readText,
  writeText,
  readJson,
  writeJson,
  listSubdirs,
  listFiles,
  removeDir,
  removeFile,
  slugify,
  isSafeId,
  problemDir,
  uniqueId
};
