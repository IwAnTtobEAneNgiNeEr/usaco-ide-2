"use strict";

const fs = require("fs/promises");
const path = require("path");
const verifiedArtifact = require("../src/verifiedArtifact");

const DEFAULT_MANIFEST = path.join(__dirname, "curated-content.json");
const DEFAULT_PROBLEMS_DIR = path.resolve(__dirname, "..", "..", "workspace", "problems");
const DEFAULT_BACKUP_DIR = path.resolve(__dirname, "..", "..", "data", "backups");
const PATCH_FIELDS = ["provider", "collection", "origin", "activityKind", "track", "concept", "rating"];

async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }

function validateManifest(manifest) {
  const entries = manifest && Array.isArray(manifest.problems) ? manifest.problems : [];
  if (entries.length < 12 || entries.length > 18) throw new Error(`Curated manifest must contain 12-18 problems; got ${entries.length}.`);
  const ids = entries.map((entry) => entry && entry.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) throw new Error("Curated problem ids must be present and unique.");
  for (const entry of entries) {
    if (!["bfs", "dijkstra", "prefix-sum"].includes(entry.concept)) throw new Error(`Unsupported curated concept for ${entry.id}.`);
    if (entry.ratingEvidence !== "analysis.cfRating") throw new Error(`Rating for ${entry.id} lacks approved evidence.`);
  }
  return entries;
}

async function computedDerivedStatus(problemDir, meta) {
  const historyDoc = await readJson(path.join(problemDir, "history.json")).catch(() => ({ entries: [] }));
  const currentCode = await fs.readFile(path.join(problemDir, "main.cpp"), "utf8").catch(() => "");
  return verifiedArtifact.deriveStatus({ history: meta.history, detailedHistory: historyDoc.entries, currentCode });
}

async function planMigration({ manifest, problemsDir = DEFAULT_PROBLEMS_DIR }) {
  const entries = validateManifest(manifest);
  const plans = [];
  for (const entry of entries) {
    const problemDir = path.resolve(problemsDir, entry.id);
    if (path.dirname(problemDir) !== path.resolve(problemsDir)) throw new Error(`Unsafe curated id: ${entry.id}`);
    const metaFile = path.join(problemDir, "meta.json");
    const meta = await readJson(metaFile);
    const expectedAnalysisRating = Number(meta.analysis && meta.analysis.cfRating);
    if (!Number.isFinite(expectedAnalysisRating) || expectedAnalysisRating !== entry.rating) throw new Error(`Rating evidence mismatch for ${entry.id}.`);
    const desired = { ...entry, track: manifest.track };
    const changes = {};
    for (const field of PATCH_FIELDS) if (meta[field] !== desired[field]) changes[field] = { from: meta[field] == null ? null : meta[field], to: desired[field] };
    plans.push({
      id: entry.id,
      metaFile,
      titlePreserved: meta.title,
      derivedStatus: await computedDerivedStatus(problemDir, meta),
      derivedStatusSource: manifest.derivedStatus.source,
      changes,
      changed: Object.keys(changes).length > 0,
      nextMeta: Object.assign({}, meta, Object.fromEntries(PATCH_FIELDS.map((field) => [field, desired[field]]))),
    });
  }
  return plans;
}

async function runMigration({ apply = false, manifestFile = DEFAULT_MANIFEST, problemsDir = DEFAULT_PROBLEMS_DIR, backupDir = DEFAULT_BACKUP_DIR, now = new Date() } = {}) {
  const manifest = await readJson(manifestFile);
  const plans = await planMigration({ manifest, problemsDir });
  const changed = plans.filter((plan) => plan.changed);
  let backupPath = null;
  if (apply && changed.length) {
    const stamp = now.toISOString().replace(/[:.]/g, "-");
    backupPath = path.join(backupDir, `curated-content-${stamp}`);
    await fs.mkdir(backupPath, { recursive: true });
    for (const plan of changed) {
      await fs.copyFile(plan.metaFile, path.join(backupPath, `${plan.id}.meta.json`));
      const temp = `${plan.metaFile}.curated.tmp`;
      await fs.writeFile(temp, `${JSON.stringify(plan.nextMeta, null, 2)}\n`, "utf8");
      await fs.rename(temp, plan.metaFile);
    }
  }
  return {
    mode: apply ? "apply" : "dry-run",
    allowlistCount: plans.length,
    changedCount: changed.length,
    unchangedCount: plans.length - changed.length,
    backupPath,
    titleWrites: 0,
    derivedStatusWrites: 0,
    items: plans.map(({ id, titlePreserved, derivedStatus, derivedStatusSource, changes, changed }) => ({ id, titlePreserved, derivedStatus, derivedStatusSource, changes, changed })),
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const result = await runMigration({ apply });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { PATCH_FIELDS, validateManifest, planMigration, runMigration };
