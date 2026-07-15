import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../src/features/", import.meta.url);
const read = (name) => readFile(new URL(name, root), "utf8");

test("AC clears the contextual WA Coach action from the result bar", async () => {
  const source = await readFile(new URL("../src/runner.js", import.meta.url), "utf8");
  assert.match(source, /btn\.hidden = !show/);
  assert.match(source, /btn\.textContent = ""/);
  assert.match(source, /delete btn\.dataset\.kind/);
});

test("all code-bearing mini topics delegate to the canonical activity workspace", async () => {
  const [corefill, rush, contests] = await Promise.all([
    read("corefill.js"),
    read("rush.js"),
    read("contests.js")
  ]);
  for (const [name, source] of Object.entries({ corefill, rush, contests })) {
    assert.match(source, /activityWorkspace\.(open|replace|openLoading)/, `${name} must open the canonical workspace`);
    assert.doesNotMatch(source, /new\s+CM\.EditorView|id=["'](?:cw|rush|corefill)-code/, `${name} must not own a primary editor`);
  }
});

test("canonical activity workspace owns multi-editor CodeMirror, shared shortcuts and realtime progress", async () => {
  const source = await read("activity-workspace.js");
  assert.match(source, /supportsMultipleEditors:\s*true/);
  assert.match(source, /editorHandles\s*=\s*new Map/);
  assert.match(source, /Ctrl\+Shift\+Enter/);
  assert.match(source, /function setProgress/);
});

test("Stress Lab uses three canonical C++ editors and the streaming v2 API", async () => {
  const source = await read("lab.js");
  for (const id of ["solution", "brute", "generator"]) {
    assert.match(source, new RegExp(`id:\\s*["]${id}["]`));
  }
  assert.match(source, /api\.stressStream/);
  assert.match(source, /Replay same test/);
  assert.match(source, /Run as custom test/);
  assert.match(source, /mode:\s*"performance"|data-mode="performance"/);
  assert.doesNotMatch(source, /<textarea[^>]+(?:lab-gen|lab-brute)/);
});
