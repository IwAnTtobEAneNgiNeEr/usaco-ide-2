"use strict";

const os = require("os");
const path = require("path");
const fsp = require("fs/promises");
const { spawn } = require("child_process");
const crypto = require("crypto");
const { LIMITS, WORKSPACE_DIR } = require("./config");
const { getCompilerIdentity } = require("./compilerIdentity");

// Persistent compile caches live under workspace/.cache (kept out of the throwaway
// build workdirs so they survive across runs). Two layers:
//   • pch/  — one precompiled <bits/stdc++.h> per (compiler, std, opt).
//   • bin/  — one compiled binary per (compiler, std, opt, source); reused as-is
//             when nothing changed, so a re-Run / re-Judge skips g++ entirely.
const CACHE_DIR = path.join(WORKSPACE_DIR, ".cache");
const BIN_CACHE_DIR = path.join(CACHE_DIR, "bin");
const PCH_CACHE_DIR = path.join(CACHE_DIR, "pch");
const BIN_CACHE_MAX = 120;

function sha1(s) { return crypto.createHash("sha1").update(String(s)).digest("hex"); }

// ---------------------------------------------------------------------------
// Output normalization + comparison
// ---------------------------------------------------------------------------

function normalizeLoose(output) {
  return String(output == null ? "" : output)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n+$/g, "");
}

function normalizeStrict(output) {
  // Strict still folds CRLF -> LF (editors differ) but keeps everything else.
  return String(output == null ? "" : output).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function buildDiff(expected, actual) {
  const expectedLines = normalizeLoose(expected).split("\n");
  const actualLines = normalizeLoose(actual).split("\n");
  const max = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < max; i += 1) {
    if ((expectedLines[i] || "") !== (actualLines[i] || "")) {
      return {
        line: i + 1,
        expected: expectedLines[i] == null ? "(no line)" : expectedLines[i],
        actual: actualLines[i] == null ? "(no line)" : actualLines[i],
        expectedLineCount: expectedLines.length,
        actualLineCount: actualLines.length
      };
    }
  }
  return null;
}

// Split output into whitespace-separated tokens (order preserved, blanks dropped).
function tokenize(output) {
  return String(output == null ? "" : output).trim().split(/\s+/).filter(Boolean);
}

// Two numeric tokens are "equal" within an absolute OR relative epsilon.
function numbersClose(a, b, eps) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const d = Math.abs(x - y);
  return d <= eps || d <= eps * Math.max(1, Math.abs(y));
}

// Token-wise comparison (whitespace-insensitive). When `epsilon` is set, numeric
// tokens are compared within that tolerance; non-numeric tokens must match exactly.
function tokensMatch(expected, actual, epsilon) {
  const e = tokenize(expected);
  const a = tokenize(actual);
  if (e.length !== a.length) return false;
  for (let i = 0; i < e.length; i += 1) {
    if (e[i] === a[i]) continue;
    if (epsilon != null && numbersClose(e[i], a[i], epsilon)) continue;
    return false;
  }
  return true;
}

// Returns { ok, diff }. mode:
//   "loose"  — ignore trailing whitespace / final newline (default)
//   "strict" — exact match (CRLF still folded to LF)
//   "token"  — whitespace-insensitive token equality (extra spaces/newlines OK)
//   "float"  — token equality with numeric tokens compared within `opts.epsilon`
// The reported diff is always the loose line-based diff (advisory; only shown on WA).
function compareOutput(expected, actual, mode = "loose", opts = {}) {
  let ok;
  if (mode === "strict") {
    ok = normalizeStrict(expected) === normalizeStrict(actual);
  } else if (mode === "token") {
    ok = tokensMatch(expected, actual, null);
  } else if (mode === "float" || mode === "epsilon") {
    const eps = Number(opts.epsilon) > 0 ? Number(opts.epsilon) : 1e-6;
    ok = tokensMatch(expected, actual, eps);
  } else {
    ok = normalizeLoose(expected) === normalizeLoose(actual);
  }
  return { ok, diff: ok ? null : buildDiff(expected, actual) };
}

// ---------------------------------------------------------------------------
// Isolated build directory (keeps the workspace clean)
// ---------------------------------------------------------------------------

async function createWorkdir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "usaco-ide-build-"));
}

async function cleanupWorkdir(workdir) {
  if (!workdir) return;
  try {
    await fsp.rm(workdir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

function binaryName(workdir) {
  return path.join(workdir, process.platform === "win32" ? "main.exe" : "main");
}

// ---------------------------------------------------------------------------
// Low-level process runner with timeout + output caps
// ---------------------------------------------------------------------------

function runProcess(command, args, options) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const maxStdout = options.maxStdout || LIMITS.maxOutputBytes;
    const maxStderr = options.maxStderr || LIMITS.maxStderrBytes;
    let child;
    let timedOut = false;
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let stdoutCapped = false;
    let stderrCapped = false;
    let fileCapped = false;
    const text = (buffer, max) => new TextDecoder("utf-8").decode(Buffer.from(buffer.toString("utf8")).subarray(0, max), { stream: true });

    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      resolve({
        ok: false,
        code: null,
        notFound: error && error.code === "ENOENT",
        stdout: "",
        stderr: error.message,
        timeMs: Date.now() - startedAt,
        timedOut: false,
        outputCapped: false
      });
      return;
    }

    child.stdout.on("data", (chunk) => {
      stdout = Buffer.concat([stdout, chunk]);
      if (stdout.length > maxStdout) {
        stdoutCapped = true;
        stdout = stdout.subarray(0, maxStdout);
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = Buffer.concat([stderr, chunk]);
      if (stderr.length > maxStderr) {
        stderrCapped = true;
        stderr = stderr.subarray(0, maxStderr);
        child.kill("SIGKILL");
      }
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    // Poll file output without loading it. The final bounded read also handles
    // fast programs that exit between polls.
    const fileTimer = options.outputFile ? setInterval(async () => {
      try {
        if ((await fsp.lstat(options.outputFile)).size > maxStdout) {
          fileCapped = true;
          child.kill("SIGKILL");
        }
      } catch { /* output may not exist yet */ }
    }, 50) : null;
    child.on("error", (error) => {
      clearTimeout(timer);
      clearInterval(fileTimer);
      resolve({
        ok: false,
        code: null,
        notFound: error && error.code === "ENOENT",
        stdout: text(stdout, maxStdout),
        stderr: text(stderr, maxStderr) || error.message,
        timeMs: Date.now() - startedAt,
        timedOut,
        outputCapped: stdoutCapped || stderrCapped || fileCapped,
        outputChannel: stdoutCapped ? "stdout" : stderrCapped ? "stderr" : fileCapped ? "file" : null
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      clearInterval(fileTimer);
      resolve({
        ok: code === 0 && !timedOut && !stdoutCapped && !stderrCapped && !fileCapped,
        code,
        notFound: false,
        stdout: text(stdout, maxStdout),
        stderr: text(stderr, maxStderr),
        timeMs: Date.now() - startedAt,
        timedOut,
        outputCapped: stdoutCapped || stderrCapped || fileCapped,
        outputChannel: stdoutCapped ? "stdout" : stderrCapped ? "stderr" : fileCapped ? "file" : null
      });
    });

    try {
      child.stdin.end(String(options.input || ""));
    } catch {
      /* stdin may already be closed if the process died instantly */
    }
  });
}

// ---------------------------------------------------------------------------
// Compiler check + compile + run
// ---------------------------------------------------------------------------

async function checkCompiler(settings) {
  const compiler = (settings && settings.compilerPath) || "g++";
  const result = await runProcess(compiler, ["--version"], {
    cwd: os.tmpdir(),
    timeoutMs: 8000,
    input: ""
  });
  if (result.notFound) {
    return { available: false, version: "", compiler };
  }
  const version = (result.stdout || result.stderr).split(/\r?\n/)[0] || "";
  return { available: result.code === 0, version, compiler };
}

// ---------------------------------------------------------------------------
// Precompiled header for <bits/stdc++.h>. Building the PCH once turns the
// per-compile cost of parsing the whole standard library into a single header
// load. Best-effort by design: any failure returns null and we compile normally.
// In-flight builds are de-duped so two concurrent compiles don't both build it.
// ---------------------------------------------------------------------------
const pchBuilds = new Map(); // hash -> Promise<string|null>

async function ensurePch({ compiler, std, opt, toolchain }) {
  const hash = sha1([compiler, std, opt, toolchain].join("|"));
  if (pchBuilds.has(hash)) return pchBuilds.get(hash);

  const build = (async () => {
    const dir = path.join(PCH_CACHE_DIR, hash);
    const headerPath = path.join(dir, "stdc_pch.h");
    const gchPath = headerPath + ".gch";
    try { await fsp.access(gchPath); return headerPath; } catch { /* needs build */ }
    try {
      await fsp.mkdir(dir, { recursive: true });
      await fsp.writeFile(headerPath, "#include <bits/stdc++.h>\n", "utf8");
      // Build to a unique temp, then atomically rename into place. Two builders
      // (e.g. a second server instance) never see a half-written .gch.
      const tmpName = `stdc_pch.h.gch.${process.pid}.${Date.now()}.tmp`;
      const tmpPath = path.join(dir, tmpName);
      const args = [`-std=${std}`];
      if (opt) args.push(opt);
      args.push("-x", "c++-header", "stdc_pch.h", "-o", tmpName);
      const r = await runProcess(compiler, args, {
        cwd: dir,
        input: "",
        timeoutMs: Math.max(LIMITS.compileTimeoutMs, 60000), // header build is heavier than a normal compile
        maxStdout: 20000,
        maxStderr: LIMITS.maxStderrBytes
      });
      if (!r.ok) { await fsp.rm(tmpPath, { force: true }).catch(() => {}); return null; }
      await fsp.rename(tmpPath, gchPath);
      return headerPath;
    } catch {
      return null;
    }
  })();

  pchBuilds.set(hash, build);
  const result = await build;
  if (!result) pchBuilds.delete(hash); // let a later compile retry the build
  return result;
}

// Keep the binary cache bounded — drop the oldest binaries once over the cap.
async function pruneBinCache() {
  try {
    const names = await fsp.readdir(BIN_CACHE_DIR);
    if (names.length <= BIN_CACHE_MAX) return;
    const stats = await Promise.all(names.map(async (n) => {
      const fp = path.join(BIN_CACHE_DIR, n);
      try { return { fp, mtime: (await fsp.stat(fp)).mtimeMs }; } catch { return null; }
    }));
    const valid = stats.filter(Boolean).sort((a, b) => a.mtime - b.mtime);
    const remove = valid.slice(0, valid.length - BIN_CACHE_MAX);
    await Promise.all(remove.map((x) => fsp.rm(x.fp, { force: true }).catch(() => {})));
  } catch { /* best effort */ }
}

// Compiles code into an isolated workdir. Returns binaryPath on success.
// Fast paths: an identical (compiler, std, opt, source) reuses a cached binary
// (no g++ at all); otherwise a precompiled <bits/stdc++.h> shortcuts most of the
// parse cost. Both are transparent — output is byte-identical to a plain compile.
async function compileSource({ code, settings, workdir }) {
  const startedAt = Date.now();
  const compiler = (settings && settings.compilerPath) || "g++";
  const std = (settings && settings.cppStandard) || "c++17";
  const opt = (settings && settings.optimization) || "-O2";
  const sourceStr = code == null ? "" : String(code);
  const toolchain = settings?._toolchainFingerprint || (await getCompilerIdentity(settings)).digest;
  const sourcePath = path.join(workdir, "main.cpp");
  const binaryPath = binaryName(workdir);
  const ext = process.platform === "win32" ? ".exe" : "";

  await fsp.writeFile(sourcePath, sourceStr, "utf8");

  // ---- Binary cache: identical inputs → copy the cached exe, skip g++. -------
  const binKey = sha1([compiler, std, opt, toolchain, sourceStr].join("\u0000"));
  const cachedBin = path.join(BIN_CACHE_DIR, binKey + ext);
  try {
    await fsp.access(cachedBin);
    await fsp.copyFile(cachedBin, binaryPath);
    return { ok: true, compilerMissing: false, stderr: "", timeMs: Date.now() - startedAt, binaryPath, cached: true };
  } catch { /* cache miss — compile below */ }

  // ---- PCH (best effort) — ONLY when the source already includes bits/stdc++.h,
  // so force-including the precompiled copy never changes which names are visible.
  const usesStdAll = /#\s*include\s*<bits\/(?:stdc|extc)\+\+\.h>/.test(sourceStr);
  let pchHeader = null;
  if (usesStdAll) {
    try { pchHeader = await ensurePch({ compiler, std, opt, toolchain }); } catch { pchHeader = null; }
  }

  const args = [`-std=${std}`];
  if (opt) args.push(opt);
  if (pchHeader) args.push("-include", pchHeader);
  args.push("-pipe", "main.cpp", "-o", binaryPath);

  const result = await runProcess(compiler, args, {
    cwd: workdir,
    input: "",
    timeoutMs: LIMITS.compileTimeoutMs,
    maxStdout: 20000,
    maxStderr: LIMITS.maxStderrBytes
  });

  // ---- Populate the binary cache on success (best effort, off the hot path). --
  // Copy to a unique temp, then atomic rename, so a concurrent compile/read never
  // observes a partially-written exe.
  if (result.ok) {
    const tmpBin = `${cachedBin}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fsp.mkdir(BIN_CACHE_DIR, { recursive: true });
      await fsp.copyFile(binaryPath, tmpBin);
      await fsp.rename(tmpBin, cachedBin);
      pruneBinCache(); // fire-and-forget; prune has its own error handling
    } catch {
      await fsp.rm(tmpBin, { force: true }).catch(() => {});
    }
  }

  return {
    ok: result.ok,
    compilerMissing: result.notFound,
    stderr: result.stderr,
    timeMs: Date.now() - startedAt,
    binaryPath: result.ok ? binaryPath : null,
    command: [compiler, ...args], cached: false,
    stdout: result.stdout, exitCode: result.code, timedOut: result.timedOut,
    errorCode: result.outputCapped ? "OUTPUT_LIMIT" : result.timedOut ? "COMPILE_TIMEOUT" : result.notFound ? "COMPILER_MISSING" : result.ok ? null : "COMPILER_EXIT"
  };
}

function normalizeProjectFilePath(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")
      || !/^[A-Za-z0-9_.\-/]+$/.test(normalized)) {
    const error = new Error("Invalid C++ project file path.");
    error.status = 400;
    throw error;
  }
  return normalized;
}

// Compile a real multi-file C++ project in one isolated directory. Headers and
// nested paths are materialized exactly once; every .cpp translation unit is
// passed to g++, so include boundaries and linker failures remain observable.
async function compileFiles({ files, settings, workdir }) {
  const startedAt = Date.now();
  const compiler = (settings && settings.compilerPath) || "g++";
  const std = (settings && settings.cppStandard) || "c++17";
  const opt = (settings && settings.optimization) || "-O2";
  const entries = (Array.isArray(files) ? files : []).map((file) => ({
    path: normalizeProjectFilePath(file && file.path),
    content: String(file && file.content != null ? file.content : ""),
  }));
  if (!entries.length || entries.length > 100) {
    throw Object.assign(new Error("A C++ project must contain 1–100 files."), { status: 400 });
  }
  if (new Set(entries.map((file) => file.path.toLowerCase())).size !== entries.length) {
    throw Object.assign(new Error("C++ project file paths must be unique."), { status: 400 });
  }
  const sources = entries.filter((file) => /\.cpp$/i.test(file.path));
  if (!sources.length) throw Object.assign(new Error("A C++ project needs at least one .cpp file."), { status: 400 });

  await Promise.all(entries.map(async (file) => {
    const destination = path.join(workdir, ...file.path.split("/"));
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.writeFile(destination, file.content, "utf8");
  }));

  const binaryPath = binaryName(workdir);
  const ext = process.platform === "win32" ? ".exe" : "";
  const signature = entries.slice().sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => `${file.path}\u0000${file.content}`).join("\u0001");
  const binKey = sha1(["multi-file-v1", compiler, std, opt, signature].join("\u0000"));
  const cachedBin = path.join(BIN_CACHE_DIR, binKey + ext);
  try {
    await fsp.access(cachedBin);
    await fsp.copyFile(cachedBin, binaryPath);
    return { ok: true, compilerMissing: false, stderr: "", timeMs: Date.now() - startedAt, binaryPath, cached: true, fileCount: entries.length };
  } catch { /* cache miss */ }

  const args = [`-std=${std}`];
  if (opt) args.push(opt);
  args.push("-pipe", "-I.", ...sources.map((file) => file.path), "-o", binaryPath);
  const result = await runProcess(compiler, args, {
    cwd: workdir,
    input: "",
    timeoutMs: LIMITS.compileTimeoutMs,
    maxStdout: 20000,
    maxStderr: LIMITS.maxStderrBytes,
  });
  if (result.ok) {
    const tmpBin = `${cachedBin}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fsp.mkdir(BIN_CACHE_DIR, { recursive: true });
      await fsp.copyFile(binaryPath, tmpBin);
      await fsp.rename(tmpBin, cachedBin);
      pruneBinCache();
    } catch {
      await fsp.rm(tmpBin, { force: true }).catch(() => {});
    }
  }
  return {
    ok: result.ok,
    compilerMissing: result.notFound,
    stderr: result.stderr,
    timeMs: Date.now() - startedAt,
    binaryPath: result.ok ? binaryPath : null,
    cached: false,
    fileCount: entries.length,
  };
}

async function compileProject({ files, settings }) {
  const workdir = await createWorkdir();
  try {
    const compile = await compileFiles({ files, settings, workdir });
    return { ...compile, workdir };
  } catch (error) {
    await cleanupWorkdir(workdir);
    throw error;
  }
}

// Runs a compiled binary against one input string. Returns a per-run record.
// fileMode: { name } enables USACO-style file IO — input is written to <name>.in
// in the binary's cwd, and <name>.out is read back as the program's output
// (so freopen("<name>.in"/"<name>.out") works).
async function runBinary({ binaryPath, input, timeMs, fileMode, args }) {
  const limit = Math.min(Math.max(Number(timeMs) || 2000, 100), LIMITS.maxTimeMs);
  const cwd = path.dirname(binaryPath);
  let outFilePath = null;

  if (fileMode && fileMode.name) {
    const base = String(fileMode.name).replace(/[^\w.\-]/g, "");
    const inPath = path.join(cwd, `${base}.in`);
    outFilePath = path.join(cwd, `${base}.out`);
    await fsp.writeFile(inPath, input == null ? "" : String(input), "utf8");
    await fsp.rm(outFilePath, { force: true }).catch(() => {});
  }

  const result = await runProcess(binaryPath, Array.isArray(args) ? args : [], {
    cwd,
    input: fileMode && fileMode.name ? "" : input,
    timeoutMs: limit,
    maxStdout: LIMITS.maxOutputBytes,
    maxStderr: LIMITS.maxStderrBytes,
    outputFile: outFilePath
  });

  if (result.outputCapped) {
    return {
      status: "RE",
      stdout: result.stdout,
      stderr: result.stderr || "Output limit exceeded.",
      runtimeMs: result.timeMs,
      errorCode: "OUTPUT_LIMIT", outputChannel: result.outputChannel, outputLimitBytes: result.outputChannel === "stderr" ? LIMITS.maxStderrBytes : LIMITS.maxOutputBytes
    };
  }
  if (result.timedOut) {
    return { status: "TLE", stdout: result.stdout, stderr: result.stderr, runtimeMs: result.timeMs };
  }
  if (result.code !== 0) {
    return {
      status: "RE",
      stdout: result.stdout,
      stderr: result.stderr || `Process exited with code ${result.code}.`,
      runtimeMs: result.timeMs
    };
  }
  // In file mode the answer is whatever the program wrote to <name>.out.
  let stdout = result.stdout;
  if (outFilePath) {
    try {
      const stat = await fsp.lstat(outFilePath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Output must be a regular file.");
      if (stat.size > LIMITS.maxOutputBytes) return { status: "RE", stdout: "", stderr: "File output limit exceeded.", runtimeMs: result.timeMs, errorCode: "OUTPUT_LIMIT", outputChannel: "file", outputLimitBytes: LIMITS.maxOutputBytes };
      const file = await fsp.open(outFilePath, "r");
      try {
        const buffer = Buffer.alloc(LIMITS.maxOutputBytes + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > LIMITS.maxOutputBytes) return { status: "RE", stdout: "", stderr: "File output limit exceeded.", runtimeMs: result.timeMs, errorCode: "OUTPUT_LIMIT", outputChannel: "file", outputLimitBytes: LIMITS.maxOutputBytes };
        stdout = new TextDecoder("utf-8").decode(Buffer.from(buffer.subarray(0, bytesRead).toString("utf8")).subarray(0, LIMITS.maxOutputBytes), { stream: true });
      } finally { await file.close(); }
    }
    catch {
      return {
        status: "RE",
        stdout: "",
        stderr: result.stderr || `Program did not create the output file (${path.basename(outFilePath)}).`,
        runtimeMs: result.timeMs
      };
    }
  }
  return { status: "OK", stdout, stderr: result.stderr, runtimeMs: result.timeMs };
}

// Compile a single source into its OWN fresh workdir. Caller owns cleanup of
// the returned `workdir`. Used by the Stress Tester / Complexity Profiler which
// juggle several binaries (generator + brute + main) at once.
async function compileStandalone({ code, settings }) {
  const workdir = await createWorkdir();
  try {
    const compile = await compileSource({ code, settings, workdir });
    return { ...compile, workdir };
  } catch (error) {
    // Callers cannot clean a directory they never received. Ensure an
    // exceptional compile (filesystem failure, cache copy failure, etc.) does
    // not leak its freshly-created workdir before propagating the error.
    await cleanupWorkdir(workdir);
    throw error;
  }
}

// Overall verdict for a list of per-test statuses (worst wins).
function overallVerdict(statuses) {
  const list = Array.isArray(statuses) ? statuses : [];
  if (list.length === 0) return "AC";
  if (list.every((s) => s === "AC")) return "AC";
  for (const priority of ["CE", "TLE", "RE", "WA"]) {
    if (list.some((s) => s === priority)) return priority;
  }
  return "WA";
}

module.exports = {
  compareOutput,
  normalizeLoose,
  normalizeStrict,
  createWorkdir,
  cleanupWorkdir,
  checkCompiler,
  compileSource,
  compileFiles,
  compileProject,
  compileStandalone,
  runBinary,
  overallVerdict
};
