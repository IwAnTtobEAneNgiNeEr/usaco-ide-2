"use strict";

// memSampler.js — best-effort PEAK memory measurement for a judged child
// process, used to implement the MLE verdict. Design goals:
//   • cross-platform, but NEVER fabricate: if the platform/tooling can't sample,
//     `supported` is false and the caller omits MLE entirely.
//   • low overhead: ONE long-lived helper process (Windows / macOS) or cheap
//     /proc reads (Linux) — no per-sample process spawns.
//
// startSampler(pid) -> { stop(): Promise<{ peakBytes, supported }> }
//   peakBytes  — highest resident/working-set size observed, in bytes (0 if none seen yet).
//   supported  — whether sampling is feasible here. When false, the caller must
//                NOT report MLE (we have no trustworthy number).
//
// Note on "missed" samples: the helper starts a beat after the child, so a
// program that spikes and exits in well under ~200ms may finish before any
// sample lands. In that case peakBytes stays 0 and we simply do not flag MLE
// (lenient — we never false-positive). Peak metrics (Windows PeakWorkingSet64,
// Linux VmHWM) are monotonic, so a single late sample still captures the true peak.

const fs = require("fs");
const { spawn } = require("child_process");

const POLL_MS = 30;

function unsupported() {
  return { stop: async () => ({ peakBytes: 0, supported: false }) };
}

// ---------------------------------------------------------------------------
// Linux — read VmHWM (peak RSS) straight from /proc. No child process.
// ---------------------------------------------------------------------------
function linuxSampler(pid) {
  let peak = 0;
  let everRead = false;
  const read = () => {
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
      const m = status.match(/VmHWM:\s*(\d+)\s*kB/);
      if (m) { peak = Math.max(peak, Number(m[1]) * 1024); everRead = true; }
    } catch { /* process gone / unreadable */ }
  };
  read(); // /proc exists on linux even if this pid already vanished -> everRead stays false only then
  const timer = setInterval(read, POLL_MS);
  return {
    stop: async () => {
      read();
      clearInterval(timer);
      // Platform is supported as long as /proc was readable at least once.
      return { peakBytes: peak, supported: everRead };
    }
  };
}

// ---------------------------------------------------------------------------
// Windows — one PowerShell monitor that prints PeakWorkingSet64 (bytes, peak)
// until the target exits. We keep the max of everything it emits.
// ---------------------------------------------------------------------------
function windowsSampler(pid) {
  let peak = 0;
  let everRead = false;
  let spawnFailed = false;
  let buf = "";
  const script =
    `$ErrorActionPreference='Stop';` +
    `while($true){try{$p=Get-Process -Id ${pid}}catch{break};` +
    `[Console]::Out.WriteLine($p.PeakWorkingSet64);` +
    `Start-Sleep -Milliseconds ${POLL_MS}}`;

  let child;
  try {
    child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch {
    return unsupported();
  }

  const absorb = (line) => {
    const n = Number(String(line).trim());
    if (Number.isFinite(n) && n > 0) { peak = Math.max(peak, n); everRead = true; }
  };
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      absorb(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
    }
  });
  child.on("error", () => { spawnFailed = true; });

  return {
    stop: async () => {
      if (buf.trim()) absorb(buf);
      try { child.kill(); } catch { /* already gone */ }
      // Supported when PowerShell actually ran. If it never emitted a line
      // because the target was too short-lived, peak stays 0 (no MLE) but the
      // platform is still "supported" so we don't mislabel.
      return { peakBytes: peak, supported: !spawnFailed };
    }
  };
}

// ---------------------------------------------------------------------------
// macOS — one shell loop polling `ps -o rss=` (KB) while the target is alive.
// ---------------------------------------------------------------------------
function darwinSampler(pid) {
  let peak = 0;
  let everRead = false;
  let spawnFailed = false;
  let buf = "";
  const script = `while kill -0 ${pid} 2>/dev/null; do ps -o rss= -p ${pid}; sleep 0.03; done`;

  let child;
  try {
    child = spawn("/bin/sh", ["-c", script], { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return unsupported();
  }

  const absorb = (line) => {
    const n = Number(String(line).trim());
    if (Number.isFinite(n) && n > 0) { peak = Math.max(peak, n * 1024); everRead = true; }
  };
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) { absorb(buf.slice(0, nl)); buf = buf.slice(nl + 1); }
  });
  child.on("error", () => { spawnFailed = true; });

  return {
    stop: async () => {
      if (buf.trim()) absorb(buf);
      try { child.kill(); } catch { /* already gone */ }
      return { peakBytes: peak, supported: !spawnFailed && everRead };
    }
  };
}

function startSampler(pid) {
  if (!pid) return unsupported();
  switch (process.platform) {
    case "linux": return linuxSampler(pid);
    case "win32": return windowsSampler(pid);
    case "darwin": return darwinSampler(pid);
    default: return unsupported();
  }
}

module.exports = { startSampler };
