"use strict";
// Preloaded via `node --require` by the npm test script (execArgv propagates to
// the test-runner child processes, so this runs before ANY module — including
// src/config.js — is loaded in every test process).
//
// WHY: tests that call problemStore.createProblem / write data/arena-*.json
// used to hit the REAL user workspace. A crashed or interrupted run left
// garbage problems (zz-arena-route-test, zz-hint-tracking, zz-gauntlet-reject-
// test…) sitting in the user's actual problem list. Redirecting the whole
// user-data root to a throwaway directory makes that class of leak impossible.
//
// Respect an explicit override so someone can still point tests at a fixture
// dir on purpose.
if (!process.env.USACO_IDE_USER_DATA_DIR) {
  const os = require("os");
  const path = require("path");
  const fs = require("fs");
  const dir = path.join(os.tmpdir(), "usaco-ide-2-test", `run-${process.pid}`);
  // Pre-create the subtree the app normally lazy-creates: tests that write
  // fixtures straight to data/*.json (e.g. arena-rating.json) assume the
  // directory already exists on a real install.
  fs.mkdirSync(path.join(dir, "data"), { recursive: true });
  fs.mkdirSync(path.join(dir, "workspace", "problems"), { recursive: true });
  fs.mkdirSync(path.join(dir, "workspace", "contests"), { recursive: true });
  process.env.USACO_IDE_USER_DATA_DIR = dir;
}
