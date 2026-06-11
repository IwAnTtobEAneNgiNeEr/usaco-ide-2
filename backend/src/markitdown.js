"use strict";

// markitdown.js — thin wrapper around the MarkItDown Python module for converting
// documents (PDF/DOCX/PPTX/HTML) to Markdown. Images go through AI vision instead.

const os = require("os");
const path = require("path");
const fsp = require("fs/promises");
const { spawn } = require("child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "markitdown_convert.py");
const PY_CANDIDATES = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];

let cachedPython = undefined; // undefined = unprobed, null = none found

function tryPython(cmd, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true, env: { ...process.env, PYTHONUTF8: "1" } });
    } catch {
      resolve({ ok: false });
      return;
    }
    let out = "";
    let err = "";
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, timeoutMs);
    child.stdout.on("data", (c) => (out += c.toString("utf8")));
    child.stderr.on("data", (c) => (err += c.toString("utf8")));
    child.on("error", () => { clearTimeout(timer); resolve({ ok: false }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ ok: code === 0, out, err }); });
  });
}

// Find a python that can import markitdown. Cached after first probe.
async function resolvePython() {
  if (cachedPython !== undefined) return cachedPython;
  for (const cmd of PY_CANDIDATES) {
    const probe = await tryPython(cmd, ["-c", "import markitdown; print('ok')"]);
    if (probe.ok && /ok/.test(probe.out)) { cachedPython = cmd; return cmd; }
  }
  cachedPython = null;
  return null;
}

async function isAvailable() {
  return (await resolvePython()) !== null;
}

// Convert a buffer (with a filename hint) to Markdown via a temp file.
async function convertBuffer(buffer, fileName = "document") {
  const py = await resolvePython();
  if (!py) {
    const e = new Error("MarkItDown (Python) is not available. Install it with: pip install markitdown[all]");
    e.code = "NO_MARKITDOWN";
    throw e;
  }
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-ide-md-"));
  const safeName = path.basename(fileName).replace(/[^\w.\-]+/g, "_") || "document";
  const filePath = path.join(dir, safeName);
  try {
    await fsp.writeFile(filePath, buffer);
    const result = await runConvert(py, filePath);
    return result;
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function runConvert(py, filePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(py, [SCRIPT, filePath], { windowsHide: true, env: { ...process.env, PYTHONUTF8: "1" } });
    let out = Buffer.alloc(0);
    let err = "";
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} reject(new Error("MarkItDown timed out.")); }, 60000);
    child.stdout.on("data", (c) => (out = Buffer.concat([out, c])));
    child.stderr.on("data", (c) => (err += c.toString("utf8")));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.toString("utf8"));
      else reject(new Error(err.trim() || `MarkItDown failed (exit ${code}).`));
    });
  });
}

module.exports = { isAvailable, convertBuffer };
