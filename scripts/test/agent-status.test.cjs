"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { parseWorktrees, parseStatus, inspectWorktrees } = require("../agent-status.cjs");

test("worktree metadata retains a detached and an unavailable tree", () => {
  const trees = parseWorktrees("worktree /repo one\0HEAD abc123\0branch refs/heads/feature/a\0\0worktree /missing\0HEAD def456\0detached\0prunable missing\0\0");
  assert.equal(trees[0].branch, "feature/a");
  assert.equal(trees[1].detached, true);
  assert.equal(trees[1].prunable, true);
});

test("status handles untracked files, renames, conflicts and unusual names", () => {
  const result = parseStatus(" M src/a.js\0?? note with spaces.md\0R  new\nname.js\0old name.js\0UU conflict.js\0");
  assert.deepEqual(result.counts, { entries: 4, staged: 2, unstaged: 2, untracked: 1, conflicts: 1 });
  assert.equal(result.files[2].path, "new\nname.js");
  assert.equal(result.files[2].originalPath, "old name.js");
});

test("empty status is distinct from truncated or malformed output", () => {
  assert.equal(parseStatus("").counts.entries, 0);
  assert.throws(() => parseStatus(" M file.js"), /Incomplete/);
  assert.throws(() => parseStatus("R  new.js\0"), /Incomplete/);
  assert.throws(() => parseStatus("?M malformed.js\0"), /Unexpected/);
  assert.throws(() => parseWorktrees("worktree /repo\0HEAD abc\0"), /Incomplete/);
});

test("Git location overrides fail closed without exposing their values", () => {
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "agent-status.cjs")], {
    encoding: "utf8", env: { ...process.env, GIT_INDEX_FILE: "private-index-path" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GIT_INDEX_FILE/);
  assert.doesNotMatch(result.stderr, /private-index-path/);
});

test("unreadable worktrees are unknown, never reported clean", () => {
  const trees = [
    { path: "/missing", head: "abc", branch: "x", detached: false, bare: false, prunable: false },
    { path: "/other", head: "def", branch: null, detached: true, bare: false, prunable: true },
  ];
  const result = inspectWorktrees(trees, "/missing", () => { throw new Error("denied"); });
  assert.equal(result.incomplete, true);
  for (const tree of result.worktrees) {
    assert.equal(tree.changes, null);
    assert.equal(tree.error, "status-unavailable");
    assert.equal("worktreePath" in tree, false);
  }
});

test("details are opt-in and contain paths, not file contents", () => {
  const tree = { path: "/repo", head: "abc", branch: "topic", detached: false, bare: false, prunable: false };
  const summary = inspectWorktrees([tree], "/repo", () => "?? notes.md\0");
  assert.equal("files" in summary.worktrees[0], false);
  const detailed = inspectWorktrees([tree], "/repo", () => "?? notes.md\0", true);
  assert.deepEqual(detailed.worktrees[0].files, [{ status: "??", path: "notes.md" }]);
});
