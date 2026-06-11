"use strict";

// ocr.js — LOCAL image OCR via Tesseract (pytesseract). No AI / network is used
// for reading images. Documents (PDF/DOCX) keep going through markitdown.js.

const os = require("os");
const path = require("path");
const fsp = require("fs/promises");
const { spawn } = require("child_process");

const SCRIPT = path.join(__dirname, "..", "scripts", "ocr_image.py");
const PY_CANDIDATES = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];

let cachedPython = undefined; // undefined = unprobed, null = none usable

// Human-readable reasons keyed by the python script's exit codes.
const REASONS = {
  3: "thiếu thư viện Pillow (chạy: pip install pillow).",
  4: "thiếu pytesseract (chạy: pip install pytesseract).",
  5: "chưa cài Tesseract OCR engine trên máy (Windows: winget install tesseract-ocr.UB-Mannheim.TesseractOCR).",
  2: "thiếu đường dẫn ảnh."
};

function runPython(cmd, args, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true, env: { ...process.env, PYTHONUTF8: "1" } });
    } catch {
      return resolve({ ok: false });
    }
    let out = Buffer.alloc(0);
    let err = "";
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, timeoutMs);
    child.stdout.on("data", (c) => (out = Buffer.concat([out, c])));
    child.stderr.on("data", (c) => (err += c.toString("utf8")));
    child.on("error", () => { clearTimeout(timer); resolve({ ok: false }); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ ok: code === 0, code, out: out.toString("utf8"), err }); });
  });
}

// Find a python that can import pytesseract + PIL. Cached after first probe.
async function resolvePython() {
  if (cachedPython !== undefined) return cachedPython;
  for (const cmd of PY_CANDIDATES) {
    const probe = await runPython(cmd, ["-c", "import pytesseract, PIL; print('ok')"]);
    if (probe.ok && /ok/.test(probe.out)) { cachedPython = cmd; return cmd; }
  }
  cachedPython = null;
  return null;
}

async function isAvailable() {
  return (await resolvePython()) !== null;
}

// OCR an image buffer -> plain text. Throws with a clear, specific reason.
async function imageToText(buffer, fileName = "image.png") {
  const py = await resolvePython();
  if (!py) {
    const e = new Error("OCR cục bộ chưa sẵn sàng — cần: pip install pytesseract pillow và cài Tesseract OCR engine.");
    e.code = "NO_LOCAL_OCR";
    throw e;
  }
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-ocr-"));
  const safe = path.basename(fileName).replace(/[^\w.\-]+/g, "_") || "image.png";
  const file = path.join(dir, safe);
  try {
    await fsp.writeFile(file, buffer);
    const r = await runPython(py, [SCRIPT, file], 60000);
    if (!r.ok) {
      const reason = REASONS[r.code] || (r.err ? r.err.trim().split("\n").pop() : `tiến trình OCR lỗi (exit ${r.code}).`);
      const e = new Error(reason);
      e.code = r.code === 5 ? "NO_TESSERACT" : "OCR_FAILED";
      throw e;
    }
    return (r.out || "").trim();
  } finally {
    fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { isAvailable, imageToText };
