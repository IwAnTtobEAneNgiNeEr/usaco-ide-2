"use strict";

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { PROBLEMS_DIR } = require("./config");

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

async function writeText(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, content == null ? "" : String(content), "utf8");
  return filePath;
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
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  return filePath;
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
