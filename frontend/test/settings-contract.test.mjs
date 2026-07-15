import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = fs.readFileSync(path.join(root, "src", "settings.js"), "utf8");

test("AI settings expose the supported OpenAI-compatible configuration", () => {
  assert.match(settings, /btn-save-ai/);
  assert.match(settings, /API key/);
  assert.match(settings, /Base URL/);
  assert.match(settings, /Model/);
  assert.match(settings, /if \(key\.trim\(\) !== ""\) patch\.apiKey = key/);
  assert.doesNotMatch(settings, /btn-save-cloudflare/);
});
