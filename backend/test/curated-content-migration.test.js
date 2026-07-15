"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const migration = require("../scripts/curated-content-migration");

function entries() {
  return Array.from({ length: 15 }, (_, index) => ({
    id: `p-${index}`,
    provider: "fixture",
    collection: "curated",
    origin: "imported",
    activityKind: "competitive-problem",
    concept: ["bfs", "dijkstra", "prefix-sum"][index % 3],
    rating: 800 + index * 50,
    ratingEvidence: "analysis.cfRating",
  }));
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "curated-migration-"));
  const problemsDir = path.join(root, "problems");
  const manifestFile = path.join(root, "manifest.json");
  const manifest = { version: 1, track: "verified-artifact", derivedStatus: { source: "judge-history+code-snapshot" }, problems: entries() };
  await fs.writeFile(manifestFile, JSON.stringify(manifest));
  for (const entry of manifest.problems) {
    const dir = path.join(problemsDir, entry.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify({ id: entry.id, title: `User title ${entry.id}`, status: "learning", analysis: { cfRating: entry.rating }, history: [] }));
    await fs.writeFile(path.join(dir, "main.cpp"), "int main(){}\n");
  }
  return { root, problemsDir, manifestFile, backupDir: path.join(root, "backups") };
}

test("manifest gate refuses full-repository migration sizes and unsupported concepts", () => {
  assert.throws(() => migration.validateManifest({ problems: entries().slice(0, 11) }), /12-18/);
  assert.throws(() => migration.validateManifest({ problems: [...entries(), ...entries().map((entry, i) => ({ ...entry, id: `x-${i}` }))] }), /12-18/);
  const invalid = entries(); invalid[0].concept = "taxonomy";
  assert.throws(() => migration.validateManifest({ problems: invalid }), /Unsupported/);
});

test("migration is dry-run by default, backs up before apply, preserves titles, and is idempotent", async () => {
  const ctx = await fixture();
  try {
    const dry = await migration.runMigration({ ...ctx, now: new Date("2026-07-16T00:00:00.000Z") });
    assert.equal(dry.mode, "dry-run");
    assert.equal(dry.allowlistCount, 15);
    assert.equal(dry.changedCount, 15);
    const untouched = JSON.parse(await fs.readFile(path.join(ctx.problemsDir, "p-0", "meta.json"), "utf8"));
    assert.equal(untouched.provider, undefined);

    const applied = await migration.runMigration({ ...ctx, apply: true, now: new Date("2026-07-16T00:00:00.000Z") });
    assert.equal(applied.changedCount, 15);
    assert.ok(applied.backupPath);
    const backup = JSON.parse(await fs.readFile(path.join(applied.backupPath, "p-0.meta.json"), "utf8"));
    const migrated = JSON.parse(await fs.readFile(path.join(ctx.problemsDir, "p-0", "meta.json"), "utf8"));
    assert.equal(backup.provider, undefined);
    assert.equal(migrated.provider, "fixture");
    assert.equal(migrated.title, "User title p-0");
    assert.equal(applied.titleWrites, 0);
    assert.equal(applied.derivedStatusWrites, 0);

    const again = await migration.runMigration({ ...ctx, apply: true, now: new Date("2026-07-17T00:00:00.000Z") });
    assert.equal(again.changedCount, 0);
    assert.equal(again.backupPath, null);
  } finally { await fs.rm(ctx.root, { recursive: true, force: true }); }
});
