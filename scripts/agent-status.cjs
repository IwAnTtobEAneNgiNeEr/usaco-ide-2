#!/usr/bin/env node
"use strict";

// Report local Git state; never explicitly stage, commit, fetch, push, or print file contents.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const GIT_LOCATION_OVERRIDES = [
  "GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES",
];
const CONFLICTS = new Set(["DD", "AU", "UD", "UA", "DU", "AA", "UU"]);

function parseWorktrees(output) {
  if (!output.endsWith("\0\0")) throw new Error("Incomplete worktree listing");
  const blocks = output.slice(0, -2).split("\0\0");
  if (!blocks.length || !blocks[0]) throw new Error("No worktrees reported");
  return blocks.map((block) => {
    const result = { path: null, head: null, branch: null, detached: false, bare: false, prunable: false };
    for (const field of block.split("\0")) {
      const separator = field.indexOf(" ");
      const key = separator < 0 ? field : field.slice(0, separator);
      const value = separator < 0 ? "" : field.slice(separator + 1);
      if (key === "worktree") result.path = value;
      else if (key === "HEAD") result.head = value;
      else if (key === "branch") result.branch = value.replace(/^refs\/heads\//, "");
      else if (key === "detached") result.detached = true;
      else if (key === "bare") result.bare = true;
      else if (key === "prunable") result.prunable = true;
    }
    if (!result.path || (!result.bare && !result.head)) throw new Error("Invalid worktree listing");
    return result;
  });
}

function parseStatus(output) {
  if (output && !output.endsWith("\0")) throw new Error("Incomplete Git status");
  const fields = output ? output.slice(0, -1).split("\0") : [];
  const counts = { entries: 0, staged: 0, unstaged: 0, untracked: 0, conflicts: 0 };
  const files = [];
  for (let i = 0; i < fields.length; i++) {
    const record = fields[i];
    if (record.length < 4 || record[2] !== " ") throw new Error("Invalid Git status entry");
    const code = record.slice(0, 2);
    const name = record.slice(3);
    if (!name || !/^[ MADRCUT?!]{2}$/.test(code) || code === "!!" || code === "  " || (code.includes("?") && code !== "??")) {
      throw new Error("Unexpected Git status entry");
    }
    const entry = { status: code, path: name };
    if (code !== "??" && (code.includes("R") || code.includes("C"))) {
      if (++i >= fields.length || !fields[i]) throw new Error("Incomplete rename or copy entry");
      entry.originalPath = fields[i];
    }
    counts.entries++;
    if (code === "??") counts.untracked++;
    else {
      if (code[0] !== " ") counts.staged++;
      if (code[1] !== " ") counts.unstaged++;
      if (CONFLICTS.has(code)) counts.conflicts++;
    }
    files.push(entry);
  }
  return { counts, files };
}

function inspectWorktrees(worktrees, currentRoot, readStatus, details = false) {
  let incomplete = false;
  const canonical = (value) => {
    try { return fs.realpathSync(value); } catch { return path.resolve(value); }
  };
  const current = canonical(currentRoot);
  const rows = worktrees.map((tree) => {
    const row = {
      current: canonical(tree.path) === current,
      branch: tree.branch,
      head: tree.head,
      detached: tree.detached,
      bare: tree.bare,
      prunable: tree.prunable,
      changes: null,
    };
    if (details) row.worktreePath = tree.path;
    if (tree.bare) return row;
    try {
      if (tree.prunable) throw new Error("Worktree is prunable");
      const status = parseStatus(readStatus(tree.path));
      row.changes = status.counts;
      if (details) row.files = status.files;
    } catch {
      // Do not publish raw git stderr or treat an unreadable tree as clean.
      row.error = "status-unavailable";
      incomplete = true;
    }
    return row;
  });
  return { worktrees: rows, incomplete };
}

function git(cwd, args) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" };
  // Trace settings may write files even during a metadata-only query.
  for (const key of Object.keys(env)) if (key.startsWith("GIT_TRACE")) delete env[key];
  const result = spawnSync("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "-C", cwd, ...args], {
    encoding: "utf8", env, timeout: 15000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error("Git metadata query failed");
  return result.stdout;
}

function run(args, cwd = process.cwd()) {
  if (args.includes("--help")) {
    console.log("Usage: node scripts/agent-status.cjs [--json] [--details]\nRead local worktree and stash metadata. --details includes paths; review before sharing.");
    return 0;
  }
  if (args.some((arg) => arg !== "--json" && arg !== "--details")) {
    console.error("Unknown option. Use --help.");
    return 2;
  }
  const override = GIT_LOCATION_OVERRIDES.find((key) => process.env[key]);
  if (override) {
    console.error(`Cannot safely infer worktrees while ${override} is set.`);
    return 1;
  }
  try {
    const root = git(cwd, ["rev-parse", "--show-toplevel"]).replace(/\r?\n$/, "");
    const trees = parseWorktrees(git(root, ["worktree", "list", "--porcelain", "-z"]));
    const details = args.includes("--details");
    const result = inspectWorktrees(trees, root, (treePath) =>
      git(treePath, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]), details);
    let stashes = null;
    try { stashes = git(root, ["stash", "list", "--format=%gd"]).split("\n").filter(Boolean).length; }
    catch { result.incomplete = true; }
    const report = {
      scope: "Local Git status only; ignored files and live remote state are not checked.",
      incomplete: result.incomplete,
      worktrees: result.worktrees,
      stashes,
    };
    if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(report.scope);
      for (const tree of report.worktrees) {
        const label = tree.branch || (tree.bare ? "bare" : "detached");
        const state = tree.changes
          ? `${tree.changes.entries} changed entries (${tree.changes.staged} staged, ${tree.changes.unstaged} unstaged, ${tree.changes.untracked} untracked, ${tree.changes.conflicts} conflicts)`
          : tree.bare ? "no working tree" : "UNKNOWN: status unavailable";
        console.log(`${tree.current ? "*" : "-"} ${label} ${tree.head ? tree.head.slice(0, 12) : "no HEAD"}: ${state}`);
        if (details) {
          console.log(`  path: ${JSON.stringify(tree.worktreePath)}`);
          for (const file of tree.files || []) console.log(`  ${file.status} ${JSON.stringify(file.path)}${file.originalPath ? ` <- ${JSON.stringify(file.originalPath)}` : ""}`);
        }
      }
      console.log(`Stashes: ${stashes === null ? "UNKNOWN" : stashes}. ${report.incomplete ? "Some status is unavailable." : "Snapshot only; recheck before acting."}`);
    }
    return report.incomplete ? 1 : 0;
  } catch {
    console.error("Cannot inspect Git metadata; confirm the current directory and Git access.");
    return 1;
  }
}

if (require.main === module) process.exitCode = run(process.argv.slice(2));
module.exports = { parseWorktrees, parseStatus, inspectWorktrees, run };
