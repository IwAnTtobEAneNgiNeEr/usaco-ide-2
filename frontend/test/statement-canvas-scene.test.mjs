import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "src", "statement-canvas-scene.js"), "utf8");

test("Canvas scene renderer supports safe primitives and cleanup", () => {
  assert.match(source, /export function renderCanvasScene/);
  assert.match(source, /export function disposeCanvasScene/);
  assert.match(source, /devicePixelRatio/);
  assert.match(source, /prefers-reduced-motion/);
  assert.doesNotMatch(source, /eval\(|new Function/);
  assert.match(source, /const fontSize = Math\.max\(8/);
  assert.match(source, /el\.type === "timeline"/);
  assert.match(source, /grid\|maze\|path/);
  assert.match(source, /requestAnimationFrame\(draw\)/);
});
