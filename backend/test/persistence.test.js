"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const fileStore = require("../src/fileStore");

test("corrupt JSON is surfaced instead of silently replaced with defaults", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "usaco-corrupt-"));
  const file = path.join(dir, "meta.json");
  try {
    await fsp.writeFile(file, "{not-json", "utf8");
    await assert.rejects(
      () => fileStore.readJson(file, { silently: "lost" }),
      (error) => error.code === "CORRUPT_JSON" && error.message.includes(file)
    );
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test("desktop data root override moves mutable workspace and settings only", () => {
  const root = path.join(os.tmpdir(), "usaco-user-data-test");
  const script = [
    "const c=require('./src/config');",
    "process.stdout.write(JSON.stringify({root:c.USER_DATA_ROOT,workspace:c.WORKSPACE_DIR,data:c.DATA_DIR,frontend:c.FRONTEND_DIR}))"
  ].join("");
  const output = execFileSync(process.execPath, ["-e", script], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, USACO_IDE_USER_DATA_DIR: root },
    encoding: "utf8"
  });
  const config = JSON.parse(output);
  assert.equal(config.root, path.resolve(root));
  assert.equal(config.workspace, path.join(path.resolve(root), "workspace"));
  assert.equal(config.data, path.join(path.resolve(root), "data"));
  assert.equal(config.frontend.includes(path.resolve(root)), false);
});
