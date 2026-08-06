"use strict";

// Acceptance harness for authored arcs (docs/HANDOVER.md §4, checklist item 7).
//
// Opening a Xưởng project normally needs a live AI call to /analyze. That makes
// the "verify by eye on the real app" step expensive and, worse, tempting to
// skip. This harness performs the same store calls with a LOCAL pathway
// proposal (no AI, the trusted registry still owns every name, runner and
// oracle) and serves the result on its own port.
//
// It writes to a THROWAWAY workspace under the system temp dir, never the
// owner's. Test data leaking into workspace/xuong has recurred three times in
// this project; this script cannot cause it.
//
//   node backend/scripts/authored-arc-preview.js [seedId ...]
//
// Then open http://127.0.0.1:5098 and walk Xưởng → project → Chạy build.

const fs = require("fs");
const os = require("os");
const path = require("path");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "usaco-xuong-preview-"));
process.env.USACO_IDE_USER_DATA_DIR = root;
process.env.USACO_IDE_PORT = process.env.USACO_IDE_PORT || "5098";
process.env.USACO_COMPANION_PORT = "0";

const registry = require("../src/xuongScenarioRegistry");
const store = require("../src/applicationProjectStore");

const requested = process.argv.slice(2);
const seedIds = requested.length
  ? requested
  : registry.listArcIds().filter((id) => registry.getArc(id).authored);

// A local stand-in for the AI's semantic proposal. It only names the seed; the
// trusted registry supplies title, brief, scenario, runner and verifier.
function localProposal(seedId) {
  const arc = registry.getArc(seedId);
  return async () => ({
    analysis: {
      summary: arc.capability.summary,
      concepts: [arc.domain],
      constraints: [arc.transformation.oldAssumption],
      evidenceRefs: [],
    },
    pathways: [{
      id: `local-${seedId}`,
      title: arc.display.label,
      // Neutral copy on purpose: the trusted registry overwrites purpose,
      // verification and tasks anyway, and a proposal quoting a real symbol
      // name is (correctly) rejected by the product-copy boundary.
      purpose: arc.display.description,
      context: arc.display.description,
      application: arc.display.label,
      target: "cpp",
      seedId,
      deliverables: [],
      verification: "Runner và oracle cục bộ kiểm tra hành vi.",
      tasks: [],
      contractCriteria: [],
    }],
  });
}

(async () => {
  const made = [];
  for (const seedId of seedIds) {
    const arc = registry.getArc(seedId);
    if (!arc) { process.stderr.write(`bỏ qua ${seedId}: không có trong registry\n`); continue; }
    const session = await store.createAnalysisSession(
      { input: arc.display.label, code: `// ${arc.productTitle}` },
      { provider: localProposal(seedId) },
    );
    const { project } = await store.selectPathway(session.id, session.pathways[0].id);
    made.push({ seedId, productTitle: arc.productTitle, base: arc.recipe.base, projectId: project.id });
  }

  require(path.join(__dirname, "..", "server.js")).start();
  process.stdout.write(`\nWorkspace tạm: ${root}\n`);
  for (const item of made) {
    process.stdout.write(`  ${item.productTitle.padEnd(16)} ${item.base.padEnd(17)} ${item.projectId}\n`);
  }
  process.stdout.write(`\nMở http://127.0.0.1:${process.env.USACO_IDE_PORT} → Xưởng\n`);
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exit(1);
});
