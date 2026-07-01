import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settings = fs.readFileSync(path.join(root, "src", "settings.js"), "utf8");

test("illustration settings expose dedicated Cloudflare credentials", () => {
  assert.match(settings, /btn-save-cloudflare/);
  assert.match(settings, /Cloudflare Account ID/);
  assert.match(settings, /saveKeyOnly: true/);
  assert.match(settings, /patch\.illustrationProvider = "cloudflare"/);
  assert.match(settings, /Save illustration settings/);
});
