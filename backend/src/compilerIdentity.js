"use strict";
// Content-address the local toolchain, including headers/libraries, not just "g++".
// A process-local cache is invalidated by toolchain file changes and driver stat.
const fs = require("node:fs"), fsp = require("node:fs/promises"), path = require("node:path"), crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { fingerprint } = require("./judgeFingerprint");
const cache = new Map();
async function resolveCompiler(command) {
  const names = path.extname(command) || process.platform !== "win32" ? [command] : [command + ".exe", command];
  const dirs = /[\\/]/.test(command) ? [""] : String(process.env.PATH || "").split(path.delimiter);
  for (const dir of dirs) for (const name of names) {
    const candidate = path.resolve(dir, name);
    try { if ((await fsp.stat(candidate)).isFile()) return candidate; } catch { /* next explicit PATH entry */ }
  }
  return null;
}
function probe(command, args) {
  return new Promise(resolve => {
    let text = ""; const p = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => p.kill("SIGKILL"), 8000);
    for (const stream of [p.stdout, p.stderr]) stream.on("data", b => { text += b; if (text.length > 16384) p.kill("SIGKILL"); });
    p.once("error", () => { clearTimeout(timer); resolve(""); });
    p.once("close", code => { clearTimeout(timer); resolve(code === 0 ? text.trim() : ""); });
  });
}
async function fileHash(file) {
  const hash = crypto.createHash("sha256");
  for await (const block of fs.createReadStream(file)) hash.update(block);
  return hash.digest("hex");
}
async function discover(root, files) {
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error("Toolchain symlink requires an explicit resolved installation.");
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) await discover(target, files);
    else if (entry.isFile()) files.push(target);
    if (files.length > 50000) throw Error("Toolchain inventory exceeds safety bound.");
  }
}
async function getCompilerIdentity(settings = {}) {
  const command = String(settings.compilerPath || "g++"), resolved = await resolveCompiler(command);
  const environment = Object.fromEntries(["CPATH", "CPLUS_INCLUDE_PATH", "C_INCLUDE_PATH", "LIBRARY_PATH", "COMPILER_PATH", "GCC_EXEC_PREFIX", "SOURCE_DATE_EPOCH"].map(k => [k, process.env[k] || ""]));
  if (!resolved) return { command, resolved: null, available: false, digest: fingerprint({ command, missing: true, environment }) };
  const stat = await fsp.stat(resolved), key = fingerprint({ resolved, environment, driver: [stat.size, stat.mtimeMs, stat.ctimeMs] });
  const previous = cache.get(key); if (previous && !previous.dirty) return previous.promise;
  // Close old watchers when the driver identity/settings change.
  for (const [oldKey, old] of cache) if (oldKey !== key) { old.watchers.forEach(w => w.close()); cache.delete(oldKey); }
  if (previous) previous.watchers.forEach(w => w.close());
  const entry = { dirty: false, watchers: [], promise: null }; cache.set(key, entry);
  entry.promise = (async () => {
    const version = await probe(resolved, ["--version"]), target = await probe(resolved, ["-dumpmachine"]);
    const root = path.dirname(path.dirname(resolved)), files = [resolved], roots = [];
    if (path.basename(path.dirname(resolved)).toLowerCase() === "bin" && !["/usr", "/usr/local"].includes(root.replace(/\\/g, "/"))) {
      for (const name of ["include", "lib", "lib32", "libexec"]) {
        const dir = path.join(root, name); try { if ((await fsp.stat(dir)).isDirectory()) roots.push(dir); } catch { /* not shipped */ }
      }
      const bin = path.dirname(resolved); roots.push(bin);
    } else {
      // System GCC: ask the installed driver for component locations.
      for (const name of ["include", "include-fixed", "libstdc++.a", "libgcc.a", "cc1plus", "collect2", "ld", "as"]) {
        const location = await probe(resolved, ["-print-file-name=" + name]);
        if (path.isAbsolute(location)) { try { const s = await fsp.stat(location); if (s.isDirectory()) roots.push(location); else files.push(location); } catch { /* unavailable component */ } }
      }
      const gccVersion = await probe(resolved, ["-dumpversion"]);
      const headers = path.join(root, "include", "c++", gccVersion); try { if ((await fsp.stat(headers)).isDirectory()) roots.push(headers); } catch { /* versioned install */ }
    }
    try {
      for (const dir of roots) {
        const watcher = fs.watch(dir, { recursive: true }, () => { entry.dirty = true; }); watcher.unref(); entry.watchers.push(watcher);
        await discover(dir, files);
      }
      const unique = [...new Set(files)].sort(), components = new Array(unique.length); let next = 0;
      await Promise.all(Array.from({ length: 6 }, async () => { for (;;) { const i = next++; if (i >= unique.length) return; components[i] = { path: unique[i], sha256: await fileHash(unique[i]) }; } }));
      const identity = { command, resolved, available: Boolean(version), version: version.split(/\r?\n/)[0], target, environment, components: components.length, digest: fingerprint({ components, version, target, environment }) };
      return identity;
    } catch (error) {
      // Never attest current AC from a partial/unreadable toolchain inventory.
      entry.dirty = true;
      return { command, resolved, available: Boolean(version), version: version.split(/\r?\n/)[0], target, environment, unverifiable: true, reason: error.message, digest: fingerprint({ resolved, version, environment, unverifiable: true }) };
    }
  })();
  return entry.promise;
}
function invalidate() { for (const item of cache.values()) { item.dirty = true; item.watchers.forEach(w => w.close()); item.watchers = []; } }
module.exports = { getCompilerIdentity, invalidate, resolveCompiler };
