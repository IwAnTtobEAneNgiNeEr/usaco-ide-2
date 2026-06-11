"use strict";

// Regression tests for prompt construction + AI input validation.
// - Source lint: prompt arrays must be joined with real newlines ("\n"), never
//   a literal backslash-n, which would feed the model a single garbled line
//   (this actually shipped once in EXPLAIN_CE_SYSTEM).
// - Source lint: no raw NUL bytes in source files — they make ripgrep and
//   other text tools treat the file as binary (shipped once in cache keys).
// - dryRunDebugger must reject missing/blank input before any network call.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ai = require("../src/ai");

const BACKSLASH = String.fromCharCode(92);
const NUL = String.fromCharCode(0);
// The buggy byte sequence in source: join("..") with two backslashes before n.
const BAD_JOIN = 'join("' + BACKSLASH + BACKSLASH + 'n")';

function sourceFiles() {
  const dirs = [path.join(__dirname, "..", "src"), path.join(__dirname, "..", "src", "routes")];
  const files = [];
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".js")) files.push(path.join(dir, name));
    }
  }
  return files;
}

test("no prompt array is joined with a literal backslash-n", () => {
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, "utf8");
    assert.ok(
      !src.includes(BAD_JOIN),
      `${path.basename(file)} joins with a literal backslash-n (garbles the prompt)`
    );
  }
});

test("no source file contains a raw NUL byte (keeps files greppable)", () => {
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, "utf8");
    assert.ok(!src.includes(NUL), `${path.basename(file)} contains a raw NUL byte`);
  }
});

test("dryRunDebugger rejects null input before any network call", async () => {
  await assert.rejects(
    ai.dryRunDebugger({ settings: { apiKey: "x" }, code: "int main(){}", input: null }),
    /Cần input/
  );
});

test("dryRunDebugger rejects whitespace-only input", async () => {
  await assert.rejects(
    ai.dryRunDebugger({ settings: { apiKey: "x" }, code: "int main(){}", input: "   \n" }),
    /Cần input/
  );
});
