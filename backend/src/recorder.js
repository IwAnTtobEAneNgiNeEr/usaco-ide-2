"use strict";

// recorder.js — Event Recorder (README-LOOPS.md §3.2, task B1).
//
// Append-only JSONL timeline of what a student did on one problem: opened the
// statement, ran code, got a verdict, switched tabs, went idle, ran an
// autopsy... This is the data spine for Game Review (Loop 2) and, later,
// Season Engine reporting. It must never slow down or break the thing it is
// recording, so every entry point swallows its own errors and resolves
// {ok:false} instead of throwing.
//
// Deliberately does NOT store full source code — only hashes/sizes — so a
// runaway caller can't turn this into a second, unbounded copy of the code
// (enforced loosely via MAX_EVENT_CHARS, since this layer doesn't know each
// event type's exact shape).

const path = require("path");
const fsp = require("fs/promises");
const { withLock, ensureDir, problemDir } = require("./fileStore");

const LOG_FILENAME = "session-log.jsonl";
const MAX_BYTES = 2 * 1024 * 1024; // rotate past 2MB
const MAX_EVENT_CHARS = 4000; // one event line — hashes/sizes, not full code

const EVENT_TYPES = new Set([
  "open-statement",
  "edit-snapshot",
  "run",
  "verdict",
  "tab",
  "timer",
  "autopsy",
  "idle",
  // "moment" was documented in README-AUTOPILOT.md §3 as a Recorder event but
  // never added here — every moment-diagnose call silently failed to log
  // (recordEvent swallows the "unknown event type" error). Fixed alongside the
  // Đấu Trường (Arena) build, which adds its own "gauntlet" event for the same reason.
  "moment",
  "gauntlet",
]);

/**
 * Pure: turn (type, data, now) into one JSONL line, or throw a descriptive
 * error. No I/O here — this is what actually gets unit-tested exhaustively.
 */
function buildEventLine(type, data, now = Date.now()) {
  if (!EVENT_TYPES.has(type)) {
    throw new Error(`recorder: unknown event type "${type}"`);
  }
  const payload = data == null ? {} : data;
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("recorder: event data must be a plain object");
  }
  const line = `${JSON.stringify({ t: now, type, data: payload })}\n`;
  if (line.length > MAX_EVENT_CHARS) {
    throw new Error(
      `recorder: event line exceeds ${MAX_EVENT_CHARS} chars — record hashes/sizes, not full code`
    );
  }
  return line;
}

/**
 * If the live log is already at/over maxBytes, rename it out of the way so
 * the next append starts a fresh file. Returns true iff it rotated.
 */
async function rotateIfNeeded(filePath, maxBytes) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
  if (stat.size < maxBytes) return false;
  await fsp.rename(filePath, `${filePath}.${Date.now()}.old`);
  return true;
}

/**
 * Append one event under `dir` (a problem's workspace directory). Appends to
 * the same file are serialized per-dir via fileStore's keyed lock so rotation
 * and the write it guards can't interleave across concurrent callers.
 */
async function appendEvent(dir, type, data, opts = {}) {
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  const now = opts.now ?? Date.now();
  const line = buildEventLine(type, data, now); // throws before touching disk
  const filePath = path.join(dir, LOG_FILENAME);
  return withLock(`session-log:${dir}`, async () => {
    await ensureDir(dir);
    await rotateIfNeeded(filePath, maxBytes);
    await fsp.appendFile(filePath, line, "utf8");
    return filePath;
  });
}

/** Fire-and-forget entry point: never rejects, always resolves {ok, error?}. */
async function recordEvent(dir, type, data, opts) {
  try {
    await appendEvent(dir, type, data, opts);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/** Convenience wrapper for the common case of "this problem's workspace". */
async function recordProblemEvent(problemId, type, data, opts) {
  return recordEvent(problemDir(problemId), type, data, opts);
}

/**
 * Read the whole timeline back as parsed events, oldest first. Tolerant of a
 * partial final line (process could have been killed mid-append).
 */
async function readEvents(dir) {
  const filePath = path.join(dir, LOG_FILENAME);
  let raw;
  try {
    raw = await fsp.readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  const events = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // crash-truncated last line — skip rather than fail the whole read
    }
  }
  return events;
}

async function readProblemEvents(problemId) {
  return readEvents(problemDir(problemId));
}

module.exports = {
  EVENT_TYPES,
  LOG_FILENAME,
  MAX_BYTES,
  MAX_EVENT_CHARS,
  buildEventLine,
  rotateIfNeeded,
  appendEvent,
  recordEvent,
  recordProblemEvent,
  readEvents,
  readProblemEvents,
};
